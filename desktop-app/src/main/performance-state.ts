export type MemoryPressure = 'unknown' | 'nominal' | 'warning' | 'critical'
/** OS pressure is independent from decoding speed; unsupported platforms stay unknown. */
export class PerformanceMonitor {
  private thermalState = 'unknown'
  private speedLimit = 100
  private memoryPressure: MemoryPressure = 'unknown'
  private level = 0
  private recoverAt = 0
  private analysisHealthySince = -Infinity

  update(update: { thermalState?: string; speedLimit?: number; memoryPressure?: MemoryPressure }, now = performance.now()): void {
    if (['unknown', 'nominal', 'fair', 'serious', 'critical'].includes(update.thermalState || '')) this.thermalState = update.thermalState!
    if (Number.isFinite(update.speedLimit)) this.speedLimit = Math.max(1, Math.min(100, update.speedLimit!))
    if (['unknown', 'nominal', 'warning', 'critical'].includes(update.memoryPressure || '')) this.memoryPressure = update.memoryPressure!
    this.snapshot(now)
  }

  snapshot(now = performance.now()): {
    thermalState: string; speedLimit: number; previewFloorMs: number
    previewDutyCycle: number; previewsPaused: boolean; coolingDown: boolean
    optionalAnalysisAllowed: boolean
    memoryPressure?: MemoryPressure
  } {
    const target = this.thermalState === 'critical' || this.speedLimit < 50 || this.memoryPressure === 'critical' ? 3
      : this.thermalState === 'serious' || this.speedLimit < 80 || this.memoryPressure === 'warning' ? 2 : this.thermalState === 'fair' ? 1 : 0
    if (target > 0) this.analysisHealthySince = Infinity
    else if (this.analysisHealthySince === Infinity) this.analysisHealthySince = now
    if (target >= this.level) {
      this.level = target
      this.recoverAt = now + 30_000
    } else if (now >= this.recoverAt) {
      // Restore one step at a time; a brief nominal reading must not restart
      // full-rate inference while the fanless machine is still cooling.
      const steps = 1 + Math.floor((now - this.recoverAt) / 30_000)
      this.level = Math.max(target, this.level - steps)
      this.recoverAt += steps * 30_000
    }
    return {
      thermalState: this.thermalState, speedLimit: this.speedLimit,
      memoryPressure: this.memoryPressure,
      previewFloorMs: [0, 900, 1500, 2500][this.level]!,
      previewDutyCycle: [0.85, 0.65, 0.4, 0.25][this.level]!,
      previewsPaused: this.level === 3, coolingDown: this.level > target,
      // Explicit cue analysis is occasional. Wait for stable recovery without
      // lifting the longer cadence cooldown for rolling previews.
      optionalAnalysisAllowed: now - this.analysisHealthySince >= 4000
    }
  }
}
const monitor = new PerformanceMonitor()
const optionalAnalysisStops = new Set<() => void>()
export function onOptionalAnalysisPause(stop: () => void): () => void {
  optionalAnalysisStops.add(stop)
  return () => { optionalAnalysisStops.delete(stop) }
}

export const updatePerformanceState = (update: { thermalState?: string; speedLimit?: number; memoryPressure?: MemoryPressure }): void => {
  monitor.update(update)
  if (!monitor.snapshot().optionalAnalysisAllowed) {
    for (const stop of optionalAnalysisStops) stop()
  }
}
export const performanceState = (): ReturnType<PerformanceMonitor['snapshot']> => monitor.snapshot()
