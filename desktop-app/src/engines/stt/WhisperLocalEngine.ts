import { getModelPath, isModelDownloaded, downloadModel } from '../model-downloader'
import type { WhisperVariant } from '../model-downloader'
import { filterWhisperHallucination } from '../../pipeline/whisper-filter'
import type { STTEngine, STTResult, Language, SourceLanguage, SpeechEvidence } from '../types'
import { createLogger } from '../../main/logger'
import { macInferenceThreads, windowsInferenceThreads } from '../inference-resources'
import type { WhisperWorkerClient } from './whisper-worker-client'
import { SpeechLanguageStabilizer } from './SpeechLanguageStabilizer'

const log = createLogger('whisper-local')

export class WhisperLocalEngine implements STTEngine {
  readonly id = 'whisper-local'
  readonly name: string
  readonly isOffline = true

  private modelPath = ''
  private transcribe: typeof import('@kutalia/whisper-node-addon').transcribe | null = null
  private workerClient: WhisperWorkerClient | null = null
  private onProgress?: (message: string) => void
  private modelVariant?: WhisperVariant
  private sourceLanguage: SourceLanguage = 'auto'
  private languageStabilizer = new SpeechLanguageStabilizer()
  private generation = 0

  setLanguage(language: SourceLanguage): void {
    if (this.sourceLanguage !== language) this.languageStabilizer.reset()
    this.sourceLanguage = language
  }

  // Promise-based mutex — queues callers so only one transcribe() runs at a time (#363)
  private mutex: Promise<void> = Promise.resolve()

  constructor(options?: { onProgress?: (message: string) => void; modelVariant?: WhisperVariant }) {
    this.onProgress = options?.onProgress
    this.modelVariant = options?.modelVariant
    const variantNames: Record<string, string> = {
      'large-v3-turbo': 'large-v3-turbo',
      'base': 'base',
      'small': 'small'
    }
    const variantLabel = this.modelVariant ? variantNames[this.modelVariant] : null
    this.name = variantLabel
      ? `Whisper Local (${variantLabel})`
      : 'Whisper Local (kotoba-whisper-v2.0)'
  }

  async initialize(): Promise<void> {
    if (this.modelPath && this.transcribe) return
    const generation = this.generation
    const modelPath = isModelDownloaded(this.modelVariant)
      ? getModelPath(this.modelVariant)
      : await downloadModel(this.onProgress, this.modelVariant)
    if (generation !== this.generation) throw new Error('Whisper initialization cancelled')
    let transcribe: NonNullable<typeof this.transcribe>
    // Windows DLL loading itself can stall the event loop, even before decoding.
    if (process.platform === 'win32') {
      const { WhisperWorkerClient } = await import('./whisper-worker-client')
      const client = this.workerClient ??= new WhisperWorkerClient()
      await client.initialize()
      transcribe = options => client.transcribe(options)
    } else {
      transcribe = (await import('@kutalia/whisper-node-addon')).transcribe
    }
    if (generation !== this.generation) throw new Error('Whisper initialization cancelled')
    this.modelPath = modelPath
    this.transcribe = transcribe
  }

  async processAudio(audioChunk: Float32Array, _sampleRate: number, evidence?: SpeechEvidence): Promise<STTResult | null> {
    if (!this.modelPath || !this.transcribe) return null
    // Snapshot per request: a later settings change must not relabel queued audio.
    const requestedLanguage = this.sourceLanguage
    const generation = this.generation
    const transcribe = this.transcribe

    // Promise-based mutex — serializes all calls so whisper-node-addon's
    // Metal GPU context is never entered concurrently (#363).
    // Each call chains onto the previous promise, guaranteeing FIFO order.
    let release: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const prev = this.mutex
    this.mutex = gate

    try {
      await prev
    } catch {
      // Previous call's error doesn't affect us
    }

    try {
      if (generation !== this.generation) return null
      const threads = process.platform === 'win32' ? windowsInferenceThreads().whisper :
        process.platform === 'darwin' && process.arch === 'arm64' ? macInferenceThreads().speech : undefined
      const result = await transcribe({
        model: this.modelPath,
        pcmf32: audioChunk,
        language: requestedLanguage,
        // The addon defaults to English translation; this stage must emit the
        // original language for the downstream translator and bilingual text.
        translate: false,
        vad: false,
        no_timestamps: true,
        ...(process.platform === 'win32' && process.env.VOCALUME_WHISPER_CPU === '1' ? { use_gpu: false } : {}),
        ...(threads !== undefined ? { n_threads: threads } : {}),
        no_prints: true
      })
      if (generation !== this.generation) return null

      const rawText = this.extractText(result.transcription)
      const text = filterWhisperHallucination(rawText)
      if (!text) return null

      // A configured language is authoritative. Script heuristics misclassify
      // short Japanese names written only in kanji and Latin-script languages.
      const timestamp = Date.now()
      const detected = requestedLanguage === 'auto' ? this.detectLanguage(text) : requestedLanguage
      const language = requestedLanguage === 'auto' && this.sourceLanguage === 'auto'
        ? this.languageStabilizer.detect(detected, text, timestamp, evidence)
        : detected

      return {
        text,
        language,
        isFinal: true,
        timestamp
      }
    } catch (err) {
      log.error('Transcription error:', err)
      return null
    } finally {
      release!()
    }
  }

  async dispose(): Promise<void> {
    log.info('Disposing resources')
    this.generation++
    this.workerClient?.dispose()
    this.workerClient = null
    this.transcribe = null
    this.modelPath = ''
    this.languageStabilizer.reset()
  }

  private detectLanguage(text: string): Language {
    if (!text || text.length === 0) return 'en'

    // Japanese: Hiragana, Katakana, CJK ideographs (when mixed with kana)
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja'

    // Chinese: CJK ideographs without Japanese kana
    const cjkPattern = /[\u4E00-\u9FFF\u3400-\u4DBF]/g
    const cjkMatches = text.match(cjkPattern)
    const cjkCount = cjkMatches?.length || 0
    const cjkRatio = cjkCount / text.length
    if (cjkRatio > 0.3) return 'zh'

    // Korean: Hangul syllables and jamo
    const koreanPattern = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g
    const koMatches = text.match(koreanPattern)
    const koCount = koMatches?.length || 0
    const koRatio = koCount / text.length
    if (koRatio > 0.3) return 'ko'

    // Thai
    const thaiPattern = /[\u0E00-\u0E7F]/g
    const thMatches = text.match(thaiPattern)
    const thCount = thMatches?.length || 0
    if (thCount / text.length > 0.3 && thCount >= 2) return 'th'

    // Arabic
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F]/g
    const arMatches = text.match(arabicPattern)
    const arCount = arMatches?.length || 0
    if (arCount / text.length > 0.3 && arCount >= 2) return 'ar'

    // Default to English for Latin-script languages
    // (more precise detection for fr/de/es/etc. relies on Whisper's own language detection)
    return 'en'
  }

  private extractText(transcription: string[][] | string[]): string {
    if (!transcription || transcription.length === 0) return ''
    if (Array.isArray(transcription[0])) {
      return (transcription as string[][]).map((seg) => seg[seg.length - 1] || '').join(' ')
    }
    return (transcription as string[]).join(' ')
  }
}
