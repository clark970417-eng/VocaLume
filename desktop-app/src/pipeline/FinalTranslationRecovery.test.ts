import {expect, it, vi} from 'vitest'
import {recoverFinalTranslation} from './FinalTranslationRecovery'
import {apiFetch} from '../engines/translator/api-utils'

const invalid = () => Object.assign(new Error('Invalid translation'), {name:'TranslationValidationError'})

it('retries a quickly rejected final once, without timers or another audio pass', async () => {
  for (const error of [
    invalid(),
    new Error('Worker process exited'),
    Object.assign(new Error('Worker was replaced'), {name: 'WorkerTerminatedError'}),
    new Error('翻譯遺漏人名，請重試')
  ]) {
    const translate=vi.fn().mockRejectedValueOnce(error).mockResolvedValue('Recovered')
    expect(await recoverFinalTranslation(translate,()=>true)).toBe('Recovered')
    expect(translate).toHaveBeenCalledTimes(2)
  }
})

it('retries blank translations without returning or caching blank text', async () => {
  const translate = vi.fn().mockResolvedValueOnce('  ').mockResolvedValueOnce('Recovered')
  expect(await recoverFinalTranslation(translate, () => true)).toBe('Recovered')
  expect(translate).toHaveBeenCalledTimes(2)

  const blank = vi.fn(async () => '')
  await expect(recoverFinalTranslation(blank, () => true)).rejects.toThrow('returned no text')
  expect(blank).toHaveBeenCalledTimes(2)
})

it('retries a quickly failed cloud request but does not repeat auth or quota errors', async () => {
  const options = {url: 'https://translation.invalid', init: {method: 'POST'}, timeoutMs: 5000, serviceName: 'Mock API'}
  const translate = () => apiFetch<string>(options)
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  try {
    for (const failure of [new Response('', {status: 503}), new Response('invalid json'), new TypeError('fetch failed')]) {
      fetch.mockReset()
      if (failure instanceof Error) fetch.mockRejectedValueOnce(failure)
      else fetch.mockResolvedValueOnce(failure)
      fetch.mockResolvedValueOnce(Response.json('Recovered'))
      expect(await recoverFinalTranslation(translate, () => true)).toBe('Recovered')
      expect(fetch).toHaveBeenCalledTimes(2)
    }
    for (const status of [400, 401, 403, 429]) {
      fetch.mockReset().mockResolvedValueOnce(new Response('', {status}))
      await expect(recoverFinalTranslation(translate, () => true)).rejects.toThrow(String(status))
      expect(fetch).toHaveBeenCalledOnce()
    }
  } finally {
    vi.unstubAllGlobals()
  }
})

it('does not repeat success or endlessly repeat invalid output', async () => {
  const good=vi.fn(async()=>'Valid')
  expect(await recoverFinalTranslation(good,()=>true)).toBe('Valid')
  expect(good).toHaveBeenCalledOnce()
  const bad=vi.fn().mockRejectedValue(invalid())
  await expect(recoverFinalTranslation(bad,()=>true)).rejects.toThrow('Invalid')
  expect(bad).toHaveBeenCalledTimes(2)
})

it('does not retry stopped, slow, overloaded, timed-out or cancelled work', async () => {
  for (const [error,current,elapsed] of [
    [invalid(),false,0], [invalid(),true,1000],
    [new Error('Translation queue is full; please retry'),true,0],
    [new Error('Worker request timed out (translate)'),true,0],
    [new Error('Translation cancelled'),true,0], [new Error('Out of memory'),true,0]
  ] as const) {
    const translate=vi.fn().mockRejectedValue(error)
    let clock=0
    await expect(recoverFinalTranslation(translate,()=>current,{now:()=>clock++ ? elapsed : 0})).rejects.toBe(error)
    expect(translate).toHaveBeenCalledOnce()
  }
})
