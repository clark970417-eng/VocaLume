import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerTextTranslationIpc } from './text-translation-ipc'
import type { AppContext } from '../app-context'
import { LiveWorkScheduler } from '../live-work'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  downloadModel: vi.fn(),
  initialize: vi.fn(),
  translate: vi.fn(),
  dispose: vi.fn(),
  create: vi.fn(),
  settings: vi.fn(),
  run: vi.fn()
}))

vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../store', () => ({ store: { get: mocks.settings } }))
vi.mock('../live-work', async (importOriginal) => ({
  ...await importOriginal<typeof import('../live-work')>(),
  liveWork: () => ({ run: mocks.run })
}))
vi.mock('../../engines/translator/HunyuanMT15Translator', () => ({
  HunyuanMT15Translator: class {
    constructor(options: unknown) { mocks.create(options) }
    downloadModel = mocks.downloadModel
    initialize = mocks.initialize
    translate = mocks.translate
    dispose = mocks.dispose
  }
}))

type Translate = (event: unknown, text: unknown, from: unknown, to: unknown) => Promise<string>
let translate: Translate
let ctx: AppContext

beforeEach(() => {
  vi.resetAllMocks()
  mocks.settings.mockImplementation(key => key.endsWith('Terms') ? [] : undefined)
  mocks.translate.mockResolvedValue('translation')
  mocks.run.mockImplementation((_priority, operation) => operation(new AbortController().signal))
  ctx = { pipeline: null } as AppContext
  registerTextTranslationIpc(ctx)
  expect(mocks.handle).toHaveBeenCalledWith('translate-text', expect.any(Function))
  translate = mocks.handle.mock.calls[0][1] as Translate
})

