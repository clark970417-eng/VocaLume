import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'node:util'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { app } from 'electron'
import type { STTEngine, STTResult, Language, SourceLanguage, SpeechEvidence } from '../types'
import { ALL_LANGUAGES } from '../types'
import { createLogger } from '../../main/logger'
import type { WhisperWorkerClient } from './whisper-worker-client'
import { SpeechLanguageStabilizer } from './SpeechLanguageStabilizer'
import { isImplausibleTranscript } from './transcript-guard'

const log = createLogger('sensevoice-sherpa')

/**
 * SenseVoice Small model configuration for sherpa-onnx.
 *
 * Model: sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17
 * - Non-autoregressive: ~70ms for 10s audio (15x faster than Whisper-Large)
 * - 234M params, int8 quantized model ~229MB
 * - Languages: JA, EN, ZH, KO, Cantonese (yue)
 * - Features: emotion detection, audio event detection, ITN (punctuation)
 */
const SENSEVOICE_MODEL = {
  dirName: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17',
  /** tar.bz2 download URL from sherpa-onnx releases */
  downloadUrl:
    'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2',
  modelFile: 'model.int8.onnx',
  tokensFile: 'tokens.txt',
  sizeMB: 229
} as const

const SUPPORTED_SOURCE_LANGUAGES = new Set<SourceLanguage>(['ja', 'en', 'zh', 'ko'])

