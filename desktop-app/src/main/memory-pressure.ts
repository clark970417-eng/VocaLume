import { execFile, spawn } from 'child_process'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { EventEmitter } from 'events'
import { resolveBridgeScript } from '../engines/SubprocessBridge'
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

type WatchPressure = (update: (state: MemoryPressure) => void, unavailable: () => void) => (() => void) | undefined

const watchMacMemoryPressure: WatchPressure = (update, unavailable) => {
  if (process.platform !== 'darwin') return
  const path = resolveBridgeScript('bin/voice-tone-helper')
  if (!existsSync(path)) return

  const child = spawn(path, ['--memory-pressure'], { stdio: ['pipe', 'pipe', 'ignore'] })
  let stopped = false
  let ready = false
  let buffer = ''
  const stop = (): void => {
    if (stopped) return
    stopped = true
    clearTimeout(timeout)
    child.stdin.end()
    child.kill()
  }
  const failed = (): void => {
    if (stopped) return
    stop()
    unavailable()
  }
  const timeout = setTimeout(failed, 1500)
  timeout.unref()
  child.once('error', failed)
  child.once('exit', failed)
  child.stdin.on('error', failed)
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    if (stopped) return
    buffer += chunk
    if (buffer.length > 128) { failed(); return }
    let end: number
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      if (!ready && line === 'ready') {
        ready = true
        clearTimeout(timeout)
      } else {
        const state = darwinMemoryPressure(line)
        if (!ready || state === 'unknown') { failed(); return }
        update(state)
      }
    }
  })
  return stop
}

interface PressureSession {
  timer?: ReturnType<typeof setTimeout>
  stopWatch?: () => void
  reading: boolean
  events: number
}

/** Read the starting level once, then use macOS notifications. If the helper
 * is unavailable, poll only during capture without overlapping reads. */
export function bindMemoryPressure(pipeline: EventEmitter, update: (state: MemoryPressure) => void,
  read = readMemoryPressure, watch = read === readMemoryPressure ? watchMacMemoryPressure : undefined): () => void {
  let session: PressureSession | undefined
  const poll = async (current: PressureSession): Promise<void> => {
    if (current !== session) return
    current.timer = undefined
    current.reading = true
    const previousEvents = current.events
    let state: MemoryPressure = 'unknown'
    try { state = await read() } catch { /* Unavailable sensors stay unknown. */ }
    current.reading = false
    if (current !== session) return
    if (previousEvents === current.events) update(state)
    if (current === session && !current.stopWatch) {
      current.timer = setTimeout(() => { void poll(current) }, 5000)
      current.timer.unref?.()
    }
  }
  const change = (state: string): void => {
    const active = ['initializing', 'running', 'recovering'].includes(state)
    if (active === Boolean(session)) return
    if (active) {
      const current: PressureSession = { reading: false, events: 0 }
      session = current
      try {
        current.stopWatch = watch?.(pressure => {
          if (current !== session) return
          current.events++
          update(pressure)
        }, () => {
          if (current !== session) return
          current.stopWatch = undefined
          if (!current.reading) void poll(current)
        })
      } catch { /* Fall back to the initial and periodic probes. */ }
      void poll(current)
    } else {
      const previous = session!
      session = undefined
      clearTimeout(previous.timer)
      previous.stopWatch?.()
      update('unknown')
    }
  }
  pipeline.on('state-change', change)
  return () => { pipeline.off('state-change', change); change('idle') }
}
