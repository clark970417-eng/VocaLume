/**
 * Repackages a stream of variable-length PCM frames into fixed-size chunks.
 *
 * Cloud realtime translation APIs (OpenAI realtime, Gemini Live) expect audio
 * appended as fixed ~100ms PCM chunks, but the VAD emits frames of a different
 * cadence (~96ms at 16kHz). This buffers incoming frames and emits exactly
 * `chunkSamples`-long chunks, carrying the remainder to the next push so no
 * sample is dropped or duplicated. Chunk boundaries are driven purely by sample
 * count, never by a timer, to keep the stream continuous and gap-free.
 */
export class RealtimeChunker {
  private pending: Float32Array
  private filled = 0

  constructor(
    private readonly chunkSamples: number,
    private readonly onChunk: (chunk: Float32Array) => void
  ) {
    if (chunkSamples <= 0) throw new Error('chunkSamples must be positive')
    this.pending = new Float32Array(chunkSamples)
  }

  /** Append a frame; emits zero or more fixed-size chunks as capacity fills. */
  push(frame: Float32Array): void {
    for (let offset = 0; offset < frame.length;) {
      const count = Math.min(this.chunkSamples - this.filled, frame.length - offset)
      this.pending.set(frame.subarray(offset, offset + count), this.filled)
      offset += count
      this.filled += count
      if (this.filled === this.chunkSamples) {
        const chunk = this.pending
        this.pending = new Float32Array(this.chunkSamples)
        this.filled = 0
        this.onChunk(chunk)
      }
    }
  }

  /** Drop any buffered partial samples without emitting (e.g. on stop/reset). */
  reset(): void {
    this.filled = 0
  }
}
