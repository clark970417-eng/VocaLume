import type { BrowserWindow, WebContents } from 'electron'
import type { TranslationResult } from '../engines/types'
import type { VirtualMicManager } from './virtual-mic-manager'
import { KokoroTTSEngine } from '../engines/tts/KokoroTTSEngine'
import { TtsVoiceUnavailableError, WindowsTTSEngine } from '../engines/tts/WindowsTTSEngine'
import { createLogger } from './logger'
import { store } from './store'
import { performanceState, subscribePerformanceState } from './performance-state'

const log = createLogger('tts-manager')
const MODEL_IDLE_MS = 30_000

type SpeechEngine = Pick<KokoroTTSEngine, 'initialize' | 'setVoice' | 'synthesize' | 'dispose'>
type SpeechJob = { text: string; language: TranslationResult['targetLanguage']; window: BrowserWindow | null }

/** Optional speech is a latest-only lane beside the caption pipeline. */
export class TTSManager {
  private engine?: SpeechEngine
  private enabled = false
  private voice = 'auto'
  private volume = 1
  private virtualMicManager: VirtualMicManager | null = null
  private playbackTarget?: WebContents
  private playbackError = ''
  private detachPlaybackTarget?: () => void
  private pending?: SpeechJob
  private active?: AbortController
  private draining?: Promise<void>
  private releasing?: Promise<void>
  private idleTimer?: ReturnType<typeof setTimeout>
  private releaseAfterWork = false
  private pausedForPressure = performanceState().speculativeTranslationPaused
  private readonly unsubscribePressure = subscribePerformanceState(({ speculativeTranslationPaused }) => {
    const enteredPressure = speculativeTranslationPaused && !this.pausedForPressure
    this.pausedForPressure = speculativeTranslationPaused
    if (enteredPressure && this.enabled) this.stopPlayback()
  })

