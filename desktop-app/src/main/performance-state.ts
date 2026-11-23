export type MemoryPressure = 'unknown' | 'nominal' | 'warning' | 'critical'
type PerformanceUpdate = { thermalState?: string; speedLimit?: number; memoryPressure?: MemoryPressure; lowPowerMode?: boolean | null }
const RECOVERY_STEP_MS = 30_000

export interface PerformanceState {
  thermalState: string
  speedLimit: number
  memoryPressure: MemoryPressure
  lowPowerMode: boolean | null
  previewFloorMs: number
  previewDutyCycle: number
  previewsPaused: boolean
  optionalAnalysisAllowed: boolean
  auxiliaryWorkPaused: boolean
  speculativeTranslationPaused: boolean
  coolingDown: boolean
}

/** OS pressure is independent from decoding speed; unsupported platforms stay unknown. */
export class PerformanceMonitor {
  private thermalState = 'unknown'
  private speedLimit = 100
  private memoryPressure: MemoryPressure = 'unknown'
  private lowPowerMode: boolean | null = null
  private level = 0
  private targetLevel = 0
  private recoverAt = 0
  private analysisHealthySince = -Infinity

  update(update: PerformanceUpdate, now = performance.now()): PerformanceState {
    if (['unknown', 'nominal', 'fair', 'serious', 'critical'].includes(update.thermalState || '')) this.thermalState = update.thermalState!
    if (Number.isFinite(update.speedLimit)) this.speedLimit = Math.max(1, Math.min(100, update.speedLimit!))
    if (['unknown', 'nominal', 'warning', 'critical'].includes(update.memoryPressure || '')) this.memoryPressure = update.memoryPressure!
    if (typeof update.lowPowerMode === 'boolean' || update.lowPowerMode === null) this.lowPowerMode = update.lowPowerMode
    return this.snapshot(now)
  }

  get nextRecoveryAt(): number | undefined {
    return this.level > this.targetLevel ? this.recoverAt : undefined
  }

  snapshot(now = performance.now()): PerformanceState {
    const target = this.thermalState === 'critical' || this.speedLimit < 50 || this.memoryPressure === 'critical' ? 3
      : this.thermalState === 'serious' || this.speedLimit < 80 || this.memoryPressure === 'warning' ? 2 : (this.thermalState === 'fair' || this.lowPowerMode === true) ? 1 : 0
    if (target > 0) this.analysisHealthySince = Infinity
    else if (this.analysisHealthySince === Infinity) this.analysisHealthySince = now
    if (target >= this.level) {
      this.level = target
    } else if (target !== this.targetLevel) {
      // Start cooling when we first see a lower level. A stale hot reading
      // does not show the machine spent the intervening time cooling.
      this.recoverAt = now + RECOVERY_STEP_MS
    } else if (now >= this.recoverAt) {
      // Restore one step at a time; a brief nominal reading must not restart
      // full-rate inference while the fanless machine is still cooling.
      const steps = 1 + Math.floor((now - this.recoverAt) / RECOVERY_STEP_MS)
      this.level = Math.max(target, this.level - steps)
      this.recoverAt += steps * RECOVERY_STEP_MS
    }
    this.targetLevel = target
    return {
      thermalState: this.thermalState, speedLimit: this.speedLimit,
      memoryPressure: this.memoryPressure, lowPowerMode: this.lowPowerMode,
      previewFloorMs: [0, 900, 1500, 2500][this.level]!,
      previewDutyCycle: [0.85, 0.65, 0.4, 0.25][this.level]!,
      previewsPaused: this.level === 3,
      auxiliaryWorkPaused: this.level >= 1,
      speculativeTranslationPaused: this.level >= 2,
      coolingDown: this.level > target,
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

const subscribers = new Set<(state: PerformanceState) => void>()
let published = monitor.snapshot()
let recoveryTimer: ReturnType<typeof setTimeout> | undefined
let scheduledRecoveryAt: number | undefined

export function updatePerformanceState(update: PerformanceUpdate): void {
  const state = monitor.update(update)
  if (!state.optionalAnalysisAllowed) for (const stop of optionalAnalysisStops) stop()
  publishPerformanceState(state)
}

function publishPerformanceState(state: PerformanceState): void {
  const next = monitor.nextRecoveryAt
  if (next !== scheduledRecoveryAt) {
    clearTimeout(recoveryTimer)
    recoveryTimer = undefined
    scheduledRecoveryAt = next
    if (next !== undefined) {
      recoveryTimer = setTimeout(() => {
        scheduledRecoveryAt = undefined
        recoveryTimer = undefined
        publishPerformanceState(monitor.snapshot())
      }, Math.max(1, Math.ceil(next - performance.now())))
      recoveryTimer.unref?.()
    }
  }
  const keys = Object.keys(state) as Array<keyof PerformanceState>
  if (keys.every(key => published[key] === state[key])) return
  published = state
  for (const subscriber of subscribers) subscriber(state)
}

export const performanceState = (): PerformanceState => monitor.snapshot()

export function subscribePerformanceState(listener: (state: PerformanceState) => void): () => void {
  subscribers.add(listener)
  return () => { subscribers.delete(listener) }
}
