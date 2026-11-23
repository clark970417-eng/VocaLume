import {SenseVoiceSherpaEngine} from '../engines/stt/SenseVoiceSherpaEngine'
import {lowerInferencePriority} from '../engines/inference-resources'
import type { SourceLanguage, SpeechEvidence } from '../engines/types'
let engine:SenseVoiceSherpaEngine | undefined
let queue:Promise<void> = Promise.resolve()
lowerInferencePriority()
process.parentPort!.on('message',(event:{data:{type:string;id:number;modelsRoot?:string;sourceLanguage?:SourceLanguage;options?:{samples:Float32Array;sampleRate:number;evidence?:SpeechEvidence}}})=>{
 const message=event.data
 queue=queue.then(async()=>{
  try {
   if(message.type==='init') {
    if(!message.modelsRoot)throw new Error('Missing SenseVoice model directory')
    engine=new SenseVoiceSherpaEngine({inWorker:true,modelsRoot:message.modelsRoot,sourceLanguage:message.sourceLanguage,onProgress:message=>process.parentPort!.postMessage({type:'progress',message})})
    await engine.initialize();process.parentPort!.postMessage({type:'ready'})
   } else if(message.type==='transcribe'&&message.options) {
    if(!engine)throw new Error('SenseVoice is not initialized')
    const result=await engine.processAudio(message.options.samples,message.options.sampleRate,message.options.evidence)
    process.parentPort!.postMessage({type:'result',id:message.id,result})
   }
  }catch(error){process.parentPort!.postMessage({type:message.type==='init'?'fatal':'error',id:message.id,message:String(error)})}
 })
})
