import { ipcMain } from 'electron'
import type { AppContext } from '../app-context'
import { store } from '../store'
import { createLogger } from '../logger'
import { getWindowsTtsVoices } from '../../engines/tts/WindowsTTSEngine'

const log = createLogger('ipc:tts')

/** Register TTS-related IPC handlers (#508) */
export function registerTtsIpc(ctx: AppContext): void {
  ipcMain.handle('tts-get-voices', () => process.platform === 'win32' ? getWindowsTtsVoices() : [])
  ipcMain.on('tts-playback-listener', (event, ready: unknown) => {
    const window = ctx.mainWindow
    if (typeof ready !== 'boolean' || !window || window.isDestroyed() ||
        event.sender !== window.webContents || event.senderFrame?.parent) return
    ctx.ttsManager?.setPlaybackListener(event.sender, ready)
  })

  // Enable/disable TTS
  ipcMain.handle('tts-set-enabled', async (_event, enabled: boolean) => {
    try {
      if (!ctx.ttsManager) return { error: 'TTS manager not initialized' }
      await ctx.ttsManager.setEnabled(enabled)
      store.set('ttsEnabled', enabled)
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('Failed to set TTS enabled:', msg)
      return { error: msg }
    }
  })

  // Set TTS voice
  ipcMain.handle('tts-set-voice', (_event, voiceId: string) => {
    if (!ctx.ttsManager) return
    if (typeof voiceId !== 'string' || !voiceId.trim()) return
    ctx.ttsManager.setVoice(voiceId)
    store.set('ttsVoice', voiceId)
  })

  // Set TTS volume
  ipcMain.handle('tts-set-volume', (_event, volume: number) => {
    if (!ctx.ttsManager) return
    if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1) return
    ctx.ttsManager.setVolume(volume)
    store.set('ttsVolume', volume)
  })

  // Set TTS output device
  ipcMain.handle('tts-set-output-device', (_event, deviceId: string) => {
    if (typeof deviceId !== 'string' || deviceId === store.get('ttsOutputDevice')) return
    store.set('ttsOutputDevice', deviceId)
    ctx.ttsManager?.stopPlayback()
    // Device routing is handled in the renderer via Web Audio API
  })

  // Get TTS settings
  ipcMain.handle('tts-get-settings', () => {
    return {
      enabled: store.get('ttsEnabled'),
      voice: store.get('ttsVoice'),
      outputDevice: store.get('ttsOutputDevice'),
      volume: store.get('ttsVolume')
    }
  })
}
