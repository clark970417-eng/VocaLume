import { expect, it, vi } from 'vitest'
import type { TranslationResult } from '../engines/types'
import type { AppContext } from './app-context'
import { sendOverlayCaption } from './subtitle-delivery'

const caption: TranslationResult = {
  sourceText: 'こんにちは', translatedText: '你好', timestamp: 1,
  sourceLanguage: 'ja', targetLanguage: 'zh'
}

it('coalesces duplicate drawing but preserves the last activity time and changed text', () => {
  vi.useFakeTimers()
  try {
    const send = vi.fn()
    const ctx = { subtitleWindow: { isDestroyed: () => false, webContents: { send } } } as unknown as AppContext
    sendOverlayCaption(ctx, 'interim-result', caption)
    vi.advanceTimersByTime(20)
    sendOverlayCaption(ctx, 'interim-result', { ...caption, timestamp: 2 })
    vi.advanceTimersByTime(30)
    sendOverlayCaption(ctx, 'interim-result', { ...caption, timestamp: 3 })
    const lastActivity = Date.now()
    vi.advanceTimersByTime(100)
    expect(send.mock.calls).toEqual([['interim-result', caption], ['subtitle-activity', lastActivity]])
    const revised = { ...caption, translatedText: '您好' }
    sendOverlayCaption(ctx, 'interim-result', revised)
    expect(send).toHaveBeenLastCalledWith('interim-result', revised)
    vi.advanceTimersByTime(4100)
    sendOverlayCaption(ctx, 'interim-result', revised)
    expect(send).toHaveBeenCalledTimes(4)
  } finally {
    vi.useRealTimers()
  }
})

it('does not deliver to the old desktop overlay during browser capture or after replacement', () => {
  vi.useFakeTimers()
  try {
    const send = vi.fn()
    const ctx = { subtitleWindow: { isDestroyed: () => false, webContents: { send } }, extensionConnected: true } as unknown as AppContext
    sendOverlayCaption(ctx, 'translation-result', caption)
    expect(send).not.toHaveBeenCalled()
    ctx.extensionConnected = false
    sendOverlayCaption(ctx, 'translation-result', caption)
    sendOverlayCaption(ctx, 'translation-result', caption)
    ctx.subtitleWindow = null
    vi.advanceTimersByTime(100)
    expect(send).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
  }
})

it.skipIf(process.platform !== 'win32' && process.platform !== 'darwin')('delivers repeated words as separate completed cues', () => {
  const send = vi.fn()
  const ctx = { subtitleWindow: { isDestroyed: () => false, webContents: { send } } } as unknown as AppContext
  const repeated = { ...caption, timestamp: 2 }
  sendOverlayCaption(ctx, 'translation-result', caption)
  sendOverlayCaption(ctx, 'translation-result', repeated)
  expect(send.mock.calls).toEqual([['translation-result', caption], ['translation-result', repeated]])
})
