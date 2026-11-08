import { describe, expect, it } from 'vitest'
import { chooseMediaCut, compactDigitalSilence, findOpeningSegmentEnd, findQuietSegmentEnd,
  mediaOverlapPrefix, stitchMediaText } from './media-segmentation'

describe('streamed media segmentation', () => {
  it('uses the first early sustained pause before the normal opening window', () => {
    const audio = new Float32Array(2_400).fill(0.5)
    audio.fill(0, 620, 680)
    audio.fill(0, 980, 1_020)
    expect(findOpeningSegmentEnd(audio, 100)).toBe(640)
  })

  it('does not use a short gap within the earlier opening', () => {
    const audio = new Float32Array(2_400).fill(0.5)
    audio.fill(0, 620, 644)
    audio.fill(0, 980, 1_020)
    expect(findOpeningSegmentEnd(audio, 100)).toBe(1_010)
  })

  it('finds a sustained early pause and leaves audio on both sides', () => {
    const audio = new Float32Array(2_400).fill(0.5)
    audio.fill(0, 980, 1_020)
    expect(findOpeningSegmentEnd(audio, 100)).toBe(1_010)
  })

  it('keeps the normal segment limit if the opening has no sustained pause', () => {
    const audio = new Float32Array(2_400).fill(0.5)
    audio.fill(0, 980, 990)
    audio.fill(0, 1_300, 1_340)
    expect(findOpeningSegmentEnd(audio, 100)).toBeNull()
  })

  it('does not add an STT call for a silent opening', () => {
    expect(findOpeningSegmentEnd(new Float32Array(2_400), 100)).toBeNull()
  })

  it('keeps speech around shortened digital silence without touching quiet audio', () => {
    const audio = new Float32Array(400).fill(0.0001)
    audio.fill(0, 50, 250)
    audio.fill(0, 300, 325)
    const shortened = compactDigitalSilence(audio, 100)
    expect(shortened).toEqual(Float32Array.from([...audio.subarray(0, 100), ...audio.subarray(250)]))
    expect(compactDigitalSilence(new Float32Array(300), 100)).toHaveLength(0)
  })

  it('keeps a short final segment intact', () => {
    expect(findQuietSegmentEnd(new Float32Array(500), 100, 10, 4)).toBe(500)
  })

  it('cuts a full segment at the quietest window near its end', () => {
    const audio = new Float32Array(1_000).fill(0.5)
    audio.fill(0, 760, 780)
    expect(findQuietSegmentEnd(audio, 100, 10, 4)).toBe(762)
  })

  it('never searches before the configured tail window', () => {
    const audio = new Float32Array(1_000).fill(0.5)
    audio.fill(0, 100, 120)
    expect(findQuietSegmentEnd(audio, 100, 10, 2)).toBeGreaterThanOrEqual(800)
  })

  it('classifies a cut through audible speech and protects an actual pause', () => {
    const audio = new Float32Array(2_400).fill(.1)
    const cut = chooseMediaCut(audio, 100)
    expect(cut.hard).toBe(true)
    const tail = audio.slice(cut.end - 110, cut.end)
    expect(mediaOverlapPrefix(tail, audio, 100)).toBe(tail)
    expect(mediaOverlapPrefix(tail, new Float32Array(20), 100)).toBeUndefined()
    audio.fill(0, 2_310, 2_350)
    expect(chooseMediaCut(audio, 100)).toEqual({ end: 2340, hard: false })
  })

  it('requires an exact substantial overlap and does not erase conflicting counts or short repeats', () => {
    expect(stitchMediaText('雇用統計は市場の予測', '市場の予測を上回りました。')).toEqual({
      merged: '雇用統計は市場の予測を上回りました。', appended: 'を上回りました。'
    })
    expect(stitchMediaText('That is one example', 'one example, and here is another.')).toEqual({
      merged: 'That is one example, and here is another.', appended: 'and here is another.'
    })
    expect(stitchMediaText('今日は15日', '今日は16日です。')).toBeNull()
    expect(stitchMediaText('そうです', 'そうです、本当です。')).toBeNull()
    expect(stitchMediaText('前月より10', '前月より100増えた')).toBeNull()
  })
})
