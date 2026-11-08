import type { BrowserWindow } from 'electron'
import type { TranslationResult } from '../engines/types'
import type { AppContext } from './app-context'

type Channel = 'translation-result' | 'interim-result' | 'draft-result'
const deliveries = new WeakMap<BrowserWindow, { key: string; activity: number; timer?: ReturnType<typeof setTimeout> }>()

export function sendOverlayCaption(ctx: AppContext, channel: Channel, result: TranslationResult & { translationFailed?: boolean }): void {
  const window = ctx.subtitleWindow
  if (!window || window.isDestroyed() || ctx.extensionConnected || !result.sourceText?.trim()) return
  const key = JSON.stringify([
    channel, result.confirmedText ?? result.sourceText, result.interimText ?? '',
    result.translatedText, result.translationFailed, result.confidence,
    result.tokenConfidences, result.speakerLabel, result.speakerIndex
  ])
  const activity = Date.now()
  const last = deliveries.get(window)
  if (last?.key === key && activity - last.activity < 3800) {
    last.activity = activity
    last.timer ??= setTimeout(() => {
      last.timer = undefined
      if (ctx.subtitleWindow === window && !window.isDestroyed() && !ctx.extensionConnected) {
        window.webContents.send('subtitle-activity', last.activity)
      }
    }, 100)
    return
  }
  clearTimeout(last?.timer)
  deliveries.set(window, { key, activity })
  window.webContents.send(channel, result)
}
