import { expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { TTSResult, TranslationResult } from '../engines/types'
import { TTSManager } from './tts-manager'
import * as pressure from './performance-state'

const { synthesize } = vi.hoisted(() => ({ synthesize: vi.fn() }))
vi.mock('./store', () => ({ store: { get: () => undefined } }))
vi.mock('../engines/tts/KokoroTTSEngine', () => ({
  KokoroTTSEngine: class {
    async initialize(): Promise<void> {}
    async dispose(): Promise<void> {}
    synthesize = synthesize
  }
}))

const caption = (text: string): TranslationResult => ({
  sourceText: text, translatedText: text, sourceLanguage: 'ja', targetLanguage: 'en', timestamp: 1
})

it('runs only one voice synthesis at a time and keeps only the newest waiting caption', async () => {
  synthesize.mockReset()
  let finish!: (result: TTSResult) => void
  const audio = { audio: new Float32Array([0.5]), sampleRate: 24000 }
  synthesize.mockImplementationOnce(() => new Promise<TTSResult>(resolve => { finish = resolve }))
    .mockResolvedValue(audio)
  const manager = new TTSManager()
  const send = vi.fn()
  const window = { webContents: { send } } as unknown as BrowserWindow
  await manager.setEnabled(true)
  const active = manager.handleTranslationResult(caption('first'), window)
  await manager.handleTranslationResult(caption('second'), window)
  await manager.handleTranslationResult(caption('latest'), window)
  expect(synthesize.mock.calls).toEqual([['first', 'en']])
  finish(audio)
  await active
  expect(synthesize.mock.calls).toEqual([['first', 'en'], ['latest', 'en']])
  expect(send).toHaveBeenCalledOnce()
  await manager.dispose()
})

it('drops pending caption speech during serious pressure and resumes after cooldown', async () => {
  synthesize.mockReset()
  const monitor = new pressure.PerformanceMonitor()
  let now = 0
  const policy = vi.spyOn(pressure, 'performanceState').mockImplementation(() => monitor.snapshot(now))
  const audio = { audio: new Float32Array([0.5]), sampleRate: 24000 }
  let finish!: (result: TTSResult) => void
  synthesize.mockResolvedValueOnce(audio)
    .mockImplementationOnce(() => new Promise<TTSResult>(resolve => { finish = resolve }))
    .mockResolvedValue(audio)
  const manager = new TTSManager()
  const send = vi.fn()
  const window = { webContents: { send } } as unknown as BrowserWindow
  try {
    await manager.handleTranslationResult(caption('default disabled'), window)
    expect(synthesize).not.toHaveBeenCalled()
    await manager.setEnabled(true)
    await manager.handleTranslationResult(caption('already playing'), window)
    const active = manager.handleTranslationResult(caption('active'), window)
    await manager.handleTranslationResult(caption('waiting'), window)
    monitor.update({ thermalState: 'serious' }, now)
    await manager.handleTranslationResult(caption('while hot'), window)
    finish(audio)
    await active
    expect(synthesize.mock.calls).toEqual([['already playing', 'en'], ['active', 'en']])
    expect(send.mock.calls.map(([type]) => type)).toEqual(['tts-audio'])
    monitor.update({ thermalState: 'nominal' }, now)
    now = 60_000
    await manager.handleTranslationResult(caption('recovered'), window)
    expect(synthesize).toHaveBeenLastCalledWith('recovered', 'en')
    expect(send).toHaveBeenCalledTimes(2)
  } finally {
    policy.mockRestore()
    await manager.dispose()
  }
})
