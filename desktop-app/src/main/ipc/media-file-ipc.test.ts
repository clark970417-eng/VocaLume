import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { STTResult, TranslationResult } from '../../engines/types'
import type { FileSegmentOptions } from '../../pipeline/TranslationPipeline'
import type { AppContext } from '../app-context'
import { registerMediaFileIpc } from './media-file-ipc'

const { handlers, spawn, fileStat } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  spawn: vi.fn(),
  fileStat: vi.fn()
}))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, fn: (...args: unknown[]) => unknown) => handlers.set(name, fn) } }))
vi.mock('node:child_process', () => ({ spawn }))
vi.mock('ffmpeg-static', () => ({ default: 'ffmpeg' }))
vi.mock('node:fs/promises', () => ({ stat: fileStat }))

const rate = 16_000
function source(text: string): STTResult { return { text, language: 'ja', timestamp: 0, isFinal: true } }

function fileSender() {
  return Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
}

function filePipeline(process: (audio: Float32Array, rate: number, options: FileSegmentOptions) => unknown) {
  return Object.assign(new EventEmitter(), { running: true, sessionStartTime: 0, process })
}

function processFile(seconds: number, replies: { stt: STTResult; translated?: string }[], review = false) {
  const decoder = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
    killed: false, kill: vi.fn() })
  spawn.mockImplementationOnce(() => {
    queueMicrotask(() => {
      const pcm = new Float32Array(seconds * rate).fill(.1)
      decoder.stdout.write(Buffer.from(pcm.buffer))
      decoder.emit('close', 0)
    })
    return decoder
  })
  const sender = fileSender()
  const calls: { length: number; sourceText: string; published: boolean }[] = []
  const process = vi.fn(async (audio: Float32Array, _rate: number, options: FileSegmentOptions): Promise<TranslationResult | null> => {
    const { stt, translated } = replies.shift()!
    const sourceText = options.prepareSource(stt)
    if (!sourceText) return null
    calls.push({ length: audio.length, sourceText, published: options.publish() })
    const result: TranslationResult = { sourceText, translatedText: translated ?? '',
      sourceLanguage: 'ja', targetLanguage: 'zh', timestamp: 0 }
    if (translated) return result
    options.onTranslationFailure(result)
    return null
  })
  registerMediaFileIpc({ pipeline: filePipeline(process), pipelineInputOwner: 'file' } as unknown as AppContext)
  const done = handlers.get('process-media-file')!({ sender }, 'short.wav', 'job-1', review)
  return { done, calls, events: () => sender.send.mock.calls }
}

