import { EventEmitter } from 'node:events'
import type { BrowserWindow, WebContents } from 'electron'
import { expect, it, vi } from 'vitest'
import { TTSManager } from './tts-manager'
import { updatePerformanceState } from './performance-state'
import type { Language, TranslationResult, TTSResult } from '../engines/types'

vi.mock('./store', () => ({ store: { get: () => '' } }))
vi.mock('./logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

function setup() {
  const engine = {
    initialize: vi.fn(async () => {}),
    synthesize: vi.fn(async (_text: string, _language: Language, _signal?: AbortSignal): Promise<TTSResult> =>
      ({ audio: new Float32Array([.25]), sampleRate: 24000 })),
    setVoice: vi.fn(),
    dispose: vi.fn(async () => {})
  }
  const makeEngine = vi.fn(() => engine)
  const manager = new TTSManager(makeEngine, 1000)
  const target = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => false })
  const window = { webContents: target, isDestroyed: () => false } as unknown as BrowserWindow
  const listen = (): void => manager.setPlaybackListener(target as unknown as WebContents, true)
  return { manager, makeEngine, engine, target, window, listen }
}

const caption = (text: string, extra: Partial<TranslationResult> = {}): TranslationResult => ({
  sourceText: '話します', translatedText: text, sourceLanguage: 'ja', targetLanguage: 'zh', timestamp: 1, ...extra
})

it('skips initialization without a playback listener and releases the ONNX engine after speech idles', async () => {
  vi.useFakeTimers()
  const { manager, makeEngine, engine, target, window, listen } = setup()
  try {
    await manager.setEnabled(true)
    await manager.handleTranslationResult(caption('第一句'), window)
    expect(makeEngine).not.toHaveBeenCalled()
    listen()
    await manager.handleTranslationResult(caption('預覽', { isInterim: true }), window)
    await manager.handleTranslationResult(caption('修正', { captionRevision: 1 }), window)
    expect(makeEngine).not.toHaveBeenCalled()
    await manager.handleTranslationResult(caption('正式'), window)
    expect(engine.initialize).toHaveBeenCalledOnce()
    expect(target.send).toHaveBeenCalledWith('tts-audio', expect.objectContaining({ audio: new Float32Array([.25]) }))
    await vi.advanceTimersByTimeAsync(999)
    expect(engine.dispose).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(engine.dispose).toHaveBeenCalledOnce()
    await manager.handleTranslationResult(caption('恢復'), window)
    expect(engine.initialize).toHaveBeenCalledTimes(2)
  } finally {
    await manager.dispose()
    vi.useRealTimers()
  }
})

it('serializes native synthesis, skips the middle cue, and drops the stale in-flight result', async () => {
  const { manager, engine, target, window, listen } = setup()
  listen()
  await manager.setEnabled(true)
  let finish!: (result: TTSResult) => void
  engine.synthesize.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const old = manager.handleTranslationResult(caption('舊句'), window)
  await vi.waitFor(() => expect(engine.synthesize).toHaveBeenCalledOnce())
  const interrupted = engine.synthesize.mock.calls[0][2]
  const middle = manager.handleTranslationResult(caption('中間句'), window)
  const latest = manager.handleTranslationResult(caption('最新句'), window)
  expect(interrupted?.aborted).toBe(true)
  expect(engine.synthesize).toHaveBeenCalledOnce()
  finish({ audio: new Float32Array([.9]), sampleRate: 24000 })
  await Promise.all([old, middle, latest])
  expect(engine.synthesize.mock.calls.map(call => call[0])).toEqual(['舊句', '最新句'])
  expect(target.send).toHaveBeenCalledExactlyOnceWith('tts-audio', expect.objectContaining({ audio: new Float32Array([.25]) }))
  await manager.dispose()
})

it('stops active playback, discards late synthesis, and unloads after disabling', async () => {
  const { manager, engine, target, window, listen } = setup()
  listen()
  await manager.setEnabled(true)
  let finish!: (result: TTSResult) => void
  engine.synthesize.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const old = manager.handleTranslationResult(caption('停用前'), window)
  await vi.waitFor(() => expect(engine.synthesize).toHaveBeenCalledOnce())
  await manager.setEnabled(false)
  expect(target.send).toHaveBeenCalledExactlyOnceWith('tts-stop')
  expect(engine.dispose).not.toHaveBeenCalled()
  finish({ audio: new Float32Array([.9]), sampleRate: 24000 })
  await old
  expect(target.send).toHaveBeenCalledTimes(1)
  expect(engine.dispose).toHaveBeenCalledOnce()
  await manager.dispose()
})


it('cancels optional speech under serious pressure and accepts new captions after cooling', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })
  const { manager, engine, target, window, listen } = setup()
  const staleAudio = { audio: new Float32Array([.9]), sampleRate: 24000 }
  let finish: ((result: TTSResult) => void) | undefined
  try {
    listen()
    await manager.setEnabled(true)
    await manager.handleTranslationResult(caption('正常'), window)
    engine.synthesize.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const active = manager.handleTranslationResult(caption('收音中'), window)
    await vi.waitFor(() => expect(engine.synthesize).toHaveBeenCalledTimes(2))

    updatePerformanceState({ thermalState: 'serious' })
    expect(engine.synthesize.mock.calls[1][2]?.aborted).toBe(true)
    const hot = manager.handleTranslationResult(caption('過熱'), window)
    finish?.(staleAudio)
    await Promise.all([active, hot])
    expect(engine.synthesize.mock.calls.map(call => call[0])).toEqual(['正常', '收音中'])
    expect(target.send.mock.calls.map(call => call[0])).toEqual(['tts-audio', 'tts-stop'])

    updatePerformanceState({ thermalState: 'nominal' })
    await manager.handleTranslationResult(caption('降溫中'), window)
    await vi.advanceTimersByTimeAsync(60_000)
    await manager.handleTranslationResult(caption('恢復'), window)
    expect(engine.synthesize.mock.calls.map(call => call[0])).toEqual(['正常', '收音中', '恢復'])
    expect(target.send.mock.calls.map(call => call[0])).toEqual(['tts-audio', 'tts-stop', 'tts-audio'])
  } finally {
    finish?.(staleAudio)
    await manager.dispose()
    updatePerformanceState({ thermalState: 'nominal' })
    await vi.advanceTimersByTimeAsync(60_000)
    vi.useRealTimers()
  }
})
