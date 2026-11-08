import { execFile } from 'node:child_process'
import { updatePerformanceState } from './performance-state'

/** pmset -g reports the current power profile, including the Low Power setting
 * on macOS versions that expose it. AC vs battery alone is not Low Power Mode. */
export function readLowPowerMode(output: string): boolean | undefined {
  const match = /^\s*lowpowermode[ \t]+([01])[ \t]*$/im.exec(output)
  return match ? match[1] === '1' : undefined
}

export function startMacLowPowerMonitor(): () => void {
  if (process.platform !== 'darwin') return () => {}
  let stopped = false
  let reading = false
  const refresh = (): void => {
    if (reading) return
    reading = true
    execFile('/usr/bin/pmset', ['-g'], { timeout: 2000, maxBuffer: 32 * 1024 }, (error, stdout) => {
      reading = false
      if (!stopped) updatePerformanceState({ lowPowerMode: error ? null : readLowPowerMode(stdout) ?? null })
    })
  }
  refresh()
  const timer = setInterval(refresh, 60_000)
  timer.unref()
  return () => { stopped = true; clearInterval(timer) }
}
