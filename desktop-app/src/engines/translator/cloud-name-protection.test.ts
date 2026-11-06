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
    response: (text: string) => ({data: {translations: [{translatedText: text}]}})
  },
  {
    name: 'DeepL',
    engine: new DeepLTranslator('fixture-key'),
    source: (_url: string, init: RequestInit) => JSON.parse(String(init.body)).text[0],
    response: (text: string) => ({translations: [{text}]})
  },
  {
    name: 'Microsoft',
    engine: new MicrosoftTranslator('fixture-key', 'fixture-region'),
    source: (_url: string, init: RequestInit) => JSON.parse(String(init.body))[0].text,
    response: (text: string) => [{translations: [{text}]}]
  },
  {
    name: 'Gemini',
    engine: new GeminiTranslator('fixture-key'),
    source: (_url: string, init: RequestInit) => JSON.parse(String(init.body)).contents[0].parts[0].text,
    response: (text: string) => ({candidates: [{content: {parts: [{text}]}}]})
  }
]

it.each(cases)('$name protects an unfamiliar name across its actual request format', async ({engine, source, response}) => {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
  fetch.mockResolvedValueOnce(Response.json(response('［ＮＡＭＥ０］明天開台。')))
  fetch.mockResolvedValueOnce(Response.json(response('明天開台。')))
  vi.stubGlobal('fetch', fetch)
  const input = '鈴鳴リノさんは明日配信します。'

  expect(await engine.translate(input, 'ja', 'zh')).toBe('鈴鳴リノさん明天開台。')
  const sent = source(...fetch.mock.calls[0]!)
  expect(sent).toContain('[NAME0]は明日配信します。')
  expect(sent).not.toContain('鈴鳴リノ')
  await expect(engine.translate(input, 'ja', 'zh')).rejects.toThrow('遺漏人名')

  expect(await engine.translate('鈴鳴リノさん！', 'ja', 'zh')).toBe('鈴鳴リノさん！')
  expect(fetch).toHaveBeenCalledTimes(2)
})
