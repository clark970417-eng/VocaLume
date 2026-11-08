import { expect, it } from 'vitest'
import { FrameProcessor, Message } from '@ricky0123/vad-web'
import {
  CascadeCaptureBuffer, CAPTURE_CONTINUATION_THRESHOLD, CAPTURE_CUT_SAMPLES, CAPTURE_ONSET_THRESHOLD, PRE_SPEECH_PAD_MS
} from './cascadeCaptureBuffer'
import { releaseAcceptedVadAudio } from './vadAcceptedAudio'

const FRAME_SAMPLES = 1536
const frame = (value: number): Float32Array => new Float32Array(FRAME_SAMPLES).fill(value)

it('preserves the first preview and waits for half a second of new voiced audio for repeats', () => {
  const buffer = new CascadeCaptureBuffer()
  const reused = frame(0.2)
  buffer.push(frame(0.8), false, 0)
  buffer.push(frame(0.7), false, 0.9)
  buffer.startSpeech()
  for (let i = 0; i < 5; i++) buffer.push(reused, true, 0.15)
  expect(buffer.preview()).toBeNull()
  buffer.push(reused, true, 0.9)
  const first = buffer.preview()!
  expect(first.audio.length).toBe(6 * FRAME_SAMPLES)
  expect(first.audio[0]).toBeCloseTo(0.2)
  expect(first.evidence).toMatchObject({
    speechSeconds: FRAME_SAMPLES / 16_000,
    speechEndSample: 6 * FRAME_SAMPLES,
    captureStartSample: 2 * FRAME_SAMPLES, captureEndSample: 8 * FRAME_SAMPLES
  })
  reused.fill(0)
  for (let i = 0; i < 6; i++) buffer.push(reused, true, 0)
  expect(buffer.preview()).toBeNull()
  expect(first.audio[0]).toBeCloseTo(0.2)

  reused.fill(0.02)
  for (let i = 0; i < 6; i++) buffer.push(reused, true, 0.15)
  expect(buffer.preview()).toBeNull()

  reused.fill(0.3)
  for (let i = 0; i < 5; i++) buffer.push(reused, true, 0.9)
  expect(buffer.preview()).toBeNull()
  buffer.push(reused, true, 0.9)
  const renewed = buffer.preview()!
  expect(renewed.audio.at(-1)).toBeCloseTo(0.3)
  expect(renewed.evidence?.segment).toBe(first.evidence?.segment)
  expect(buffer.preview()).toBeNull()
})

it('retains only whole VAD frames in a full rolling preview', () => {
  const buffer = new CascadeCaptureBuffer()
  buffer.push(frame(0.2), false, 0.9)
  buffer.startSpeech()
  for (let i = 1; i <= 40; i++) buffer.push(frame(i / 100), true, 0.9)
  const preview = buffer.preview()!
  expect(preview.audio.length).toBe(31 * FRAME_SAMPLES)
  expect(preview.audio[0]).toBeCloseTo(0.1)
  expect(preview.audio.at(-1)).toBeCloseTo(0.4)
  expect(preview.evidence?.captureStartSample).toBe(10 * FRAME_SAMPLES)
})

it('releases accepted PCM inside MicVAD without losing first padding or a weak trailing frame', async () => {
  const buffer = new CascadeCaptureBuffer()
  const positive = (f: Float32Array): number => f[0] > 0 ? (f[0] < 0.05 ? 0.15 : 0.9) : 0
  const processor = new FrameProcessor(async (f) => ({ isSpeech: positive(f), notSpeech: 1 - positive(f) }),
    () => {}, {
      positiveSpeechThreshold: CAPTURE_ONSET_THRESHOLD,
      negativeSpeechThreshold: CAPTURE_CONTINUATION_THRESHOLD,
      preSpeechPadMs: PRE_SPEECH_PAD_MS, redemptionMs: 1400, minSpeechMs: 250, submitUserSpeechOnPause: false
    }, 96)
  const vad = { frameProcessor: processor }
  const outputs: Array<NonNullable<ReturnType<CascadeCaptureBuffer['finish']>>> = []
  let speaking = false
  processor.resume()
  const processFrame = (value: number): Promise<void> => processor.process(frame(value), event => {
    if (event.msg === Message.FrameProcessed && buffer.push(event.frame, speaking, event.probs.isSpeech)) {
      outputs.push(buffer.takeCut())
      releaseAcceptedVadAudio(vad)
    }
    if (event.msg === Message.SpeechStart) {
      speaking = true
      buffer.startSpeech()
    }
    if (event.msg === Message.SpeechEnd) {
      speaking = false
      const tail = buffer.finish(event.audio)
      if (tail) outputs.push(tail)
    }
  })
  for (let i = 1; i <= 10; i++) await processFrame(-i)
  for (let i = 0; i < Math.ceil(CAPTURE_CUT_SAMPLES / FRAME_SAMPLES); i++) await processFrame(0.5)
  expect(processor.audioBuffer.filter(value => value.frame.length > 0)).toHaveLength(1)
  await processFrame(0.02)
  for (let i = 0; i < 14; i++) await processFrame(0)
  expect(outputs).toHaveLength(2)
  expect(outputs[0].audio[0]).toBe(-3)
  expect(outputs[0].audio.at(-1)).toBe(0.5)
  expect(outputs[1].audio.length).toBe(15 * FRAME_SAMPLES)
  expect(outputs[1].audio[0]).toBeCloseTo(0.02)
  expect(outputs[1].evidence?.segment).not.toBe(outputs[0].evidence?.segment)
  expect(outputs[1].evidence?.captureStartSample).toBe(outputs[0].evidence?.captureEndSample)
  expect(outputs[1].evidence?.speechEndSample).toBe(FRAME_SAMPLES)
})

it('leaves unverified MicVAD versions untouched', () => {
  const audioBuffer = [{ frame: frame(0.2), isSpeech: true }]
  releaseAcceptedVadAudio({ frameProcessor: { audioBuffer, minSpeechFrames: 2 } }, '0.0.31')
  expect(audioBuffer[0].frame.length).toBe(FRAME_SAMPLES)
})
