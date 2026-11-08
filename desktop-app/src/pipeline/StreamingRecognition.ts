import { PreviewBudget } from '../../../extension/preview-budget.mjs'
import type { Language, SpeechEvidence, STTEngine } from '../engines/types'
import { RecognitionBoundary } from './RecognitionBoundary'

export class StreamingRecognition {
  readonly budget = new PreviewBudget()
  readonly boundary = new RecognitionBoundary()

  constructor(private readonly sourceLanguage: () => Language | 'auto') {}

  async process(engine: STTEngine, audio: Float32Array, sampleRate: number, evidence?: SpeechEvidence, final = false, signal?: AbortSignal) {
    const started = performance.now()
    try {
      const boundary = final ? this.boundary.prepare(audio, sampleRate, evidence, this.sourceLanguage()) : undefined
      const result = signal
        ? await engine.processAudio(audio, sampleRate, evidence, signal)
        : await engine.processAudio(boundary ? boundary.audio : audio, sampleRate, boundary ? boundary.evidence : evidence)
      return result && boundary ? { ...result, text: boundary.restore(result.text) } : result
    } finally {
      if (!signal?.aborted) {
        const finished = performance.now()
        this.budget.complete(finished - started, finished)
      }
    }
  }
}
