import { afterEach, expect, it } from 'vitest'
import { performanceState, updatePerformanceState } from './performance-state'
afterEach(() => updatePerformanceState({ thermalState: 'unknown', speedLimit: 100 }))
it('backs off source previews under OS thermal pressure and restores normal cadence', () => {
  updatePerformanceState({ thermalState: 'serious' })
  expect(performanceState().previewFloorMs).toBe(1500)
  updatePerformanceState({ thermalState: 'nominal', speedLimit: 40 })
  expect(performanceState().previewFloorMs).toBe(2500)
  updatePerformanceState({ speedLimit: 100 })
  expect(performanceState().previewFloorMs).toBe(0)
})
