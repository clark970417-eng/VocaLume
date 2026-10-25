import { EventEmitter } from 'events'
import { expect, it, vi } from 'vitest'
import { StreamingProcessor, type StreamingDeps } from './StreamingProcessor'
import { LocalAgreement } from './LocalAgreement'
import { ContextBuffer } from './ContextBuffer'
import { PerformanceMonitor } from '../main/performance-state'
import * as pressure from '../main/performance-state'
import type { STTResult } from '../engines/types'

function setup() {
 let text='今日は配信しません。'
 const emitter=new EventEmitter(), finals: Array<{sourceText:string}> = []
 emitter.on('result',result=>finals.push(result))
 const stt={id:'mlx-whisper',setVocabularyHints:vi.fn(),processAudio:vi.fn(async():Promise<STTResult>=>({text,language:'ja',isFinal:true,timestamp:1}))}
 const p=new StreamingProcessor({emitter,agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
  getSTTEngine:()=>stt,getTranslator:()=>({id:'hunyuan-mt-15',translate:async(source:string)=>'譯：'+source}),
  getGlossary:()=>[],getSourceLanguage:()=> 'ja',getSimulMtConfig:()=>({enabled:false,waitK:3}),
  resolveTargetLanguage:()=> 'zh',incrementProcessing(){},decrementProcessing(){}
 } as unknown as StreamingDeps)
 return {p,stt,finals,setText:(value:string)=>{text=value}}
}

it('avoids repeated decode of identical voiced audio and retains the complete final negation',async()=>{
 const f=setup(), audio=new Float32Array(16000).fill(.1)
 const evidence={segment:'1:1',speechSeconds:1,speechEndSample:16000}
 try{
  await f.p.processStreaming(audio,16000,evidence)
  await f.p.processStreaming(audio.slice(),16000,evidence)
  const final=await f.p.finalizeStreaming(audio,16000,evidence)
  expect(final?.sourceText).toBe('今日は配信しません。')
  expect(final?.translatedText).toContain('しません')
  expect(f.stt.processAudio).toHaveBeenCalledTimes(1)
  expect(f.finals).toHaveLength(1)
 }finally{f.p.reset()}
})

it('uses this cue\'s recognition vocabulary and clears it before a new cue or context reset',async()=>{
 const f=setup(), audio=new Float32Array(16000).fill(.1)
 try{
  f.setText('コンマホ、カノマホローです。')
  await f.p.processStreaming(audio,16000,{segment:'1:1',speechSeconds:1,speechEndSample:16000})
  expect(f.stt.setVocabularyHints).toHaveBeenLastCalledWith([])
  f.setText('こんまほ、鹿乃まほろです。')
  await f.p.finalizeStreaming(audio,16000,{segment:'1:1',speechSeconds:1,speechEndSample:16000})
  expect(f.stt.setVocabularyHints).toHaveBeenLastCalledWith(['こんまほ','鹿乃まほろ'])
  f.setText('明日は休みます。')
  await f.p.processStreaming(audio,16000,{segment:'1:2',speechSeconds:1,speechEndSample:16000})
  expect(f.stt.setVocabularyHints).toHaveBeenLastCalledWith([])
  const count=f.stt.processAudio.mock.calls.length
  f.p.resetSourceContext()
  await f.p.finalizeStreaming(audio,16000,{segment:'1:2',speechSeconds:1,speechEndSample:16000})
  expect(f.stt.processAudio).toHaveBeenCalledTimes(count+1)
 }finally{f.p.reset()}
})

it('does not repopulate reset recognition context from an older in-flight result',async()=>{
 const f=setup(), audio=new Float32Array(16000).fill(.1)
 let finish!: (value:STTResult)=>void
 f.stt.processAudio.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 try{
  const pending=f.p.processStreaming(audio,16000,{segment:'1:1',speechSeconds:1,speechEndSample:16000})
  f.p.resetSourceContext()
  finish({text:'コンマホ、カノマホローです。',language:'ja',isFinal:true,timestamp:1})
  await pending
  await f.p.finalizeStreaming(audio,16000,{segment:'1:1',speechSeconds:1,speechEndSample:16000})
  expect(f.stt.setVocabularyHints).toHaveBeenLastCalledWith([])
  expect(f.stt.processAudio).toHaveBeenCalledTimes(2)
 }finally{f.p.reset()}
})

it('pauses optional previews at critical memory pressure while preserving every accepted final',async()=>{
 const monitor=new PerformanceMonitor();monitor.update({thermalState:'nominal',memoryPressure:'critical'})
 const spy=vi.spyOn(pressure,'performanceState').mockImplementation(()=>monitor.snapshot())
 const f=setup(), audio=new Float32Array(16000).fill(.1)
 try{
  expect(await f.p.processStreaming(audio,16000)).toBeNull()
  expect(f.stt.processAudio).not.toHaveBeenCalled()
  const completed=[]
  for(const text of ['今日は配信しません。','明日は九時からです。','また来てください。']){
   f.setText(text)
   const result=await f.p.prepareFinalStreaming(audio,16000)
   completed.push(result?.completion)
  }
  const results=await Promise.all(completed)
  expect(results.map(result=>result?.sourceText)).toEqual(['今日は配信しません。','明日は九時からです。','また来てください。'])
  expect(results.every(result=>result?.translatedText)).toBe(true)
  expect(f.finals).toHaveLength(3)
 }finally{f.p.reset();spy.mockRestore()}
})
