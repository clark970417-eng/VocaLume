import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { StreamingProcessor, type StreamingDeps } from './StreamingProcessor'
import { LocalAgreement } from './LocalAgreement'
import { ContextBuffer } from './ContextBuffer'
import * as pressure from '../main/performance-state'
import {contextualShortReply} from '../engines/translator/contextual-short-reply'

it.each([false,true])('discards a final from older settings without releasing active recognition (SimulMT=%s)', async simul => {
  let finish!: (text:string) => void
  let glossary: Array<{source:string;target:string}> = []
  const emitter = new EventEmitter(), result = vi.fn(), context = new ContextBuffer()
  emitter.on('result',result)
  const translate = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => finish=resolve)).mockResolvedValue('新設定譯文')
  const translator = {id:'test',translate,translateSimulMt:translate,resetSimulMtSession:vi.fn()}
  const p = new StreamingProcessor({emitter,agreement:new LocalAgreement(),contextBuffer:context,
    getSTTEngine:()=>({processAudio:async()=>({text:'明日は休みです。',language:'ja'})}),getTranslator:()=>translator,
    getGlossary:()=>glossary,getSimulMtConfig:()=>({enabled:simul,waitK:3}),resolveTargetLanguage:()=> 'zh',
    incrementProcessing(){},decrementProcessing(){}
  } as unknown as StreamingDeps)
  try {
    const pending = p.finalizeStreaming(new Float32Array(16000),16000)
    await vi.waitFor(() => expect(translate).toHaveBeenCalledOnce())
    glossary=[{source:'休み',target:'休息'}];p.resetSourceContext()
    finish('舊設定譯文')
    expect(await pending).toBeNull();expect(result).not.toHaveBeenCalled()
    expect(context.getContext().previousSegments).toEqual([])
    expect(await p.finalizeStreaming(new Float32Array(16000),16000)).toMatchObject({translatedText:'新設定譯文'})
    expect(result).toHaveBeenCalledOnce()
  } finally {p.reset()}
})

it('keeps recognition serialized when settings change during a decode', async () => {
  let finish!: (value:unknown) => void
  const recognize=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>finish=resolve)).mockResolvedValue({text:'次の文章です。',language:'ja'})
  const result=vi.fn(),emitter=new EventEmitter();emitter.on('result',result)
  const p=new StreamingProcessor({emitter,agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
    getSTTEngine:()=>({processAudio:recognize}),getTranslator:()=>({translate:async()=> '中文'}),getGlossary:()=>[],
    getSimulMtConfig:()=>({enabled:false,waitK:3}),resolveTargetLanguage:()=> 'zh',incrementProcessing(){},decrementProcessing(){}
  } as unknown as StreamingDeps)
  try {
    const pending=p.finalizeStreaming(new Float32Array(16000),16000)
    p.resetSourceContext()
    expect(p.isLocked).toBe(true)
    expect(await p.processStreaming(new Float32Array(16000),16000)).toBeNull()
    expect(recognize).toHaveBeenCalledOnce()
    finish({text:'舊語言結果',language:'ja'});expect(await pending).toBeNull();expect(result).not.toHaveBeenCalled()
    expect(await p.finalizeStreaming(new Float32Array(16000),16000)).toMatchObject({translatedText:'中文'})
  } finally {p.reset()}
})

