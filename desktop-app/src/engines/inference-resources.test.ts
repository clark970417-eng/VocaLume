import { describe, expect, it } from 'vitest'
import { macInferenceThreads, windowsInferenceThreads, windowsVramPadding } from './inference-resources'

describe('Windows inference resource budget', () => {
  it.each([
    [1,1,1], [2,1,1], [4,2,2], [8,4,4], [16,4,6], [32,4,6], [128,4,6]
  ])('bounds concurrent STT/LLM threads on %i logical CPUs', (cpus,whisper,llama) => {
    expect(windowsInferenceThreads(cpus)).toEqual({whisper,llama})
  })
  it.each([0,-1,NaN,Infinity])('never passes zero/unlimited threads for invalid capacity %s', cpus => {
    expect(windowsInferenceThreads(cpus)).toEqual({whisper:1,llama:1})
  })
  it('reserves compositor headroom without excluding all low-VRAM offload', () => {
    const gib = 1024 ** 3
    expect(windowsVramPadding(2*gib)).toBeCloseTo(.4*gib)
    expect(windowsVramPadding(6*gib)).toBeCloseTo(1.2*gib)
    expect(windowsVramPadding(24*gib)).toBe(2*gib)
  })
})

describe('macOS inference resource budget', () => {
  it.each([[1, 1, 1], [4, 2, 2], [8, 2, 4], [10, 2, 4], [32, 2, 4], [NaN, 1, 1]])(
    'reserves CPU capacity while keeping an executable cap for %i available cores',
    (cpus, speech, llama) => {
      expect(macInferenceThreads(cpus)).toEqual({ speech, llama })
    }
  )
})
