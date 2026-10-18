/** OS pressure is independent from decoding speed; unsupported platforms stay unknown. */
let thermalState = 'unknown'
let speedLimit = 100
export function updatePerformanceState(update: { thermalState?: string; speedLimit?: number }): void {
  if (['unknown', 'nominal', 'fair', 'serious', 'critical'].includes(update.thermalState || '')) thermalState = update.thermalState!
  if (Number.isFinite(update.speedLimit)) speedLimit = Math.max(1, Math.min(100, update.speedLimit!))
}
export function performanceState(): { thermalState: string; speedLimit: number; previewFloorMs: number } {
  const previewFloorMs = thermalState === 'critical' || speedLimit < 50 ? 2500
    : thermalState === 'serious' || speedLimit < 80 ? 1500 : thermalState === 'fair' ? 900 : 0
  return { thermalState, speedLimit, previewFloorMs }
}
