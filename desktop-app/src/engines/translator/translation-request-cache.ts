type Consumer = {
  resolve: (text: string) => void
  reject: (error: unknown) => void
  partial?: (text: string) => void
  detach: () => void
}
type Pending = { controller: AbortController; consumers: Set<Consumer>; partial?: string }
type Task = (signal: AbortSignal, onPartial: (text: string) => void) => Promise<string>

/** Bounded, memory-only reuse of exact requests. Each caller retains its own
 * cancellation: shared inference stops only when nobody needs its result. */
export class TranslationRequestCache {
  private completed = new Map<string, { text: string; expires: number }>()
  private pending = new Map<string, Pending>()
  constructor(private limit = 128, private ttlMs = 300_000) {}

  run(key: string, task: Task, signal: AbortSignal, onPartial?: (text: string) => void): Promise<string> {
    if (signal.aborted) return Promise.reject(signal.reason)
    const cached = this.completed.get(key)
    if (cached && cached.expires > Date.now()) {
      this.completed.delete(key); this.completed.set(key, cached)
      return Promise.resolve(cached.text)
    }
    if (cached) this.completed.delete(key)
    let entry = this.pending.get(key)
    const created = !entry
    if (!entry) {
      entry = { controller: new AbortController(), consumers: new Set() }
      this.pending.set(key, entry)
    }
    const owned = entry
    const result = new Promise<string>((resolve, reject) => {
      const consumer: Consumer = { resolve, reject, partial: onPartial, detach: () => signal.removeEventListener('abort', cancel) }
      const cancel = (): void => {
        consumer.detach(); owned.consumers.delete(consumer); reject(signal.reason)
        if (!owned.consumers.size) {
          // Remove before cancelling so an immediate retry creates fresh work.
          if (this.pending.get(key) === owned) this.pending.delete(key)
          owned.controller.abort(signal.reason)
        }
      }
      owned.consumers.add(consumer)
      signal.addEventListener('abort', cancel, { once: true })
      if (owned.partial && onPartial) this.deliverPartial(consumer, owned.partial)
    })
    if (created) {
      const partial = (text: string): void => {
        if (owned.controller.signal.aborted) return
        owned.partial = text
        for (const consumer of owned.consumers) this.deliverPartial(consumer, text)
      }
      // Invoke immediately: the caller's existing worker queue owns ordering.
      let work: Promise<string>
      try { work = task(owned.controller.signal, partial) } catch (error) { work = Promise.reject(error) }
      void work.then(text => {
        if (this.pending.get(key) === owned && !owned.controller.signal.aborted && text.trim()) {
          // Cap large input keys too; limits are in characters, not token counts.
          if (key.length <= 16_384 && text.length <= 8_192) {
            this.completed.set(key, { text, expires: Date.now() + this.ttlMs })
            while (this.completed.size > this.limit) this.completed.delete(this.completed.keys().next().value!)
          }
        }
        if (this.pending.get(key) === owned) this.pending.delete(key)
        for (const consumer of owned.consumers) { consumer.detach(); consumer.resolve(text) }
      }, error => {
        if (this.pending.get(key) === owned) this.pending.delete(key)
        for (const consumer of owned.consumers) { consumer.detach(); consumer.reject(error) }
      }).finally(() => {
        if (this.pending.get(key) === owned) this.pending.delete(key)
        owned.consumers.clear()
      })
    }
    return result
  }

  /** An observer failure must not abort inference for the other caller. */
  private deliverPartial(consumer: Consumer, text: string): void {
    try { consumer.partial?.(text) } catch { /* Display callbacks do not own generation. */ }
  }

  clear(): void {
    this.completed.clear()
    const pending = [...this.pending.values()]
    this.pending.clear()
    for (const entry of pending) {
      const error = new Error('Translation cache disposed')
      for (const consumer of entry.consumers) { consumer.detach(); consumer.reject(error) }
      entry.consumers.clear(); entry.controller.abort(error)
    }
  }
}
