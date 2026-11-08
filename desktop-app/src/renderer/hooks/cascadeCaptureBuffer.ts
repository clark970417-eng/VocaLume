import { trimSilence } from './trimCaptureSilence'
import { PcmRing } from '../../../../extension/streaming.mjs'
import type { CaptureSpeechEvidence } from '../../preload/capture-speech-evidence'

const SAMPLE_RATE = 16000
export const PRE_SPEECH_PAD_MS = 800
export const CAPTURE_ONSET_THRESHOLD = 0.25
export const CAPTURE_CONTINUATION_THRESHOLD = 0.1
export const CAPTURE_CUT_SAMPLES = 8 * SAMPLE_RATE
const PREVIEW_SAMPLES = 3 * SAMPLE_RATE
const MIN_PREVIEW_SAMPLES = SAMPLE_RATE / 2
const REPEAT_PREVIEW_SPEECH_SAMPLES = SAMPLE_RATE / 2
type CaptureChunk = { audio: Float32Array; evidence?: CaptureSpeechEvidence }
let nextCapture = 0

/** One bounded buffer for complete cuts and rolling previews. */
export class CascadeCaptureBuffer {
  // A VAD callback can cross the cut threshold by at most one frame.
  private readonly pcm = new PcmRing(CAPTURE_CUT_SAMPLES + PRE_SPEECH_PAD_MS * 16 + 2048)
  private readonly capture = ++nextCapture
  private cue = 0
  private clock = 0
  private lastSpeechEnd = 0
  private readonly positiveStarts = new Float64Array(256)
  private readonly positiveFrames = new Float64Array(256)
  private positiveCount = 0
  private pending = 0
  private firstPadding = 0
  private previewExcludedSamples = 0
  private lastFrameSamples = 0
  private positiveSamplesSincePreview = 0
  private previewSent = false
  private sentCut = false

  push(frame: Float32Array, speaking: boolean, speechProbability: number): boolean {
    this.lastFrameSamples = frame.length
    this.clock += frame.length
    this.pcm.push(frame)
    if (!speaking) return false
    this.pending += frame.length
    if (speechProbability >= CAPTURE_CONTINUATION_THRESHOLD) this.lastSpeechEnd = this.clock
    if (speechProbability >= CAPTURE_ONSET_THRESHOLD) {
      this.positiveSamplesSincePreview += frame.length
      this.recordPositiveFrame()
    }
    return this.pending >= CAPTURE_CUT_SAMPLES
  }

  startSpeech(): void {
    this.pending = this.lastFrameSamples
    // Match the rolling preview's original start at the first frame after onset.
    // The first complete cut still retains the onset and its pre-speech padding.
    this.previewExcludedSamples = this.lastFrameSamples
    const padFrames = Math.floor(PRE_SPEECH_PAD_MS * 16 / this.lastFrameSamples)
    this.firstPadding = Math.min(this.pcm.length - this.lastFrameSamples, padFrames * this.lastFrameSamples)
    this.resetPreview()
    this.sentCut = false
    this.cue++
    this.lastSpeechEnd = this.clock
    this.positiveCount = 0
    this.recordPositiveFrame()
  }

  preview(): CaptureChunk | null {
    const available = this.pending - this.previewExcludedSamples
    // Weak speech may extend the final cue, but repeat previews need new voiced audio.
    if (available < MIN_PREVIEW_SAMPLES ||
        (this.previewSent && this.positiveSamplesSincePreview < REPEAT_PREVIEW_SPEECH_SAMPLES)) return null
    const maxWindow = Math.floor(PREVIEW_SAMPLES / this.lastFrameSamples) * this.lastFrameSamples
    const raw = this.pcm.snapshot(Math.min(available, maxWindow))
    const audio = trimSilence(raw)
    if (!audio) return null
    this.previewSent = true
    this.positiveSamplesSincePreview = 0
    const start = this.clock - raw.length + (audio.byteOffset - raw.byteOffset) / Float32Array.BYTES_PER_ELEMENT
    return this.chunk(audio, start)
  }

  takeCut(): CaptureChunk {
    const audio = this.pcm.snapshot(this.pending + this.firstPadding)
    const chunk = this.chunk(audio, this.clock - audio.length)
    this.clear()
    this.sentCut = true
    this.cue++
    return chunk
  }

  finish(vadAudio: Float32Array): CaptureChunk | null {
    // MicVAD may still include part or all of earlier cuts; only send the tail.
    const tail = this.sentCut ? vadAudio.subarray(Math.max(0, vadAudio.length - this.pending)) : vadAudio
    const accepted = !this.sentCut || tail.length >= SAMPLE_RATE / 4
    const chunk = accepted ? this.chunk(tail, this.clock - tail.length) : null
    this.clear()
    this.sentCut = false
    return chunk
  }

  clear(): void {
    this.pcm.clear()
    this.pending = 0
    this.firstPadding = 0
    this.previewExcludedSamples = 0
    this.lastFrameSamples = 0
    this.lastSpeechEnd = 0
    this.positiveCount = 0
    this.resetPreview()
  }

  private resetPreview(): void {
    this.previewSent = false
    this.positiveSamplesSincePreview = 0
  }

  private recordPositiveFrame(): void {
    this.positiveStarts[this.positiveCount] = this.clock - this.lastFrameSamples
    this.positiveFrames[this.positiveCount++] = this.clock
  }

  private chunk(audio: Float32Array, start: number): CaptureChunk {
    const end = start + audio.length
    if (start < 0 || this.lastSpeechEnd <= start || this.lastSpeechEnd > end ||
        this.positiveCount > this.positiveFrames.length) return { audio }
    let positiveSamples = 0
    for (let i = 0; i < this.positiveCount; i++) {
      const frameEnd = this.positiveFrames[i]
      positiveSamples += Math.max(0, Math.min(end, frameEnd) - Math.max(start, this.positiveStarts[i]))
    }
    return {
      audio,
      evidence: {
        segment: `desktop-${this.capture}:${this.cue}`,
        speechSeconds: positiveSamples / SAMPLE_RATE,
        speechEndSample: this.lastSpeechEnd - start,
        captureStartSample: start,
        captureEndSample: end
      }
    }
  }
}
