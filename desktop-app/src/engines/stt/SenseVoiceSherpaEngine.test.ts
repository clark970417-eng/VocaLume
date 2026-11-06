import {beforeEach,it,expect,vi} from 'vitest'
const native=vi.hoisted(()=>({createAsync:vi.fn(),decodeAsync:vi.fn(),acceptWaveform:vi.fn(),createStream:vi.fn()}))
vi.mock('electron',()=>({app:{getPath:()=>'/test'}}))
vi.mock('fs',()=>({existsSync:()=>true,mkdirSync:vi.fn(),createWriteStream:vi.fn()}))
vi.mock('sherpa-onnx-node',()=>({default:{OfflineRecognizer:{createAsync:native.createAsync}}}))
import {SenseVoiceSherpaEngine} from './SenseVoiceSherpaEngine'
beforeEach(()=>{
 vi.clearAllMocks()
 native.createStream.mockReturnValue({acceptWaveform:native.acceptWaveform})
 native.decodeAsync.mockResolvedValue({text:'Hello world',lang:'en'})
 native.createAsync.mockResolvedValue({createStream:native.createStream,decodeAsync:native.decodeAsync})
})
it('uses asynchronous model loading and decoding with a bounded CPU budget',async()=>{
 const engine=new SenseVoiceSherpaEngine({inWorker:true,modelsRoot:"/test/models"});await Promise.all([engine.initialize(),engine.initialize()])
 expect(native.createAsync).toHaveBeenCalledOnce()
 expect(native.createAsync).toHaveBeenCalledWith(expect.objectContaining({modelConfig:expect.objectContaining({numThreads:2,provider:'cpu'})}))
 expect((await engine.processAudio(new Float32Array(16000),16000))?.language).toBe('en')
 expect(native.decodeAsync).toHaveBeenCalledOnce();await engine.dispose()
})
it('serializes native decoding and drops queued/in-flight results after stop',async()=>{
 const engine=new SenseVoiceSherpaEngine({inWorker:true,modelsRoot:"/test/models"});await engine.initialize()
 let complete!:(r:unknown)=>void
 native.decodeAsync.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve}))
 const first=engine.processAudio(new Float32Array(16000),16000),second=engine.processAudio(new Float32Array(16000),16000)
 await vi.waitFor(()=>expect(native.decodeAsync).toHaveBeenCalledOnce())
 await engine.dispose();complete({text:'Hello',lang:'en'})
 expect(await first).toBeNull();expect(await second).toBeNull();expect(native.decodeAsync).toHaveBeenCalledOnce()
})
it('allows retry after a native initialization error',async()=>{
 const engine=new SenseVoiceSherpaEngine({inWorker:true,modelsRoot:"/test/models"});native.createAsync.mockRejectedValueOnce(new Error('native failure'))
 await expect(engine.initialize()).rejects.toThrow('native failure')
 await engine.initialize();expect(native.createAsync).toHaveBeenCalledTimes(2);await engine.dispose()
})
