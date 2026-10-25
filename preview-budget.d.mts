export interface PreviewPressure {
 previewFloorMs?: number
 previewDutyCycle?: number
 previewsPaused?: boolean
}
export class PreviewBudget {
 dutyCycle(pressure?: PreviewPressure): number
 complete(durationMs: number, now: number): void
 remainingMs(now: number, pressure?: PreviewPressure): number
 intervalMs(pressure?: PreviewPressure): number
}
