import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { endianness, homedir } from 'node:os'
import { join } from 'node:path'
import type { SpeechEvidence, STTEngine, STTResult } from '../types'
import { isImplausibleTranscript, isUnspokenOutro } from './transcript-guard'
import { lowerInferencePriority, macInferenceThreads, windowsInferenceThreads } from '../inference-resources'
import { createLogger } from '../../main/logger'
const log = createLogger('haas-ja')
const LITTLE_ENDIAN = endianness() === 'LE'

export function haasPaths() {
  if (process.platform === 'darwin' && process.arch === 'arm64' && process.resourcesPath) {
    const directory = join(process.resourcesPath, 'haas-ja')
    const binary = join(directory, 'speech')
    const model = join(directory, 'haas-q8.gguf')
    if (existsSync(binary) && existsSync(model)) return { directory, binary, model }
  }
  const windows=process.platform==='win32'
  const root=windows ? process.env.LOCALAPPDATA || join(homedir(),'AppData','Local') : join(homedir(),'Library','Application Support')
  const directory=join(root,'VocaLume','haas-ja')
  return {directory,binary:join(directory,windows?'speech.exe':'speech'),model:join(directory,'haas-q8.gguf')}
}
export async function isHaasAvailable(): Promise<boolean> {
  const paths=haasPaths()
  try {await Promise.all([access(paths.binary),access(paths.model)]);return true}catch{return false}
}

const phrases = [
  '鹿乃まほろさんの配信=狩野真穂さんの配信,鹿野真穂さんの配信,カノマホロサンノハイシン',
  'ポケカ=ポケカ'
]

function wav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const header = Buffer.from(bytes.buffer)
  header.write('RIFF')
  header.writeUInt32LE(bytes.length - 8, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(samples.length * 2, 40)
  const pcm = LITTLE_ENDIAN ? new Int16Array(bytes.buffer, 44) : undefined
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]!))
    const sample = Math.round(value * (value < 0 ? 32768 : 32767))
    if (pcm) pcm[i] = sample
    else header.writeInt16LE(sample, 44 + i * 2)
  }
  return bytes
}

export class HaasJaEngine implements STTEngine {
  readonly isOffline = true
  readonly name = 'Haas-ja Q8_0'
  readonly id: string
  private process?: ChildProcess
  private endpoint?: string
  private initPromise?: Promise<void>
  private cancelStartup?: () => void
  private generation = 0
  private requests = new Set<AbortController>()

  constructor(private readonly usePhrases: boolean, private readonly device?: 'auto' | 'cpu' | 'gpu') {
    this.id = usePhrases ? 'haas-ja-recommended' : 'haas-ja-fast'
  }

  async initialize(): Promise<void> {
    if (this.endpoint) return
    if (!this.initPromise) this.initPromise=this.start().catch(error=>{this.initPromise=undefined;throw error})
    return this.initPromise
  }

  private async start(): Promise<void> {
    const generation=this.generation
    const {directory,binary,model}=haasPaths()
    await Promise.all([access(binary),access(model)]).catch(()=>{
      throw new Error(`Haas-ja requires the speech.cpp runtime and haas-q8.gguf in ${directory}.`)
    })
    if(generation!==this.generation)throw new Error('Haas-ja initialization cancelled')
    const windows=process.platform==='win32'
    const args=['serve',model,'--host','127.0.0.1','--port','0','--device',this.device || (windows?'auto':'gpu')]
    if(windows)args.push('--threads',String(windowsInferenceThreads().whisper))
    else if (process.platform === 'darwin') args.push('--threads', String(macInferenceThreads().speech))
    const child=spawn(binary,args,{windowsHide:true})
    this.process=child
    child.once('spawn',()=>{if(windows&&child.pid)lowerInferencePriority(child.pid)})
    try {
      const endpoint=await new Promise<string>((resolve,reject)=>{
        let output=''
        const timer=setTimeout(()=>reject(new Error('Haas-ja startup timed out.')),60_000)
        this.cancelStartup=()=>{clearTimeout(timer);reject(new Error('Haas-ja initialization cancelled'))}
        const read=(chunk:Buffer):void=>{
          output=(output+chunk.toString()).slice(-4096)
          const url=output.match(/Ready at (http:\/\/127\.0\.0\.1:\d+)\//)?.[1]
          if(url){clearTimeout(timer);resolve(url)}
        }
        child.stdout.on('data',read);child.stderr.on('data',read)
        child.once('error',error=>{clearTimeout(timer);reject(error)})
        child.once('exit',code=>{
          clearTimeout(timer)
          if(this.process===child){this.endpoint=undefined;this.initPromise=undefined}
          reject(new Error(`Haas-ja exited (${code}).`))
        })
      })
      if(this.process!==child||generation!==this.generation)throw new Error('Haas-ja initialization cancelled')
      this.endpoint=endpoint
    } catch(error) {
      if(this.process===child)await this.dispose()
      throw error
    } finally {if(this.process===child)this.cancelStartup=undefined}
  }

  async processAudio(samples: Float32Array, sampleRate: number, evidence?: SpeechEvidence, signal?: AbortSignal): Promise<STTResult | null> {
    if(!this.endpoint || signal?.aborted)return null
    const generation=this.generation,controller=new AbortController()
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    this.requests.add(controller)
    const timeout=setTimeout(()=>controller.abort(),15_000)
    try {
      const form=new FormData()
      form.append('file',new Blob([wav(samples,sampleRate)],{type:'audio/wav'}),'audio.wav')
      if(this.usePhrases){
        for(const phrase of phrases)form.append('keywords[]',phrase)
        form.append('keywords_alpha','2');form.append('keywords_guard','true')
      }
      const response=await fetch(this.endpoint+'/v1/audio/transcriptions',{method:'POST',body:form,signal:requestSignal})
      if(!response.ok)throw new Error(`Haas-ja recognition failed (HTTP ${response.status}).`)
      const result=await response.json() as {text?:string}
      const text=result.text?.trim()
      if(requestSignal.aborted||generation!==this.generation||!text||isImplausibleTranscript(text,samples.length/sampleRate)||isUnspokenOutro(text,evidence))return null
      return {text,language:'ja',isFinal:true,timestamp:Date.now()}
    }catch(error){if(!requestSignal.aborted)log.warn('Recognition failed:',String(error));return null}
    finally{clearTimeout(timeout);this.requests.delete(controller)}
  }

  async dispose(): Promise<void> {
    this.generation++
    this.cancelStartup?.();this.cancelStartup=undefined
    this.initPromise=undefined
    for(const request of this.requests)request.abort()
    this.requests.clear()
    const child = this.process
    this.process = undefined
    this.endpoint = undefined
    child?.kill()
  }
}
