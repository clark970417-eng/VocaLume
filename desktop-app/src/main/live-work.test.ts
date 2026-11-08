import { describe, expect, it, vi } from 'vitest'
import { LiveWorkScheduler } from './live-work'

function latch() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

describe('shared inference admission', () => {
  it('asks background work to yield and runs a queued final before a preview', async () => {
    const work = new LiveWorkScheduler()
    const reached = latch()
    const order: string[] = []
    const background = work.run('background', signal => new Promise<void>(resolve => {
      signal.addEventListener('abort', () => { order.push('yield'); resolve() }, { once: true })
      reached.release()
    }))
    await reached.promise
    const preview = work.run('preview', async () => { order.push('preview') })
    expect(order).toEqual([])
    const final = work.run('final', async () => { order.push('final') })
    const nextFileChunk = work.run('background', async () => { order.push('next file chunk') })
    await Promise.all([background, preview, final, nextFileChunk])
    expect(order).toEqual(['yield', 'final', 'preview', 'next file chunk'])
  })

  it('allows recognition to overlap a detached final but blocks unrelated model work', async () => {
    const work = new LiveWorkScheduler()
    const translated = latch()
    const final = work.trackFinal(translated.promise)
    const translateText = vi.fn(async () => 'translation')
    const background = work.run('background', translateText)
    await work.run('preview', async () => {})
    expect(translateText).not.toHaveBeenCalled()
    translated.release()
    await final
    await expect(background).resolves.toBe('translation')
  })

  it('lets a companion abandon a queued text request without waiting for the final', async () => {
    const work = new LiveWorkScheduler()
    const translated = latch()
    const final = work.trackFinal(translated.promise)
    const connection = new AbortController()
    const background = vi.fn(async () => {})
    const queued = work.run('background', background, connection.signal)
    connection.abort(new Error('Audio arrived'))
    await expect(queued).rejects.toThrow('Audio arrived')
    await work.run('final', async () => {})
    translated.release()
    await final
    expect(background).not.toHaveBeenCalled()
  })
})
