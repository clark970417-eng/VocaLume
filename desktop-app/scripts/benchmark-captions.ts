/** Local, paced caption probe: real Silero/ASR/translation, no browser permissions
 * or remote services. Use an isolated profile with existing model files. */
import {app,powerMonitor} from 'electron'
import {readFileSync,writeFileSync} from 'fs'
import {join} from 'path'
import * as ort from 'onnxruntime-node'
import {SpeechWindows,SpeechGain,Resampler,DecodeQueue} from '../../streaming.mjs'
import {PreviewBudget} from '../../preview-budget.mjs'
import {TranslationPipeline} from '../src/pipeline/TranslationPipeline'
import {MlxWhisperEngine} from '../src/engines/stt/MlxWhisperEngine'
import {HunyuanMT15Translator} from '../src/engines/translator/HunyuanMT15Translator'
import {performanceState,updatePerformanceState} from '../src/main/performance-state'
const {COMPARE_PROFILE,COMPARE_AUDIO,COMPARE_REPORT,COMPARE_LABEL}=process.env
if(!COMPARE_PROFILE||!COMPARE_AUDIO||!COMPARE_REPORT||!COMPARE_LABEL)throw Error('Set isolated profile, audio, report and label')
app.setPath('userData',COMPARE_PROFILE)
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,Math.max(0,ms)))

