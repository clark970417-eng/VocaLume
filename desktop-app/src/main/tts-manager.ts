import type { BrowserWindow } from 'electron'
import type { Language, TranslationResult } from '../engines/types'
import type { VirtualMicManager } from './virtual-mic-manager'
import { KokoroTTSEngine } from '../engines/tts/KokoroTTSEngine'
import { createLogger } from './logger'
import { store } from './store'
import { performanceState } from './performance-state'

const log = createLogger('tts-manager')
type SynthesisRequest = { id: number; text: string; language: Language; window: BrowserWindow | null }

/**
 * Manages TTS lifecycle and queuing.
 *
 * Listens for translation results and synthesizes speech,
 * sending PCM audio to the renderer for playback.
 * Keeps one active synthesis and the newest waiting caption.
 */
export class TTSManager {
  private engine: KokoroTTSEngine | null = null
  private enabled = false
  private currentVoice: string | null = null
  private volume = 1.0
  private virtualMicManager: VirtualMicManager | null = null

  // Interrupt: track the latest request to cancel stale ones
  private requestId = 0
  private pending?: SynthesisRequest
  private synthesizing = false

  /** Initialize the TTS engine (lazy — only when enabled) */
  async initialize(): Promise<void> {
    if (this.engine) return

    this.engine = new KokoroTTSEngine({
      voice: this.currentVoice ?? undefined,
      onProgress: (msg) => log.info(msg)
    })

    try {
      await this.engine.initialize()
    } catch (err) {
      log.error('TTS initialization failed:', err)
      this.engine = null
      throw err
    }
  }

  /** Enable or disable TTS */
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    if (!enabled) this.clearSynthesisQueue()
    if (enabled && !this.engine) {
      await this.initialize()
    }
    log.info(`TTS ${enabled ? 'enabled' : 'disabled'}`)
  }

  /** Check if TTS is currently enabled */
  isEnabled(): boolean {
    return this.enabled
  }

  /** Set the voice to use */
  setVoice(voiceId: string): void {
    this.currentVoice = voiceId === 'auto' ? null : voiceId
    this.engine?.setVoice(voiceId)
  }

  /** Set playback volume (0.0-1.0) */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume))
  }

  /** Get current volume */
  getVolume(): number {
    return this.volume
  }

  /** Set the virtual mic manager for routing TTS audio to meeting apps (#515) */
  setVirtualMicManager(manager: VirtualMicManager | null): void {
    this.virtualMicManager = manager
  }

  /**
   * Handle a translation result — synthesize and send audio to renderer.
   * Uses interrupt strategy: if a new request arrives while synthesizing,
   * the old result is discarded.
   */
  async handleTranslationResult(
    result: TranslationResult,
    mainWindow: BrowserWindow | null
  ): Promise<void> {
    if (!this.enabled || !this.engine) return

    // Skip interim/draft results — only speak final translations
    if (result.isInterim || performanceState().speculativeTranslationPaused) return

    const text = result.spokenText ?? result.translatedText
    if (!text?.trim()) return

    this.pending = { id: ++this.requestId, text, language: result.targetLanguage, window: mainWindow }
    if (this.synthesizing) return

    this.synthesizing = true
    try {
      while (this.pending && this.enabled && this.engine) {
        const request = this.pending
        this.pending = undefined
        if (performanceState().speculativeTranslationPaused) break
        await this.speak(request, this.engine)
      }
    } finally {
      this.synthesizing = false
    }
  }

  private async speak(request: SynthesisRequest, engine: KokoroTTSEngine): Promise<void> {
    try {
      const ttsResult = await engine.synthesize(request.text, request.language)
      if (request.id !== this.requestId) {
        log.info('TTS result discarded (superseded)')
        return
      }

      if (ttsResult.audio.length === 0) return

      // Send audio to renderer for playback via Web Audio API
      // Must convert Float32Array to plain array for IPC transfer
      request.window?.webContents.send('tts-audio', {
        audio: Array.from(ttsResult.audio),
        sampleRate: ttsResult.sampleRate,
        volume: this.volume,
        outputDevice: store.get('ttsOutputDevice')
      })

      // Also route audio to virtual mic for meeting sharing (#515)
      if (this.virtualMicManager?.isEnabled()) {
        this.virtualMicManager.writeAudio(ttsResult.audio, ttsResult.sampleRate)
      }
    } catch (err) {
      log.error('TTS synthesis error:', err)
    }
  }

  private clearSynthesisQueue(): void {
    this.requestId++
    this.pending = undefined
  }

  /** Dispose the TTS engine and release resources */
  async dispose(): Promise<void> {
    this.clearSynthesisQueue()
    const engine = this.engine
    this.engine = null
    await engine?.dispose()
    log.info('TTSManager disposed')
  }
}
