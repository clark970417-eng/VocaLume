import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture ipcMain handlers registered by registerAudioHandlers
const handlers = new Map<string, (event: unknown, arg: unknown, evidence?: unknown) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, arg: unknown, evidence?: unknown) => unknown) => {
      handlers.set(channel, fn)
    }
  }
}))

vi.mock('./logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}))

vi.mock('./error-utils', () => ({
  sanitizeErrorMessage: (m: string) => m
}))

import { registerAudioHandlers } from './audio-handlers'
import { resetRealtimeAudioDispatcher } from './realtime-audio'
import type { AppContext } from './app-context'

// Flush the microtask queue so the realtime promise chain settles
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

function makePipeline(): {
  running: boolean
  audioSessionGeneration: number
  audioPreviewDelayMs: number
  canOverlapFinalTranslation: boolean
  prepareFinalStreaming: ReturnType<typeof vi.fn>
  process: ReturnType<typeof vi.fn>
  processStreaming: ReturnType<typeof vi.fn>
  finalizeStreaming: ReturnType<typeof vi.fn>
  pushRealtimeAudio: ReturnType<typeof vi.fn>
  onSpeechBoundary: ReturnType<typeof vi.fn>
} {
  return {
    running: true,
    audioSessionGeneration: 0,
    audioPreviewDelayMs: 0,
    canOverlapFinalTranslation: false,
    prepareFinalStreaming: vi.fn().mockResolvedValue(null),
    process: vi.fn().mockResolvedValue(null),
    processStreaming: vi.fn().mockResolvedValue(null),
    finalizeStreaming: vi.fn().mockResolvedValue(null),
    pushRealtimeAudio: vi.fn().mockResolvedValue(undefined),
    onSpeechBoundary: vi.fn().mockResolvedValue(undefined)
  }
}

describe('registerAudioHandlers (#721)', () => {
  let pipeline: ReturnType<typeof makePipeline>
  let ctx: AppContext

  beforeEach(() => {
    handlers.clear()
    resetRealtimeAudioDispatcher() // isolate the shared realtime chain between cases
    pipeline = makePipeline()
    ctx = { pipeline, mainWindow: { webContents: { send: vi.fn() } } } as unknown as AppContext
    registerAudioHandlers(ctx)
  })

  it('ignores stale desktop capture events during a file-owned pipeline session', async () => {
    ctx.pipelineInputOwner = 'file'
    const chunk = new Float32Array(16_000).fill(.5)
    await handlers.get('process-audio')!(null, chunk)
    await handlers.get('process-audio-streaming')!(null, chunk)
    await handlers.get('finalize-streaming')!(null, chunk)
    await handlers.get('push-realtime-audio')!(null, chunk.subarray(0, 1600))
    await handlers.get('speech-boundary')!(null, 'start')
    await flush()
    for (const call of [pipeline.process, pipeline.processStreaming, pipeline.finalizeStreaming, pipeline.pushRealtimeAudio, pipeline.onSpeechBoundary]) {
      expect(call).not.toHaveBeenCalled()
    }
  })

  it('routes a sub-0.5s realtime chunk to pushRealtimeAudio (bypasses the 8000-sample minimum)', async () => {
    const chunk = Array.from(new Float32Array(1600).fill(0.5)) // 100ms at 16kHz
    await handlers.get('push-realtime-audio')!(null, chunk)
    await flush()

    expect(pipeline.pushRealtimeAudio).toHaveBeenCalledTimes(1)
    const arg = pipeline.pushRealtimeAudio.mock.calls[0][0]
    expect(arg).toBeInstanceOf(Float32Array)
    expect(arg.length).toBe(1600)
    // Realtime audio must not leak into the cascade STT path
    expect(pipeline.processStreaming).not.toHaveBeenCalled()
  })

  it('preserves order across many realtime chunks via the sequential chain', async () => {
    for (let i = 0; i < 5; i++) {
      await handlers.get('push-realtime-audio')!(null, Array.from(new Float32Array(1600).fill(i / 10)))
    }
    await flush()
    expect(pipeline.pushRealtimeAudio).toHaveBeenCalledTimes(5)
  })

  it('forwards typed realtime PCM without reconstructing it', async () => {
    const chunk = new Float32Array(1600).fill(0.5)
    await handlers.get('push-realtime-audio')!(null, chunk)
    await flush()

    expect(pipeline.pushRealtimeAudio.mock.calls[0]?.[0]).toBe(chunk)
  })

  it('keeps pushing after a rejected chunk (per-link catch, no chain poisoning)', async () => {
    pipeline.pushRealtimeAudio.mockRejectedValueOnce(new Error('boom'))
    await handlers.get('push-realtime-audio')!(null, Array.from(new Float32Array(1600)))
    await handlers.get('push-realtime-audio')!(null, Array.from(new Float32Array(1600)))
    await flush()
    expect(pipeline.pushRealtimeAudio).toHaveBeenCalledTimes(2)
  })

  it('finalizes the segment only on a speech-end boundary hint', async () => {
    await handlers.get('speech-boundary')!(null, 'start')
    expect(pipeline.onSpeechBoundary).not.toHaveBeenCalled()
    await handlers.get('speech-boundary')!(null, 'end')
    expect(pipeline.onSpeechBoundary).toHaveBeenCalledTimes(1)
  })

  it('cascade regression: streaming chunks below the 0.5s minimum are still dropped', async () => {
    const short = Array.from(new Float32Array(1600).fill(0.5))
    await handlers.get('process-audio-streaming')!(null, short)
    expect(pipeline.processStreaming).not.toHaveBeenCalled()
  })

  it('cascade regression: a valid streaming chunk still reaches processStreaming', async () => {
    const valid = Array.from(new Float32Array(8000).fill(0.5))
    await handlers.get('process-audio-streaming')!(null, valid)
    expect(pipeline.processStreaming).toHaveBeenCalledTimes(1)
  })

  it('reports preview admission independently and continues to accept final PCM while previews are delayed', async () => {
    const chunk = new Float32Array(8000).fill(0.2)
    const preview = handlers.get('process-audio-preview')!
    const check = handlers.get('get-audio-preview-delay')!
    pipeline.audioPreviewDelayMs = 700
    expect(check(null, undefined)).toBe(700)
    expect(await preview(null, chunk)).toBe(700)
    expect(pipeline.processStreaming).not.toHaveBeenCalled()
    await handlers.get('finalize-streaming')!(null, chunk)
    expect(pipeline.finalizeStreaming).toHaveBeenCalledOnce()
    pipeline.audioPreviewDelayMs = 0
    pipeline.processStreaming.mockImplementationOnce(async () => { pipeline.audioPreviewDelayMs = 400 })
    expect(await preview(null, chunk)).toBe(400)
    expect(pipeline.processStreaming).toHaveBeenCalledOnce()
  })

  it('passes validated desktop capture evidence through previews and both final routes', async () => {
    const chunk = new Float32Array(16000).fill(0.25)
    const evidence = {
      segment: 'desktop:1', speechSeconds: 0.75, speechEndSample: 12800,
      captureStartSample: 32000, captureEndSample: 48000, continuationExpected: false
    }
    await handlers.get('process-audio-streaming')!(null, chunk, evidence)
    expect(pipeline.processStreaming).toHaveBeenCalledWith(chunk, 16000, evidence)
    await handlers.get('finalize-streaming')!(null, chunk, evidence)
    expect(pipeline.finalizeStreaming).toHaveBeenCalledWith(chunk, 16000, evidence)
    pipeline.canOverlapFinalTranslation = true
    await handlers.get('finalize-streaming')!(null, chunk, evidence)
    expect(pipeline.prepareFinalStreaming).toHaveBeenCalledWith(chunk, 16000, evidence)
  })

  it('accepts a short voiced final only with valid metadata for that PCM window', async () => {
    const short = new Float32Array(6400).fill(0.2)
    const evidence = {
      segment: 'desktop:1', speechSeconds: 0.192, speechEndSample: 3072,
      captureStartSample: 96000, captureEndSample: 102400
    }
    const finish = handlers.get('finalize-streaming')!
    await finish(null, short)
    await finish(null, short, { ...evidence, speechSeconds: 0 })
    await finish(null, short, { ...evidence, captureEndSample: 102401 })
    await finish(null, short, { ...evidence, speechEndSample: 100 })
    await finish(null, short, { ...evidence, speechSeconds: 1 })
    expect(pipeline.finalizeStreaming).not.toHaveBeenCalled()
    await finish(null, short, evidence)
    expect(pipeline.finalizeStreaming).toHaveBeenCalledExactlyOnceWith(short, 16000, evidence)
  })

  it('ignores realtime audio when the pipeline is not running', async () => {
    pipeline.running = false
    await handlers.get('push-realtime-audio')!(null, Array.from(new Float32Array(1600)))
    await flush()
    expect(pipeline.pushRealtimeAudio).not.toHaveBeenCalled()
  })

  it('accepts a quiet VAD-confirmed reply without submitting silence or unverified noise', async () => {
    const audio = new Float32Array(6400).fill(0.0002)
    const evidence = {
      segment: 'desktop:1', speechSeconds: 0.096, speechEndSample: 1536,
      captureStartSample: 0, captureEndSample: audio.length
    }
    const finish = handlers.get('finalize-streaming')!
    await finish(null, audio)
    await finish(null, new Float32Array(audio.length), evidence)
    await finish(null, audio, evidence)
    expect(pipeline.finalizeStreaming).toHaveBeenCalledExactlyOnceWith(audio, 16000, evidence)
  })

  it('retains a burst of finals in order and skips previews while the queue drains', async () => {
    let release!: () => void
    pipeline.finalizeStreaming.mockReturnValueOnce(new Promise<void>(resolve => { release = resolve }))
    const finish = handlers.get('finalize-streaming')!
    const queued = Array.from({ length: 17 }, (_, index) => new Float32Array(8000).fill(0.1 + index / 100))
    const results = queued.map(chunk => finish(null, chunk))
    await handlers.get('process-audio-streaming')!(null, queued[0])
    expect(pipeline.processStreaming).not.toHaveBeenCalled()
    await expect(results[16]).resolves.toBeNull()
    release()
    await Promise.all(results)
    expect(pipeline.finalizeStreaming.mock.calls.map(call => call[0])).toEqual(queued.slice(0, 16))
  })

  it('recognizes queued cloud finals in order while the first translation is pending', async () => {
    pipeline.canOverlapFinalTranslation = true
    let acceptFirst!: () => void
    let translateFirst!: () => void
    const recognition = new Promise<void>(resolve => { acceptFirst = resolve })
    const translation = new Promise<void>(resolve => { translateFirst = resolve })
    pipeline.prepareFinalStreaming.mockImplementationOnce(async () => {
      await recognition
      return { completion: translation }
    }).mockResolvedValueOnce({ completion: Promise.resolve(null) })
    const finish = handlers.get('finalize-streaming')!
    const first = new Float32Array(8000).fill(0.3)
    const second = new Float32Array(8000).fill(0.6)
    const firstResult = finish(null, first)
    const secondResult = finish(null, second)
    await handlers.get('process-audio-streaming')!(null, second)
    expect(pipeline.processStreaming).not.toHaveBeenCalled()
    expect(pipeline.prepareFinalStreaming.mock.calls.map(call => call[0])).toEqual([first])
    acceptFirst()
    await secondResult
    expect(pipeline.prepareFinalStreaming.mock.calls.map(call => call[0])).toEqual([first, second])
    translateFirst()
    await firstResult
  })

  it('drops a queued desktop final when capture has restarted', async () => {
    let finishActive!: () => void
    pipeline.finalizeStreaming.mockReturnValueOnce(new Promise<void>(resolve => { finishActive = resolve }))
    const finish = handlers.get('finalize-streaming')!
    const chunk = new Float32Array(8000).fill(0.5)
    const first = finish(null, chunk)
    const stale = finish(null, chunk)
    await flush()
    pipeline.audioSessionGeneration++
    finishActive()
    await Promise.all([first, stale])
    expect(pipeline.finalizeStreaming).toHaveBeenCalledTimes(1)
  })
})
