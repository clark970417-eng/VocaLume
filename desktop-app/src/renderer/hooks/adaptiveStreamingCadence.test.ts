import { describe, expect, it } from 'vitest'
import { firstCloudFollowUpRetry, getAdaptiveStreamingDelay } from './adaptiveStreamingCadence'

describe('getAdaptiveStreamingDelay', () => {
  it('avoids repeated incomplete cloud previews while honoring a slower user cadence', () => {
    expect(getAdaptiveStreamingDelay(800, 0, true)).toBe(1200)
    expect(getAdaptiveStreamingDelay(800, 6000, true)).toBe(1400)
    expect(getAdaptiveStreamingDelay(2500, 1000, true)).toBe(2500)
  })
  it('gets the first hypothesis out within 500ms', () => {
    expect(getAdaptiveStreamingDelay(800, 0)).toBe(500)
  })

  it('uses the selected cadence for an ordinary utterance', () => {
    expect(getAdaptiveStreamingDelay(800, 2500)).toBe(800)
  })

  it('backs off during long speech to avoid redundant queueing', () => {
    expect(getAdaptiveStreamingDelay(800, 6000)).toBe(1100)
  })

  it('preserves a user-selected 500ms low-latency cadence', () => {
    expect(getAdaptiveStreamingDelay(500, 0)).toBe(500)
  })
})

it('honors a short admission wait before the first cloud follow-up reaches a likely final', () => {
  expect(firstCloudFollowUpRetry(2400, 403, true)).toBe(403)
  expect(firstCloudFollowUpRetry(2400, 800, true)).toBeNull()
  expect(firstCloudFollowUpRetry(2900, 300, true)).toBeNull()
  expect(firstCloudFollowUpRetry(2400, 403, false)).toBeNull()
})
