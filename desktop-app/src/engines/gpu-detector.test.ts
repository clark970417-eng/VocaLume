import { EventEmitter } from 'node:events'
import { expect, it, vi, afterEach } from 'vitest'
const forks = vi.hoisted(() => ({ create: vi.fn() }))
const native = vi.hoisted(() => ({ getLlama: vi.fn() }))
vi.mock('electron', () => ({ utilityProcess: { fork: forks.create } }))
vi.mock('node-llama-cpp', () => ({ getLlama: native.getLlama }))
afterEach(() => { vi.useRealTimers(); vi.resetModules(); forks.create.mockReset() })
it('preserves the existing in-process detection path on macOS', async () => {
  const platform = process.platform
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  native.getLlama.mockResolvedValue({ getGpuDeviceNames: async () => ['Apple M5'] })
  try {
    const { detectGpu } = await import('./gpu-detector')
    expect(await detectGpu()).toEqual({ hasGpu: true, gpuNames: ['Apple M5'] })
    expect(forks.create).not.toHaveBeenCalled()
    expect(native.getLlama).toHaveBeenCalledWith({ gpu: 'auto' })
  } finally { Object.defineProperty(process, 'platform', { value: platform }) }
})
it('coalesces probes, caches results and terminates the isolated native process', async () => {
  const child = Object.assign(new EventEmitter(), { kill: vi.fn() })
  forks.create.mockReturnValue(child)
  const { detectGpu } = await import('./gpu-detector')
  const first = detectGpu()
  expect(detectGpu()).toBe(first)
  child.emit('message', { gpuNames: ['NVIDIA RTX 4050'] })
  expect(await first).toEqual({ hasGpu: true, gpuNames: ['NVIDIA RTX 4050'] })
  expect(child.kill).toHaveBeenCalledOnce()
  expect(await detectGpu()).toEqual(await first)
  expect(forks.create).toHaveBeenCalledOnce()
})
it('bounds a stuck native probe and permits a later retry', async () => {
  vi.useFakeTimers()
  const child = Object.assign(new EventEmitter(), { kill: vi.fn() })
  forks.create.mockReturnValue(child)
  const { detectGpu } = await import('./gpu-detector')
  const first = detectGpu()
  await vi.advanceTimersByTimeAsync(15000)
  expect(await first).toEqual({ hasGpu: false, gpuNames: [] })
  const retry = detectGpu()
  child.emit('message', { gpuNames: [] })
  await retry
  expect(forks.create).toHaveBeenCalledTimes(2)
})