it.each([false,true])('bounds other-language SimulMT final recovery and resets rejected cue state (persistent=%s)', async persistent => {
  const error=Object.assign(new Error('Invalid output'),{name:'TranslationValidationError'})
  const emitter=new EventEmitter(), errors=vi.fn();emitter.on('error',errors)
  const source='明日は配信を休みます。', output='No stream tomorrow.'
  const stt=vi.fn(async()=>({text:source,language:'ja'}))
  const translate=vi.fn().mockImplementation(async()=>{if(persistent)throw error;return output})
  const translator={id:'hunyuan-mt-15',translate,translateSimulMt:vi.fn().mockRejectedValueOnce(error).mockResolvedValue(output),resetSimulMtSession:vi.fn()}
  const glossary:never[]=[], context=new ContextBuffer()
  const p=new StreamingProcessor({emitter,agreement:new LocalAgreement(),contextBuffer:context,
    getSTTEngine:()=>({processAudio:stt}),getTranslator:()=>translator,getGlossary:()=>glossary,
    getSimulMtConfig:()=>({enabled:true,waitK:3}),resolveTargetLanguage:()=> 'en',incrementProcessing(){},decrementProcessing(){}
  } as unknown as StreamingDeps)
  try {
    const result=await p.finalizeStreaming(new Float32Array(16000),16000)
    if(persistent){expect(result).toBeNull();expect(errors).toHaveBeenCalledOnce();expect(context.getContext().previousSegments).toEqual([])}
    else expect(result).toMatchObject({sourceText:source,translatedText:output})
    expect(stt).toHaveBeenCalledOnce()
    expect(translator.translateSimulMt).toHaveBeenCalledOnce();expect(translate).toHaveBeenCalledOnce()
    expect(translator.resetSimulMtSession).toHaveBeenCalled()
    expect(await p.finalizeStreaming(new Float32Array(16000),16000)).toMatchObject({translatedText:output})
    expect(translate).toHaveBeenCalledOnce()
  }finally{p.reset()}
})

it.each(['serial','overlap'])('keeps Chinese reply context scoped to the adjacent cue (%s)', async mode => {
  let source='準備好了嗎？'
  const calls: unknown[]=[]
  const translator={id:'hunyuan-mt-15',translate:async()=> 'ordinary'}
  const p=new StreamingProcessor({
    emitter:new EventEmitter(),agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
    getSTTEngine:()=>({processAudio:async()=>({text:source,language:'zh'})}),getTranslator:()=>translator,
    getSourceLanguage:()=> 'zh',getGlossary:()=>[],getSimulMtConfig:()=>({enabled:false,waitK:3}),resolveTargetLanguage:()=> 'ja',
    translateFinal:async(text:string,from:string,to:string,_confidence:number|undefined,context:string|undefined)=>{
      calls.push(context);return contextualShortReply(text,from,to,context)||'ordinary'
    },incrementProcessing(){},decrementProcessing(){}
  } as unknown as StreamingDeps)
  const run=async(segment:string,start:number)=>{
    const audio=new Float32Array(16000),evidence={segment,speechSeconds:1,captureStartSample:start,captureEndSample:start+16000}
    if(mode==='serial')return p.finalizeStreaming(audio,16000,evidence)
    return (await p.prepareFinalStreaming(audio,16000,evidence))?.completion
  }
  try{
    await run('question',0);source='好了。'
    expect((await run('reply',16000))?.translatedText).toBe('準備できました。')
    p.resetSourceContext()
    expect((await run('after-seek',0))?.translatedText).toBe('ordinary')
    expect(calls).toEqual([undefined,'準備好了嗎？',undefined])
  }finally{p.reset()}
})

it.each([false,true])('uses visible source context for final captions, including negation, with SimulMT=%s', async enabled => {
  let source = '今日は配信する。'
  const calls: string[] = [], sources: string[] = []
  const emitter = new EventEmitter();emitter.on('source-result',text=>sources.push(text))
  const translator = {id:'hunyuan-mt-15',translate:async(text:string)=>{calls.push(text);return '譯：'+text},translateSimulMt:vi.fn()}
  const p = new StreamingProcessor({emitter,agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
    getSTTEngine:()=>({processAudio:async()=>({text:source,language:'ja'})}),getTranslator:()=>translator,
    getGlossary:()=>[],getSimulMtConfig:()=>({enabled,waitK:3}),resolveTargetLanguage:()=> 'zh',
    incrementProcessing(){},decrementProcessing(){}
  } as unknown as StreamingDeps)
  try {
    const audio=new Float32Array(16000)
    await p.finalizeStreaming(audio,16000)
    source='つもりはありません。明日はやります。'
    const result=await p.finalizeStreaming(audio,16000)
    expect(result?.sourceText).toBe('今日は配信するつもりはありません。明日はやります。')
    expect(result?.translatedText).toBe('譯：'+result?.sourceText)
    expect(sources.at(-1)).toBe(result?.sourceText)
    expect(calls.at(-1)).toBe(result?.sourceText)
    source='はい。'
    expect((await p.finalizeStreaming(audio,16000))?.sourceText).toBe('はい。')
    source='魚が逃げて。';await p.finalizeStreaming(audio,16000)
    p.reset();source='しまいました。'
    expect((await p.finalizeStreaming(audio,16000))?.sourceText).toBe('しまいました。')
  } finally {p.reset()}
})

