import type { Language, SpeechEvidence } from '../engines/types'

const terminal = /[。．.!！?？、，,\s]+$/u
const dependentStart = /^(?:しま(?:いました|います|った|う|わない|わなかった)|ください|くれ(?:ました|ます|た|る)|いただ(?:き|い|く)|い(?:ました|ます|ません|ない|なかった|る|た)|お(?:きます|いた|く)|み(?:ます|ました|たい|る)|ほしい)/u

/** Recover only a grammatical continuation of actually recognized speech.
 * No generated translation or unrelated history is put into the model prompt.
 * The recovered source is visible in the caption, so a correction is auditable.
 */
export function joinJapaneseCaption(previous: string, current: string, atAudioCut = false): string {
  // Never cut a long clause in the middle merely to fit the context budget.
  const prefix = previous.trim().replace(terminal, '').split(/[。．.!！?？\n]/u).at(-1)?.trim() || ''
  const next = current.trim()
  if (!prefix || prefix.length > 120 || !next || next.length > 420 || /[」』）)]$/u.test(prefix)) return current
  if (next.startsWith(prefix)) return current // overlapping recognition already contains it
  const connected = atAudioCut && /[いきぎしちにびみりえけげせてねべめれ]$/u.test(prefix) &&
      /^(?:ませんでした|ません|ました|ます)(?=[。！？!?、\s]|が|けど|ので|から|$)/u.test(next) ||
    /[てで]$/u.test(prefix) && dependentStart.test(next) ||
    /と$/u.test(prefix) && /^(?:思|言|聞|感じ|考え)/u.test(next) ||
    /かも$/u.test(prefix) && /^しれ(?:ない|ません|なかった)/u.test(next) ||
    /という$/u.test(prefix) && /^(?:わけ|こと|意味)/u.test(next) ||
    /(?:[うくぐすつぬぶむるた]|ない)$/u.test(prefix) && /^(?:つもり|予定|わけ|はず)(?:は|が|じゃ|では|です|だ|で|も|な)/u.test(next) ||
    /(?:ので|けれども|けれど|けど|なのに)$/u.test(prefix) &&
      !/^(?:はい|いいえ|うん|ううん|こんにちは|こんばんは|さて|ところで|話は変わ)/u.test(next)
  if (!connected) return current
  // Some ASR windows omit all punctuation after an orphan auxiliary. A finite
  // ending followed immediately by a new lexical clause must not swallow it.
  // Do not split connective endings (ませんが / ましたけど / ですから).
  const punctuated = next.replace(
    /^(しまいました|しまった|ください|いませんでした|いません|いました|います|しれません|ました|ません|ます)(?=[\p{Script=Han}ァ-ヺ]|ありがとう|みなさん|こんにちは|こんばんは)/u,
    '$1。')
  return prefix + punctuated
}

export class JapaneseCaptionContext {
  private previous?: {
    text: string; from: Language; to: Language; at: number; evidence?: SpeechEvidence; speaker?: number
  }

  reset(): void { this.previous = undefined }

  resolve(text: string, from: Language, to: Language, evidence?: SpeechEvidence, speaker?: number): string {
    const prior = this.previous
    if (!prior || from !== 'ja' || to !== 'zh' || prior.from !== from || prior.to !== to ||
        (prior.speaker !== undefined && speaker !== undefined && prior.speaker !== speaker) ||
        (evidence?.segment && evidence.segment === prior.evidence?.segment)) return text
    const start = evidence?.captureStartSample, end = prior.evidence?.captureEndSample
    if (start !== undefined && end !== undefined) {
      // PCM positions survive slow inference; wall time must not break adjacency
      // under load. A seek/new session or >2 s of silence does break it.
      if (start < end - 8192 || start > end + 32000) return text
    } else if (Date.now() - prior.at > 12_000) return text
    return joinJapaneseCaption(prior.text, text,
      prior.evidence?.continuationExpected === true && start !== undefined && start === end)
  }

  remember(text: string, from: Language, to: Language, evidence?: SpeechEvidence, speaker?: number): void {
    // Store the new recognition, not the expanded caption: no accumulating loop.
    this.previous = { text, from, to, at: Date.now(), evidence: evidence && { ...evidence }, speaker }
  }
}
