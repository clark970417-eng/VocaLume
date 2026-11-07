import { afterEach, expect, it, vi } from 'vitest'
import { DeepLTranslator } from './DeepLTranslator'
import { GeminiTranslator } from './GeminiTranslator'
import { GoogleTranslator } from './GoogleTranslator'
import { MicrosoftTranslator } from './MicrosoftTranslator'

afterEach(() => vi.unstubAllGlobals())

const cases = [
  {
    name: 'Google',
    engine: new GoogleTranslator('fixture-key'),
    source: (url: string) => new URL(url).searchParams.get('q'),
    target: (url: string) => new URL(url).searchParams.get('target'),
    expectedTarget: 'zh-TW',
    response: (text: string) => ({data: {translations: [{translatedText: text}]}})
  },
  {
    name: 'DeepL',
    engine: new DeepLTranslator('fixture-key'),
    source: (_url: string, init: RequestInit) => JSON.parse(String(init.body)).text[0],
    target: (_url: string, init: RequestInit) => JSON.parse(String(init.body)).target_lang,
    expectedTarget: 'ZH-HANT',
    response: (text: string) => ({translations: [{text}]})
  },
  {
    name: 'Microsoft',
    engine: new MicrosoftTranslator('fixture-key', 'fixture-region'),
    source: (_url: string, init: RequestInit) => JSON.parse(String(init.body))[0].text,
    target: (url: string) => new URL(url).searchParams.get('to'),
    expectedTarget: 'zh-Hant',
    response: (text: string) => [{translations: [{text}]}]
  },
  {
    name: 'Gemini',
    engine: new GeminiTranslator('fixture-key'),
    source: (_url: string, init: RequestInit) => JSON.parse(String(init.body)).contents[0].parts[0].text,
    target: (_url: string, init: RequestInit) => JSON.parse(String(init.body)).contents[0].parts[0].text,
    expectedTarget: 'Traditional Chinese as used in Taiwan',
    response: (text: string) => ({candidates: [{content: {parts: [{text}]}}]})
  }
]

it.each(cases)('$name protects an unfamiliar name and requests Traditional Chinese', async ({engine, source, target, expectedTarget, response}) => {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
  fetch.mockResolvedValueOnce(Response.json(response('［ＮＡＭＥ０］明天开始直播。')))
  fetch.mockResolvedValueOnce(Response.json(response('明天開台。')))
  vi.stubGlobal('fetch', fetch)
  const input = '鈴鳴リノさんは明日配信します。'

  expect(await engine.translate(input, 'ja', 'zh')).toBe('鈴鳴リノさん明天開始直播。')
  const sent = source(...fetch.mock.calls[0]!)
  expect(target(...fetch.mock.calls[0]!)).toContain(expectedTarget)
  expect(sent).toContain('[NAME0]は明日配信します。')
  expect(sent).not.toContain('鈴鳴リノ')
  await expect(engine.translate(input, 'ja', 'zh')).rejects.toThrow('遺漏人名')

  expect(await engine.translate('鈴鳴リノさん！', 'ja', 'zh')).toBe('鈴鳴リノさん！')
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each(cases)('$name rejects a response that reverses explicit negation', async ({ engine, response }) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(response('明天會參加。'))))
  await expect(engine.translate('明日は参加しません。', 'ja', 'zh')).rejects.toThrow('反轉')
})