it('leaves idle time after slow previews while final sentences bypass thermal admission', async () => {
  vi.useFakeTimers()
  const policy = vi.spyOn(pressure, 'performanceState').mockReturnValue({thermalState:'serious',speedLimit:100,previewFloorMs:1500,previewDutyCycle:.4,previewsPaused:false,coolingDown:false})
  const stt = vi.fn(async () => {await new Promise(resolve=>setTimeout(resolve,2000));return {text:'今日は配信しません。',language:'ja'}})
  const extraDraft = vi.fn()
  const processor = new StreamingProcessor({
    emitter:new EventEmitter(),agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
    getSTTEngine:()=>({processAudio:stt}),getDraftSTTEngine:()=>({processAudio:extraDraft}),
    getTranslator:()=>({id:'hunyuan-mt-15',translate:async()=> '今天不直播。'}),getGlossary:()=>[],
    getSimulMtConfig:()=>({enabled:false,waitK:3}),resolveTargetLanguage:()=> 'zh',incrementProcessing(){},decrementProcessing(){}
  } as unknown as StreamingDeps)
  try {
    const first=processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(2000);expect((await first)?.sourceText).toBe('今日は配信しません。')
    expect(await processor.processStreaming(new Float32Array(32000),16000)).toBeNull()
    expect(stt).toHaveBeenCalledOnce();expect(extraDraft).not.toHaveBeenCalled()
    policy.mockReturnValue({thermalState:'critical',speedLimit:100,previewFloorMs:2500,previewDutyCycle:.25,previewsPaused:true,coolingDown:false})
    expect(await processor.processStreaming(new Float32Array(48000),16000)).toBeNull()
    const final=processor.finalizeStreaming(new Float32Array(64000),16000)
    await vi.advanceTimersByTimeAsync(2000)
    expect((await final)?.translatedText).toBe('今天不直播。');expect(stt).toHaveBeenCalledTimes(2)
  } finally {processor.reset();policy.mockRestore();vi.useRealTimers()}
})

it('does not publish an old interim translation after the segment is finalized', async () => {
  vi.useFakeTimers()
  let complete!: (value: string) => void
  const emitter = new EventEmitter()
  const updates: unknown[] = []
  emitter.on('interim-result', r => updates.push(r))
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({ processAudio: async () => ({text: '今日は魚を見ました。', language: 'ja'}) }),
    getTranslator: () => ({translate: () => new Promise<string>(resolve => { complete = resolve })}),
    translateFinal: async () => '今天看到了魚。',
    getGlossary: () => [], getSimulMtConfig: () => ({enabled:false,waitK:3}),
    resolveTargetLanguage: () => 'zh', incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(1000)
    const final=await processor.finalizeStreaming(new Float32Array(16000),16000)
    expect(final?.translatedText).toBe('今天看到了魚。')
    const count=updates.length
    complete('過期翻譯')
    await Promise.resolve(); await Promise.resolve()
    expect(updates).toHaveLength(count)
  } finally {processor.reset();vi.useRealTimers()}
})


it('does not restart translation when recognition finishes after reset', async () => {
  vi.useFakeTimers()
  let finish!: (value: unknown) => void
  const translate = vi.fn(async () => '你好')
  const emitter = new EventEmitter()
  const emit = vi.spyOn(emitter, 'emit')
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: () => new Promise(resolve => {finish=resolve})}),
    getTranslator: () => ({translate}), getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    const processing = processor.processStreaming(new Float32Array(16000),16000)
    processor.reset()
    finish({text:'こんにちは',language:'ja'})
    expect(await processing).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(translate).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  } finally {processor.reset();vi.useRealTimers()}
})


