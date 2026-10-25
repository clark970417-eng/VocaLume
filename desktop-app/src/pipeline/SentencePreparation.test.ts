import {it, expect, vi} from 'vitest'
import {EventEmitter} from 'events'
import {StreamingProcessor, type StreamingDeps} from './StreamingProcessor'
import {LocalAgreement} from './LocalAgreement'
import {ContextBuffer} from './ContextBuffer'
import type {TranslateContext, GlossaryEntry} from '../engines/types'
import * as pressure from '../main/performance-state'

const evidence={segment:'1:1',speechSeconds:1,speechEndSample:16000}
const audio=new Float32Array(24000);audio.fill(.1,0,16000)
const finalAudio=new Float32Array(32000);finalAudio.set(audio)
function fixture(from: 'ja' | 'zh' = 'ja', serial = false) {
 let source=from==='ja'?'今日は遊びません。':'今天不會玩遊戲。'
 let glossary: GlossaryEntry[]=[]
 let finish!: (text:string)=>void, signal: AbortSignal | undefined
 const events: Array<{isInterim?:boolean;translatedText:string}>=[]
 const emitter=new EventEmitter();emitter.on('interim-result',r=>events.push(r));emitter.on('result',r=>events.push(r))
 const stt=vi.fn(async()=>({text:source,language:from,isFinal:true,timestamp:1}))
 const translate=vi.fn((_text:string,_from:string,_to:string,ctx?:TranslateContext)=>{
  signal=ctx?.signal
  return new Promise<string>(resolve=>{finish=resolve})
 })
 const translator={id:'hunyuan-mt-15',translate,...(serial && {translateSimulMt:translate})}
 const translateFinal=vi.fn(async()=>from==='ja'?'今天不玩遊戲。':'今日はゲームをしません。')
 const processor=new StreamingProcessor({
  emitter,agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),getSTTEngine:()=>({processAudio:stt}),
  getTranslator:()=>translator,getGlossary:()=>glossary,translateFinal,getSimulMtConfig:()=>({enabled:serial,waitK:3}),
  resolveTargetLanguage:()=>from==='ja'?'zh':'ja',incrementProcessing(){},decrementProcessing(){},getGeneration:()=>1
 } as unknown as StreamingDeps)
 return {processor,stt,translate,translateFinal,events,finish:(s:string)=>finish(s),signal:()=>signal,
  setSource:(s:string)=>{source=s},setGlossary:(g:GlossaryEntry[])=>{glossary=g}}
}

for(const from of ['ja','zh'] as const)it(`prepares ${from} without publishing partial translation and reuses unchanged final audio`,async()=>{
 const f=fixture(from)
 try {
  await f.processor.processStreaming(audio,16000,evidence)
  expect(f.translate).toHaveBeenCalledOnce()
  expect(f.events.every(r=>!r.translatedText)).toBe(true)
  const final=await f.processor.prepareFinalStreaming(finalAudio,16000,evidence)
  expect(final?.sourceText).toBeTruthy();expect(f.stt).toHaveBeenCalledOnce()
  expect(f.signal()?.aborted).toBe(false)
  const expected=from==='ja'?'今天不玩遊戲。':'今日はゲームをしません。'
  f.finish(expected)
  expect((await final?.completion)?.translatedText).toBe(expected)
  expect(f.translateFinal).not.toHaveBeenCalled()
  expect(f.events.filter(r=>r.translatedText)).toHaveLength(1)
 } finally {f.processor.reset()}
})

it('the saved SimulMT setting also reuses the Japanese complete-sentence preparation', async () => {
 const f=fixture('ja',true)
 try {
  await f.processor.processStreaming(audio,16000,evidence)
  f.finish('今天不玩遊戲。')
  const result=await f.processor.finalizeStreaming(finalAudio,16000,evidence)
  expect(result?.translatedText).toBe('今天不玩遊戲。')
  expect(f.stt).toHaveBeenCalledOnce();expect(f.translate).toHaveBeenCalledOnce()
  expect(f.translateFinal).not.toHaveBeenCalled()
 } finally { f.processor.reset() }
})

it('stopping while a failed preparation settles does not launch a fallback translation', async () => {
 const f=fixture()
 try {
  await f.processor.processStreaming(audio,16000,evidence)
  const final=await f.processor.prepareFinalStreaming(finalAudio,16000,evidence)
  f.processor.reset(); f.finish('')
  expect(await final?.completion).toBeNull()
  expect(f.translateFinal).not.toHaveBeenCalled()
 } finally { f.processor.reset() }
})

it('a continued negation cancels preparation and translates the entire final source',async()=>{
 const f=fixture()
 try {
  await f.processor.processStreaming(audio,16000,evidence)
  f.setSource('今日は遊びませんと言ったけど、少しだけ遊びます。')
  const pending=await f.processor.prepareFinalStreaming(finalAudio,16000,{...evidence,speechSeconds:1.3,speechEndSample:28000})
  expect(f.signal()?.aborted).toBe(true)
  expect((await pending?.completion)?.translatedText).toBe('今天不玩遊戲。')
  expect(f.translateFinal).toHaveBeenCalledWith('今日は遊びませんと言ったけど、少しだけ遊びます。','ja','zh',undefined)
  f.finish('過期的候選譯文');await Promise.resolve();await Promise.resolve()
  expect(f.events.some(r=>r.translatedText==='過期的候選譯文')).toBe(false)
 } finally {f.processor.reset()}
})

it('changed terminology invalidates a candidate even if the final audio is unchanged',async()=>{
 const f=fixture()
 try {
  await f.processor.processStreaming(audio,16000,evidence)
  f.setGlossary([{source:'遊び',target:'遊玩'}])
  const final=await f.processor.prepareFinalStreaming(finalAudio,16000,evidence)
  expect(f.signal()?.aborted).toBe(true)
  await final?.completion
  expect(f.translateFinal).toHaveBeenCalledOnce()
  f.finish('舊詞庫');await Promise.resolve()
 } finally {f.processor.reset()}
})

it('failed preparation falls back once; session stop suppresses a promoted late result',async()=>{
 const f=fixture()
 try {
  await f.processor.processStreaming(audio,16000,evidence)
  f.finish('')
  expect((await f.processor.finalizeStreaming(finalAudio,16000,evidence))?.translatedText).toBe('今天不玩遊戲。')
  expect(f.translateFinal).toHaveBeenCalledOnce()
  await f.processor.processStreaming(audio,16000,{...evidence,segment:'1:2'})
  const final=await f.processor.prepareFinalStreaming(finalAudio,16000,{...evidence,segment:'1:2'})
  const count=f.events.length
  f.processor.reset();expect(f.signal()?.aborted).toBe(true)
  f.finish('已停止的譯文');await final?.completion
  expect(f.events).toHaveLength(count)
 } finally {f.processor.reset()}
})

it('hanging clauses and thermal pressure never start optional preparation',async()=>{
 const f=fixture()
 try {
  f.setSource('魚が逃げて。')
  await f.processor.processStreaming(audio,16000,evidence)
  expect(f.translate).not.toHaveBeenCalled()
  const policy=vi.spyOn(pressure,'performanceState').mockReturnValue({thermalState:'fair',speedLimit:100,previewFloorMs:0,previewDutyCycle:.65,previewsPaused:false,coolingDown:false})
  try {
   f.setSource('魚が逃げてしまいました。')
   await f.processor.processStreaming(audio,16000,{...evidence,segment:'1:2'})
   expect(f.translate).not.toHaveBeenCalled()
  } finally {policy.mockRestore()}
 } finally {f.processor.reset()}
})
