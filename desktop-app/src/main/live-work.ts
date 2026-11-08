import type { AppContext } from './app-context'

export type LiveWorkPriority = 'final' | 'preview' | 'background'
export class LiveWorkPreempted extends Error {
  constructor() { super('Live captions took priority. Please retry the background operation.') }
}
type Task = { run: (signal: AbortSignal) => Promise<void> }

/** One admission queue for local inference. Foreground requests never wait for
 * an artificial cooldown. Background jobs yield between chunks and use the
 * abort signal to release optional model work when live audio arrives. */
export class LiveWorkScheduler {
  private readonly tasks: Record<LiveWorkPriority, Task[]> = { final: [], preview: [], background: [] }
  private active: { priority: LiveWorkPriority; controller: AbortController } | null = null
  private pendingFinals = 0
  private mediaOwner: object | null = null

  get mediaSession(): object | null { return this.mediaOwner }
  get hasDetachedFinals(): boolean { return this.pendingFinals > 0 }
  beginMediaSession(): void { this.mediaOwner = {} }
  endMediaSession(): void { this.mediaOwner = null }

  run<T>(priority: LiveWorkPriority, operation: (signal: AbortSignal) => Promise<T>, waitingSignal?: AbortSignal): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
      if (waitingSignal?.aborted) { reject(waitingSignal.reason); return }
      const task: Task = { run: async signal => {
        waitingSignal?.removeEventListener('abort', cancel)
        try { resolve(await operation(signal)) } catch (error) { reject(error) }
      } }
      const cancel = (): void => {
        const index = this.tasks[priority].indexOf(task)
        if (index < 0) return
        this.tasks[priority].splice(index, 1)
        reject(waitingSignal?.reason)
      }
      waitingSignal?.addEventListener('abort', cancel, { once: true })
      this.tasks[priority].push(task)
    })
    // A queued preview can go first once the slot is free. Only a formal cue
    // or a session control may interrupt a text request that's already started.
    if (priority === 'final' && this.active?.priority === 'background') {
      this.active.controller.abort(new LiveWorkPreempted())
    }
    this.pump()
    return result
  }

  /** A prepared final can keep translating while the next cue is recognized.
   * It still reserves admission ahead of all background model work. */
  trackFinal<T>(completion: Promise<T>): Promise<T> {
    this.pendingFinals++
    return completion.finally(() => {
      this.pendingFinals--
      this.pump()
    })
  }

  private pump(): void {
    if (this.active) return
    const priority = this.tasks.final.length ? 'final' : this.tasks.preview.length ? 'preview'
      : !this.pendingFinals && this.tasks.background.length ? 'background' : null
    if (!priority) return
    const task = this.tasks[priority].shift()!
    const controller = new AbortController()
    this.active = { priority, controller }
    void task.run(controller.signal).finally(() => {
      this.active = null
      this.pump()
    })
  }
}

const schedulers = new WeakMap<AppContext, LiveWorkScheduler>()
export function liveWork(ctx: AppContext): LiveWorkScheduler {
  let scheduler = schedulers.get(ctx)
  if (!scheduler) {
    scheduler = new LiveWorkScheduler()
    schedulers.set(ctx, scheduler)
  }
  return scheduler
}