it('coalesces newer interim text while translation is busy', async () => {
  vi.useFakeTimers()
  const calls: string[] = []
  const completions: Array<(s:string)=>void> = []
  let source = 'あいう'
  const translator = {translate: (text:string) => {calls.push(text);return new Promise<string>(r=>completions.push(r))}}
  const processor = new StreamingProcessor({
    emitter: new EventEmitter(), agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text:source,language:'ja'})}),
    getTranslator: () => translator, getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toEqual(['あいう'])
    source='あいうえ'
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(1200)
    expect(calls).toHaveLength(1)
    source='あいうえお'
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(0)
    completions[0]!('譯文')
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual(['あいう','あいうえお'])
    completions[1]!('新譯文')
    await Promise.resolve()
  } finally {processor.reset();vi.useRealTimers()}
})

it('starts the first Chinese translation without waiting for another recognition window', async () => {
  vi.useFakeTimers()
  const translate = vi.fn(async () => '大家好')
  const processor = new StreamingProcessor({
    emitter: new EventEmitter(), agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text:'みなさんこんにちは',language:'ja'})}),
    getTranslator: () => ({translate}), getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    const result = await processor.processStreaming(new Float32Array(16000),16000)
    expect(result?.sourceText).toBe('みなさんこんにちは')
    await vi.advanceTimersByTimeAsync(1)
    expect(translate).toHaveBeenCalledOnce()
    expect(processor.lastTranslatedConfirmed).toBe('大家好')
  } finally {processor.reset();vi.useRealTimers()}
})

it('SimulMT translates the newest Japanese revision that arrived while it was busy', async () => {
  let source = '最初です', finish!: (value: string) => void
  const calls: string[] = [], updates: any[] = []
  const translateSimulMt = vi.fn((text: string) => {
    calls.push(text)
    if (calls.length === 1) return new Promise<string>(resolve => { finish = resolve })
    return Promise.resolve('最新的中文')
  })
  const emitter = new EventEmitter(); emitter.on('interim-result', result => updates.push(result))
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text: source, language: 'ja'})}),
    getTranslator: () => ({translate: async () => '', translateSimulMt}), getGlossary: () => [],
    getSimulMtConfig: () => ({enabled: true, waitK: 1}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    await processor.processStreaming(new Float32Array(16000), 16000)
    expect(calls).toEqual(['最初で'])
    source = '最初です。続きがあります'
    await processor.processStreaming(new Float32Array(16000), 16000)
    expect(calls).toHaveLength(1)
    finish('最初的中文'); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(calls.at(-1)).toContain('続き')
    await Promise.resolve(); await Promise.resolve()
    expect(updates.some(result => result.translatedText === '最新的中文')).toBe(true)
  } finally { processor.reset() }
})

it('times out a finalization behind stalled recognition without entering STT concurrently', async () => {
  vi.useFakeTimers()
  let finish!: (value: null) => void
  const processAudio = vi.fn(() => new Promise<null>(r => { finish = r }))
  const processor = new StreamingProcessor({
    emitter: new EventEmitter(), agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio}), getTranslator: () => null, getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    const pending = processor.processStreaming(new Float32Array(16000),16000)
    const final = processor.finalizeStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(10001)
    expect(await final).toBeNull()
    expect(processAudio).toHaveBeenCalledOnce()
    finish(null)
    await pending
  } finally {processor.reset();vi.useRealTimers()}
})

it('does not replace an already translated hypothesis with a shorter clause on confirmation', async () => {
  vi.useFakeTimers()
  let source = '今日は魚を見ました。'
  const translate = vi.fn(async (text: string) => text === '今日は魚を見ました。' ? '今天看到了魚。' : '今天的魚')
  const emitter = new EventEmitter()
  const updates: Array<{translatedText: string}> = []
  emitter.on('interim-result', result => updates.push(result))
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text:source,language:'ja'})}),
    getTranslator: () => ({translate}), getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(1)
    expect(processor.lastTranslatedConfirmed).toBe('今天看到了魚。')
    await processor.processStreaming(new Float32Array(32000),16000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(translate).toHaveBeenCalledOnce()
    expect(updates.at(-1)?.translatedText).toBe('今天看到了魚。')
    source = '今日は鳥を見ました。'
    await processor.processStreaming(new Float32Array(48000),16000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(translate).toHaveBeenLastCalledWith(source, 'ja', 'zh', expect.anything())
  } finally {processor.reset();vi.useRealTimers()}
})

