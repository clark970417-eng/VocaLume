import type {SpeechEvidence, SourceLanguage} from '../engines/types'

/** Up to two seconds of captured sound protect a sub-second final fragment
 * after a forced cut. No new audio is awaited or extra recognition scheduled.
 * Normal pauses, seeks, rate/language changes and missing metadata never reuse it.
 */
export class RecognitionBoundary {
  private previous?: {tail: Float32Array; rate: number; end: number; segment: string; text: string; language: SourceLanguage}
  clear(): void {this.previous=undefined}

  remember(audio: Float32Array, rate: number, evidence: SpeechEvidence | undefined, text: string, language: SourceLanguage): void {
    this.clear()
    if (!['ja','zh'].includes(language) || !text.trim() || !evidence?.continuationExpected || !evidence.segment ||
        !Number.isSafeInteger(evidence.captureEndSample) || !Number.isSafeInteger(evidence.captureStartSample) ||
        evidence.captureEndSample! - evidence.captureStartSample! !== audio.length ||
        !Number.isSafeInteger(evidence.speechEndSample) || evidence.speechEndSample! > audio.length ||
        audio.length-evidence.speechEndSample! > rate*.096 || !Number.isFinite(rate) || rate<=0 || audio.length<rate) return
    // A short tail after an earlier completed sentence can drag that sentence's
    // ending into the new clause (e.g. "です後で…"). Do not reuse such audio.
    if (text.length > 120 || /[。.!！?？]/u.test(text.trim().replace(/[。.!！?？]+$/u, ''))) return
    this.previous={tail:audio.slice(-Math.round(rate*2)),rate,end:evidence.captureEndSample!,segment:evidence.segment,text,language}
  }

  prepare(audio: Float32Array, rate: number, evidence: SpeechEvidence | undefined, language: SourceLanguage) {
    const previous=this.previous
    if (!previous || !evidence?.segment || previous.segment===evidence.segment || previous.rate!==rate || previous.language!==language ||
        evidence.captureStartSample!==previous.end || !Number.isSafeInteger(evidence.speechEndSample) ||
        evidence.speechEndSample!<0 || evidence.speechEndSample!>audio.length || audio.length>rate || audio.length===0) return null
    const samples=new Float32Array(previous.tail.length+audio.length)
    samples.set(previous.tail);samples.set(audio,previous.tail.length)
    return {audio:samples,evidence:{...evidence,
      speechSeconds:evidence.speechSeconds+previous.tail.length/rate,
      speechEndSample:evidence.speechEndSample!+previous.tail.length,
      captureStartSample:evidence.captureStartSample!-previous.tail.length},
      restore:(text:string)=>restoreRecognizedOverlap(previous.text,text)}
  }
}

/** Reconstruct a clause only at a literal multi-character acoustic anchor. Dropping the
 * overlapping prefix can lose its negation (不会 + 来 -> 来). Keep that evidence
 * in the source shown and translated. A complete repetition stays intact. Never
 * fuzzy-match a negation, number or tense to fit the previous hypothesis.
 */
export function restoreRecognizedOverlap(previous: string, text: string): string {
  let prior='',normalized='';const starts:number[]=[],ends:number[]=[]
  for(let i=0;i<previous.length;i++)if(!/[\p{P}\s]/u.test(previous[i]!)){prior+=previous[i];starts.push(i)}
  for(let i=0;i<text.length;i++)if(!/[\p{P}\s]/u.test(text[i]!)){normalized+=text[i];ends.push(i+1)}
  for(let n=Math.min(prior.length,normalized.length,80);n>=3;n--){
    const index=prior.lastIndexOf(normalized.slice(0,n))
    // Replace the old trailing hypothesis with newly heard text. Appending it
    // would retain an incorrect old verb/number; stripping it loses context.
    if(index>=0){
      const oldEnd=starts[index+n-1]!+1,tail=text.slice(ends[n-1])
      // Preserve a recognized comma between a negative clause and a new time
      // clause. Removing it can turn "tomorrow cannot, next week can" into a
      // negative statement about next week. Do not invent new punctuation.
      const comma=previous.slice(oldEnd,starts[index+n]??previous.length).match(/[、，,]/u)?.[0]||''
      return previous.slice(0,oldEnd)+(tail&&!/^[\p{P}\s]/u.test(tail)?comma:'')+tail
    }
  }
  return text
}
