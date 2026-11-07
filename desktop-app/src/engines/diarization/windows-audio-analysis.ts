import { mkdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { downloadModelAsset, getModelsDir } from '../model-downloader'
import { WhisperWorkerClient } from '../stt/whisper-worker-client'
import type { DiarizationResult, SpeakerDiarizer } from '../types'
import { onOptionalAnalysisPause, performanceState } from '../../main/performance-state'
import { SpeakerClusters } from './audio-classification'

type AnalysisMode = 'speaker' | 'laughter'
type AudioWindow = { samples: Float32Array; sampleRate: number }
type AnalysisResults = { speaker: Float32Array; laughter: boolean }

const CED_URL = 'https://huggingface.co/k2-fsa/sherpa-onnx-ced-mini-audio-tagging-2024-04-19/resolve/4da6df50dc47b25f91074b5ef7df4c1cc0dd7d4d/'
const MODEL_ASSETS = {
  speaker: [{
    name: '3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx',
    sha256: 'f682b514c05d947ee3fa91cd6ec6c5c7543479a128373fa29b1faedccd21fd11'
  }],
  laughter: [{
    name: 'ced-mini.int8.onnx',
    url: CED_URL + 'model.int8.onnx',
    sha256: 'ff29f39f9fbe637f72535160e9d006d61d872fdab0fce838672265b9b38cf946'
  }, {
    name: 'ced-mini.labels.csv',
    url: CED_URL + 'class_labels_indices.csv',
    sha256: 'cdd1049833c4b86127c2773ac0d14a2754b6a6d0d1798002ed5c66e699708429'
  }]
}

/** Each opt-in analyzer owns one optional inference and is released at Stop. */
export class WindowsAudioAnalysis<Mode extends AnalysisMode> {
  private worker?: WhisperWorkerClient<AudioWindow, AnalysisResults[Mode] | null>
  private pending?: object
  private retryAt = 0
  private stopOnPressure?: () => void

  constructor(private readonly mode: Mode, private readonly onProgress?: (message: string) => void) {}

  async analyze(samples: Float32Array, sampleRate: number): Promise<AnalysisResults[Mode] | null> {
    const minimum = this.mode === 'speaker' ? 24_000 : 4_000
    if (!performanceState().optionalAnalysisAllowed || this.pending || Date.now() < this.retryAt || sampleRate !== 16_000 ||
        samples.length < minimum || samples.length > 320_000 ||
        !samples.every(Number.isFinite) || !samples.some(value => Math.abs(value) >= 0.006)) return null
    const ticket = this.pending = {}
    this.stopOnPressure ??= onOptionalAnalysisPause(() => this.dispose())
    try {
      if (!this.worker) {
        const modelDir = join(getModelsDir(), 'audio-analysis')
        await mkdir(modelDir, { recursive: true })
        if (this.pending !== ticket) return null
        const progress = (message: string): void => {
          if (this.pending === ticket) this.onProgress?.(message)
        }
        const files = await Promise.all(MODEL_ASSETS[this.mode].map(async ({ name, url, sha256 }) =>
          realpath(await downloadModelAsset(join(modelDir, name), url, name, progress, sha256))
        ))
        if (this.pending !== ticket) return null
        this.worker = new WhisperWorkerClient({
          workerFile: 'audio-analysis-worker.js',
          name: this.mode === 'speaker' ? 'Speaker identification' : 'Laughter detection',
          initPayload: { mode: this.mode, model: files[0], labels: files[1] },
          initTimeoutMs: 12_000,
          requestTimeoutMs: 2000
        })
      }
      // CED is more responsive to distinct events in a short window. Speaker
      // identification uses the current caption cue, capped at the last six seconds.
      const cap = (this.mode === 'speaker' ? 6 : 4) * sampleRate
      const pcm = samples.length <= cap ? samples : samples.slice(-cap)
      const result = await this.worker.transcribe({ samples: pcm, sampleRate })
      return this.pending === ticket ? result : null
    } catch {
      if (this.pending === ticket) {
        this.worker?.dispose()
        this.worker = undefined
        this.retryAt = Date.now() + 60_000
        this.onProgress?.(this.mode === 'speaker'
          ? 'Speaker identification unavailable — continuing without speaker labels.'
          : 'Acoustic laughter detection unavailable — continuing with transcript markers.')
      }
      return null
    } finally {
      if (this.pending === ticket) this.pending = undefined
    }
  }

  dispose(): void {
    this.stopOnPressure?.()
    this.stopOnPressure = undefined
    this.pending = undefined
    this.retryAt = 0
    this.worker?.dispose()
    this.worker = undefined
  }
}

export class SherpaDiarizer implements SpeakerDiarizer {
  readonly id = 'sherpa-speaker'
  readonly name = 'CAM++ (Sherpa ONNX)'
  readonly finalOnly = true
  private readonly analysis: WindowsAudioAnalysis<'speaker'>
  private speakers = new SpeakerClusters()

  constructor(onProgress?: (message: string) => void) {
    this.analysis = new WindowsAudioAnalysis('speaker', onProgress)
  }

  // Downloading/loading the optional model cannot hold up capture startup.
  async initialize(): Promise<void> {}

  async processAudio(audio: Float32Array, sampleRate: number): Promise<DiarizationResult | null> {
    const embedding = await this.analysis.analyze(audio, sampleRate)
    return embedding ? this.speakers.identify(embedding) : null
  }

  async dispose(): Promise<void> {
    this.analysis.dispose()
    this.speakers = new SpeakerClusters()
  }
}