it('bounds draft recognition and drops drafts that arrive after the primary result', async () => {
  let complete!: (value: unknown) => void
  const draft = vi.fn(() => new Promise(resolve => { complete = resolve }))
  const emitter = new EventEmitter()
  const emitted = vi.fn()
  emitter.on('draft-stt-result', emitted)
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text:'午後九時です。',language:'ja'})}),
    getDraftSTTEngine: () => ({processAudio:draft}),
    getTranslator: () => null, getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    await processor.processStreaming(new Float32Array(16000),16000)
    await processor.processStreaming(new Float32Array(32000),16000)
    expect(draft).toHaveBeenCalledOnce()
    complete({text:'五時です。',language:'ja'})
    await new Promise(resolve => setTimeout(resolve,0))
    expect(emitted).not.toHaveBeenCalled()
    await processor.processStreaming(new Float32Array(48000),16000)
    expect(draft).toHaveBeenCalledTimes(2)
    processor.reset()
    complete({text:'古い字幕',language:'ja'})
    await new Promise(resolve => setTimeout(resolve,0))
    expect(emitted).not.toHaveBeenCalled()
  } finally {processor.reset()}
})

it('publishes a fast Japanese draft before primary recognition completes', async () => {
  let finish!: (value: unknown) => void
  const emitter = new EventEmitter()
  const draft = vi.fn()
  emitter.on('draft-stt-result', draft)
  const processor = new StreamingProcessor({
    emitter, agreement:new LocalAgreement(), contextBuffer:new ContextBuffer(),
    getSTTEngine:()=>({processAudio:()=>new Promise(resolve=>{finish=resolve})}),
    getDraftSTTEngine:()=>({processAudio:async()=>({text:'こんばんは',language:'ja'})}),
    getTranslator:()=>null,getGlossary:()=>[],getSimulMtConfig:()=>({enabled:false,waitK:3}),
    resolveTargetLanguage:()=> 'zh',incrementProcessing(){},decrementProcessing(){},getGeneration:()=>1
  } as unknown as StreamingDeps)
  try {
    const pending=processor.processStreaming(new Float32Array(16000),16000)
    await vi.waitFor(()=>expect(draft).toHaveBeenCalledOnce())
    expect(draft).toHaveBeenCalledWith(expect.objectContaining({sourceText:'こんばんは',translatedText:'',isInterim:true}))
    finish({text:'皆さん、こんばんは。',language:'ja'})
    expect((await pending)?.sourceText).toBe('皆さん、こんばんは。')
  } finally {processor.reset()}
})
it('cancels the interim inference before processing the final utterance', async () => {
 vi.useFakeTimers()
 let signal:AbortSignal|undefined
 const processor=new StreamingProcessor({
  emitter:new EventEmitter(),agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
  getSTTEngine:()=>({processAudio:async()=>({text:'こんにちは',language:'ja'})}),
  getTranslator:()=>({translate:(_t:string,_f:string,_to:string,c:any)=>{signal=c.signal;return new Promise((_r,reject)=>signal!.addEventListener('abort',()=>reject(new Error('cancelled'))))}}),
  translateFinal:async()=>{expect(signal?.aborted).toBe(true);return '你好'},
  getGlossary:()=>[],getSimulMtConfig:()=>({enabled:false,waitK:3}),resolveTargetLanguage:()=> 'zh',incrementProcessing(){},decrementProcessing(){}
 } as unknown as StreamingDeps)
 try {
  await processor.processStreaming(new Float32Array(16000),16000)
  await vi.advanceTimersByTimeAsync(0)
  expect(signal?.aborted).toBe(false)
  expect((await processor.finalizeStreaming(new Float32Array(16000),16000))?.translatedText).toBe('你好')
 }finally{processor.reset();vi.useRealTimers()}
})
it('reuses an exact completed translation at speech end but re-translates a changed sentence', async () => {
 vi.useFakeTimers()
 let text='今日は休みです。'
 const final=vi.fn(async()=> '明天休息。')
 const processor=new StreamingProcessor({
  emitter:new EventEmitter(),agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
  getSTTEngine:()=>({processAudio:async()=>({text,language:'ja'})}),
  getTranslator:()=>({translate:async()=> '今天休息。'}),translateFinal:final,
  getGlossary:()=>[],getSimulMtConfig:()=>({enabled:false,waitK:3}),resolveTargetLanguage:()=> 'zh',incrementProcessing(){},decrementProcessing(){}
 } as unknown as StreamingDeps)
 try {
  await processor.processStreaming(new Float32Array(16000),16000);await vi.advanceTimersByTimeAsync(0)
  expect((await processor.finalizeStreaming(new Float32Array(16000),16000))?.translatedText).toBe('今天休息。')
  expect(final).not.toHaveBeenCalled()
  await processor.processStreaming(new Float32Array(16000),16000);await vi.advanceTimersByTimeAsync(0)
  text='明日は休みです。'
  expect((await processor.finalizeStreaming(new Float32Array(16000),16000))?.translatedText).toBe('明天休息。')
  expect(final).toHaveBeenCalledTimes(1)
 }finally{processor.reset();vi.useRealTimers()}
})

