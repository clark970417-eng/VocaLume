import {expect,it,vi} from 'vitest'
import {TranslationRequestCache} from './translation-request-cache'
const live = () => new AbortController()
const deferred = () => { let resolve!: (s: string) => void, reject!: (e: Error) => void; const promise = new Promise<string>((a,b) => {resolve=a;reject=b}); return {promise,resolve,reject} }

it('shares one pending inference, delivers partials, then reuses only the completed result', async () => {
  const cache=new TranslationRequestCache(), task=deferred(), a=vi.fn(), b=vi.fn()
  let emit!: (s:string)=>void
  const run=vi.fn((_s:AbortSignal,p:(s:string)=>void)=>{emit=p;return task.promise})
  const one=cache.run('same',run,live().signal,a)
  emit('尚未')
  const two=cache.run('same',run,live().signal,b)
  expect(b).toHaveBeenCalledWith('尚未')
  expect(run).toHaveBeenCalledOnce()
  task.resolve('尚未完成。')
  expect(await Promise.all([one,two])).toEqual(['尚未完成。','尚未完成。'])
  expect(await cache.run('same',run,live().signal)).toBe('尚未完成。')
  expect(run).toHaveBeenCalledOnce()
})
it('cancelling one listener does not cancel a translation another still needs', async () => {
  const cache=new TranslationRequestCache(), task=deferred(), a=live(), b=live(), partial=vi.fn()
  let workerSignal!: AbortSignal, emit!: (s:string)=>void
  const run=(s:AbortSignal,p:(s:string)=>void)=>{workerSignal=s;emit=p;return task.promise}
  const one=cache.run('same',run,a.signal,partial), two=cache.run('same',run,b.signal)
  const rejected=expect(one).rejects.toThrow('stop one')
  a.abort(new Error('stop one'));await rejected
  expect(workerSignal.aborted).toBe(false)
  emit('譯文');expect(partial).not.toHaveBeenCalled()
  task.resolve('完整譯文');expect(await two).toBe('完整譯文')
})
it('last cancellation aborts shared work; a late result cannot replace the immediate retry', async () => {
  const cache=new TranslationRequestCache(), old=deferred(), next=deferred(), a=live()
  let signal!:AbortSignal
  const one=cache.run('same',s=>{signal=s;return old.promise},a.signal)
  const failure=expect(one).rejects.toThrow('cancel')
  a.abort(new Error('cancel'));await failure;expect(signal.aborted).toBe(true)
  const two=cache.run('same',()=>next.promise,live().signal)
  old.resolve('過時結果');await Promise.resolve();await Promise.resolve()
  next.resolve('完整重試');expect(await two).toBe('完整重試')
  expect(await cache.run('same',()=>Promise.reject(),live().signal)).toBe('完整重試')
})
it('failures and empty outputs do not poison an immediate retry', async () => {
  const cache=new TranslationRequestCache()
  await expect(cache.run('x',()=>Promise.reject(new Error('worker exit')),live().signal)).rejects.toThrow('worker exit')
  expect(await cache.run('x',async()=>'',live().signal)).toBe('')
  expect(await cache.run('x',async()=>'成功',live().signal)).toBe('成功')
})
it('bounds memory, expires entries, clears on disposal and respects already-aborted cache hits', async () => {
  vi.useFakeTimers()
  try {
    const cache=new TranslationRequestCache(2,100),run=vi.fn(async()=> 'complete')
    for(const key of ['a','b','a','c','b'])await cache.run(key,run,live().signal)
    expect(run).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(101);await cache.run('b',run,live().signal);expect(run).toHaveBeenCalledTimes(5)
    const stopped=live();stopped.abort(new Error('stopped'))
    await expect(cache.run('b',run,stopped.signal)).rejects.toThrow('stopped')
    cache.clear();await cache.run('b',run,live().signal);expect(run).toHaveBeenCalledTimes(6)
    for(let i=0;i<2;i++)await cache.run('x'.repeat(16385),run,live().signal)
    expect(run).toHaveBeenCalledTimes(8)
  } finally {vi.useRealTimers()}
})
it('disposal cancels waiting callers and ignores old completion after restarting', async () => {
  const cache=new TranslationRequestCache(),task=deferred()
  const pending=cache.run('x',()=>task.promise,live().signal)
  const failure=expect(pending).rejects.toThrow('disposed');cache.clear();await failure
  await cache.run('x',async()=>'new',live().signal);task.resolve('old');await Promise.resolve()
  expect(await cache.run('x',async()=>'wrong',live().signal)).toBe('new')
})