function senseVoiceModelDirectory(modelsRoot: string): string {
  const legacy = join(modelsRoot, 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17')
  return existsSync(join(legacy, SENSEVOICE_MODEL.modelFile)) ? legacy : join(modelsRoot, SENSEVOICE_MODEL.dirName)
}

export function isSenseVoiceModelInstalled(modelsRoot = join(app.getPath('userData'), 'models', 'sherpa-onnx')): boolean {
  const directory = senseVoiceModelDirectory(modelsRoot)
  return existsSync(join(directory, SENSEVOICE_MODEL.modelFile)) && existsSync(join(directory, SENSEVOICE_MODEL.tokensFile))
}

interface SenseVoiceRequest {
  samples: Float32Array
  sampleRate: number
  evidence?: SpeechEvidence
}
type SenseVoiceWorker = WhisperWorkerClient<SenseVoiceRequest, STTResult | null>

/** Minimal sherpa-onnx-node types for SenseVoice offline recognizer */
interface SherpaOnnxModule {
  OfflineRecognizer: {
    new (config: SherpaOnnxConfig): SherpaOnnxRecognizer
    createAsync(config: SherpaOnnxConfig): Promise<SherpaOnnxRecognizer>
  }
}

interface SherpaOnnxRecognizer {
  createStream(): SherpaOnnxStream
  decode(stream: SherpaOnnxStream): void
  decodeAsync(stream: SherpaOnnxStream): Promise<SherpaOnnxResult>
  getResult(stream: SherpaOnnxStream): SherpaOnnxResult
}

interface SherpaOnnxStream {
  acceptWaveform(params: { sampleRate: number; samples: Float32Array }): void
}

interface SherpaOnnxResult {
  text: string
  lang?: string
  tokens?: string[]
  timestamps?: number[]
}

interface SherpaOnnxConfig {
  featConfig: { sampleRate: number; featureDim: number }
  modelConfig: {
    senseVoice: { model: string; language: string; useItn: number }
    tokens: string
    numThreads: number
    provider: string
    debug: number
  }
}

/**
 * SenseVoice Small STT engine via sherpa-onnx native addon.
 *
 * Unlike the FunASR-based SenseVoiceEngine, this uses sherpa-onnx's
 * C++ ONNX Runtime — no Python dependency, lower overhead, and
 * cross-platform (macOS, Windows, Linux).
 *
 * SenseVoice Small (~234M params) is non-autoregressive, achieving
 * ~70ms inference for 10s audio. Supports JA/EN/ZH/KO with built-in
 * language detection, emotion recognition, and ITN (punctuation).
 *
 * Requires: `npm install sherpa-onnx-node` (optional dependency)
 * Model auto-downloads on first use (~229MB int8 quantized).
 *
 * TODO: Benchmark evaluation (#554)
 * - [ ] JA CER on standard test set (compare against MLX Whisper 8.1%)
 * - [ ] EN WER on standard test set (compare against MLX Whisper 3.8%)
 * - [ ] Latency measurement: cold start, per-chunk inference
 * - [ ] Memory usage: RSS after model load
 * - [ ] Streaming mode viability: test with short chunks (1-3s)
 * - [ ] Compare against Whisper Local (whisper.cpp) and Moonshine Tiny JA
 */
export class SenseVoiceSherpaEngine implements STTEngine {
  readonly id = 'sensevoice-sherpa'
  readonly name = 'SenseVoice Small (sherpa-onnx, ultra-fast)'
  readonly isOffline = true

  private recognizer: SherpaOnnxRecognizer | null = null
  private initPromise: Promise<void> | null = null
  private generation = 0
  private mutex: Promise<void> = Promise.resolve()
  private onProgress?: (message: string) => void
  private workerClient: SenseVoiceWorker | null = null
  private nativeFactory?: (language: SourceLanguage) => Promise<SherpaOnnxRecognizer>
  private sourceLanguage: SourceLanguage = 'auto'
  private loadedLanguage: SourceLanguage | null = null
  private languageStabilizer = new SpeechLanguageStabilizer()
  private inWorker = false
  private modelsRoot?: string

  constructor(options?: {
    onProgress?: (message: string) => void
    inWorker?: boolean
    modelsRoot?: string
    sourceLanguage?: SourceLanguage
  }) {
    this.onProgress = options?.onProgress
    this.inWorker = options?.inWorker || false
    this.modelsRoot = options?.modelsRoot
    if (options?.sourceLanguage) this.setLanguage(options.sourceLanguage)
  }

  setLanguage(language: SourceLanguage): void {
    // On unsupported input, keep the model's detected language. Never claim
    // the recognizer transcribed in a language its model cannot accept.
    const supported = SUPPORTED_SOURCE_LANGUAGES.has(language) ? language : 'auto'
    if (this.sourceLanguage !== supported) this.languageStabilizer.reset()
    this.sourceLanguage = supported
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise
    const job = this.doInitialize()
    this.initPromise = job
    void job.catch(() => { if (this.initPromise === job) this.initPromise = null })
    return this.initPromise
  }

  private async doInitialize(): Promise<void> {
    if (this.recognizer) return
    const generation = this.generation
    if (process.platform === 'win32' && !this.inWorker) {
      await this.prepareWorker(this.sourceLanguage, generation)
      return
    }

    this.onProgress?.('Loading SenseVoice Small (sherpa-onnx)...')

    // Ensure model directory exists
    const modelsRoot = this.modelsRoot || join(app.getPath('userData'), 'models', 'sherpa-onnx')
    if (!existsSync(modelsRoot)) {
      mkdirSync(modelsRoot, { recursive: true })
    }

    const modelDir = senseVoiceModelDirectory(modelsRoot)

    // Auto-download model if not present
    if (!existsSync(modelDir)) {
      await this.downloadModel(modelsRoot, modelDir)
    }

    // Verify required files exist after download
    const modelPath = join(modelDir, SENSEVOICE_MODEL.modelFile)
    const tokensPath = join(modelDir, SENSEVOICE_MODEL.tokensFile)

    if (!existsSync(modelPath)) {
      throw new Error(
        `[sensevoice-sherpa] Model file not found: ${modelPath}. ` +
        `Delete ${modelDir} and restart to re-download.`
      )
    }
    if (!existsSync(tokensPath)) {
      throw new Error(
        `[sensevoice-sherpa] Tokens file not found: ${tokensPath}. ` +
        `Delete ${modelDir} and restart to re-download.`
      )
    }

    // Load sherpa-onnx-node native addon (optional dependency)
    let sherpaOnnx: SherpaOnnxModule
    try {
      sherpaOnnx = (await import('sherpa-onnx-node')).default as SherpaOnnxModule
    } catch (err) {
      throw new Error(
        '[sensevoice-sherpa] Failed to load sherpa-onnx-node. ' +
        'Install it with: npm install sherpa-onnx-node. ' +
        `Error: ${err instanceof Error ? err.message : err}`
      )
    }

    const config = (language: SourceLanguage): SherpaOnnxConfig => ({
      featConfig: {
        sampleRate: 16000,
        featureDim: 80
      },
      modelConfig: {
        senseVoice: {
          model: modelPath,
          language,
          useItn: 1
        },
        tokens: tokensPath,
        numThreads: 2,
        provider: 'cpu',
        debug: 0
      }
    })

    try {
      // Both model construction and decoding otherwise block Electron's main
      // loop. The pinned native package supplies asynchronous N-API methods.
      if (generation !== this.generation) throw new Error('SenseVoice initialization cancelled')
      this.nativeFactory = language => sherpaOnnx.OfflineRecognizer.createAsync(config(language))
      await this.prepareRecognizer(this.sourceLanguage, generation)
    } catch (err) {
      throw new Error(
        `[sensevoice-sherpa] Failed to create recognizer: ${err instanceof Error ? err.message : err}`
      )
    }

    this.onProgress?.('SenseVoice Small (sherpa-onnx) ready')
    log.info('SenseVoice Small initialized successfully')
  }

  private async prepareWorker(language: SourceLanguage, generation: number): Promise<SenseVoiceWorker> {
    const { WhisperWorkerClient } = await import('./whisper-worker-client')
    if (generation !== this.generation) throw new Error('SenseVoice initialization cancelled')
    if (!this.workerClient || this.loadedLanguage !== language) {
      // Switching a manual language releases the old native model. Preserve
      // only one worker/model on low-memory systems.
      this.workerClient?.dispose()
      this.workerClient = new WhisperWorkerClient({
        workerFile: 'sensevoice-worker.js',
        name: 'SenseVoice',
        initTimeoutMs: 12 * 60_000,
        initPayload: { modelsRoot: this.modelsRoot || join(app.getPath('userData'), 'models', 'sherpa-onnx'), sourceLanguage: language },
        onProgress: this.onProgress
      })
      this.loadedLanguage = language
    }
    const client = this.workerClient
    await client.initialize()
    return client
  }

  private async prepareRecognizer(language: SourceLanguage, generation: number): Promise<SherpaOnnxRecognizer> {
    if (this.recognizer && this.loadedLanguage === language) return this.recognizer
    if (!this.nativeFactory) throw new Error('SenseVoice is not initialized')
    // Recreate to preserve model-specific feature settings derived by sherpa.
    this.recognizer = null
    const recognizer = await this.nativeFactory(language)
    if (generation !== this.generation) throw new Error('SenseVoice initialization cancelled')
    this.recognizer = recognizer
    this.loadedLanguage = language
    return recognizer
  }

  async processAudio(audioChunk: Float32Array, sampleRate: number, evidence?: SpeechEvidence): Promise<STTResult | null> {
    if (!this.nativeFactory && !this.workerClient) return null
    const useWorker = this.workerClient !== null
    const generation = this.generation
    const requestedLanguage = this.sourceLanguage
    const previous = this.mutex
    let release!: () => void
    this.mutex = new Promise<void>(resolve => { release = resolve })
    await previous

    try {
      if (generation !== this.generation) return null
      if (useWorker) {
        const client = this.workerClient && this.loadedLanguage === requestedLanguage
          ? this.workerClient : await this.prepareWorker(requestedLanguage, generation)
        const result = await client.transcribe({ samples: audioChunk, sampleRate, evidence })
        return generation === this.generation ? result : null
      }
      const recognizer = await this.prepareRecognizer(requestedLanguage, generation)
      if (generation !== this.generation) return null
      const stream = recognizer.createStream()
      stream.acceptWaveform({ sampleRate, samples: audioChunk })
      // Windows runs recognition in a dedicated utility process.
      let result: SherpaOnnxResult
      if (this.inWorker) {
        recognizer.decode(stream)
        result = recognizer.getResult(stream)
      } else {
        result = await recognizer.decodeAsync(stream)
      }
      if (generation !== this.generation) return null

      const text = (result.text ?? '').trim()
      if (!text || isImplausibleTranscript(text, audioChunk.length / sampleRate)) return null

      // SenseVoice returns lang field (e.g., 'en', 'ja', 'zh', 'ko')
      const detectedLang = result.lang?.replace(/^<\|([a-z]+)\|>$/, '$1')
      const candidate: Language = (detectedLang && ALL_LANGUAGES.includes(detectedLang as Language))
        ? (detectedLang as Language)
        : this.detectLanguageFallback(text)
      const timestamp = Date.now()
      const language = requestedLanguage !== 'auto' ? requestedLanguage :
        this.sourceLanguage === 'auto' ? this.languageStabilizer.detect(candidate, text, timestamp, evidence) : candidate

      return {
        text,
        language,
        isFinal: true,
        timestamp
      }
    } catch (err) {
      log.error('Transcription error:', err)
      return null
    } finally { release() }
  }

  async dispose(): Promise<void> {
    log.info('Disposing SenseVoice sherpa-onnx resources')
    this.generation++
    this.workerClient?.dispose()
    this.workerClient = null
    this.recognizer = null
    this.nativeFactory = undefined
    this.loadedLanguage = null
    this.languageStabilizer.reset()
    this.initPromise = null
  }

  /**
   * Download and extract the SenseVoice model tar.bz2 archive.
   * Uses system tar to extract (available on macOS and most Linux/Windows).
   */
  private async downloadModel(modelsRoot: string, modelDir: string): Promise<void> {
    const archivePath = join(modelsRoot, `${SENSEVOICE_MODEL.dirName}.tar.bz2`)
    const controller = new AbortController()
    // Keep the timeout active through the body, not just the response headers.
    const timeout = setTimeout(() => controller.abort(), 10 * 60_000)
    try {
      this.onProgress?.(`Downloading SenseVoice Small model (~${SENSEVOICE_MODEL.sizeMB}MB)...`)
      const response = await fetch(SENSEVOICE_MODEL.downloadUrl, {redirect:'follow',signal:controller.signal})
      if (!response.ok || !response.body) throw new Error(`SenseVoice download failed: HTTP ${response.status}`)
      const total = Number(response.headers.get('content-length')) || 0
      let received = 0, previousPercent = -1, previousTime = 0
      const progress = new Transform({transform: (chunk: Buffer, _encoding, callback) => {
        received += chunk.length
        const percent = total ? Math.floor(received / total * 100) : 0
        const now = Date.now()
        if (percent !== previousPercent && now - previousTime >= 250) {
          previousPercent = percent; previousTime = now
          this.onProgress?.(`Downloading SenseVoice: ${(received/1024/1024).toFixed(0)}MB${total ? ` (${percent}%)` : ''}`)
        }
        callback(null, chunk)
      }})
      // pipeline respects disk backpressure and forwards read/write errors.
      await pipeline(Readable.from(response.body as unknown as AsyncIterable<Uint8Array>), progress, createWriteStream(archivePath))
      this.onProgress?.('Extracting SenseVoice model...')
      await promisify(execFile)('tar', ['-xjf',archivePath,'-C',modelsRoot], {timeout:120_000,windowsHide:true})
      if (!existsSync(join(modelDir,SENSEVOICE_MODEL.modelFile))) throw new Error('SenseVoice archive did not contain the expected int8 model')
    } finally {
      clearTimeout(timeout)
      await import('node:fs/promises').then(fs => fs.unlink(archivePath).catch(() => {}))
    }
  }

  /**
   * Fallback script-based language detection when the model
   * does not provide a lang field in the result.
   */
  private detectLanguageFallback(text: string): Language {
    if (!text) return 'en'

    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja'

    const cjk = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g)
    const cjkCount = cjk?.length ?? 0
    if (cjkCount / text.length > 0.3) return 'zh'

    const ko = text.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g)
    const koCount = ko?.length ?? 0
    if (koCount / text.length > 0.3) return 'ko'

    return 'en'
  }
}
