import type { Language, SpeechEvidence } from '../types'

/** Preserve the recent speech language across an ambiguous short name or
 * numeral. Clear script evidence and longer turns can switch immediately. */
export class SpeechLanguageStabilizer {
  private stable?: { language: Language; timestamp: number; capture?: string; end?: number }

  detect(candidate: Language, text: string, now: number, evidence?: SpeechEvidence): Language {
    const previous = this.stable
    const capture = evidence?.segment?.replace(/:\d+$/u, '')
    const start = evidence?.captureStartSample
    const sameCapture = previous?.capture === capture
    const adjacent = previous?.end !== undefined && start !== undefined
      ? start >= previous.end - 8 * 16000 && start - previous.end <= 8 * 16000
      : previous !== undefined && now - previous.timestamp <= 8000

    if (previous && sameCapture && adjacent && previous.language !== candidate) {
      const compact = text.replace(/[^\p{L}\p{N}]/gu, '')
      const hanName = /^\p{Script=Han}{1,5}$/u.test(compact) &&
        !/[我你們们這这的了沒没嗎吗]/u.test(compact)
      const shortLatin = /^[\p{Script=Latin}\p{N}]{1,12}$/u.test(compact) &&
        text.trim().split(/\s+/u).length < 3
      const cjk = ['ja', 'zh', 'ko'].includes(previous.language)
      if ((candidate === 'zh' && previous.language === 'ja' && hanName) ||
          (cjk && candidate === 'en' && shortLatin)) {
        return previous.language
      }
    }

    this.stable = { language: candidate, timestamp: now, capture, end: evidence?.captureEndSample }
    return candidate
  }

  reset(): void {
    this.stable = undefined
  }
}
