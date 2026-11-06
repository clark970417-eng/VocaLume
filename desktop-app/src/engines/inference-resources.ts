import { availableParallelism, constants, setPriority } from 'node:os'

/** Leave CPU capacity for capture, Chromium, OBS and other foreground apps.
 * This changes scheduling, not model weights, context or decoding quality. */
export function windowsInferenceThreads(parallelism = availableParallelism()): { whisper: number; llama: number } {
  const capacity = Number.isFinite(parallelism) ? Math.max(1, Math.floor(parallelism)) : 1
  return {
    whisper: Math.min(4, Math.max(1, Math.floor(capacity / 2))),
    llama: Math.min(6, Math.max(1, Math.floor(capacity / 2)))
  }
}

/** Auto offload needs headroom for the desktop compositor and other GPU apps.
 * This is a safety margin for the library's estimator, not a hard VRAM limit. */
export function windowsVramPadding(totalBytes: number): number {
  return Math.min(totalBytes * 0.2, 2 * 1024 ** 3)
}

/** Lower only the inference child, never the UI/capture process. */
export function lowerInferencePriority(pid = 0): boolean {
  if (process.platform !== 'win32') return false
  try {
    setPriority(pid, constants.priority.PRIORITY_BELOW_NORMAL)
    return true
  } catch {
    // Sandboxed environments may deny this; thread limits still apply.
    return false
  }
}
