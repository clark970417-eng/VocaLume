import { expect, it, vi } from 'vitest'
import { createInputLevel } from './input-level'

it('only requests samples for a visible listener and skips the same displayed percent', () => {
  const meter = createInputLevel()
  const notify = vi.fn()
  const unsubscribe = meter.subscribe(notify)
  expect(meter.needsSample).toBe(false)
  meter.setVisible(true)
  expect(meter.needsSample).toBe(true)
  meter.measure(Float32Array.of(0.05, -0.05))
  meter.measure(Float32Array.of(0.0501, -0.0501))
  expect(meter.getSnapshot()).toBe(25)
  expect(notify).toHaveBeenCalledTimes(1)
  meter.setVisible(false)
  expect(meter.getSnapshot()).toBe(0)
  expect(meter.needsSample).toBe(false)
  meter.setVisible(true)
  unsubscribe()
  expect(meter.needsSample).toBe(false)
})