describe('desktop text translation', () => {
  it('translates common phrases and preserves emoji without loading a model', async () => {
    await expect(translate(null, '謝謝今天的直播', 'zh', 'ja')).resolves.toBe('今日の配信ありがとうございました！')
    await expect(translate(null, 'こんばんは', 'ja', 'zh')).resolves.toBe('晚上好！')
    await expect(translate(null, '😊', 'ko', 'en')).resolves.toBe('😊')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('rejects blank and oversized text and unsupported language pairs before inference', async () => {
    await expect(translate(null, ' ', 'ja', 'zh')).rejects.toThrow('Invalid text length')
    await expect(translate(null, 'a'.repeat(3001), 'en', 'ja')).rejects.toThrow('Invalid text length')
    await expect(translate(null, 'hello', 'auto', 'ja')).rejects.toThrow('Invalid translation languages')
    await expect(translate(null, 'hello', 'en', 'en')).rejects.toThrow('Invalid translation languages')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('uses the custom glossary and releases its default shared model reference', async () => {
    const personal = { source: '直播', target: '生放送' }
    const managed = { source: '直播', target: 'ライブ配信' }
    const settings: Record<string, unknown> = {
      glossaryTerms: [personal],
      orgGlossaryTerms: [managed],
      slmKvCacheQuant: true,
      slmSpeculativeDecoding: false
    }
    mocks.settings.mockImplementation(key => settings[key])
    mocks.translate.mockResolvedValue('今日のライブ配信ありがとうございました！')
    await expect(translate(null, '謝謝今天的直播', 'zh', 'ja')).resolves.toBe('今日のライブ配信ありがとうございました！')
    expect(mocks.create).toHaveBeenCalledWith({ kvCacheQuant: true, speculativeDecoding: false })
    expect(mocks.translate).toHaveBeenCalledWith('謝謝今天的直播', 'zh', 'ja', expect.objectContaining({
      previousSegments: [],
      glossary: expect.arrayContaining([managed]),
      writingStyle: 'general'
    }))
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it('bounds long requests and preserves blank lines', async () => {
    const sentence = '같은 문장을 여러 번 읽어요. '.repeat(30)
    await expect(translate(null, sentence + '\n\n고마워요', 'ko', 'en')).resolves.toBe('translation translation\n\ntranslation')
    expect(mocks.translate.mock.calls.every(([text]) => text.length <= 400)).toBe(true)
    expect(mocks.initialize).toHaveBeenCalledOnce()
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(mocks.run).toHaveBeenCalledTimes(4)
    expect(mocks.run).toHaveBeenCalledWith('background', expect.any(Function))
  })

  it('borrows the live translator without loading or disposing another model', async () => {
    ctx.pipeline = {
      active: true,
      getTranslatorForBackgroundText: () => ({ id: 'hunyuan-mt-15', translate: mocks.translate })
    } as unknown as AppContext['pipeline']
    await expect(translate(null, '답장을 보내 주세요.', 'ko', 'en')).resolves.toBe('translation')
    expect(mocks.translate).toHaveBeenCalledWith('답장을 보내 주세요.', 'ko', 'en', expect.objectContaining({
      previousSegments: [], signal: expect.any(AbortSignal)
    }))
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(mocks.dispose).not.toHaveBeenCalled()
  })

  it('does not replace an incompatible live model', async () => {
    ctx.pipeline = {
      active: true,
      getTranslatorForBackgroundText: () => null
    } as unknown as AppContext['pipeline']
    await expect(translate(null, '답장을 보내 주세요.', 'ko', 'en')).rejects.toThrow('Stop live translation')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.translate).not.toHaveBeenCalled()
  })

  it('checks for a live translator again after the idle download', async () => {
    mocks.downloadModel.mockImplementationOnce(async () => {
      ctx.pipeline = {
        active: true,
        getTranslatorForBackgroundText: () => ({ id: 'hunyuan-mt-15', translate: mocks.translate })
      } as unknown as AppContext['pipeline']
    })
    await expect(translate(null, '답장을 보내 주세요.', 'ko', 'en')).resolves.toBe('translation')
    expect(mocks.downloadModel).toHaveBeenCalledOnce()
    expect(mocks.initialize).not.toHaveBeenCalled()
  })

  it.each([1, 2, 3])('retries a written draft after %i live final interruptions within its retry limit', async interruptions => {
    const scheduler = new LiveWorkScheduler()
    mocks.run.mockImplementation(scheduler.run.bind(scheduler))
    ctx.pipeline = {
      active: true,
      getTranslatorForBackgroundText: () => ({ id: 'hunyuan-mt-15', translate: mocks.translate })
    } as unknown as AppContext['pipeline']
    const order: string[] = []
    for (let attempt = 0; attempt < interruptions; attempt++) {
      mocks.translate.mockImplementationOnce((_text, _from, _to, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          order.push('draft')
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          void scheduler.run('final', async () => { order.push('final') })
        }))
    }
    mocks.translate.mockImplementation(async () => {
      order.push('completed')
      return '明日は近くの公園に行くかもしれません。'
    })
    const request = translate(null, '我明天可能會去附近的公園。', 'zh', 'ja')
    if (interruptions < 3) {
      await expect(request).resolves.toBe('明日は近くの公園に行くかもしれません。')
    } else {
      await expect(request).rejects.toThrow('Live captions took priority')
    }
    expect(order).toEqual([
      ...Array.from({ length: interruptions }, () => ['draft', 'final']).flat(),
      ...(interruptions < 3 ? ['completed'] : [])
    ])
    expect(mocks.dispose).not.toHaveBeenCalled()
  })

  it('does not retry a translation error', async () => {
    mocks.translate.mockRejectedValueOnce(new Error('Model output was invalid'))
    await expect(translate(null, '답장을 보내 주세요.', 'ko', 'en')).rejects.toThrow('Model output was invalid')
    expect(mocks.translate).toHaveBeenCalledOnce()
  })

  it('bounds concurrent model work and allows retry after a failed initialization', async () => {
    let fail: (error: Error) => void = () => {}
    const initializing = new Promise<void>(resolve => {
      mocks.initialize.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; resolve() }))
    })
    const pending = translate(null, '답장을 보내 주세요.', 'ko', 'en')
    await initializing
    await expect(translate(null, '다른 문장입니다.', 'ko', 'en')).rejects.toThrow('already running')
    fail(new Error('Model unavailable'))
    await expect(pending).rejects.toThrow('Model unavailable')
    await expect(translate(null, '다른 문장입니다.', 'ko', 'en')).resolves.toBe('translation')
    expect(mocks.dispose).toHaveBeenCalledTimes(2)
  })
})