  constructor(
    private readonly makeEngine: () => SpeechEngine = () => process.platform === 'win32'
      ? new WindowsTTSEngine() : new KokoroTTSEngine({ onProgress: msg => log.info(msg) }),
    private readonly idleMs = MODEL_IDLE_MS
  ) {}

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    if (!enabled) this.stopPlayback()
  }

  isEnabled(): boolean { return this.enabled }
  getVolume(): number { return this.volume }

  setVoice(voice: string): void {
    this.voice = voice
    this.engine?.setVoice(voice)
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume))
  }

  setVirtualMicManager(manager: VirtualMicManager | null): void {
    this.virtualMicManager = manager
  }

  setPlaybackListener(target: WebContents, ready: boolean): void {
    if (!ready) {
      if (this.playbackTarget !== target) return
      this.detachPlaybackTarget?.()
      this.playbackTarget = undefined
      if (!this.virtualMicManager?.isEnabled()) this.stopPlayback()
      return
    }
    if (this.playbackTarget === target) return
    this.detachPlaybackTarget?.()
    this.playbackTarget = target
    this.playbackError = ''
    const remove = (): void => this.setPlaybackListener(target, false)
    const navigation = (event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>): void => {
      if (event.isMainFrame && !event.isSameDocument) remove()
    }
    target.once('destroyed', remove)
    target.once('render-process-gone', remove)
    target.on('did-start-navigation', navigation)
    this.detachPlaybackTarget = () => {
      target.off('destroyed', remove)
      target.off('render-process-gone', remove)
      target.off('did-start-navigation', navigation)
      this.detachPlaybackTarget = undefined
    }
  }

  private playbackFor(window: BrowserWindow | null): WebContents | undefined {
    const target = this.playbackTarget
    return target && this.volume > 0 && window && !window.isDestroyed() &&
      window.webContents === target && !target.isDestroyed() ? target : undefined
  }

  private hasOutput(window: BrowserWindow | null): boolean {
    return !!this.playbackFor(window) || !!this.virtualMicManager?.isEnabled()
  }

  private reportPlaybackError(window: BrowserWindow | null, message: string): void {
    const playback = this.playbackFor(window)
    if (!playback || this.playbackError === message) return
    this.playbackError = message
    playback.send('tts-error', message)
  }

  async handleTranslationResult(result: TranslationResult, window: BrowserWindow | null): Promise<void> {
    const text = (result.spokenText ?? result.translatedText).trim()
    if (!this.enabled || this.pausedForPressure || result.isInterim || result.captionRevision || !text || !this.hasOutput(window)) return

    this.clearIdleTimer()
    this.releaseAfterWork = false
    this.active?.abort()
    this.pending = { text, language: result.targetLanguage, window }
    await this.startDrain()
  }

  private startDrain(): Promise<void> {
    this.draining ??= this.drain().finally(() => {
      this.draining = undefined
      if (this.enabled && this.pending) return this.startDrain()
      if (this.releaseAfterWork || !this.enabled) void this.releaseEngine()
      else this.scheduleIdleRelease()
    })
    return this.draining
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const { text, language, window } = this.pending
      this.pending = undefined
      if (!this.enabled || this.pausedForPressure || !this.hasOutput(window)) continue
      const controller = new AbortController()
      this.active = controller
      try {
        const engine = await this.ensureEngine(controller.signal)
        controller.signal.throwIfAborted()
        if (!this.hasOutput(window)) continue
        const result = await engine.synthesize(text, language, controller.signal)
        if (controller.signal.aborted || !this.enabled || this.pausedForPressure || !result.audio.length) continue

        this.playbackFor(window)?.send('tts-audio', {
          audio: result.audio,
          sampleRate: result.sampleRate,
          volume: this.volume,
          outputDevice: store.get('ttsOutputDevice')
        })
        this.reportPlaybackError(window, '')
        if (this.virtualMicManager?.isEnabled()) {
          this.virtualMicManager.writeAudio(result.audio, result.sampleRate)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          log.error('TTS synthesis failed:', error)
          this.reportPlaybackError(window, error instanceof TtsVoiceUnavailableError
            ? error.message : 'Unable to generate translated speech.')
        }
      } finally {
        this.active = undefined
      }
    }
  }

  private async ensureEngine(signal: AbortSignal): Promise<SpeechEngine> {
    await this.releasing
    signal.throwIfAborted()
    if (this.engine) return this.engine
    const engine = this.engine = this.makeEngine()
    engine.setVoice(this.voice)
    try {
      await engine.initialize()
      return engine
    } catch (error) {
      await this.releaseEngine()
      throw error
    }
  }

  /** Called when capture stops or speech output is disabled. */
  stopPlayback(): void {
    this.pending = undefined
    this.active?.abort()
    this.releaseAfterWork = true
    this.clearIdleTimer()
    if (this.playbackTarget && !this.playbackTarget.isDestroyed()) {
      if (this.playbackError) this.playbackTarget.send('tts-error', '')
      this.playbackTarget.send('tts-stop')
    }
    this.playbackError = ''
    if (!this.draining) void this.releaseEngine()
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = undefined
  }

  private scheduleIdleRelease(): void {
    this.clearIdleTimer()
    if (!this.engine) return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined
      if (!this.draining && !this.pending) void this.releaseEngine()
    }, this.idleMs)
    this.idleTimer.unref?.()
  }

  private releaseEngine(): Promise<void> {
    this.clearIdleTimer()
    const engine = this.engine
    if (!engine) return this.releasing ?? Promise.resolve()
    this.engine = undefined
    this.releasing = engine.dispose().catch(error => log.warn('TTS model release failed:', error)).finally(() => {
      this.releasing = undefined
    })
    return this.releasing
  }

  async dispose(): Promise<void> {
    this.unsubscribePressure()
    this.enabled = false
    this.stopPlayback()
    this.detachPlaybackTarget?.()
    this.playbackTarget = undefined
    await this.draining
    await this.releaseEngine()
  }
}
