import {EventEmitter} from 'node:events'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({spawn:vi.fn(),access:vi.fn()}))
vi.mock('node:child_process',()=>({spawn:mocks.spawn}))
vi.mock('node:fs/promises',()=>({access:mocks.access}))
vi.mock('../inference-resources',()=>({windowsInferenceThreads:()=>({whisper:4}),lowerInferencePriority:vi.fn()}))
import {HaasJaEngine,isHaasAvailable} from './HaasJaEngine'
let child:any,engine:HaasJaEngine
const platform=process.platform
beforeEach(()=>{
 Object.defineProperty(process,'platform',{value:'win32'})
 mocks.access.mockReset().mockResolvedValue(undefined);mocks.spawn.mockReset()
 child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),kill:vi.fn()})
 mocks.spawn.mockReturnValue(child);engine=new HaasJaEngine(false)
})
afterEach(async()=>{await engine.dispose();vi.unstubAllGlobals();Object.defineProperty(process,'platform',{value:platform})})
async function ready(){const count=mocks.spawn.mock.calls.length;const job=engine.initialize();await vi.waitFor(()=>expect(mocks.spawn).toHaveBeenCalledTimes(count+1));child.stdout.emit('data',Buffer.from('Ready at http://127.0.0.1:34567/\n'));await job}
it('shares initialization and limits the Windows runtime while permitting CPU fallback',async()=>{
 const a=engine.initialize(),b=engine.initialize()
 await vi.waitFor(()=>expect(mocks.spawn).toHaveBeenCalledOnce())
 child.stdout.emit('data',Buffer.from('Ready at http://127.0.0.1:34567/\n'));await Promise.all([a,b])
 expect(mocks.spawn.mock.calls[0][1]).toEqual(expect.arrayContaining(['--device','auto','--threads','4']))
})
it('rejects a stopped startup promptly and permits another initialization',async()=>{
 const a=engine.initialize();const rejected=expect(a).rejects.toThrow('cancelled')
 await vi.waitFor(()=>expect(mocks.spawn).toHaveBeenCalledOnce());await engine.dispose();await rejected
 expect(child.kill).toHaveBeenCalledOnce();await ready()
})
it('returns null for absent/failed inference and does not send unrequested phrase hints',async()=>{
 expect(await engine.processAudio(new Float32Array(16000),16000)).toBeNull()
 await ready()
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({text:'今日は良い天気ですね。'})});vi.stubGlobal('fetch',fetch)
 expect((await engine.processAudio(new Float32Array(16000),16000))?.language).toBe('ja')
 expect(fetch.mock.calls[0][1].body.getAll('keywords[]')).toEqual([])
 fetch.mockResolvedValue({ok:false,status:503})
 expect(await engine.processAudio(new Float32Array(16000),16000)).toBeNull()
})
it('reports missing assets without spawning and recovers after installation',async()=>{
 mocks.access.mockRejectedValue(new Error('missing'))
 expect(await isHaasAvailable()).toBe(false);await expect(engine.initialize()).rejects.toThrow('requires')
 expect(mocks.spawn).not.toHaveBeenCalled();mocks.access.mockResolvedValue(undefined)
 expect(await isHaasAvailable()).toBe(true);await ready()
})
