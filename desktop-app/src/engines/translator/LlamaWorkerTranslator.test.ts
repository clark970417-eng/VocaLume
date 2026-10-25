/** An interrupted engine is finished: it neither loads nor sends any more work. */
import { expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }))
vi.mock('../model-downloader', () => ({ getGGUFDir: () => '/models', downloadGGUF: vi.fn(async () => '') }))

import { HunyuanMT2Translator } from './HunyuanMT2Translator'
import { WorkerTerminatedError, type WorkerPool } from '../../main/worker-pool'
import type { TranslateContext } from '../types'

function fakePool() {
  const order: string[] = []
  const pool = {
    acquire: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    terminate: vi.fn(() => { order.push('terminate') }),
    sendRequest: vi.fn((_message: unknown, _type: string, _options: unknown, signal?: AbortSignal) =>
      new Promise<string>((resolve, reject) => {
        signal?.addEventListener('abort', () => { order.push('abort'); reject(signal.reason) }, { once: true })
        if (!signal) resolve('')
      }))
  }
  return { pool, order }
}

it('does not acquire the worker after an interrupt that arrived before the load began', async () => {
  const { pool } = fakePool()
  const engine = new HunyuanMT2Translator({ variant: '7B-Q4_K_M', pool: pool as unknown as WorkerPool })
  engine.interrupt('Live captions started')
  await expect(engine.initialize()).rejects.toBeInstanceOf(WorkerTerminatedError)
  expect(pool.acquire).not.toHaveBeenCalled()
})

it('translates known greetings without a GPU call and preserves names in longer input', async () => {
  const { pool } = fakePool()
  const engine = new HunyuanMT2Translator({ pool: pool as unknown as WorkerPool })
  await expect(engine.translate('こんまほ', 'ja', 'zh')).resolves.toBe('你好！')
  await expect(engine.translate('おつかの～🐾', 'ja', 'zh')).resolves.toBe('辛苦了～🐾')
  expect(pool.acquire).not.toHaveBeenCalled()
  expect(pool.sendRequest).not.toHaveBeenCalled()
  await engine.initialize()
  pool.sendRequest.mockResolvedValueOnce('你好，鹿乃まほろ今天要玩遊戲。')
  await engine.translate('こんまほ、鹿乃まほろです。今日はゲームします。', 'ja', 'zh')
  expect(pool.sendRequest.mock.calls[0][0]).toMatchObject({ text: 'こんにちは、鹿乃まほろです。今日はゲームします。' })
})

it('uses exact game names cheaply and forwards only applicable contextual terms', async () => {
  const {pool}=fakePool()
  const engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
  await expect(engine.translate('ピカチュウ','ja','zh')).resolves.toBe('皮卡丘')
  await expect(engine.translate('皮卡丘','zh','ja')).resolves.toBe('ピカチュウ')
  expect(pool.sendRequest).not.toHaveBeenCalled()
  await engine.initialize()
  pool.sendRequest.mockResolvedValue('翻譯')
  await engine.translate('VALORANTでリコイル制御を練習','ja','zh')
  expect(pool.sendRequest.mock.calls.at(-1)?.[0]).toMatchObject({context:{glossary:[{source:'VALORANT',target:'特戰英豪'},{source:'リコイル制御',target:'壓槍'}]}})
  await engine.translate('皮卡丘','zh','ja',{previousSegments:[],glossary:[{source:'皮卡丘',target:'ピカちゃん'}]})
  expect(pool.sendRequest.mock.calls.at(-1)?.[0]).toMatchObject({context:{glossary:[{source:'皮卡丘',target:'ピカちゃん'}]}})
})

it('answers verified short Japanese without loading, queueing or starting model inference', async () => {
  const { pool } = fakePool()
  const engine = new HunyuanMT2Translator({ pool: pool as unknown as WorkerPool })
  await expect(engine.translate('本当に？', 'ja', 'zh')).resolves.toBe('真的？')
  await expect(engine.translate('明日は？', 'ja', 'zh')).resolves.toBe('明天呢？')
  await expect(engine.translate('ません。', 'ja', 'zh')).resolves.toBe('不……')
  expect(pool.acquire).not.toHaveBeenCalled()
  expect(pool.sendRequest).not.toHaveBeenCalled()
  const cancelled = new AbortController(); cancelled.abort(new Error('Cancelled'))
  await expect(engine.translate('本当に？', 'ja', 'zh', { previousSegments: [], signal: cancelled.signal })).rejects.toThrow('Cancelled')
  engine.interrupt('Stopped')
  await expect(engine.translate('本当に？', 'ja', 'zh')).rejects.toBeInstanceOf(WorkerTerminatedError)
})

