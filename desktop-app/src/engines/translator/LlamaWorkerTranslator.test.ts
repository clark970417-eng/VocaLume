/** An interrupted engine is finished: it neither loads nor sends any more work. */
import { expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }))
vi.mock('../model-downloader', () => ({ getGGUFDir: () => '/models', downloadGGUF: vi.fn(async () => '') }))

import { HunyuanMT2Translator } from './HunyuanMT2Translator'
import { WorkerTerminatedError, type WorkerPool } from '../../main/worker-pool'
import type { TranslateContext } from '../types'

it('rejects invalid local output before caching so the same spoken sentence can recover', async () => {
  for (const [to, bad, good] of [
    ['zh', '🎉', '明天沒有直播。'], ['en', '明天沒有直播。', 'No stream tomorrow.'],
    ['ko', 'Translation: 내일 방송이 없습니다.', '내일 방송이 없습니다.'],
    ['ar', '', 'لن يكون هناك بث غداً.'], ['nl', '🎉', 'Morgen is er geen livestream.'],
    ['pl', '🎉', 'Jutro nie będzie transmisji.']
  ] as const) {
    const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
    await engine.initialize()
    pool.sendRequest.mockResolvedValueOnce(bad).mockResolvedValue(good)
    await expect(engine.translate('明日は配信を休みます。','ja',to)).rejects.toThrow()
    expect(await engine.translate('明日は配信を休みます。','ja',to)).toBe(good)
    expect(await engine.translate('明日は配信を休みます。','ja',to)).toBe(good)
    expect(pool.sendRequest).toHaveBeenCalledTimes(2)
    await engine.dispose()
  }
})

it('does not reuse invalid incremental, speculative or simultaneous translations as a final caption', async () => {
  const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
  await engine.initialize();pool.sendRequest.mockResolvedValue('🎉')
  const text='明日は配信を休みます。'
  await expect(engine.translateIncremental(text,'','ja','ko')).rejects.toThrow()
  await expect(engine.translateSSBD(text,'','ja','ko')).rejects.toThrow()
  await expect(engine.translateSimulMt(text,'','ja','ko',true)).rejects.toThrow()
  pool.sendRequest.mockResolvedValue('내일 방송이 없습니다.')
  expect(await engine.translate(text,'ja','ko')).toBe('내일 방송이 없습니다.')
  expect(pool.sendRequest).toHaveBeenCalledTimes(4)
  await engine.dispose()
})

