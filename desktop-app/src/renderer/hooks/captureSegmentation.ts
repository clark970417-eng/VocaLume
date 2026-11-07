import type { SpeechEvidence } from '../../engines/types'
import { trimSilence } from './trimCaptureSilence'

// The legacy Silero model emits 96 ms frames. Four quiet frames release short
// cloud utterances one frame sooner than the previous 500 ms configuration.
export const CLOUD_SPEECH_END_MS = 384
export const CLOUD_PREVIEW_PAUSE_MS = 192
export const SPEECH_ONSET_PROBABILITY = 0.25
export const SPEECH_END_PROBABILITY = 0.1
const SHORT_REPLY_PROBABILITY = 0.65

export interface CapturedSpeech {
  audio: Float32Array
  evidence: SpeechEvidence
}

interface CaptureFrame {
  length: number
  voiced: boolean
  probability: number
}

/** Use a real pause when it coincides with the capture limit. */
export function captureBoundary(seconds: number, quietSeconds: number, cloud: boolean): 'pause' | 'limit' | undefined {
  if (cloud && seconds >= 2.5 && quietSeconds >= 0.24) return 'pause'
  if (seconds >= (cloud ? 6 : 8)) return 'limit'
  return undefined
}

/** Tracks sample positions on the 16 kHz VAD stream, including idle frames. */
export class CascadeCapture {
  private cursor = 0
  private segment = 0
  private onset?: { audio: Float32Array; info: CaptureFrame }
  private active = false
  private sentPartial = false
  private hasNewSpeech = false
  private frames: CaptureFrame[] = []
  private pendingSamples = 0
  private quiet = 0
  private pcm: Float32Array

  constructor(private readonly captureId: string, private readonly cloud: boolean, private readonly rate: number) {
    // The hard cut can overshoot by one VAD frame. Reuse storage across windows.
    this.pcm = new Float32Array(Math.ceil(rate * (cloud ? 6.1 : 8.1)))
  }

  get quietSamples(): number { return this.quiet }

  push(frame: Float32Array, probability: number): CapturedSpeech | null {
    this.cursor += frame.length
    const voiced = probability >= SPEECH_ONSET_PROBABILITY
    const info = { length: frame.length, voiced, probability }
    if (!this.active) {
      // The VAD sends the onset frame immediately before the speech-start event.
      this.onset = { audio: frame, info }
      return null
    }
    this.append(frame, info)
    if (probability >= SPEECH_END_PROBABILITY) this.hasNewSpeech = true
    this.quiet = probability < SPEECH_END_PROBABILITY ? this.quiet + frame.length : 0
    const boundary = captureBoundary(this.pendingSamples / this.rate, this.quiet / this.rate, this.cloud)
    if (!boundary) return null

    const audio = this.pcm.slice(0, this.pendingSamples)
    const packet = this.packet(audio, this.cursor)
    if (boundary === 'limit' && packet.evidence.speechEndSample !== undefined &&
        audio.length - packet.evidence.speechEndSample <= this.rate * 0.096) {
      packet.evidence.continuationExpected = true
    }
    this.clearWindow()
    this.sentPartial = true
    return packet
  }

  start(): void {
    this.active = true
    this.sentPartial = false
    this.hasNewSpeech = true
    this.frames.length = 0
    this.pendingSamples = 0
    if (this.onset) this.append(this.onset.audio, this.onset.info)
    this.quiet = 0
    this.onset = undefined
  }

  preview(): CapturedSpeech | null {
    if (!this.active || this.pendingSamples < this.rate * 0.5) return null
    let length = 0
    let first = this.frames.length
    while (first > 0 && length + this.frames[first - 1].length <= this.rate * 3) {
      length += this.frames[--first].length
    }
    if (length < this.rate * 0.5) return null
    const window = this.pcm.subarray(this.pendingSamples - length, this.pendingSamples)
    const audio = trimSilence(window)
    if (!audio) return null
    const offset = (audio.byteOffset - window.byteOffset) / Float32Array.BYTES_PER_ELEMENT
    // IPC owns only the returned window, not the entire reusable backing buffer.
    return this.packet(audio.slice(), this.cursor - length + offset + audio.length)
  }

  end(audio: Float32Array): CapturedSpeech | null {
    // VAD returns pre-roll plus the complete utterance. After a cut send only
    // fresh PCM. The recognizer owns any context reused at a proven hard cut.
    const length = this.sentPartial ? this.pendingSamples : audio.length
    const tail = audio.subarray(Math.max(0, audio.length - length))
    const packet = this.active && this.hasNewSpeech && tail.length >= this.rate / 4
      ? this.packet(tail.byteLength === tail.buffer.byteLength ? tail : tail.slice(), this.cursor) : null
    this.discard()
    return packet
  }

  /** Silero rejects a one-frame turn at the configured minimum speech
   * duration. Keep it only when that frame strongly indicates real speech. */
  recoverShortReply(): CapturedSpeech | null {
    const voiced = this.frames.filter(frame => frame.voiced)
    const shortReply = this.active && this.pendingSamples >= this.rate / 4 &&
      voiced.length === 1 && voiced[0].probability >= SHORT_REPLY_PROBABILITY
    const packet = shortReply
      ? this.packet(this.pcm.slice(0, this.pendingSamples), this.cursor)
      : null
    this.discard()
    return packet
  }

  discard(): void {
    this.active = false
    this.onset = undefined
    this.clearWindow()
  }

  private clearWindow(): void {
    this.segment++
    this.frames.length = 0
    this.pendingSamples = 0
    this.quiet = 0
    this.hasNewSpeech = false
  }

  private append(audio: Float32Array, info: CaptureFrame): void {
    const end = this.pendingSamples + audio.length
    if (end > this.pcm.length) {
      const replacement = new Float32Array(end)
      replacement.set(this.pcm.subarray(0, this.pendingSamples))
      this.pcm = replacement
    }
    this.pcm.set(audio, this.pendingSamples)
    this.frames.push(info)
    this.pendingSamples = end
  }

  private packet(audio: Float32Array, captureEndSample: number): CapturedSpeech {
    const captureStartSample = captureEndSample - audio.length
    let frameStart = this.cursor - this.pendingSamples
    let speechSamples = 0
    let speechEndSample = 0
    for (const frame of this.frames) {
      const frameEnd = frameStart + frame.length
      const speechStart = Math.max(frameStart, captureStartSample)
      const speechEnd = Math.min(frameEnd, captureEndSample)
      if (frame.voiced && speechEnd > speechStart) {
        speechSamples += speechEnd - speechStart
        speechEndSample = speechEnd - captureStartSample
      }
      frameStart = frameEnd
    }
    const evidence: SpeechEvidence = { speechSeconds: speechSamples / this.rate }
    if (captureStartSample >= 0 && speechEndSample > 0) {
      evidence.segment = `${this.captureId}:${this.segment}`
      evidence.speechEndSample = speechEndSample
      evidence.captureStartSample = captureStartSample
      evidence.captureEndSample = captureEndSample
    }
    return { audio, evidence }
  }
}
