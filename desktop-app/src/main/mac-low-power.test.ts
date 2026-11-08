import { expect, it } from 'vitest'
import { readLowPowerMode } from './mac-low-power'
import { PerformanceMonitor } from './performance-state'

it('uses the current macOS power profile and does not infer low power from battery alone', () => {
  expect(readLowPowerMode('Currently in use:\n lowpowermode     1\n sleep 10\n')).toBe(true)
  expect(readLowPowerMode('Currently in use:\n lowpowermode     0\n')).toBe(false)
  expect(readLowPowerMode('Now drawing from Battery Power')).toBeUndefined()
  const monitor = new PerformanceMonitor()
  monitor.update({ thermalState: 'nominal', lowPowerMode: true }, 0)
  expect(monitor.snapshot(0)).toMatchObject({ auxiliaryWorkPaused: true, previewsPaused: false })
  monitor.update({ lowPowerMode: false }, 1000)
  expect(monitor.snapshot(1000).auxiliaryWorkPaused).toBe(true)
  expect(monitor.snapshot(31_000).auxiliaryWorkPaused).toBe(false)
})
