import { PreviewBudget } from '../../../extension/preview-budget.mjs'
import type { Language, SpeechEvidence, STTEngine } from '../engines/types'
import { RecognitionBoundary } from './RecognitionBoundary'
import { isDetachedJapaneseParticle } from '../engines/stt/transcript-guard'

type WindowObservation = { text: string; start: number; end: number }

/** Repair a dropped digit in a numeric month only when two shorter windows
 * from that same cue independently support both sides of the date. */
export function corroboratedJapaneseMonth(text: string, early: string, recent: string): string {
  const month = /(?<![0-9０-９])[1１]月/u.exec(text)
  if (!month || [...text.normalize('NFKC').matchAll(/(?:\d+|[〇一二三四五六七八九十]+)月/gu)].length !== 1) return text
  const left = text.slice(0, month.index).trimEnd().slice(-12)
  const right = text.slice(month.index + month[0].length).slice(0, 6)
  if (left.length < 4 || right.length < 6) return text
  // SenseVoice sometimes mixes the kanji ten and a redundant zero in the
  // shorter window. No valid Japanese month is written 十0月.
  const recentMonthEvidence = recent.replace(/十[0０]月/gu, '十月')
  for (const numeral of ['十二', '十一', '十']) {
    if (recentMonthEvidence.includes(numeral + '月' + right) &&
        [left + numeral, left + numeral + 'が', left + numeral + '月'].some(suffix => early.trim().endsWith(suffix))) {
      return text.slice(0, month.index) + numeral + '月' + text.slice(month.index + month[0].length)
    }
  }
  return text
}

export class StreamingRecognition {
  readonly budget = new PreviewBudget()
  readonly boundary = new RecognitionBoundary()
  private previews?: { segment: string; first: WindowObservation; latest: WindowObservation }

  constructor(private readonly sourceLanguage: () => Language | 'auto') {}

  clearPreviews(): void { this.previews = undefined }

  async process(engine: STTEngine, audio: Float32Array, sampleRate: number, evidence?: SpeechEvidence, final = false, signal?: AbortSignal) {
    const started = performance.now()
    try {
      const boundary = final ? this.boundary.prepare(audio, sampleRate, evidence, this.sourceLanguage()) : undefined
      const result = await engine.processAudio(boundary ? boundary.audio : audio, sampleRate, boundary ? boundary.evidence : evidence, signal)
      if (final && !boundary && evidence?.segment && !evidence.continuationExpected &&
          result?.language === 'ja' && isDetachedJapaneseParticle(result.text)) return null
      if (!result || boundary || result.language !== 'ja' || !evidence?.segment ||
          evidence.captureStartSample === undefined || evidence.captureEndSample === undefined) {
        return result && boundary ? { ...result, text: boundary.restore(result.text) } : result
      }
      const { segment, captureStartSample: start, captureEndSample: end } = evidence
      const previous = this.previews?.segment === segment ? this.previews : undefined
      if (!final) {
        const latest = { text: result.text, start, end }
        this.previews = { segment, first: previous?.first ?? latest, latest }
      } else if (previous && previous.first.start >= start && previous.first.start <= start + sampleRate * .2 &&
          previous.latest.start >= start && previous.first.end < previous.latest.end && previous.latest.end <= end) {
        const text = corroboratedJapaneseMonth(result.text, previous.first.text, previous.latest.text)
        if (text !== result.text) return { ...result, text }
      }
      return result
    } finally {
      if (!signal?.aborted) {
        const finished = performance.now()
        this.budget.complete(finished - started, finished)
      }
    }
  }
}