app.whenReady().then(async()=>{
 const fixedCues=process.env.COMPARE_FIXED_CUES==='1'
 const report:any={label:COMPARE_LABEL,rounds:Number(process.env.COMPARE_ROUNDS||4),source:COMPARE_AUDIO,fixedCues,events:[],completed:[],metrics:[]}
 const pipeline=new TranslationPipeline(), stt=new MlxWhisperEngine({language:'ja'}), translator=new HunyuanMT15Translator({kvCacheQuant:true})
 let asrCalls=0,asrMs=0,translationCalls=0,translationMs=0
 const recognize=stt.processAudio.bind(stt);stt.processAudio=async(...args)=>{const start=performance.now();asrCalls++;try{return await recognize(...args)}finally{asrMs+=performance.now()-start}}
 const translate=translator.translate.bind(translator);translator.translate=async(...args)=>{const start=performance.now();translationCalls++;try{return await translate(...args)}finally{translationMs+=performance.now()-start}}
 pipeline.registerSTT('mlx-whisper',()=>stt);pipeline.registerTranslator('hunyuan-mt-15',()=>translator)
 pipeline.on('error',error=>report.events.push({error:String(error)}))
 if(process.platform==='darwin')updatePerformanceState({thermalState:powerMonitor.getCurrentThermalState()})
 powerMonitor.on('thermal-state-change',details=>updatePerformanceState({thermalState:details.state}))
 powerMonitor.on('speed-limit-change',details=>updatePerformanceState({speedLimit:details.limit}))
 const began=performance.now()
 try{
  const wav=readFileSync(COMPARE_AUDIO), rate=wav.readUInt32LE(24)
  let offset=12
  while(wav.toString('ascii',offset,offset+4)!=='data')offset+=8+wav.readUInt32LE(offset+4)+(wav.readUInt32LE(offset+4)%2)
  const count=wav.readUInt32LE(offset+4)/2
  const pcm=Float32Array.from({length:count},(_,i)=>wav.readInt16LE(offset+8+i*2)/32768)
  const resampled=new Resampler(rate).push(pcm),audio=new Float32Array(resampled.length+40000);audio.set(resampled)
  const vad=await ort.InferenceSession.create(join(process.cwd(),'../vendor/silero/silero_vad_v5.onnx'))
  const gain=new SpeechGain(),frames:Array<{audio:Float32Array;probability:number}>=[]
  let context=new Float32Array(64),state=new ort.Tensor('float32',new Float32Array(256),[2,1,128])
  const sr=new ort.Tensor('int64',BigInt64Array.from([16000n]),[])
  for(let i=0;i<audio.length;i+=512){
   const raw=new Float32Array(512);raw.set(audio.subarray(i,i+512));const frame=gain.push(raw)
   const data=new Float32Array(576);data.set(context);data.set(frame,64);context=frame.slice(-64)
   const input=new ort.Tensor('float32',data,[1,576]),out=await vad.run({input,state,sr})
   input.dispose();state.dispose();state=out.stateN
   frames.push({audio:frame,probability:Number(out.output.data[0])});out.output.dispose()
  }
  state.dispose();sr.dispose();await vad.release()
  await pipeline.switchEngine({mode:'cascade',sttEngineId:'mlx-whisper',translatorEngineId:'hunyuan-mt-15'})
  pipeline.setLanguageConfig('ja','zh');pipeline.setSimulMt(true,2)
  pipeline.setSpeechToneMode(process.env.COMPARE_TONE || 'off');pipeline.start()
  await stt.processAudio(resampled,16000);await translator.translate('準備ができました。','ja','zh')
  asrCalls=asrMs=translationCalls=translationMs=0
  const windows=new SpeechWindows({shortCues:true}),budget=new PreviewBudget(),queue=new DecodeQueue({retainFinals:true,retainInterim:true})
  const finals=new Set<Promise<void>>(),first=new Set<number>();let busy=false, fatal:unknown
  const start=performance.now()
  const record=(event:any)=>{report.events.push({...event,atMs:Math.round(performance.now()-start)})}
  const drain=async()=>{
   if(busy||fatal)return
   const job=queue.shift();if(!job)return
   if(!job.final&&budget.remainingMs(performance.now(),performanceState())>0){void drain();return}
   busy=true;const t=performance.now()
   const evidence={segment:'bench:'+job.id,speechSeconds:job.speechSeconds,speechEndSample:job.lastSpeechSample-job.startSample,captureStartSample:job.startSample,captureEndSample:job.endSample,continuationExpected:job.final&&!job.utteranceEnd}
   try{
    if(job.final&&finals.size>=4)await Promise.race(finals)
    const result=job.final ? (pipeline.canOverlapFinalTranslation
     ? await pipeline.prepareFinalStreaming(job.audio,16000,evidence)
     : await pipeline.finalizeStreaming(job.audio,16000,evidence).then(final=>final?{sourceText:final.sourceText,completion:Promise.resolve(final)}:null))
     : await pipeline.processStreaming(job.audio,16000,evidence)
    const source=result?.sourceText||''
    budget.observeSource?.(source,job.final)
    if(source){
     if(!fixedCues)windows.hint(source,job.utteranceId,job.id,job.sampleCount)
     if(!first.has(job.id)){first.add(job.id);record({type:'first-source',cue:job.id,text:source,latencyMs:performance.now()-start-job.speechStartSample/16})}
    }
    record({type:'decode',cue:job.id,final:job.final,ms:performance.now()-t,audioMs:job.audio.length/16,startSample:job.startSample,endSample:job.endSample,source})
    if(job.final){
     const completion=(async()=>{
      const final=await result?.completion
      report.completed.push({cue:job.id,source:final?.sourceText||'',translated:final?.translatedText||'',
       endToChineseMs:performance.now()-start-job.endSample/16,atMs:performance.now()-start})
      if(!final?.translatedText)record({error:'Missing final translation',cue:job.id})
     })().finally(()=>finals.delete(completion))
     finals.add(completion)
    }
   }catch(error){fatal=error}
   finally{budget.complete(performance.now()-t,performance.now());busy=false;void drain()}
  }
  for(let round=0;round<report.rounds;round++){
   for(let i=0;i<frames.length;i++){
    await sleep((round*frames.length+i+1)*32-(performance.now()-start))
    if(fatal)throw fatal
    const frame=frames[i]!,job=windows.push(frame.audio,frame.probability,fixedCues ? 0.5 : budget.intervalMs(performanceState())/1000)
    if(job){queue.push(job);void drain()}
   }
   report.metrics.push({round:round+1,atMs:performance.now()-start,queued:queue.jobs.length,
    thermal:performanceState(),rss:process.memoryUsage().rss,processes:app.getAppMetrics().map(p=>({type:p.type,kb:p.memory.workingSetSize}))})
   if ((round + 1) % 10 === 0) console.log('CAPTION_PROGRESS '+JSON.stringify({round:round+1,finals:report.completed.length,queued:queue.jobs.length,thermal:performanceState().thermalState}))
  }
  const final=windows.finish();if(final){queue.push(final);void drain()}
  while(busy||queue.jobs.length){if(fatal)throw fatal;await sleep(100)}
  await Promise.all(finals)
  if(fatal)throw fatal
  report.summary={durationMs:performance.now()-start,asrCalls,asrMs,translationCalls,translationMs,finals:report.completed.length,
   failed:report.completed.filter((r:any)=>!r.translated).length}
 }catch(error){report.fatal=String(error);process.exitCode=1}
 finally{
  await pipeline.dispose();report.totalMs=performance.now()-began
  writeFileSync(COMPARE_REPORT,JSON.stringify(report,null,2));console.log('CAPTION_REPORT '+JSON.stringify(report.summary||report.fatal));app.quit()
 }
})
