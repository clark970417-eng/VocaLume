export class PcmRing {
  constructor(capacity: number)
  readonly capacity: number
  readonly length: number
  clear(): void
  push(samples: Float32Array): void
  snapshot(count?: number): Float32Array<ArrayBuffer>
}
