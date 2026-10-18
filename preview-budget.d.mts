export interface PreviewPressure {
 previewFloorMs?: number
 previewDutyCycle?: number
 previewsPaused?: boolean
}
export class PreviewBudget {
 complete(durationMs: number, now: number): void
 remainingMs(now: number, pressure?: PreviewPressure): number
 intervalMs(pressure?: PreviewPressure): number
}
