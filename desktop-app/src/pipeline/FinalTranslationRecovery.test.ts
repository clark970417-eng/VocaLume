import {expect, it, vi} from 'vitest'
import {recoverFinalTranslation} from './FinalTranslationRecovery'

const invalid = () => Object.assign(new Error('Invalid translation'), {name:'TranslationValidationError'})

it('retries a quickly rejected final once, without timers or another audio pass', async () => {
  for (const error of [invalid(), new Error('Worker process exited'), new Error('翻譯遺漏人名，請重試')]) {
    const translate=vi.fn().mockRejectedValueOnce(error).mockResolvedValue('Recovered')
    expect(await recoverFinalTranslation(translate,()=>true)).toBe('Recovered')
    expect(translate).toHaveBeenCalledTimes(2)
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
