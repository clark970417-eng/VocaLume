/** Fixed input/semantic checks, with real models. Timings exclude capture and UI.
 * Combine with benchmark-captions.ts for paced capture-policy measurements.
 * Pattern checks are regression signals, not a human translation quality score. */
import {app,powerMonitor} from 'electron'
import {readFileSync,writeFileSync} from 'fs'
import {join} from 'path'
import {createHash} from 'crypto'
import {cpus,release,totalmem} from 'os'
import {MlxWhisperEngine} from '../src/engines/stt/MlxWhisperEngine'
import {HunyuanMT15Translator} from '../src/engines/translator/HunyuanMT15Translator'
import {TranslationPipeline} from '../src/pipeline/TranslationPipeline'
import type {Language,STTEngine} from '../src/engines/types'
const {COMPARE_PROFILE,COMPARE_REPORT,COMPARE_LABEL,CORPUS_AUDIO_DIR}=process.env
if(!COMPARE_PROFILE||!COMPARE_REPORT||!COMPARE_LABEL||!CORPUS_AUDIO_DIR)throw Error('Set isolated profile, report, label and corpus directory')
app.setPath('userData',COMPARE_PROFILE)
const fixture=JSON.parse(readFileSync(join(CORPUS_AUDIO_DIR,'manifest.json'),'utf8'))
const normalize=(text:string)=>[...text.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'')]
function distance(a:string[],b:string[]):number{
 let row=Array.from({length:b.length+1},(_,i)=>i)
 for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]!+1,row[j+1]!+1,row[j]!+(a[i]===b[j]?0:1)));row=next}return row[b.length]!
}
function pcm(file:string):Float32Array{
 const b=readFileSync(file)
 if(b.readUInt16LE(22)!==1||b.readUInt32LE(24)!==16000||b.readUInt16LE(34)!==16)throw Error('Mono PCM16 16kHz required')
 for(let p=12;p+8<=b.length;){const n=b.readUInt32LE(p+4);if(b.toString('ascii',p,p+4)==='data')return Float32Array.from({length:n/2},(_,i)=>b.readInt16LE(p+8+2*i)/32768);p+=8+n+n%2}throw Error('WAV missing data')
}
function checks(row:any,translated:string){return {meaningChecksPassed:!!translated&&(row.must||[]).every((s:string)=>new RegExp(s,'u').test(translated))&&(row.mustNot||[]).every((s:string)=>!new RegExp(s,'u').test(translated))}}
app.whenReady().then(async()=>{
 app.dock?.hide()
 const report:any={label:COMPARE_LABEL,fixtureHash:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),corpusHash:fixture.corpusSha256,scope:fixture.provenance,
  system:{platform:process.platform,arch:process.arch,os:release(),cpu:cpus()[0]?.model,memoryBytes:totalmem(),electron:process.versions.electron},
  engines:{asr:'mlx-community/whisper-large-v3-turbo',translator:'HY-MT1.5-1.8B Q4_K_M'},
  cachePolicy:'Audio and text run in separate passes; translator disposed and reinitialized between passes. No source examples are used for warmup.',
  audio:[],text:[],context:[],errors:[],thermal:process.platform==='darwin'?powerMonitor.getCurrentThermalState():'unknown'}
 const stt=new MlxWhisperEngine({language:'ja'}),translator=new HunyuanMT15Translator(),pipeline=new TranslationPipeline()
 let scripted=''
 const checkpoint=()=>writeFileSync(COMPARE_REPORT,JSON.stringify(report,null,2))
 const scriptSTT:STTEngine={id:'scripted',name:'Frozen source text',isOffline:true,initialize:async()=>{},dispose:async()=>{},processAudio:async()=>({text:scripted,language:'ja',isFinal:true,timestamp:Date.now()})}
 try{
  if(!Array.isArray(fixture.audio)||!fixture.audio.length)throw Error('Empty audio corpus')
  for(const row of fixture.audio){
   if(!/^[a-z0-9-]+$/.test(row.id))throw Error('Invalid case ID')
   const bytes=readFileSync(join(CORPUS_AUDIO_DIR,row.id+'.wav'))
   if(!row.sha256||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Audio hash mismatch: '+row.id)
  }
  await stt.initialize();await translator.initialize()
  await translator.translate('準備ができました。','ja','zh')
  for(const row of fixture.audio){
   try{
   const audio=pcm(join(CORPUS_AUDIO_DIR,row.id+'.wav'));stt.setLanguage(row.from)
   const start=performance.now(),result=await stt.processAudio(audio,16000),recognized=result?.text||'',asrMs=performance.now()-start
   const t=performance.now(),translated=recognized?await translator.translate(recognized,row.from,row.to):''
   const record={id:row.id,from:row.from,to:row.to,reference:row.text,recognized,translated,asrMs,translationMs:performance.now()-t,audioMs:audio.length/16,CER:distance(normalize(row.text),normalize(recognized))/Math.max(1,normalize(row.text).length),...checks(row,translated)}
   report.audio.push(record);console.log('QUALITY '+JSON.stringify(record))
   }catch(error){report.errors.push('audio:'+row.id+':'+String(error));report.audio.push({id:row.id,from:row.from,to:row.to,translated:'',error:String(error)})}
   checkpoint()
  }
  // A just-translated ASR hypothesis may exactly equal the reference. Running
  // text translation immediately afterward would report a cache hit as model speed.
  await translator.dispose();await translator.initialize()
  await translator.translate('準備ができました。','ja','zh')
  for(const row of fixture.audio){
   try{
   const textAt=performance.now(),textTranslation=await translator.translate(row.text,row.from,row.to)
   report.text.push({id:row.id,source:row.text,translated:textTranslation,ms:performance.now()-textAt,...checks(row,textTranslation)})
   }catch(error){report.errors.push('text:'+row.id+':'+String(error));report.text.push({id:row.id,source:row.text,translated:'',error:String(error)})}
   checkpoint()
  }
  pipeline.registerSTT('scripted',()=>scriptSTT);pipeline.registerTranslator('hunyuan-mt-15',()=>translator)
  pipeline.on('error',e=>report.errors.push(String(e)))
  await pipeline.switchEngine({mode:'cascade',sttEngineId:'scripted',translatorEngineId:'hunyuan-mt-15'});pipeline.setLanguageConfig('ja','zh');pipeline.start()
  for(const row of fixture.context){
   try{
   // stop() disposes engines asynchronously; reinitialize before the next pair.
   await pipeline.stop();await pipeline.switchEngine({mode:'cascade',sttEngineId:'scripted',translatorEngineId:'hunyuan-mt-15'});pipeline.start();scripted=row.previous
   const a=new Float32Array(16000)
   await pipeline.finalizeStreaming(a,16000,{segment:row.id+':previous',speechSeconds:1,speechEndSample:16000,captureStartSample:0,captureEndSample:16000,continuationExpected:row.cut===true})
   scripted=row.text;const at=performance.now()
   const result=await pipeline.finalizeStreaming(a,16000,{segment:row.id+':current',speechSeconds:1,speechEndSample:16000,captureStartSample:16000,captureEndSample:32000})
   const translated=result?.translatedText||''
   report.context.push({...row,source:result?.sourceText,translated,ms:performance.now()-at,...checks(row,translated)})
   }catch(error){report.errors.push('context:'+row.id+':'+String(error));report.context.push({...row,translated:'',error:String(error)})}
   checkpoint()
  }
 }catch(error){report.errors.push(String(error));process.exitCode=1}
 finally{await pipeline.dispose();await stt.dispose();await translator.dispose();checkpoint();console.log('QUALITY_REPORT '+COMPARE_REPORT);app.exit(report.errors.length?1:0)}
})
