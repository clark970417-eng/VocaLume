import { expect, it, vi } from 'vitest'
vi.mock('../model-downloader', () => ({ isModelDownloaded: () => true, getModelPath: () => 'test.bin' }))
vi.mock('@kutalia/whisper-node-addon', () => { throw new Error('Missing native DLL') })

it('opens the app module without loading optional native Whisper DLLs', async () => {
  const { WhisperLocalEngine } = await import('./WhisperLocalEngine')
  const engine = new WhisperLocalEngine()
  await expect(engine.initialize()).rejects.toThrow()
  expect(await engine.processAudio(new Float32Array(), 16000)).toBeNull()
})

it('keeps recognized speech in its source language instead of English', async () => {
  vi.resetModules()
  const transcribe = vi.fn(async () => ({ transcription: ['今日はいい天気ですね'] }))
  vi.doMock('@kutalia/whisper-node-addon', () => ({ transcribe }))
  const { WhisperLocalEngine } = await import('./WhisperLocalEngine')
  const engine = new WhisperLocalEngine()
  await engine.initialize()
  const result = await engine.processAudio(new Float32Array(16000), 16000)
  expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ translate: false, language: 'auto' }))
  expect(result?.language).toBe('ja')
})

it.each([['ja', '東京'], ['fr', 'Bonjour tout le monde']])('honors selected %s for decoding and result language', async (language, text) => {
  vi.resetModules()
  const transcribe = vi.fn(async () => ({ transcription: [text] }))
  vi.doMock('@kutalia/whisper-node-addon', () => ({ transcribe }))
  const { WhisperLocalEngine } = await import('./WhisperLocalEngine')
  const engine = new WhisperLocalEngine()
  await engine.initialize()
  engine.setLanguage(language as 'ja' | 'fr')
  const result = await engine.processAudio(new Float32Array(16000), 16000)
  expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ language, translate: false }))
  expect(result?.language).toBe(language)
  engine.setLanguage('auto')
  await engine.processAudio(new Float32Array(16000), 16000)
  expect(transcribe).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'auto' }))
})
