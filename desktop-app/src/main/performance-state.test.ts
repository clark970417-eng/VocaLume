import { expect, it } from 'vitest'
import { PerformanceMonitor } from './performance-state'

it('reduces optional inference immediately and restores one step per 30 seconds', () => {
  const monitor = new PerformanceMonitor()
  monitor.update({ thermalState: 'serious' }, 0)
  expect(monitor.snapshot(0)).toMatchObject({ previewFloorMs: 1500, previewDutyCycle: 0.4 })
  monitor.update({ thermalState: 'nominal' }, 1000)
  expect(monitor.snapshot(29_999)).toMatchObject({ previewFloorMs: 1500, coolingDown: true })
  expect(monitor.snapshot(30_000).previewFloorMs).toBe(900)
  expect(monitor.snapshot(60_000)).toMatchObject({ previewFloorMs: 0, coolingDown: false })
})

it('pauses only optional previews at critical pressure or severe speed limits', () => {
  const monitor = new PerformanceMonitor()
  monitor.update({ speedLimit: 40 }, 0)
  expect(monitor.snapshot(0).previewsPaused).toBe(true)
  monitor.update({ speedLimit: 100 }, 10)
  expect(monitor.snapshot(29_999).previewsPaused).toBe(true)
  expect(monitor.snapshot(90_000)).toMatchObject({ previewFloorMs: 0, previewsPaused: false })
  monitor.update({ thermalState: 'critical' }, 91_000)
  expect(monitor.snapshot(91_000).previewsPaused).toBe(true)
})

it('restarts recovery after pressure rises again and ignores invalid samples', () => {
  const monitor = new PerformanceMonitor()
  monitor.update({ thermalState: 'fair' }, 0)
  monitor.update({ thermalState: 'nominal' }, 1)
  monitor.update({ thermalState: 'serious' }, 29_000)
  monitor.update({ thermalState: 'nominal' }, 29_001)
  expect(monitor.snapshot(30_000).previewFloorMs).toBe(1500)
  monitor.update({ thermalState: 'invalid', speedLimit: NaN }, 30_001)
  expect(monitor.snapshot(30_001)).toMatchObject({ thermalState: 'nominal', speedLimit: 100 })
  expect(monitor.snapshot(59_000).previewFloorMs).toBe(900)
})
