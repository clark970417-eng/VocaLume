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
  // A Japanese comparative predicate may be stranded after a hard cut. Bring
  // over only its actual object, never the preceding numbers or subject.
  const comparison = atAudioCut && !/[「」『』]/u.test(prefix) &&
    prefix.match(/(?:市場(?:関係者)?|専門家)の(?:予想|予測|見通し)を(?:大きく?|大幅に)?$/u)?.[0]
  if (comparison) {
    const verb = /大きく?$/u.test(comparison) ? next.replace(/^く(?=上回|下回)/u, '') : next
    if (/^(?:上回|下回)(?:りました|ります|った|る)(?=[。！？!?、\s]|$)/u.test(verb)) {
      return comparison.replace(/大き$/u, '大きく') + verb
    }
  }
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

  /** Use a short adjacent source question for known replies. Only providers
   * with a separate reference field receive a declarative antecedent, and
   * only for explicitly referential phrasing. Never feed generated output.
   */
  referenceFor(text: string, from: Language, to: Language, evidence?: SpeechEvidence, speaker?: number,
    acceptsReference = false): string | undefined {
    const prior=this.previous
    if (!prior || !((from==='ja'&&to==='zh')||(from==='zh'&&to==='ja')) || prior.from!==from || prior.to!==to ||
        prior.evidence?.continuationExpected || !evidence?.segment || !prior.evidence?.segment || evidence.segment===prior.evidence.segment ||
        (prior.speaker!==undefined && speaker!==undefined && prior.speaker!==speaker)) return undefined
    const start=evidence.captureStartSample,end=prior.evidence.captureEndSample
    if (start===undefined || end===undefined || start<end || start>end+32000) return undefined
    const previous=prior.text.trim(),current=text.trim()
    if (previous.length>80 || /[\n「」『』"<>]/u.test(previous)) return undefined
    if (contextualShortReply(current, from, to, previous) !== undefined) return previous
    const priorStart = prior.evidence.captureStartSample
    const priorSpeechEnd = prior.evidence.speechEndSample
    const lastSpeech = priorStart !== undefined && priorSpeechEnd !== undefined &&
      priorSpeechEnd > 0 && priorSpeechEnd <= end - priorStart ? priorStart + priorSpeechEnd : end
    if (!acceptsReference || from!=='ja' || to!=='zh' || evidence.continuationExpected || current.length>120 ||
        /[\n「」『』"<>]/u.test(current) || start - lastSpeech > 14400 ||
        !/^(?:それ(?:は|が|を|も|について)|その(?:理由|件|結果|場所|後)|同じ(?:もの|ところ|理由))/u.test(current) ||
        !/[^。.!！?？\n]+[。．.!！]$/u.test(previous) || /[。．.!！?？]/u.test(previous.slice(0, -1))) return undefined
    return previous
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
