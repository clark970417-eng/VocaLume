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

  it('promotes a queued shared caption instead of running duplicate inference', async () => {
    const work = new LiveWorkScheduler()
    const running = latch()
    const order: string[] = []
    const promote = new AbortController()
    const preview = work.run('preview', () => running.promise)
    const chat = work.run('background', async () => { order.push('chat') })
    const shared = work.run('background', async () => { order.push('shared caption') }, undefined, promote.signal)
    promote.abort()
    running.release()
    await Promise.all([preview, chat, shared])
    expect(order).toEqual(['shared caption', 'chat'])
  })

  it('allows active matching text to finish when promoted by a caption', async () => {
    const work = new LiveWorkScheduler()
    const running = latch()
    const promote = new AbortController()
    const active = work.run('background', async signal => {
      await running.promise
      signal.throwIfAborted()
      return '字幕'
    }, undefined, promote.signal)
    promote.abort()
    const next = work.run('final', async () => {})
    running.release()
    await expect(active).resolves.toBe('字幕')
    await next
  })

  it('measures caption queue wait with the same active operation and page/chat burst', async () => {
    vi.useFakeTimers()
    try {
      const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
      const measure = async (captionPriority: 'background' | 'final'): Promise<number> => {
        const work = new LiveWorkScheduler()
        const queuedAt = Date.now()
        const running = work.run('background', () => wait(20))
        const page = work.run('background', () => wait(50))
        const chat = work.run('background', () => wait(80))
        const caption = work.run(captionPriority, async () => Date.now() - queuedAt)
        await vi.advanceTimersByTimeAsync(200)
        await Promise.all([running, page, chat])
        return await caption
      }
      expect(await measure('background')).toBe(150)
      expect(await measure('final')).toBe(20)
    } finally {
      vi.useRealTimers()
    }
  })
})