it('recognizes subsequent speech while final Chinese is pending, then publishes finals in source order', async () => {
  const emitter = new EventEmitter()
  emitter.on('error', () => {})
  const published: string[] = [], sources: string[] = [], calls: string[] = []
  emitter.on('result', r => published.push(r.sourceText + ':' + r.translatedText))
  emitter.on('source-result', text => sources.push(text))
  let release!: (s: string) => void
  let source = '最初の文'
  const translate = vi.fn((text: string) => { calls.push(text); return text === '最初の文' ? new Promise<string>(r => {release = r}) : Promise.resolve('第二句') })
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text: source, language: 'ja'})}),
    getTranslator: () => ({translate}), getGlossary: () => [],
    getSimulMtConfig: () => ({enabled: false, waitK: 3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    const first = await processor.prepareFinalStreaming(new Float32Array(16000), 16000)
    expect(processor.isLocked).toBe(false)
    source = '次の文'
    const second = await processor.prepareFinalStreaming(new Float32Array(16000), 16000)
    expect(sources).toEqual(['最初の文', '次の文'])
    expect(calls).toEqual(['最初の文'])
    expect(published).toEqual([])
    source = ''
    await processor.processStreaming(new Float32Array(16000), 16000)
    release('第一句')
    await Promise.all([first?.completion, second?.completion])
    expect(published).toEqual(['最初の文:第一句', '次の文:第二句'])
  } finally { release?.('cleanup'); processor.reset() }
})

it('cancels accepted finals on reset without cancelling them on the next utterance', async () => {
  const emitter = new EventEmitter()
  const published = vi.fn()
  emitter.on('result', published)
  let release!: (s: string) => void
  const translate = vi.fn(() => new Promise<string>(r => {release = r}))
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text: '古い文', language: 'ja'})}),
    getTranslator: () => ({translate}), getGlossary: () => [],
    getSimulMtConfig: () => ({enabled: false, waitK: 3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  const first = await processor.prepareFinalStreaming(new Float32Array(16000), 16000)
  const second = await processor.prepareFinalStreaming(new Float32Array(16000), 16000)
  processor.reset()
  release('舊翻譯')
  expect(await first?.completion).toBeNull()
  expect(await second?.completion).toBeNull()
  expect(translate).toHaveBeenCalledOnce()
  expect(published).not.toHaveBeenCalled()
})

it('continues final translation after a failed sentence and balances processing counts', async () => {
  const emitter = new EventEmitter()
  const errors = vi.fn()
  emitter.on('error', errors)
  let active = 0, source = '失敗'
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text: source, language: 'ja'})}),
    getTranslator: () => ({translate: async (text: string) => { if (text === '失敗') throw new Error('timeout'); return '成功' }}),
    getGlossary: () => [], getSimulMtConfig: () => ({enabled: false, waitK: 3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {active++}, decrementProcessing() {active--}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  const first = await processor.prepareFinalStreaming(new Float32Array(16000), 16000)
  source = '成功'
  const second = await processor.prepareFinalStreaming(new Float32Array(16000), 16000)
  expect(await first?.completion).toBeNull()
  expect((await second?.completion)?.translatedText).toBe('成功')
  expect(errors).toHaveBeenCalledOnce()
  expect(active).toBe(0)
  processor.reset()
})

