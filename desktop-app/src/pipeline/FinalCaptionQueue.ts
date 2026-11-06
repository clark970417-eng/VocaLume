export class FinalCaptionQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private count = 0

  get pending(): number {
    return this.count
  }

  enqueue<T>(run: () => Promise<T>, settled: () => void): Promise<T> {
    this.count++
    const completion = this.tail.then(run).finally(() => {
      this.count--
      settled()
    })
    this.tail = completion.catch(() => undefined)
    return completion
  }
}
