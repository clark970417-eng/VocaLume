import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { resolveBridgeScript } from '../engines/SubprocessBridge'

/** One low-priority local classifier at a time. A slow/missing helper is optional;
 * caption translation never waits for it. No audio or transcript is logged. */
export class SpeechToneAnalyzer {
  private child?: ChildProcessWithoutNullStreams
  private pending?: { id: number; resolve: (confidence: number) => void; timer: ReturnType<typeof setTimeout> }
  private sequence = 0
  private buffer = ''
  private retryAfter = 0

  analyze(audio: Float32Array, sampleRate: number): Promise<number> {
    if (process.platform !== 'darwin' || sampleRate !== 16000 || this.pending || Date.now() < this.retryAfter ||
        audio.length < 4000 || audio.length > 320000 || !audio.every(Number.isFinite)) return Promise.resolve(0)
    if (!this.child) {
      const path = resolveBridgeScript('bin/voice-tone-helper')
      if (!existsSync(path)) return Promise.resolve(0)
      const child = spawn('/usr/bin/nice', ['-n', '10', path], { stdio: 'pipe' })
      this.child = child
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (data: string) => {
        if (this.child !== child) return
        this.buffer += data
        if (this.buffer.length > 65536) { this.fail(); return }
        let end: number
        while ((end = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1)
          try {
            const value = JSON.parse(line)
            if (value.id === this.pending?.id) this.finish(typeof value.confidence === 'number' &&
              Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : 0)
          } catch { this.fail() }
        }
      })
      child.stderr.resume()
      child.stdin.on('error', () => { if (this.child === child) this.fail() })
      child.on('error', () => { if (this.child === child) this.fail() })
      child.on('exit', () => { if (this.child === child) this.fail() })
    }
    const id = ++this.sequence
    return new Promise<number>(resolve => {
      const timer = setTimeout(() => this.fail(), 2500)
      this.pending = { id, resolve, timer }
      const bytes = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength)
      this.child!.stdin.write(JSON.stringify({ id, audio: bytes.toString('base64') }) + '\n')
    })
  }

  private finish(confidence: number): void {
    const pending = this.pending; this.pending = undefined
    if (pending) { clearTimeout(pending.timer); pending.resolve(confidence) }
  }

  private fail(): void { this.retryAfter = Date.now() + 60000; this.dispose() }

  dispose(): void {
    const child = this.child; this.child = undefined; this.buffer = ''
    child?.kill(); this.finish(0)
  }
}