describe('streaming file import', () => {
  beforeEach(() => {
    handlers.clear()
    spawn.mockReset()
    fileStat.mockReset().mockResolvedValue({ isFile: () => true })
  })

  it('shows the first result, then revises its source and timestamps across a hard cut', async () => {
    const job = processFile(27, [
      { stt: source('雇用統計は市場の予測'), translated: '就業統計與市場預測' },
      { stt: source('市場の予測を上回りました。'), translated: '就業統計超出市場預測' }
    ])
    expect(await job.done).toEqual({ processedSeconds: 27, cancelled: false })
    expect(job.calls.map(call => call.sourceText)).toEqual(['雇用統計は市場の予測', '雇用統計は市場の予測を上回りました。'])
    expect(job.calls.map(call => call.published)).toEqual([true, false])
    expect(job.calls[0]!.length + job.calls[1]!.length).toBe(rate * 28.1)
    const cues = job.events().filter(([channel]) => channel === 'media-file-cue').map(([, cue]) => cue)
    expect(cues).toMatchObject([
      { jobId: 'job-1', cueId: 1, revision: 0, startSeconds: 0, translatedText: '就業統計與市場預測' },
      { jobId: 'job-1', cueId: 1, revision: 1, startSeconds: 0, endSeconds: 27, translatedText: '就業統計超出市場預測' }
    ])
  })

  it('keeps a failed source in the initial result and revises only with opted-in review', async () => {
    const original = source('短い失敗した文です。')
    const job = processFile(3, [{ stt: original }, { stt: original, translated: '短句' }], true)
    expect(await job.done).toEqual({ processedSeconds: 3, cancelled: false })
    expect(job.calls.map(call => call.published)).toEqual([true, false])
    const cues = job.events().filter(([channel]) => channel === 'media-file-cue').map(([, cue]) => cue)
    expect(cues).toMatchObject([
      { jobId: 'job-1', cueId: 1, revision: 0, startSeconds: 0, endSeconds: 3, sourceText: original.text,
        status: 'translation-failed' },
      { jobId: 'job-1', cueId: 1, revision: 1, startSeconds: 0, endSeconds: 3, status: 'translated' }
    ])
  })

  it('rejects file work on the live-caption pipeline before starting a decoder', async () => {
    registerMediaFileIpc({ pipeline: filePipeline(vi.fn()), pipelineInputOwner: 'app' } as unknown as AppContext)
    await expect(handlers.get('process-media-file')!({ sender: fileSender() }, 'short.wav', 'job-2'))
      .rejects.toThrow('Start a file translation session')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('cancels a job when its pipeline stops while a segment is still running', async () => {
    const sender = fileSender()
    const decoder = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
      killed: false, kill: vi.fn() })
    spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        decoder.stdout.write(Buffer.from(new Float32Array(rate).fill(.1).buffer))
        decoder.emit('close', 0)
      })
      return decoder
    })
    let receivedSignal!: (signal: AbortSignal) => void
    const processing = new Promise<AbortSignal>(resolve => { receivedSignal = resolve })
    const pipeline = filePipeline((_audio: Float32Array, _rate: number, options: FileSegmentOptions) => {
      receivedSignal(options.signal)
      return new Promise(resolve => options.signal.addEventListener('abort', () => resolve(null), { once: true }))
    })
    registerMediaFileIpc({ pipeline, pipelineInputOwner: 'file' } as unknown as AppContext)
    const done = handlers.get('process-media-file')!({ sender }, 'short.wav', 'job-3')
    const signal = await processing
    Reflect.set(pipeline, 'sessionStartTime', null)
    pipeline.emit('state-change', 'idle')
    expect(await done).toEqual({ processedSeconds: 0, cancelled: true })
    expect(signal.aborted).toBe(true)
    expect(decoder.kill).toHaveBeenCalledWith('SIGKILL')
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('allows cancellation before the file path finishes resolving', async () => {
    const sender = fileSender()
    const pendingStat = Promise.withResolvers<{ isFile: () => boolean }>()
    fileStat.mockReturnValueOnce(pendingStat.promise)
    registerMediaFileIpc({ pipeline: filePipeline(vi.fn()), pipelineInputOwner: 'file' } as unknown as AppContext)
    const done = handlers.get('process-media-file')!({ sender }, 'short.wav', 'job-4')
    expect(handlers.get('cancel-media-file')!({ sender }, 'job-4')).toEqual({ cancelled: true })
    pendingStat.resolve({ isFile: () => true })
    expect(await done).toEqual({ processedSeconds: 0, cancelled: true })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('caps the legacy complete-PCM IPC at four minutes and leaves streamed imports separate', async () => {
    const decoder = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
    spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        const block = Buffer.alloc(512 * 1024)
        for (let i = 0; i < 31; i++) decoder.stdout.emit('data', block)
        decoder.emit('close', 0)
      })
      return decoder
    })
    registerMediaFileIpc({ pipeline: null } as AppContext)
    await expect(handlers.get('decode-media-file')!({ sender: fileSender() }, 'long.wav'))
      .rejects.toThrow('longer than four minutes')
    expect(spawn.mock.calls[0]![1]).toEqual(expect.arrayContaining(['-t', '241']))
    expect(decoder.kill).toHaveBeenCalledWith('SIGKILL')
  })
})
