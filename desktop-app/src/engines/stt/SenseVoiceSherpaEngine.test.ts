import {beforeEach,it,expect,vi} from 'vitest'
const native=vi.hoisted(()=>({createAsync:vi.fn(),decodeAsync:vi.fn(),decode:vi.fn(),getResult:vi.fn(),acceptWaveform:vi.fn(),createStream:vi.fn()}))
const worker = vi.hoisted(() => ({ create: vi.fn(), initialize: vi.fn(), transcribe: vi.fn(), dispose: vi.fn() }))
vi.mock('electron',()=>({app:{getPath:()=>'/test'}}))
vi.mock('fs',()=>({existsSync:()=>true,mkdirSync:vi.fn(),createWriteStream:vi.fn()}))
vi.mock('sherpa-onnx-node',()=>({default:{OfflineRecognizer:{createAsync:native.createAsync}}}))
vi.mock('./whisper-worker-client', () => ({
  WhisperWorkerClient: class {
    constructor(options: unknown) { worker.create(options) }
    initialize = worker.initialize
    transcribe = worker.transcribe
    dispose = worker.dispose
  }
}))
import {SenseVoiceSherpaEngine} from './SenseVoiceSherpaEngine'
beforeEach(()=>{
 vi.clearAllMocks()
 native.createStream.mockReturnValue({acceptWaveform:native.acceptWaveform})
 native.decodeAsync.mockResolvedValue({text:'Hello world',lang:'en'})
 native.getResult.mockReturnValue({text:'Hello world',lang:'<|en|>'})
 native.createAsync.mockResolvedValue({createStream:native.createStream,decodeAsync:native.decodeAsync,decode:native.decode,getResult:native.getResult})
})
it('loads asynchronously and decodes in the isolated worker with a bounded CPU budget',async()=>{
 const engine=new SenseVoiceSherpaEngine({inWorker:true,modelsRoot:"/test/models"});await Promise.all([engine.initialize(),engine.initialize()])
 expect(native.createAsync).toHaveBeenCalledOnce()
 expect(native.createAsync).toHaveBeenCalledWith(expect.objectContaining({modelConfig:expect.objectContaining({numThreads:2,provider:'cpu'})}))
 expect((await engine.processAudio(new Float32Array(16000),16000))?.language).toBe('en')
 expect(native.decode).toHaveBeenCalledOnce();await engine.dispose()
})
it('serializes native decoding and drops queued/in-flight results after stop',async()=>{
 vi.spyOn(process,'platform','get').mockReturnValue('darwin')
 const engine=new SenseVoiceSherpaEngine({modelsRoot:"/test/models"});await engine.initialize()
 let complete!:(r:unknown)=>void
 native.decodeAsync.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve}))
 const first=engine.processAudio(new Float32Array(16000),16000),second=engine.processAudio(new Float32Array(16000),16000)
 await vi.waitFor(()=>expect(native.decodeAsync).toHaveBeenCalledOnce())
 await engine.dispose();complete({text:'Hello',lang:'en'})
 expect(await first).toBeNull();expect(await second).toBeNull();expect(native.decodeAsync).toHaveBeenCalledOnce()
 vi.restoreAllMocks()
})
it('allows retry after a native initialization error',async()=>{
 const engine=new SenseVoiceSherpaEngine({inWorker:true,modelsRoot:"/test/models"});native.createAsync.mockRejectedValueOnce(new Error('native failure'))
 await expect(engine.initialize()).rejects.toThrow('native failure')
 await engine.initialize();expect(native.createAsync).toHaveBeenCalledTimes(2);await engine.dispose()
})

it('loads fixed Japanese in the native decoder and preserves the chosen language across names', async () => {
  const engine = new SenseVoiceSherpaEngine({ inWorker: true, modelsRoot: '/test/models', sourceLanguage: 'ja' })
  await engine.initialize()
  native.getResult.mockReturnValueOnce({ text: '東京都 OpenAI', lang: '<|en|>' })
  expect((await engine.processAudio(new Float32Array(16000), 16000))?.language).toBe('ja')
  expect(native.createAsync).toHaveBeenCalledOnce()
  expect(native.createAsync).toHaveBeenCalledWith(expect.objectContaining({
    modelConfig: expect.objectContaining({ senseVoice: expect.objectContaining({ language: 'ja' }) })
  }))
  engine.setLanguage('auto')
  expect((await engine.processAudio(new Float32Array(16000), 16000))?.language).toBe('en')
  expect(native.createAsync).toHaveBeenLastCalledWith(expect.objectContaining({
    modelConfig: expect.objectContaining({ senseVoice: expect.objectContaining({ language: 'auto' }) })
  }))
  await engine.dispose()
})

it('warms the Windows worker in the selected language and disposes it before switching', async () => {
  const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const engine = new SenseVoiceSherpaEngine({ modelsRoot: '/test/models' })
  try {
    engine.setLanguage('ja')
    await engine.initialize()
    expect(worker.create).toHaveBeenCalledWith(expect.objectContaining({
      initPayload: { modelsRoot: '/test/models', sourceLanguage: 'ja' }
    }))
    engine.setLanguage('ko')
    const audio = new Float32Array(16000)
    await engine.processAudio(audio, 16000, { speechSeconds: 0.5 })
    expect(worker.dispose).toHaveBeenCalledOnce()
    expect(worker.create).toHaveBeenLastCalledWith(expect.objectContaining({
      initPayload: { modelsRoot: '/test/models', sourceLanguage: 'ko' }
    }))
    expect(worker.transcribe).toHaveBeenCalledWith({ samples: audio, sampleRate: 16000, evidence: { speechSeconds: 0.5 } })
  } finally {
    await engine.dispose()
    platform.mockRestore()
  }
})
