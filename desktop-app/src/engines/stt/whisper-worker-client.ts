import { utilityProcess } from 'electron'
import { join } from 'node:path'
import type { WhisperOptions } from '@kutalia/whisper-node-addon'

type Result = Awaited<ReturnType<typeof import('@kutalia/whisper-node-addon').transcribe>>

/** Windows native loads and decoding belong outside the UI/main process.
 * The engine owns serialization; this client owns child lifetime and timeouts. */
export class WhisperWorkerClient {
  private worker: Electron.UtilityProcess | null = null
  private ready: Promise<void> | null = null
  private sequence = 0
  private pending = new Map<number, { resolve: (result: Result) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private rejectInit: ((error: Error) => void) | null = null

  initialize(): Promise<void> {
    if (this.ready) return this.ready
    const worker = utilityProcess.fork(join(__dirname, 'whisper-worker.js'))
    this.worker = worker
    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.stop(new Error('Whisper worker initialization timed out')), 30_000)
      this.rejectInit = error => { clearTimeout(timer); reject(error) }
      worker.on('message', (message: { type: string; id?: number; result?: Result; message?: string }) => {
        if (this.worker !== worker) return
        if (message.type === 'ready') {
          clearTimeout(timer); this.rejectInit = null; resolve(); return
        }
        if (message.type === 'fatal') { this.stop(new Error(message.message || 'Whisper worker initialization failed')); return }
        const pending = message.id === undefined ? undefined : this.pending.get(message.id)
        if (!pending) return
        clearTimeout(pending.timer); this.pending.delete(message.id!)
        if (message.type === 'result' && message.result) pending.resolve(message.result)
        else pending.reject(new Error(message.message || 'Whisper transcription failed'))
      })
      worker.on('exit', () => {
        if (this.worker === worker) this.stop(new Error('Whisper worker exited'))
      })
    })
    return this.ready
  }

  async transcribe(options: WhisperOptions): Promise<Result> {
    await this.initialize()
    const worker = this.worker
    if (!worker) throw new Error('Whisper worker was stopped')
    const id = ++this.sequence
    return new Promise<Result>((resolve, reject) => {
      const timer = setTimeout(() => this.stop(new Error('Whisper transcription timed out')), 120_000)
      this.pending.set(id, {resolve,reject,timer})
      try { worker.postMessage({type:'transcribe',id,options}) }
      catch (error) { this.stop(error instanceof Error ? error : new Error(String(error))) }
    })
  }

  dispose(): void { this.stop(new Error('Whisper worker disposed')) }

  private stop(error: Error): void {
    const worker = this.worker
    this.worker = null; this.ready = null
    this.rejectInit?.(error); this.rejectInit = null
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error) }
    this.pending.clear()
    worker?.removeAllListeners()
    try { worker?.kill() } catch { /* Child already exited. */ }
  }
}
