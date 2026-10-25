import { EventEmitter } from 'events'
import { expect, it, vi } from 'vitest'
import { availableMemoryPressure, bindMemoryPressure, darwinMemoryPressure, linuxMemoryPressure } from './memory-pressure'

it('uses macOS pressure levels and conservative non-Mac free-memory thresholds',()=>{
 expect(['1\n','2','4','0','bad','constructor','toString'].map(darwinMemoryPressure)).toEqual(['nominal','warning','critical','unknown','unknown','unknown','unknown'])
 const total=16*1024*1024
 expect(availableMemoryPressure({total,free:128*1024})).toBe('critical')
 expect(availableMemoryPressure({total,free:512*1024})).toBe('warning')
 expect(availableMemoryPressure({total,free:1024*1024})).toBe('nominal')
 for(const free of [NaN,-1,Infinity,total+1])expect(availableMemoryPressure({total,free})).toBe('unknown')
 expect(availableMemoryPressure({total:0,free:0})).toBe('unknown')
})

it('uses reclaimable Linux memory rather than treating a full disk cache as critical pressure',()=>{
 expect(linuxMemoryPressure('MemTotal: 16777216 kB\nMemFree: 50000 kB\nMemAvailable: 8000000 kB')).toBe('nominal')
 expect(linuxMemoryPressure('MemTotal: 16777216 kB\nMemFree: 50000 kB\nMemAvailable: 100000 kB')).toBe('critical')
 expect(linuxMemoryPressure('MemTotal: 16777216 kB\nMemFree: 50000 kB')).toBe('unknown')
 expect(linuxMemoryPressure('MemTotal: invalid\nMemAvailable: 100000 kB')).toBe('unknown')
})

it('polls only while audio is active, never overlaps checks, and ignores stale responses after Stop',async()=>{
 vi.useFakeTimers()
 const pipeline=new EventEmitter(),update=vi.fn()
 let complete!: (state:'critical'|'nominal')=>void
 const read=vi.fn(()=>new Promise<'critical'|'nominal'>(resolve=>{complete=resolve}))
 const cleanup=bindMemoryPressure(pipeline,update,read)
 try{
  expect(read).not.toHaveBeenCalled()
  pipeline.emit('state-change','initializing');pipeline.emit('state-change','running')
  await vi.advanceTimersByTimeAsync(20_000);expect(read).toHaveBeenCalledTimes(1)
  complete('critical');await vi.advanceTimersByTimeAsync(0)
  expect(update).toHaveBeenLastCalledWith('critical')
  await vi.advanceTimersByTimeAsync(5000);expect(read).toHaveBeenCalledTimes(2)
  pipeline.emit('state-change','idle')
  complete('critical');await vi.advanceTimersByTimeAsync(10_000)
  expect(update).toHaveBeenLastCalledWith('unknown');expect(read).toHaveBeenCalledTimes(2)
  pipeline.emit('state-change','running');expect(read).toHaveBeenCalledTimes(3)
  cleanup();cleanup();complete('nominal');await vi.advanceTimersByTimeAsync(10_000)
  expect(update).toHaveBeenLastCalledWith('unknown')
  expect(pipeline.listenerCount('state-change')).toBe(0)
 }finally{cleanup();vi.useRealTimers()}
})
