import { expect, it, vi } from 'vitest'
import { PerformanceMonitor, subscribePerformanceState, updatePerformanceState } from './performance-state'

it('reduces optional inference immediately and restores one step per 30 seconds', () => {
  const monitor = new PerformanceMonitor()
  monitor.update({ thermalState: 'serious' }, 0)
  expect(monitor.snapshot(0)).toMatchObject({ previewFloorMs: 1500, previewDutyCycle: 0.4 })
  monitor.update({ thermalState: 'nominal' }, 1000)
  expect(monitor.snapshot(30_999)).toMatchObject({ previewFloorMs: 1500, coolingDown: true })
  expect(monitor.snapshot(31_000).previewFloorMs).toBe(900)
  expect(monitor.snapshot(61_000)).toMatchObject({ previewFloorMs: 0, coolingDown: false })
})

it('pauses only optional previews at critical pressure or severe speed limits', () => {
  const monitor = new PerformanceMonitor()
  monitor.update({ speedLimit: 40 }, 0)
  expect(monitor.snapshot(0).previewsPaused).toBe(true)
  monitor.update({ speedLimit: 100 }, 10)
  expect(monitor.snapshot(29_999).previewsPaused).toBe(true)
  expect(monitor.snapshot(90_010)).toMatchObject({ previewFloorMs: 0, previewsPaused: false })
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
  expect(monitor.snapshot(59_001).previewFloorMs).toBe(900)
})

it('uses the stronger memory/thermal signal and recovers gradually without reading old swap totals',()=>{
 const monitor=new PerformanceMonitor()
 monitor.update({thermalState:'nominal',memoryPressure:'warning'},0)
 expect(monitor.snapshot(0)).toMatchObject({memoryPressure:'warning',previewFloorMs:1500,previewsPaused:false})
 monitor.update({memoryPressure:'critical'},1)
 expect(monitor.snapshot(1).previewsPaused).toBe(true)
 monitor.update({memoryPressure:'nominal'},2)
 expect(monitor.snapshot(29_999).previewsPaused).toBe(true)
 expect(monitor.snapshot(90_002)).toMatchObject({previewsPaused:false,previewFloorMs:0})
 monitor.update({thermalState:'serious',memoryPressure:'nominal'},90_002)
 expect(monitor.snapshot(90_002).previewFloorMs).toBe(1500)
})

it('starts the cooldown when pressure falls even after a long gap between samples', () => {
  const monitor = new PerformanceMonitor()
  monitor.update({ thermalState: 'critical' }, 0)
  monitor.update({ thermalState: 'nominal' }, 180_000)
  expect(monitor.snapshot(209_999)).toMatchObject({ previewsPaused: true, coolingDown: true })
  expect(monitor.snapshot(210_000)).toMatchObject({ previewsPaused: false, speculativeTranslationPaused: true })
})

it('publishes cooldown steps automatically without another OS pressure signal', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const report = vi.fn()
  const unsubscribe = subscribePerformanceState(report)
  try {
    updatePerformanceState({ thermalState: 'serious' })
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({
      auxiliaryWorkPaused: true, speculativeTranslationPaused: true, previewsPaused: false
    }))
    updatePerformanceState({ thermalState: 'serious' })
    expect(report).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(1000)
    updatePerformanceState({ thermalState: 'nominal' })
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(30_000)
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({
      auxiliaryWorkPaused: true, speculativeTranslationPaused: false, coolingDown: true
    }))
    vi.advanceTimersByTime(30_000)
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({
      auxiliaryWorkPaused: false, speculativeTranslationPaused: false, coolingDown: false
    }))
    expect(vi.getTimerCount()).toBe(0)
    unsubscribe()
    report.mockClear()
    updatePerformanceState({ speedLimit: 99 })
    expect(report).not.toHaveBeenCalled()
  } finally {
    unsubscribe()
    vi.clearAllTimers()
    vi.useRealTimers()
    updatePerformanceState({ thermalState: 'nominal', speedLimit: 100 })
  }
})
