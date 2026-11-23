/** Keeps optional recognition requests from preparing overlapping PCM while
 * the main process is still decoding or temporarily declining previews. */
export class CapturePreviewAdmission {
  private session = 0
  private utterance = 0
  private pending?: object
  private nextAt = 0
  private checkBeforePacking = false

  constructor(private readonly now = () => performance.now()) {}

  beginUtterance(): void {
    this.utterance++
    this.nextAt = 0
    this.checkBeforePacking = false
  }

  resetSession(): void {
    this.session++
    this.pending = undefined
    this.beginUtterance()
  }

  remainingMs(): number {
    return Math.max(0, this.nextAt - this.now())
  }

  async submit<T>(
    pack: () => T | null,
    send: (packet: T) => Promise<number>,
    check: () => Promise<number>
  ): Promise<void> {
    if (this.pending || this.remainingMs() > 0) return
    const ticket = {}
    const session = this.session
    const utterance = this.utterance
    const current = (): boolean => this.session === session && this.utterance === utterance
    this.pending = ticket
    try {
      if (this.checkBeforePacking) {
        const wait = await check()
        if (!current()) return
        if (this.defer(wait)) return
      }
      const packet = pack()
      if (!packet) return
      const wait = await send(packet)
      if (current()) this.defer(wait)
    } catch {
      // A closed capture/IPC session can invalidate an optional request.
    } finally {
      if (this.pending === ticket) this.pending = undefined
    }
  }

  private defer(delay: number): boolean {
    const wait = Number.isFinite(delay) ? Math.min(5000, Math.max(0, delay)) : 0
    this.nextAt = this.now() + wait
    // Short cooldowns already fit under the normal capture cadence.
    this.checkBeforePacking = wait >= 250
    return wait > 0
  }
}
