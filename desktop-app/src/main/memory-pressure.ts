import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'
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

interface WindowsMemoryInfo { total: number; free: number; swapTotal: number; swapFree: number }

export function windowsMemoryPressure(memory: WindowsMemoryInfo, sustainedPaging = false): MemoryPressure {
  const physical = availableMemoryPressure(memory)
  const { free, total, swapFree, swapTotal } = memory
  if (physical === 'unknown' || physical === 'critical') return physical
  // Chromium maps these Windows fields to GlobalMemoryStatusEx commit
  // capacity and remaining commit, in KiB.
  if (!Number.isFinite(swapTotal) || !Number.isFinite(swapFree) ||
      swapTotal <= 0 || swapFree < 0 || swapFree > swapTotal) return physical
  const commitRemaining = swapFree / swapTotal
  if (commitRemaining <= .025 || swapFree < 256 * 1024) return 'critical'
  if (physical === 'warning' || commitRemaining <= .09 ||
      (free < Math.min(total * .1, 768 * 1024) && swapFree < 1536 * 1024) ||
      (sustainedPaging && free < 1024 * 1024 && commitRemaining < .25)) return 'warning'
  return physical
}

let nextPagingSample = 0
let pagingStreak = 0

async function readWindowsMemoryPressure(memory: WindowsMemoryInfo): Promise<MemoryPressure> {
  const pressure = windowsMemoryPressure(memory)
  // Normal load uses the existing in-process read. Check page reads only
  // when physical and commit headroom are both falling near the threshold.
  if (pressure !== 'nominal' || memory.free >= 1024 * 1024 || memory.swapFree >= memory.swapTotal * .25) {
    pagingStreak = 0
    return pressure
  }
  const now = performance.now()
  if (now >= nextPagingSample) {
    nextPagingSample = now + 20_000
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const shell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const pages = await new Promise<number>((resolve) => {
      execFile(shell, ['-NoProfile', '-NonInteractive', '-Command',
        '(Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -Property PagesInputPersec).PagesInputPersec'],
      { timeout: 1500, windowsHide: true }, (error, stdout) => resolve(error || !stdout.trim() ? NaN : Number(stdout.trim())))
    })
    pagingStreak = Number.isFinite(pages) && pages >= 150 ? Math.min(2, pagingStreak + 1) : 0
  }
  return windowsMemoryPressure(memory, pagingStreak >= 2)
}

export function readMemoryPressure(): Promise<MemoryPressure> {
  if (process.platform === 'linux') return readFile('/proc/meminfo', 'utf8').then(linuxMemoryPressure, () => 'unknown')
  if (process.platform !== 'darwin') {
    try {
      const memory = process.getSystemMemoryInfo()
      return process.platform === 'win32' ? readWindowsMemoryPressure(memory) : Promise.resolve(availableMemoryPressure(memory))
    }
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
