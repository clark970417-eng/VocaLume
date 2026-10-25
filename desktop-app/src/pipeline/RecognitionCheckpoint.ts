import type { SpeechEvidence, STTResult } from '../engines/types'

/** Reuse a completed recognition only when capture added quiet trailing audio.
 * VAD metadata alone is insufficient: compare the PCM prefix and check every
 * new 16 ms frame. Missing metadata, new speech, edits and new cues re-decode.
 */
export class RecognitionCheckpoint {
  private value?: { audio: Float32Array; rate: number; evidence: SpeechEvidence; result: STTResult }

  clear(): void { this.value = undefined }

  remember(audio: Float32Array, rate: number, evidence: SpeechEvidence | undefined, result: STTResult): void {
    this.clear()
    if (!result.text.trim() || !evidence?.segment || !Number.isSafeInteger(evidence.speechEndSample) ||
        evidence.speechEndSample! <= 0 || audio.length > rate * 20 || audio.length < rate ||
        audio.length - evidence.speechEndSample! < rate * .192) return
    this.value = { audio: audio.slice(), rate, evidence: { ...evidence }, result: { ...result } }
  }

  reuse(audio: Float32Array, rate: number, evidence?: SpeechEvidence): STTResult | null {
    const saved = this.value
    if (!saved || !evidence || rate !== saved.rate || evidence.segment !== saved.evidence.segment ||
        evidence.speechEndSample !== saved.evidence.speechEndSample || evidence.speechSeconds !== saved.evidence.speechSeconds ||
        audio.length < saved.audio.length || audio.length > saved.audio.length + rate * 2) return null
    for (let i = 0; i < saved.audio.length; i++) if (saved.audio[i] !== audio[i]) return null
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
