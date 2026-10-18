/** OS pressure is independent from decoding speed; unsupported platforms stay unknown. */
export class PerformanceMonitor {
  private thermalState = 'unknown'
  private speedLimit = 100
  private level = 0
  private recoverAt = 0

  update(update: { thermalState?: string; speedLimit?: number }, now = performance.now()): void {
    if (['unknown', 'nominal', 'fair', 'serious', 'critical'].includes(update.thermalState || '')) this.thermalState = update.thermalState!
    if (Number.isFinite(update.speedLimit)) this.speedLimit = Math.max(1, Math.min(100, update.speedLimit!))
    this.snapshot(now)
  }

  snapshot(now = performance.now()): {
    thermalState: string; speedLimit: number; previewFloorMs: number
    previewDutyCycle: number; previewsPaused: boolean; coolingDown: boolean
  } {
    const target = this.thermalState === 'critical' || this.speedLimit < 50 ? 3
      : this.thermalState === 'serious' || this.speedLimit < 80 ? 2 : this.thermalState === 'fair' ? 1 : 0
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
      previewFloorMs: [0, 900, 1500, 2500][this.level]!,
      previewDutyCycle: [0.85, 0.65, 0.4, 0.25][this.level]!,
      previewsPaused: this.level === 3, coolingDown: this.level > target
    }
  }
}
const monitor = new PerformanceMonitor()
export const updatePerformanceState = (update: { thermalState?: string; speedLimit?: number }): void => monitor.update(update)
export const performanceState = (): ReturnType<PerformanceMonitor['snapshot']> => monitor.snapshot()
