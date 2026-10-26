import type { Language, SpeechEvidence } from '../engines/types'
import { contextualShortReply } from '../engines/translator/contextual-short-reply'

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
    // Colloquial negatives/contractions and quoted speech need evidence of an
    // exact capture cut: otherwise a short new reply could be unrelated.
    atAudioCut && (
      /[てで]$/u.test(prefix) && /^(?:ない|なかった|ません)(?=[。！？!?、\s]|です|でした|が|けど|ので|から|$)/u.test(next) ||
      /っ$/u.test(prefix) && /^ちゃ(?:った|う|います|いました|わない)(?=[。！？!?、\s]|が|けど|ので|から|$)/u.test(next) ||
      /ん$/u.test(prefix) && /^じゃ(?:った|う|います|いました|わない)(?=[。！？!?、\s]|が|けど|ので|から|$)/u.test(next) ||
      /(?:ちゃ|じゃ)$/u.test(prefix) && /^(?:った|う|います|いました|わない)(?=[。！？!?、\s]|が|けど|ので|から|$)/u.test(next) ||
      /って$/u.test(prefix) && /^(?:言|聞|思)/u.test(next) ||
      /(?:つもり|わけ|はず)$/u.test(prefix) && /^(?:は|が)(?:ない|ありません)/u.test(next) ||
      /(?:難し|忙し|寂し|楽し|美味し|おいし|怖|痛|高|安|強|弱|悪|良|よ)く$/u.test(prefix) && /^な(?:い|かった|くて|くても)(?=[。！？!?、\s]|です|でした|が|けど|ので|から|$)/u.test(next)
    ) ||
    /(?:わけ|つもり|はず)では$/u.test(prefix) && /^(?:ない|ありません|なかった)/u.test(next) ||
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

  /** Only a nearby, complete source question may disambiguate a short reply.
   * Never feed generated translations, an entire conversation, or a cut clause
   * back into the model. This snapshot is captured before remembering this cue.
   */
  referenceFor(text: string, from: Language, to: Language, evidence?: SpeechEvidence, speaker?: number): string | undefined {
    const prior=this.previous
    if (!prior || !((from==='ja'&&to==='zh')||(from==='zh'&&to==='ja')) || prior.from!==from || prior.to!==to ||
        prior.evidence?.continuationExpected || !evidence?.segment || !prior.evidence?.segment || evidence.segment===prior.evidence.segment ||
        (prior.speaker!==undefined && speaker!==undefined && prior.speaker!==speaker)) return undefined
    const start=evidence.captureStartSample,end=prior.evidence.captureEndSample
    if (start===undefined || end===undefined || start<end || start>end+32000) return undefined
    const previous=prior.text.trim(),current=text.trim()
    if (previous.length>80 || /[\n「」『』"<>]/u.test(previous) || !/[?？]$/u.test(previous)) return undefined
    // Unhandled senses keep ordinary preparation and cache reuse: a reference
    // that cannot improve the reply must not add work or postpone its display.
    return contextualShortReply(current, from, to, previous) !== undefined ? previous : undefined
  }

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