it('reuses an exact completed translation for a repeated interim without running inference', async () => {
  vi.useFakeTimers()
  const emitter = new EventEmitter(), updates: any[] = []
  emitter.on('interim-result', result => updates.push(result))
  const translate = vi.fn(async () => '新譯文')
  let source = 'まだ終わっていません。'
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text: source, language: 'ja'})}),
    getTranslator: () => ({translate}),
    getCachedTranslation: (text: string) => text === 'まだ終わっていません。' ? '還沒結束。' : undefined,
    getGlossary: () => [], getSimulMtConfig: () => ({enabled:false,waitK:3}),
    resolveTargetLanguage: () => 'zh', incrementProcessing() {}, decrementProcessing() {}
  } as unknown as StreamingDeps)
  try {
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(0)
    expect(translate).not.toHaveBeenCalled()
    expect(updates.at(-1).translatedText).toBe('還沒結束。')
    processor.reset()
    source = 'もう終わりました。'
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(0)
    expect(translate).toHaveBeenCalledTimes(1)
  } finally {processor.reset();vi.useRealTimers()}
})

it('publishes generated Chinese before completion and drops chunks after reset', async () => {
 vi.useFakeTimers()
 let source='今日は先に寝ます。'
 let chunk!: (text: string) => void, finish!: (text: string) => void
 const emitter=new EventEmitter(), updates:any[]=[]
 emitter.on('interim-result',r=>updates.push(r))
 const processor=new StreamingProcessor({
  emitter,agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
  getSTTEngine:()=>({processAudio:async()=>({text:source,language:'ja'})}),
  getTranslator:()=>({translate:(_t: string,_f: string,_to: string,ctx:any)=>{chunk=ctx.onPartial;return new Promise(r=>finish=r)}}),
  getGlossary:()=>[],getSimulMtConfig:()=>({enabled:false,waitK:3}),resolveTargetLanguage:()=> 'zh',
  incrementProcessing(){},decrementProcessing(){}
 } as unknown as StreamingDeps)
 try {
  await processor.processStreaming(new Float32Array(16000),16000);await vi.advanceTimersByTimeAsync(0)
  chunk('今天先去');expect(updates.at(-1).translatedText).toBe('今天先去')
  expect(updates.at(-1).isInterim).toBe(true)
  source='今日は先に寝ません。'
  await processor.processStreaming(new Float32Array(16000),16000)
  const beforeCorrection=updates.length
  chunk('今天先去睡了');expect(updates).toHaveLength(beforeCorrection)
  processor.reset();const count=updates.length
  chunk('不該再顯示');finish('今天先去睡了。');await vi.advanceTimersByTimeAsync(0)
  expect(updates).toHaveLength(count)
 } finally {processor.reset();vi.useRealTimers()}
})

it('passes each chunk\'s speech evidence to recognition with that chunk only', async () => {
  const emitter = new EventEmitter()
  const seen: unknown[] = []
  const deps = (simulMt: boolean) => ({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({ processAudio: async (_audio: Float32Array, _rate: number, evidence?: unknown) => { seen.push(evidence); return null } }),
    getTranslator: () => ({ translate: async () => '', ...(simulMt && { translateSimulMt: async () => '' }) }),
    getGlossary: () => [], getSimulMtConfig: () => ({ enabled: simulMt, waitK: 3 }),
    resolveTargetLanguage: () => 'zh', incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  const processor = new StreamingProcessor(deps(false))
  await processor.processStreaming(new Float32Array(16000), 16000, { speechSeconds: 0.5 })
  await processor.processStreaming(new Float32Array(16000), 16000)
  await processor.finalizeStreaming(new Float32Array(16000), 16000, { speechSeconds: 1.5 })
  await processor.prepareFinalStreaming(new Float32Array(16000), 16000)
  const serial = new StreamingProcessor(deps(true))
  await serial.finalizeStreaming(new Float32Array(16000), 16000, { speechSeconds: 2 })
  expect(seen).toEqual([{ speechSeconds: 0.5 }, undefined, { speechSeconds: 1.5 }, undefined, { speechSeconds: 2 }])
  processor.reset(); serial.reset()
})
