import {it, expect, vi, afterEach} from 'vitest'
import {EventEmitter} from 'events'
import {GERProcessor} from './GERProcessor'
import type {TranslatorEngine} from '../engines/types'

const worker = vi.hoisted(()=>({sendRequest:vi.fn()}))
vi.mock('../main/worker-pool',()=>({workerPool:{isAlive:true,sendRequest:worker.sendRequest}}))
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks()})

function fixture() {
  const emitter=new EventEmitter(), corrected=vi.fn(), translate=vi.fn<TranslatorEngine['translate']>(async()=> '譯文')
  emitter.on('ger-corrected',corrected)
  const translator={id:'test',name:'test',isOffline:true,initialize:async()=>{},dispose:async()=>{},translate}
  let configuration=0
  const p=new GERProcessor({emitter,getTranslator:()=>translator,getGlossary:()=>[],getGeneration:()=>1,getConfigurationRevision:()=>configuration})
  p.setEnabled(true)
  return {p,corrected,translate,change:()=>configuration++}
}

it('clears a successful correction deadline and avoids same-language retranslation',async()=>{
  vi.useFakeTimers()
  worker.sendRequest.mockResolvedValue('今天不會參加。')
  const f=fixture()
  f.p.maybeCorrect('今天不回參加。',.4,'zh','zh',1)
  await vi.advanceTimersByTimeAsync(0)
  expect(f.corrected).toHaveBeenCalledWith(expect.objectContaining({translatedText:'今天不會參加。'}))
  expect(f.translate).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('configuration changes discard pending corrections before retranslation',async()=>{
  vi.useFakeTimers()
  let finish!: (value:string)=>void
  worker.sendRequest.mockImplementation(()=>new Promise<string>(resolve=>finish=resolve))
  const f=fixture();f.p.maybeCorrect('まほろの配信です。',.4,'ja','zh',1)
  f.change();finish('まほろさんの配信です。')
  await vi.advanceTimersByTimeAsync(0)
  expect(f.translate).not.toHaveBeenCalled();expect(f.corrected).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('reset prevents a late retranslation from rewriting a delivered caption',async()=>{
  vi.useFakeTimers()
  worker.sendRequest.mockResolvedValue('まほろさんの配信です。')
  const f=fixture();let finish!: (value:string)=>void
  f.translate.mockImplementation(()=>new Promise<string>(resolve=>finish=resolve))
  f.p.maybeCorrect('まほろの配信です。',.4,'ja','zh',1)
  await vi.advanceTimersByTimeAsync(0)
  expect(f.translate).toHaveBeenCalledOnce()
  f.p.reset();finish('舊字幕')
  await vi.advanceTimersByTimeAsync(0)
  expect(f.corrected).not.toHaveBeenCalled()
})

it('disabled correction performs no worker or translation work',()=>{
  const f=fixture();f.p.setEnabled(false)
  f.p.maybeCorrect('まほろの配信です。',.1,'ja','zh',1)
  expect(worker.sendRequest).not.toHaveBeenCalled();expect(f.translate).not.toHaveBeenCalled()
})

it('does not trust a background edit that invents a different number',async()=>{
  vi.useFakeTimers()
  worker.sendRequest.mockResolvedValue('午後9時に配信します。')
  const f=fixture()
  f.p.maybeCorrect('午後8時に配信します。',.4,'ja','zh',1)
  await vi.advanceTimersByTimeAsync(0)
  expect(f.translate).not.toHaveBeenCalled()
  expect(f.corrected).not.toHaveBeenCalled()
})

it('gives recognition and retranslation one deadline and discards a late answer',async()=>{
  vi.useFakeTimers()
  worker.sendRequest.mockResolvedValue('まほろさんの配信です。')
  const f=fixture()
  let finish!: (text:string)=>void
  f.translate.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  f.p.maybeCorrect('まほろの配信です。',.4,'ja','zh',1)
  await vi.advanceTimersByTimeAsync(0)
  const context = f.translate.mock.calls[0]?.[3]
  await vi.advanceTimersByTimeAsync(2001)
  expect(context?.signal?.aborted).toBe(true)
  finish('まほろ的直播。')
  await vi.advanceTimersByTimeAsync(0)
  expect(f.corrected).not.toHaveBeenCalled()
})
