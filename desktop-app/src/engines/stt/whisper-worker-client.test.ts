import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({fork:vi.fn()}))
vi.mock('electron',()=>({utilityProcess:{fork:state.fork}}))
import { WhisperWorkerClient } from './whisper-worker-client'

let client: WhisperWorkerClient
let child: EventEmitter & {kill:ReturnType<typeof vi.fn>;postMessage:ReturnType<typeof vi.fn>}
beforeEach(()=>{
  vi.useFakeTimers()
  child = Object.assign(new EventEmitter(),{kill:vi.fn(),postMessage:vi.fn()})
  state.fork.mockReset().mockReturnValue(child)
  client = new WhisperWorkerClient()
})
afterEach(()=>{client.dispose();vi.useRealTimers()})

it('shares child initialization and delivers original audio and decoding options',async()=>{
  const first=client.initialize(), second=client.initialize()
  expect(first).toBe(second)
  expect(state.fork).toHaveBeenCalledTimes(1)
  child.emit('message',{type:'ready'});await first
  const options={model:'base.bin',pcmf32:new Float32Array([.1,.2]),language:'fr',translate:false}
  const result=client.transcribe(options)
  await Promise.resolve()
  expect(child.postMessage).toHaveBeenCalledWith({type:'transcribe',id:1,options})
  child.emit('message',{type:'result',id:1,result:{transcription:['Bonjour']}})
  await expect(result).resolves.toEqual({transcription:['Bonjour']})
})

it('rejects a native initialization failure and permits a fresh child',async()=>{
  const first=client.initialize()
  const rejected=expect(first).rejects.toThrow('Missing native DLL')
  child.emit('message',{type:'fatal',message:'Missing native DLL'})
  await rejected
  expect(child.kill).toHaveBeenCalledTimes(1)
  const next=client.initialize()
  child.emit('message',{type:'ready'});await next
  expect(state.fork).toHaveBeenCalledTimes(2)
})

it('terminates a stuck initializer rather than leaving the app waiting forever',async()=>{
  const rejected=expect(client.initialize()).rejects.toThrow('initialization timed out')
  await vi.advanceTimersByTimeAsync(30_000)
  await rejected
  expect(child.kill).toHaveBeenCalledTimes(1)
})

it('rejects decoding on child crash and removes pending request timers',async()=>{
  const ready=client.initialize();child.emit('message',{type:'ready'});await ready
  const result=client.transcribe({model:'base.bin',pcmf32:new Float32Array(1)})
  const rejected=expect(result).rejects.toThrow('worker exited')
  await Promise.resolve();child.emit('exit',1)
  await rejected
  expect(vi.getTimerCount()).toBe(0)
})

it('kills timed-out decoding and rejects in-flight work when disposed',async()=>{
  const ready=client.initialize();child.emit('message',{type:'ready'});await ready
  const result=client.transcribe({model:'base.bin',pcmf32:new Float32Array(1)})
  const rejected=expect(result).rejects.toThrow('transcription timed out')
  await vi.advanceTimersByTimeAsync(120_000);await rejected
  expect(child.kill).toHaveBeenCalledTimes(1)
  const next=client.initialize();child.emit('message',{type:'ready'});await next
  const pending=client.transcribe({model:'base.bin',pcmf32:new Float32Array(1)})
  const disposed=expect(pending).rejects.toThrow('disposed')
  await Promise.resolve();client.dispose();await disposed
  expect(vi.getTimerCount()).toBe(0)
})
