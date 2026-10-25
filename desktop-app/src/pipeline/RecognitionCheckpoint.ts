import type { SpeechEvidence, STTResult } from '../engines/types'

/** Reuse a completed recognition for identical PCM or quiet trailing audio.
 * VAD metadata alone is insufficient: compare the PCM prefix and check every
 * new 16 ms frame. Missing metadata, new speech, edits and new cues re-decode.
 */
export class RecognitionCheckpoint {
  private value?: { audio: Float32Array; rate: number; evidence: SpeechEvidence; result: STTResult; context?: string; stable: boolean }

  clear(): void { this.value = undefined }

  remember(audio: Float32Array, rate: number, evidence: SpeechEvidence | undefined, result: STTResult, context?: string): void {
    const previous = this.value
    this.clear()
    if (!result.text.trim() || !evidence?.segment || !Number.isSafeInteger(evidence.speechEndSample) ||
        !Number.isFinite(rate) || rate <= 0 || evidence.speechEndSample! <= 0 || evidence.speechEndSample! > audio.length ||
        audio.length > rate * 20 || audio.length < rate) return
    const stable = !!previous && previous.rate === rate && previous.context === context &&
      previous.evidence.segment === evidence.segment && previous.evidence.captureStartSample === evidence.captureStartSample &&
      previous.result.text === result.text && previous.result.language === result.language &&
      audio.length >= previous.audio.length && previous.audio.every((sample, i) => sample === audio[i])
    this.value = { audio: audio.slice(), rate, evidence: { ...evidence }, result: { ...result }, context, stable }
  }

  reuse(audio: Float32Array, rate: number, evidence?: SpeechEvidence, context?: string): STTResult | null {
    const saved = this.value
    if (!saved || !evidence || rate !== saved.rate || context !== saved.context || evidence.segment !== saved.evidence.segment ||
        evidence.captureStartSample !== saved.evidence.captureStartSample ||
        evidence.speechEndSample !== saved.evidence.speechEndSample || evidence.speechSeconds !== saved.evidence.speechSeconds ||
        audio.length < saved.audio.length || audio.length > saved.audio.length + rate * 2) return null
    for (let i = 0; i < saved.audio.length; i++) if (saved.audio[i] !== audio[i]) return null
    // An identical request adds no information, even before a pause. For a
    // growing window keep the quiet-tail guard; an earlier unpadded decode
    // additionally needs two matching hypotheses on identical captured speech.
    if (audio.length > saved.audio.length &&
        (audio.length - evidence.speechEndSample! < rate * .192 ||
         (saved.audio.length - saved.evidence.speechEndSample! < rate * .192 && !saved.stable))) return null
    const frame = Math.max(1, Math.round(rate * .016))
    for (let start = saved.audio.length; start < audio.length; start += frame) {
      const end = Math.min(audio.length, start + frame)
      let energy = 0
      for (let i = start; i < end; i++) energy += audio[i]! ** 2
      if (!Number.isFinite(energy) || Math.sqrt(energy / (end - start)) > .003) return null
    }
    return { ...saved.result }
  }
}
