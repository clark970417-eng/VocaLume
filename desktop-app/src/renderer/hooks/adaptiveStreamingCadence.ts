/**
 * Pick the next cascade decode interval.  Start aggressively so the first
 * caption appears quickly, then back off for long utterances so a slower STT
 * engine does not accumulate redundant rolling-window work.
 */
export function getAdaptiveStreamingDelay(baseIntervalMs: number, speechElapsedMs: number, cloud = false): number {
  const base = Math.max(500, Math.min(3000, baseIntervalMs))
  // Final captions already have short pause boundaries. Re-decoding overlapping
  // previews twice a second wastes CPU and provider calls on incomplete words.
  if (cloud) return Math.max(base, speechElapsedMs < 5000 ? 1200 : 1400)
  if (speechElapsedMs < 1800) return Math.min(base, 500)
  if (speechElapsedMs < 5000) return base
  return Math.max(base, 1100)
}

/** The first Windows cloud follow-up may already have its next admission
 * deadline. Waiting another full interval can put it across the final cut. */
export function firstCloudFollowUpRetry(elapsedMs: number, cooldownMs: number, windowsCloud: boolean): number | null {
  if (!windowsCloud || elapsedMs < 2000 || elapsedMs > 2900 || cooldownMs < 40 ||
      cooldownMs > 650 || elapsedMs + cooldownMs > 3100) return null
  return Math.ceil(cooldownMs)
}
