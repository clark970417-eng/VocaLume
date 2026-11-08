import { afterEach, expect, it, vi } from 'vitest'
import { GooglePublicTranslator } from './GooglePublicTranslator'

afterEach(() => vi.unstubAllGlobals())

it('normalizes mixed Simplified output to Taiwan Traditional Chinese', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([[['视频软件与网络设置。']]]))))
  const engine = new GooglePublicTranslator()
  expect(await engine.translate('動画ソフトとネットワークの設定です。', 'ja', 'zh')).toBe('影片軟體與網路設定。')
})

it('requests Traditional Chinese and joins all translated segments', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([
    [['今天不直播。'], ['明天晚上八點開始。']]
  ])))
  vi.stubGlobal('fetch', fetch)
  const engine = new GooglePublicTranslator()
  await engine.initialize()
  expect(await engine.translate('今日は配信しません。明日八時から始めます。', 'ja', 'zh'))
    .toBe('今天不直播。明天晚上八點開始。')
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('tl')).toBe('zh-TW')
})

it('rejects a wrong-language response and honors cancellation', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([[['こんにちは']]])))
  vi.stubGlobal('fetch', fetch)
  const engine = new GooglePublicTranslator()
  await expect(engine.translate('こんにちは', 'ja', 'zh')).rejects.toThrow()
  const controller = new AbortController()
  controller.abort()
  await expect(engine.translate('こんにちは', 'ja', 'zh', {
    previousSegments: [], signal: controller.signal
  })).rejects.toThrow()
  expect(fetch).toHaveBeenCalledOnce()
})

it('separates a complete Japanese sentence from a following day clause', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([
    [['今天不直播。明天晚上八點開始。']]
  ])))
  vi.stubGlobal('fetch', fetch)
  const engine = new GooglePublicTranslator()
  expect(await engine.translate('今日は配信しません明日の午後八時から始めます', 'ja', 'zh'))
    .toBe('今天不直播。明天晚上八點開始。')
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('q')).toContain('ません。明日')
})
