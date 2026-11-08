import {EventEmitter} from 'node:events'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({spawn:vi.fn(),access:vi.fn()}))
vi.mock('node:child_process',()=>({spawn:mocks.spawn}))
vi.mock('node:fs/promises',()=>({access:mocks.access}))
vi.mock('../inference-resources',()=>({windowsInferenceThreads:()=>({whisper:4}),macInferenceThreads:()=>({speech:2}),lowerInferencePriority:vi.fn()}))
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
it('keeps Mac GPU recognition and caps its CPU threads', async () => {
 Object.defineProperty(process, 'platform', { value: 'darwin' })
 await ready()
 expect(mocks.spawn.mock.calls[0][1]).toEqual(expect.arrayContaining(['--device', 'gpu', '--threads', '2']))
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
it('keeps the WAV header and clipped PCM samples byte-for-byte equivalent', async () => {
 await ready()
 const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'こんにちは。' }) })
 vi.stubGlobal('fetch', fetch)
 await engine.processAudio(new Float32Array([-2, -1, -.5, -.1, 0, .1, .5, 1, 2, NaN]), 16000)
 const file = (fetch.mock.calls[0][1].body as FormData).get('file') as File
 const wave = Buffer.from(await file.arrayBuffer())
 expect(file.name).toBe('audio.wav')
 expect(wave.subarray(0, 44).toString('hex')).toBe('524946463800000057415645666d74201000000001000100803e0000007d0000020010006461746114000000')
 expect(Array.from({ length: 10 }, (_, i) => wave.readInt16LE(44 + i * 2))).toEqual([
  -32768, -32768, -16384, -3277, 0, 3277, 16384, 32767, 32767, 0
 ])
})
it('cancels only the selected preview request and keeps the engine available', async () => {
 await ready()
 const fetch = vi.fn().mockImplementationOnce((_url, { signal }: { signal: AbortSignal }) =>
  new Promise((_resolve, reject) => {
   signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  .mockResolvedValueOnce({ ok: true, json: async () => ({ text: '今日は良い天気ですね。' }) })
 vi.stubGlobal('fetch', fetch)
 const preview = new AbortController()
 const audio = new Float32Array(16000)
 const pending = engine.processAudio(audio, 16000, undefined, preview.signal)
 preview.abort()
 await expect(pending).resolves.toBeNull()
 await expect(engine.processAudio(audio, 16000, undefined, preview.signal)).resolves.toBeNull()
 await expect(engine.processAudio(audio, 16000)).resolves.toMatchObject({ text: '今日は良い天気ですね。' })
 expect(fetch).toHaveBeenCalledTimes(2)
 expect(mocks.spawn).toHaveBeenCalledOnce()
})
it('reports missing assets without spawning and recovers after installation',async()=>{
 mocks.access.mockRejectedValue(new Error('missing'))
 expect(await isHaasAvailable()).toBe(false);await expect(engine.initialize()).rejects.toThrow('requires')
 expect(mocks.spawn).not.toHaveBeenCalled();mocks.access.mockResolvedValue(undefined)
 expect(await isHaasAvailable()).toBe(true);await ready()
})