function fakePool() {
  const order: string[] = []
  const pool = {
    acquire: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    terminate: vi.fn(() => { order.push('terminate') }),
    sendRequest: vi.fn((_message: unknown, _type: string, _options: unknown, signal?: AbortSignal, _onPartial?: (value:string)=>void) =>
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
  pool.sendRequest.mockResolvedValueOnce('你好，[NAME0]今天要玩遊戲。')
  await expect(engine.translate('こんまほ、鹿乃まほろです。今日はゲームします。', 'ja', 'zh')).resolves.toBe('你好，鹿乃まほろ今天要玩遊戲。')
  expect(pool.sendRequest.mock.calls[0][0]).toMatchObject({ text: 'こんにちは、[NAME0]です。今日はゲームします。' })
})

it('preserves a short personal name in both directions and restores safe partial captions', async () => {
  const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
  await engine.initialize()
  pool.sendRequest.mockImplementationOnce(async (_request, _type, _options, _signal, onPartial) => {
    onPartial?.('[NA'); onPartial?.('[NAME0]明天不會'); return '[NAME0]明天不會來。'
  })
  const partials:string[]=[]
  await expect(engine.translate('まほろちゃんは明日来ません。','ja','zh',{previousSegments:[],onPartial:t=>partials.push(t)})).resolves.toBe('まほろちゃん明天不會來。')
  expect(partials).toEqual(['まほろちゃん明天不會'])
  pool.sendRequest.mockResolvedValueOnce('[NAME0]、明日もまた来ます。')
  await expect(engine.translate('まほろ，我明天還會來。','zh','ja')).resolves.toBe('まほろ、明日もまた来ます。')
  pool.sendRequest.mockResolvedValueOnce('[NAME0]今天休息。')
  await expect(engine.translate('まほろは今日休みです。','ja','zh',{previousSegments:[],glossary:[{source:'まほろ',target:'真幌'}]})).resolves.toBe('真幌今天休息。')
})

it('keeps already-Chinese content and name-only messages out of the model', async () => {
  const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
  for(const text of ['這是中文','まほろちゃん今天辛苦了','鹿乃まほろ','まほろ']) await expect(engine.translate(text,'ja','zh')).resolves.toBe(text)
  expect(pool.acquire).not.toHaveBeenCalled();expect(pool.sendRequest).not.toHaveBeenCalled()
})

it('preserves literal-only input across decoding modes without loading a model', async () => {
  const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
  for (const text of ['🎉🎉', '7/14', 'https://example.invalid/live/123', '@viewer #123']) {
    for (const run of [
      ()=>engine.translate(text,'ja','zh'),
      ()=>engine.translate(text,'zh','ja'),
      ()=>engine.translateIncremental(text,'','ja','zh'),
      ()=>engine.translateSSBD(text,'','ja','zh'),
      ()=>engine.translateSimulMt(text,'','ja','zh',true)
    ]) await expect(run()).resolves.toBe(text)
  }
  expect(pool.acquire).not.toHaveBeenCalled(); expect(pool.sendRequest).not.toHaveBeenCalled()
  const cancelled=new AbortController(); cancelled.abort(new Error('Cancelled'))
  await expect(engine.translate('🎉','ja','zh',{previousSegments:[],signal:cancelled.signal})).rejects.toThrow('Cancelled')
  await engine.initialize(); pool.sendRequest.mockResolvedValueOnce('七月十四日')
  await expect(engine.translate('7/14','ja','zh',{previousSegments:[],glossary:[{source:'7/14',target:'七月十四日'}]})).resolves.toBe('七月十四日')
  expect(pool.sendRequest).toHaveBeenCalledTimes(1)
  engine.interrupt('Stopped')
  await expect(engine.translate('🎉','ja','zh')).rejects.toBeInstanceOf(WorkerTerminatedError)
})

it('skips already-target Korean, Russian, Arabic and Thai while respecting glossary overrides', async () => {
  const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
  for(const [to,text] of [['ko','내일은 방송을 쉬겠습니다.'],['ru','Завтра трансляции не будет.'],['ar','لن يكون هناك بث غداً.'],['th','พรุ่งนี้ไม่มีการถ่ายทอดสด']] as const){
    await expect(engine.translate(text,'ja',to)).resolves.toBe(text)
    await expect(engine.translateIncremental(text,'','ja',to)).resolves.toBe(text)
    await expect(engine.translateSSBD(text,'','ja',to)).resolves.toBe(text)
    await expect(engine.translateSimulMt(text,'','ja',to,true)).resolves.toBe(text)
  }
  expect(pool.acquire).not.toHaveBeenCalled();expect(pool.sendRequest).not.toHaveBeenCalled()
  const cancelled=new AbortController();cancelled.abort(new Error('Cancelled'))
  await expect(engine.translate('안녕하세요','ja','ko',{previousSegments:[],signal:cancelled.signal})).rejects.toThrow('Cancelled')
  await engine.initialize();pool.sendRequest.mockResolvedValue('방송')
  await expect(engine.translate('방송','ja','ko',{previousSegments:[],glossary:[{source:'방송',target:'방송'}]})).resolves.toBe('방송')
  // Preserve-as-written glossary entries resolve exactly; ordinary explicit
  // replacements still reach the translator and are not blocked by the shortcut.
  await engine.translate('방송','ja','ko',{previousSegments:[],glossary:[{source:'방송',target:'라이브'}]})
  expect(pool.sendRequest).toHaveBeenCalledTimes(1)
})

it('rejects lost names and protects alternate decoding paths without leaking internal tokens', async () => {
  const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
  await engine.initialize()
  pool.sendRequest.mockResolvedValueOnce('真弘明天不來。')
  await expect(engine.translate('まほろは明日来ません。','ja','zh')).rejects.toThrow('遺漏人名')
  pool.sendRequest.mockResolvedValue('[NAME0]明天不來。')
  for(const run of [
    ()=>engine.translateIncremental('まほろは明日来ません。','','ja','zh'),
    ()=>engine.translateSSBD('まほろは明日来ません。','','ja','zh'),
    ()=>engine.translateSimulMt('まほろは明日来ません。','','ja','zh',true)
  ]) await expect(run()).resolves.toBe('まほろ明天不來。')
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

it('uses an adjacent question for narrow incomplete replies without another model request', async () => {
  const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
  await expect(engine.translate('まだです。','ja','zh',{previousSegments:[],sourceContext:'準備はできましたか？'})).resolves.toBe('還沒準備好。')
  await expect(engine.translate('還沒。','zh','ja',{previousSegments:[],sourceContext:'結束了嗎？'})).resolves.toBe('まだ終わっていません。')
  expect(pool.acquire).not.toHaveBeenCalled()
  expect(pool.sendRequest).not.toHaveBeenCalled()
  await engine.initialize();pool.sendRequest.mockResolvedValueOnce('自訂譯文')
  await expect(engine.translate('まだです。','ja','zh',{previousSegments:[],sourceContext:'準備はできましたか？',glossary:[{source:'まだ',target:'自訂'}]})).resolves.toBe('自訂譯文')
  expect(pool.sendRequest).toHaveBeenCalledOnce()
})

it('does not let the short path bypass user terminology, other languages or contextual full input', async () => {
  const { pool } = fakePool()
  const engine = new HunyuanMT2Translator({ pool: pool as unknown as WorkerPool })
  await engine.initialize(); pool.sendRequest.mockImplementation(async request => (request as {to:string}).to === 'en' ? 'Model translation' : '模型譯文')
  const glossary = [{ source: 'ありがとう', target: '感恩' }]
  const custom: TranslateContext = { previousSegments: [], glossary }
  for (const [text, from, to, context] of [
    ['ありがとうございます！', 'ja', 'zh', custom],
    ['本当に？', 'ja', 'en', undefined], ['真的嗎？', 'zh', 'ja', undefined],
    ['薬は飲みません。', 'ja', 'zh', undefined], ['大丈夫。', 'ja', 'zh', undefined],
    ['明日は何曜日？', 'ja', 'zh', undefined]
  ] as const) await expect(engine.translate(text, from, to, context)).resolves.toBe(to === 'en' ? 'Model translation' : '模型譯文')
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
  await engine.initialize();pool.sendRequest.mockImplementation(async request => (request as {to:string}).to === 'en' ? 'Complete translation' : '完整譯文')
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

it('locks card abbreviations in sentences without changing a separate personal name', async () => {
 const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
 await engine.initialize()
 pool.sendRequest.mockImplementation(async (message:any)=> {
  expect(message.text).toBe('ポチさんも[NAME0]が好きだよ')
  return '波奇也喜歡[NAME0]。'
 })
 expect(await engine.translate('ポチさんもポケカが好きだよ','ja','zh')).toBe('波奇也喜歡寶可夢卡。')
 await engine.dispose()
})
it('keeps a personal card-term override ahead of the built-in protected term', async () => {
 const {pool}=fakePool(), engine=new HunyuanMT2Translator({pool:pool as unknown as WorkerPool})
 await engine.initialize();pool.sendRequest.mockResolvedValue('喜歡[NAME0]。')
 await engine.translate('ポケカが好き','ja','zh',{previousSegments:[],glossary:[{source:'ポケカ',target:'自訂卡牌'}]})
 expect((pool.sendRequest.mock.calls[0][0] as any).text).toBe('[NAME0]が好き')
 await engine.dispose()
})
