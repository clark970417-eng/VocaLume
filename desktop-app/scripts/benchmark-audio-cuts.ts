/** Diagnostic forced cuts of the frozen synthetic corpus. These are not natural
 * VAD boundaries or a streaming latency score; inspect both cue meanings. */
import {app} from 'electron'
import {readFileSync,writeFileSync} from 'fs'
import {join} from 'path'
import {TranslationPipeline} from '../src/pipeline/TranslationPipeline'
import {MlxWhisperEngine} from '../src/engines/stt/MlxWhisperEngine'
import {HunyuanMT15Translator} from '../src/engines/translator/HunyuanMT15Translator'
const {COMPARE_PROFILE,COMPARE_REPORT,CORPUS_AUDIO_DIR}=process.env
if(!COMPARE_PROFILE||!COMPARE_REPORT||!CORPUS_AUDIO_DIR)throw Error('Set profile, report and corpus directory')
app.setPath('userData',COMPARE_PROFILE)
app.whenReady().then(async()=>{
 const pipeline=new TranslationPipeline(),rows:any[]=[],errors:string[]=[]
 const stt=new MlxWhisperEngine({language:'ja'}),mt=new HunyuanMT15Translator()
 pipeline.registerSTT('mlx-whisper',()=>stt);pipeline.registerTranslator('hunyuan-mt-15',()=>mt)
 pipeline.on('error',error=>errors.push(String(error)))
 const manifest=JSON.parse(readFileSync(join(CORPUS_AUDIO_DIR,'manifest.json'),'utf8'))
 try{
  await pipeline.switchEngine({mode:'cascade',sttEngineId:'mlx-whisper',translatorEngineId:'hunyuan-mt-15'});pipeline.start()
  const holdout = process.env.COMPARE_CUT_HOLDOUT === '1'
  for(const row of manifest.audio.filter((r:any)=>!r.id.endsWith('incomplete') && (/past|future|not-yet|number/.test(r.id) !== holdout))){
   const wav=readFileSync(join(CORPUS_AUDIO_DIR,row.id+'.wav'));let p=12
   while(wav.toString('ascii',p,p+4)!=='data')p+=8+wav.readUInt32LE(p+4)+wav.readUInt32LE(p+4)%2
   const audio=Float32Array.from({length:wav.readUInt32LE(p+4)/2},(_,i)=>wav.readInt16LE(p+8+i*2)/32768)
   for(const fraction of [.55,.75]){
    pipeline.setGlossary([]);pipeline.setLanguageConfig(row.from,row.to)
    const cut=Math.round(audio.length*fraction),parts=[]
    for(const [i,start,end]of [[0,0,cut],[1,cut,audio.length]]){
     const at=performance.now(),result=await pipeline.finalizeStreaming(audio.slice(start,end),16000,
      {segment:row.id+':'+fraction+':'+i,speechSeconds:(end-start)/16000,speechEndSample:end-start,captureStartSample:start,captureEndSample:end,continuationExpected:i===0})
     parts.push({source:result?.sourceText,translated:result?.translatedText,ms:performance.now()-at})
    }
    rows.push({id:row.id,reference:row.text,fraction,parts})
   }
  }
 }catch(error){errors.push(String(error));process.exitCode=1}
 finally{await pipeline.dispose();writeFileSync(COMPARE_REPORT,JSON.stringify({scope:'Synthetic forced-cut diagnostic; manual semantic review required',rows,errors},null,2));app.quit()}
})
