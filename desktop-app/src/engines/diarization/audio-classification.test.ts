import { describe, expect, it } from 'vitest'
import { isAcousticLaughter, SpeakerClusters } from './audio-classification'

describe('speaker labels within a session', () => {
  it('reuses labels and rejects ambiguous identities', () => {
    const clusters = new SpeakerClusters()
    const identify = (...values: number[]) => clusters.identify(Float32Array.from(values))
    expect(identify(1, 0, 0)?.speakerLabel).toBe('Speaker 1')
    expect(identify(0.1, 0.99, 0)?.speakerLabel).toBe('Speaker 2')
    expect(identify(0.9, 0.1, 0)?.speakerLabel).toBe('Speaker 1')
    expect(identify(0.1, 0.9, 0)?.speakerLabel).toBe('Speaker 2')
    expect(identify(1, 1, 0)).toBeNull()
    expect(identify(0, 0, 0)).toBeNull()
    expect(identify(1, NaN, 0)).toBeNull()
  })
})

describe('Windows acoustic laughter', () => {
  it('accepts a prominent laugh and rejects weak and incidental labels', () => {
    expect(isAcousticLaughter([{ name: 'Snicker', prob: 0.615 }])).toBe(true)
    expect(isAcousticLaughter([{ name: 'Laughter', prob: 0.38 }])).toBe(false)
    expect(isAcousticLaughter([{ name: 'Speech', prob: 0.78 }, { name: 'Laughter', prob: 0.56 }])).toBe(false)
    expect(isAcousticLaughter([{ name: 'Silence', prob: 0.53 }])).toBe(false)
    expect(isAcousticLaughter([])).toBe(false)
  })
})
