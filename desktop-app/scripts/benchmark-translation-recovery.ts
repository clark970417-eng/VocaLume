/** Authored text through the production chunker, policy and local model.
 * No browser IPC, audio capture, live-site content or preference mutation. */
import {app} from 'electron'
import {readFileSync,writeFileSync} from 'fs'
import {resolve} from 'path'
import {HunyuanMT15Translator} from '../src/engines/translator/HunyuanMT15Translator'
import type {Language} from '../src/engines/types'
// The shared extension policy is bundled for this isolated probe.
import {phraseTranslation,splitTranslationText,validateTranslation} from '../../translation-policy.mjs'
const {COMPARE_PROFILE,COMPARE_REPORT,COMPARE_LABEL,COMPARE_CORPUS}=process.env
if(!COMPARE_PROFILE||!COMPARE_REPORT||!COMPARE_LABEL)throw Error('Set isolated profile, report and label')
app.setPath('userData',COMPARE_PROFILE)
const corpus=JSON.parse(readFileSync(resolve(COMPARE_CORPUS||'../tests/fixtures/translation-recovery-4.5.7.json'),'utf8'))
app.whenReady().then(async()=>{
 const engine=new HunyuanMT15Translator(),results:unknown[]=[]
 try {
  await engine.initialize()
  for(const row of corpus.cases){
   const start=performance.now();let modelCalls=0
   const rawChunks:string[]=[]
   try {
    const translated:string[]=[]
    for(const part of splitTranslationText(row.text)){
     const direction=`${row.from}-${row.to}`, phrase=phraseTranslation(part,direction)
     if(phrase){translated.push(phrase);continue}
     modelCalls++
     const raw=await engine.translate(part,row.from as Language,row.to as Language)
     rawChunks.push(raw)
     translated.push(validateTranslation(raw,direction,part))
    }
    const text=translated.join('')
    results.push({...row,translated:text,ms:Math.round(performance.now()-start),modelCalls,pass:!!text&&(!row.unchanged||text===row.text)&&(row.literal||[]).every((literal:string)=>text.includes(literal))&&(row.must||[]).every((pattern:string)=>new RegExp(pattern,'u').test(text))})
   } catch(error){results.push({...row,error:String(error),rawChunks,ms:Math.round(performance.now()-start),modelCalls,pass:false})}
  }
 } finally {
  await engine.dispose()
  writeFileSync(COMPARE_REPORT,JSON.stringify({label:COMPARE_LABEL,provenance:corpus.provenance,results},null,2))
  app.quit()
 }
})
