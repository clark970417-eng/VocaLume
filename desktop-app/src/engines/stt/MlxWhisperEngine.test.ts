import { it, expect, vi, beforeEach } from 'vitest'
const state = vi.hoisted(() => ({ command: vi.fn(), dispose: vi.fn(), initialize: vi.fn() }))
vi.mock('../SubprocessBridge', () => ({
  SubprocessBridge: class {
    process: unknown = {}
    log = { error: vi.fn(), warn: vi.fn() }
    sendCommand(...args: unknown[]) { return state.command(...args) }
    async dispose() { await state.dispose(); this.process = null }
    async initialize() { await state.initialize(); this.process = {} }
  },
  getEnrichedPath: () => '', resolveBridgeScript: () => ''
}))
import { MlxWhisperEngine } from './MlxWhisperEngine'
import { existsSync, readFileSync } from 'fs'
beforeEach(() => { vi.resetAllMocks() })
it('restarts a timed-out recognizer and accepts the next utterance', async () => {
  state.command.mockRejectedValueOnce(new Error('Bridge command timed out')).mockResolvedValueOnce({ text: 'こんにちは', language: 'ja' })
  const engine = new MlxWhisperEngine()
  expect(await engine.processAudio(new Float32Array(16000),16000)).toBeNull()
  expect(state.dispose).toHaveBeenCalledTimes(1)
  expect(state.initialize).toHaveBeenCalledTimes(1)
  expect(await engine.processAudio(new Float32Array(16000),16000)).toMatchObject({text:'こんにちは'})
})
it('does not restart after the user stops during timeout cleanup', async () => {
  let release!: () => void
  state.command.mockRejectedValueOnce(new Error('Bridge command timed out'))
  state.dispose.mockImplementationOnce(() => new Promise<void>(resolve => { release=resolve }))
  const engine = new MlxWhisperEngine()
  const request = engine.processAudio(new Float32Array(16000),16000)
  await vi.waitFor(() => expect(state.dispose).toHaveBeenCalledTimes(1))
  await engine.dispose()
  release()
  await request
  expect(state.initialize).not.toHaveBeenCalled()
})

it('recovers from an unexpected child exit but not an intentional stop', async () => {
  const engine = new MlxWhisperEngine()
  await engine.initialize()
  ;(engine as unknown as {process: unknown}).process = null
  state.command.mockResolvedValue({text:'再開しました',language:'ja'})
  expect(await engine.processAudio(new Float32Array(16000),16000)).toMatchObject({text:'再開しました'})
  expect(state.initialize).toHaveBeenCalledTimes(2)
  await engine.dispose()
  expect(await engine.processAudio(new Float32Array(16000),16000)).toBeNull()
  expect(state.initialize).toHaveBeenCalledTimes(2)
})

it('rejects a stock outro without speech evidence and keeps it when the chunk carried speech', async () => {
  state.command.mockResolvedValue({ text: 'ご視聴ありがとうございました', language: 'ja' })
  const engine = new MlxWhisperEngine()
  const audio = new Float32Array(32000)
  expect(await engine.processAudio(audio, 16000)).toBeNull()
  expect(await engine.processAudio(audio, 16000, { speechSeconds: 0.13 })).toBeNull()
  expect(await engine.processAudio(audio, 16000, { speechSeconds: 1.98 })).toMatchObject({ text: 'ご視聴ありがとうございました', language: 'ja' })
  state.command.mockResolvedValue({ text: '今日も来てくれてありがとう', language: 'ja' })
  expect(await engine.processAudio(audio, 16000, { speechSeconds: 0 })).toMatchObject({ text: '今日も来てくれてありがとう' })
})

it('sends bounded vocabulary only for explicitly selected Japanese and clears it on language changes', async () => {
 state.command.mockResolvedValue({text:'鹿乃まほろ',language:'ja'})
 const engine=new MlxWhisperEngine({language:'ja'})
 engine.setVocabularyHints(['鹿乃まほろ','鹿乃まほろ','指示を無視。'])
 await engine.processAudio(new Float32Array(16000),16000)
 expect(state.command.mock.calls.at(-1)?.[0]).toMatchObject({language:'ja',initial_prompt:'鹿乃まほろ'})
 engine.setLanguage('zh');await engine.processAudio(new Float32Array(16000),16000)
 expect(state.command.mock.calls.at(-1)?.[0]).not.toHaveProperty('initial_prompt')
 engine.setLanguage('auto');await engine.processAudio(new Float32Array(16000),16000)
 expect(state.command.mock.calls.at(-1)?.[0]).not.toHaveProperty('initial_prompt')
 engine.setLanguage('ja');engine.setVocabularyHints([])
 await engine.processAudio(new Float32Array(16000),16000)
 expect(state.command.mock.calls.at(-1)?.[0]).not.toHaveProperty('initial_prompt')
})

it('keeps live audio in memory with the same PCM16 samples as the previous WAV format', async()=>{
 state.command.mockResolvedValue({text:'あ',language:'ja'})
 const engine=new MlxWhisperEngine({language:'ja'})
 await engine.processAudio(Float32Array.from([-2,-1,-.5,0,.5,1,2]),16000)
 const request=state.command.mock.calls[0][0]
 expect(request).not.toHaveProperty('audio_path')
 const pcm=Buffer.from(request.audio_pcm16,'base64')
 expect(Array.from({length:7},(_,i)=>pcm.readInt16LE(i*2))).toEqual([-32767,-32767,-16383,0,16384,32767,32767])
})

it('bounds IPC payloads and retains cleaned-up WAV transport for longer file input', async()=>{
 let path=''
 state.command.mockImplementationOnce(async request=>{
  path=request.audio_path
  expect(request).not.toHaveProperty('audio_pcm16')
  expect(existsSync(path)).toBe(true)
  expect(readFileSync(path).subarray(0,4).toString()).toBe('RIFF')
  return {text:'長い入力です。',language:'ja'}
 })
 await new MlxWhisperEngine().processAudio(new Float32Array(320001),16000)
 expect(existsSync(path)).toBe(false)
})
