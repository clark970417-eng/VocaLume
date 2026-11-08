import type { TTSPlaybackData } from '../../engines/types'

type RoutableContext = AudioContext & { setSinkId?: (device: string) => Promise<void> }

async function selectSink(context: RoutableContext, deviceId: string): Promise<void> {
  if (!context.setSinkId) {
    if (deviceId) throw new Error('Specific audio output devices are not supported')
    return
  }
  await context.setSinkId(deviceId)
}

/** Check a specific output before persisting the route, without playing audio. */
export async function verifyTtsOutputDevice(
  deviceId: string,
  makeContext = (): RoutableContext => new AudioContext()
): Promise<void> {
  if (!deviceId) return
  const context = makeContext()
  try {
    await selectSink(context, deviceId)
  } finally {
    await context.close()
  }
}

/** Reuse the same output graph for nearby cues, with one audible cue at a time. */
export class TtsPlayback {
  private context?: RoutableContext
  private gain?: GainNode
  private source?: AudioBufferSourceNode
  private sink = ''
  private requestedSink = ''
  private routing: Promise<void> = Promise.resolve()
  private generation = 0
  private idleTimer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly makeContext = (sampleRate: number): RoutableContext => new AudioContext({ sampleRate }),
    private readonly idleMs = 15_000
  ) {}

  async play({ audio, sampleRate, volume, outputDevice }: TTSPlaybackData): Promise<void> {
    if (!audio.length || !Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(volume) || volume <= 0) return
    const generation = ++this.generation
    this.requestedSink = outputDevice
    this.clearIdle()
    this.stopSource()
    try {
      const context = this.context ??= this.makeContext(sampleRate)
      if (!this.gain) {
        this.gain = context.createGain()
        this.gain.connect(context.destination)
      }
      const current = (): boolean => this.context === context && this.generation === generation
      const route = this.routing.then(async () => {
        if (!current() || outputDevice === this.sink) return
        await selectSink(context, outputDevice)
        if (this.context === context) this.sink = outputDevice
      })
      this.routing = route.catch(() => {})
      await route
      if (!current()) return
      if (context.state === 'suspended') await context.resume()
      if (!current() || !this.gain) return

      const samples = audio instanceof Float32Array && audio.buffer instanceof ArrayBuffer
        ? audio as Float32Array<ArrayBuffer> : Float32Array.from(audio)
      const buffer = context.createBuffer(1, samples.length, sampleRate)
      buffer.copyToChannel(samples, 0)
      const source = context.createBufferSource()
      source.buffer = buffer
      this.gain.gain.value = Math.min(1, volume)
      source.connect(this.gain)
      this.source = source
      source.onended = () => {
        source.disconnect()
        if (this.source !== source) return
        this.source = undefined
        this.scheduleIdle()
      }
      source.start()
    } catch (error) {
      if (generation === this.generation) {
        this.stopSource()
        console.warn('[tts] Playback failed:', error)
      }
    } finally {
      if (generation === this.generation && !this.source) this.scheduleIdle()
    }
  }

  async stop(): Promise<void> {
    this.generation++
    this.clearIdle()
    this.stopSource()
    const context = this.context
    this.context = undefined
    this.gain = undefined
    this.sink = ''
    this.requestedSink = ''
    this.routing = Promise.resolve()
    if (context && context.state !== 'closed') {
      await context.close().catch(error => console.warn('[tts] Audio context close failed:', error))
    }
  }

  /** Revalidate explicit routes before the next cue after an output change. */
  async handleDeviceChange(): Promise<void> {
    if (this.requestedSink) await this.stop()
  }

  private stopSource(): void {
    const source = this.source
    if (!source) return
    this.source = undefined
    source.onended = null
    try { source.stop() } catch { /* It may have ended already. */ }
    source.disconnect()
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = undefined
  }

  private scheduleIdle(): void {
    this.clearIdle()
    if (this.context) this.idleTimer = setTimeout(() => { void this.stop() }, this.idleMs)
  }
}
