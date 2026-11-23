import { expect, it } from 'vitest'
import { CascadeCapture, captureBoundary, type CapturedSpeech } from './captureSegmentation'

const rate = 16000
const frameSize = 1536
const voice = new Float32Array(frameSize).fill(0.2)
const silence = new Float32Array(frameSize)

function vadAudio(leadingFrames: number, voicedFrames: number, trailingFrames: number): Float32Array {
  const audio = new Float32Array((leadingFrames + voicedFrames + trailingFrames) * frameSize)
  audio.fill(voice[0], leadingFrames * frameSize, (leadingFrames + voicedFrames) * frameSize)
  return audio
}

it('uses a real pause before a hard limit and keeps the longer offline capture window', () => {
  expect(captureBoundary(3, 0.16, true)).toBeUndefined()
  expect(captureBoundary(2, 0.26, true)).toBeUndefined()
  expect(captureBoundary(3, 0.26, true)).toBe('pause')
  expect(captureBoundary(5.9, 0, true)).toBeUndefined()
  expect(captureBoundary(6, 0.26, true)).toBe('pause')
  expect(captureBoundary(6, 0, true)).toBe('limit')
  expect(captureBoundary(6, 0.3, false)).toBeUndefined()
  expect(captureBoundary(8, 0, false)).toBe('limit')
})

it('describes the exact trimmed preview and the full VAD final as the same cue', () => {
  const capture = new CascadeCapture('capture', true, rate)
  for (let i = 0; i < 2; i++) capture.push(silence, 0)
  capture.push(voice, 0.8)
  capture.start()
  for (let i = 0; i < 7; i++) capture.push(voice, 0.8)
  for (let i = 0; i < 3; i++) capture.push(silence, 0)

  const preview = capture.preview()!
  expect(preview.audio.length).toBeLessThan(11 * frameSize)
  expect(preview.audio.buffer.byteLength).toBe(preview.audio.byteLength)
  expect(preview.evidence).toEqual({
    segment: 'capture:0', speechSeconds: 8 * frameSize / rate, speechEndSample: 8 * frameSize,
    captureStartSample: 2 * frameSize, captureEndSample: 2 * frameSize + preview.audio.length
  })

  capture.push(silence, 0)
  const audio = vadAudio(2, 8, 4)
  const final = capture.end(audio)!
  expect(final.audio).toEqual(audio)
  expect(final.evidence).toEqual({
    segment: preview.evidence.segment, speechSeconds: preview.evidence.speechSeconds, speechEndSample: 10 * frameSize,
    captureStartSample: 0, captureEndSample: audio.length
  })
})

it('keeps only fresh PCM after a hard cut and describes a contiguous short continuation', () => {
  const capture = new CascadeCapture('capture', true, rate)
  capture.push(voice, 0.8)
  capture.start()
  let first: CapturedSpeech | null = null
  for (let i = 1; i < 63; i++) first = capture.push(voice, 0.8) ?? first
  expect(first?.audio).toHaveLength(63 * frameSize)
  expect(first?.evidence.continuationExpected).toBe(true)

  for (let i = 0; i < 2; i++) capture.push(voice, 0.8)
  for (let i = 0; i < 4; i++) capture.push(silence, 0)
  const final = capture.end(vadAudio(0, 65, 4))!
  expect(final.audio).toEqual(vadAudio(0, 2, 4))
  expect(final.audio.buffer.byteLength).toBe(final.audio.byteLength)
  expect(final.evidence).toEqual({
    segment: 'capture:1', speechSeconds: 2 * frameSize / rate, speechEndSample: 2 * frameSize,
    captureStartSample: first?.evidence.captureEndSample, captureEndSample: 69 * frameSize
  })
})

it('does not mark a natural pause as continuation or resend silence after it', () => {
  const capture = new CascadeCapture('capture', true, rate)
  capture.push(voice, 0.8)
  capture.start()
  for (let i = 1; i < 24; i++) capture.push(voice, 0.8)
  for (let i = 0; i < 2; i++) expect(capture.push(silence, 0)).toBeNull()
  const final = capture.push(silence, 0)!
  expect(final.audio).toHaveLength(27 * frameSize)
  expect(final.evidence.continuationExpected).toBeUndefined()
  capture.push(silence, 0)
  expect(capture.end(vadAudio(0, 24, 4))).toBeNull()

  capture.push(voice, 0.8)
  capture.start()
  for (let i = 0; i < 5; i++) capture.push(voice, 0.8)
  expect(capture.preview()?.evidence.segment).not.toBe(final.evidence.segment)
})

it('recovers a single clear reply from a VAD misfire without promoting weak noise', () => {
  const capture = new CascadeCapture('capture', true, rate)
  const playReply = (probability: number): CapturedSpeech | null => {
    capture.push(voice, probability)
    capture.start()
    for (let i = 0; i < 4; i++) capture.push(silence, 0)
    return capture.recoverShortReply()
  }
  expect(playReply(0.41)).toBeNull()
  const result = playReply(0.89)
  expect(result?.audio).toEqual(vadAudio(0, 1, 4))
  expect(result?.evidence).toMatchObject({
    captureStartSample: 5 * frameSize, captureEndSample: 10 * frameSize, speechSeconds: 0.096, speechEndSample: frameSize
  })
  expect(capture.recoverShortReply()).toBeNull()
})
