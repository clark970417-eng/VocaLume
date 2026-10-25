import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import type { EventEmitter } from 'events'
import type { MemoryPressure } from './performance-state'

export function darwinMemoryPressure(value: string): MemoryPressure {
  switch (value.trim()) {
    case '1': return 'nominal'
    case '2': return 'warning'
    case '4': return 'critical'
    default: return 'unknown'
  }
}

/** Free memory is a resource signal on non-Mac platforms, not a temperature or
 * an inference about pressure from an old accumulated swap allocation. */
export function availableMemoryPressure(memory: { total: number; free: number }): MemoryPressure {
  const { total, free } = memory
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free) || free < 0 || free > total) return 'unknown'
  if (free < 256 * 1024 && free / total < .02) return 'critical'
  if (free < 768 * 1024 && free / total < .05) return 'warning'
  return 'nominal'
}

export function linuxMemoryPressure(value: string): MemoryPressure {
  const total = /^MemTotal:\s+(\d+)\s+kB$/m.exec(value)
  const available = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(value)
  // MemFree alone excludes reclaimable cache and would pause drafts on a
  // healthy Linux desktop. Without MemAvailable the signal is unknown.
  return total && available ? availableMemoryPressure({ total: Number(total[1]), free: Number(available[1]) }) : 'unknown'
}

export function readMemoryPressure(): Promise<MemoryPressure> {
  if (process.platform === 'linux') return readFile('/proc/meminfo', 'utf8').then(linuxMemoryPressure, () => 'unknown')
  if (process.platform !== 'darwin') {
    try { return Promise.resolve(availableMemoryPressure(process.getSystemMemoryInfo())) }
    catch { return Promise.resolve('unknown') }
  }
  return new Promise(resolve => {
    execFile('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { timeout: 1500 },
      (error, stdout) => resolve(error ? 'unknown' : darwinMemoryPressure(stdout)))
  })
}

/** One asynchronous check every five seconds while audio is active. A stale
 * response after Stop/dispose cannot change the next session's policy. */
export function bindMemoryPressure(pipeline: EventEmitter, update: (state: MemoryPressure) => void,
  read = readMemoryPressure): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let epoch = 0, active = false
  const poll = async (generation: number): Promise<void> => {
    let state: MemoryPressure = 'unknown'
    try { state = await read() } catch { /* Unavailable sensors stay unknown. */ }
    if (!active || generation !== epoch) return
    update(state)
    timer = setTimeout(() => { void poll(generation) }, 5000)
    timer.unref?.()
  }
  const change = (state: string): void => {
    const next = ['initializing', 'running', 'recovering'].includes(state)
    if (next === active) return
    active = next; epoch++
    if (timer) clearTimeout(timer)
    timer = undefined
    if (active) void poll(epoch)
    else update('unknown')
  }
  pipeline.on('state-change', change)
  return () => { pipeline.off('state-change', change); change('idle') }
}