it('does not let the short path bypass user terminology, other languages or contextual full input', async () => {
  const { pool } = fakePool()
  const engine = new HunyuanMT2Translator({ pool: pool as unknown as WorkerPool })
  await engine.initialize(); pool.sendRequest.mockResolvedValue('模型譯文')
  const glossary = [{ source: 'ありがとう', target: '感恩' }]
  const custom: TranslateContext = { previousSegments: [], glossary }
  for (const [text, from, to, context] of [
    ['ありがとうございます！', 'ja', 'zh', custom],
    ['本当に？', 'ja', 'en', undefined], ['真的嗎？', 'zh', 'ja', undefined],
    ['薬は飲みません。', 'ja', 'zh', undefined], ['大丈夫。', 'ja', 'zh', undefined],
    ['明日は何曜日？', 'ja', 'zh', undefined]
  ] as const) await expect(engine.translate(text, from, to, context)).resolves.toBe('模型譯文')
  expect(pool.sendRequest).toHaveBeenCalledTimes(6)
  expect(pool.sendRequest.mock.calls[0][0]).toMatchObject({ context: { glossary } })
})

it('respects custom terminology, cancellation and the reverse translation direction', async () => {
  const { pool } = fakePool()
  const engine = new HunyuanMT2Translator({ pool: pool as unknown as WorkerPool })
  await engine.initialize()
  pool.sendRequest.mockResolvedValueOnce('自訂招呼')
  await engine.translate('こんまほ', 'ja', 'zh', { previousSegments: [], glossary: [{ source:'こんまほ',target:'自訂招呼' }] })
  expect(pool.sendRequest.mock.calls[0][0]).toMatchObject({ text:'こんまほ' })
  pool.sendRequest.mockResolvedValueOnce('こんばんは')
  await engine.translate('晚上好', 'zh', 'ja')
  expect(pool.sendRequest.mock.calls[1][0]).toMatchObject({ text:'晚上好',from:'zh',to:'ja' })
  const cancelled = new AbortController(); cancelled.abort(new Error('Cancelled'))
  await expect(engine.translate('こんまほ','ja','zh',{signal:cancelled.signal,previousSegments:[]})).rejects.toThrow('Cancelled')
  engine.interrupt('Stopped')
  await expect(engine.translate('こんまほ','ja','zh')).rejects.toBeInstanceOf(WorkerTerminatedError)
})

it('passes an interruption signal to acquire, so an acquire still waiting in the pool gives up', async () => {
  const { pool } = fakePool()
  let seen: AbortSignal | undefined
  pool.acquire.mockImplementation(async (...args: unknown[]) => { seen = args[2] as AbortSignal })
  const engine = new HunyuanMT2Translator({ variant: '7B-Q4_K_M', pool: pool as unknown as WorkerPool })
  await engine.initialize()
  expect(seen?.aborted).toBe(false)
  engine.interrupt('Live captions started')
  expect(seen?.aborted).toBe(true)
})

it('fails work in progress as terminated and refuses new work after an interrupt', async () => {
  const { pool, order } = fakePool()
  const engine = new HunyuanMT2Translator({ variant: '7B-Q4_K_M', pool: pool as unknown as WorkerPool })
  await engine.initialize()
  const caller = new AbortController()
  const running = engine.translate('你好', 'zh', 'ja', { signal: caller.signal, previousSegments: [] })
  engine.interrupt('Live captions started')
  await expect(running).rejects.toBeInstanceOf(WorkerTerminatedError)
  // The pool is stopped before in-flight work is told to abort.
  expect(order).toEqual(['terminate', 'abort'])
  await expect(engine.translate('再見', 'zh', 'ja')).rejects.toBeInstanceOf(WorkerTerminatedError)
  expect(pool.sendRequest).toHaveBeenCalledTimes(1)
  await engine.dispose()
  expect(pool.release).toHaveBeenCalledTimes(1)
})

it('reuses identical complete translations but isolates directions, register, terms and disposal', async () => {
  const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
  await engine.initialize();pool.sendRequest.mockResolvedValue('完整譯文')
  const text='今日はもう遊べません。'
  await engine.translate(text,'ja','zh')
  await engine.translate(text,'ja','zh')
  expect(pool.sendRequest).toHaveBeenCalledTimes(1)
  await engine.translate(text,'ja','en')
  await engine.translate(text,'ja','zh',{previousSegments:[],glossary:[{source:'遊べ',target:'遊玩'}]})
  await engine.translate('今天不能來','zh','ja',{previousSegments:[],writingStyle:'general'})
  await engine.translate('今天不能來','zh','ja',{previousSegments:[],writingStyle:'polite'})
  expect(pool.sendRequest).toHaveBeenCalledTimes(5)
  await engine.dispose();await engine.initialize();await engine.translate(text,'ja','zh')
  expect(pool.sendRequest).toHaveBeenCalledTimes(6)
  await engine.dispose()
})

it('snapshots terminology before queued inference, so later edits cannot poison the cached request', async () => {
  const {pool}=fakePool(),engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
  await engine.initialize();pool.sendRequest.mockResolvedValue('阿光')
  const context={previousSegments:[],glossary:[{source:'ひかり',target:'阿光'}]}
  const first=engine.translate('ひかりが来ました。','ja','zh',context)
  context.glossary[0].target='光'
  expect(pool.sendRequest.mock.calls[0][0]).toMatchObject({context:{glossary:[{source:'ひかり',target:'阿光'}]}})
  await first;await engine.translate('ひかりが来ました。','ja','zh',context)
  expect(pool.sendRequest).toHaveBeenCalledTimes(2)
  await engine.dispose()
})
