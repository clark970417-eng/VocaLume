/** Real-model regression probe. Authored text only; never posts or changes preferences. */
import {app} from 'electron'
import {readFileSync,writeFileSync} from 'fs'
import {resolve} from 'path'
import {HunyuanMT15Translator} from '../src/engines/translator/HunyuanMT15Translator'
import type {Language} from '../src/engines/types'
const {COMPARE_PROFILE,COMPARE_REPORT,COMPARE_LABEL}=process.env
if(!COMPARE_PROFILE||!COMPARE_REPORT||!COMPARE_LABEL)throw Error('Set isolated profile, report and label')
app.setPath('userData',COMPARE_PROFILE)
const corpus=JSON.parse(readFileSync(resolve('../extension/tests/fixtures/names-language-4.5.6.json'),'utf8'))
app.whenReady().then(async()=>{
 const engine=new HunyuanMT15Translator(),results:unknown[]=[]
 try {
  await engine.initialize()
  for(const row of corpus.cases){
   const start=performance.now()
   try {
    const translated=await engine.translate(row.text,row.from as Language,row.to as Language)
    const result={...row,translated,ms:Math.round(performance.now()-start),pass:!!translated&&(!row.unchanged||translated===row.text)&&(row.names||[]).every((name:string)=>translated.includes(name))&&(row.must||[]).every((pattern:string)=>new RegExp(pattern,'u').test(translated))}
    results.push(result);console.log(JSON.stringify(result))
   } catch(error){results.push({...row,error:String(error),pass:false})}
  }
 } finally {
  await engine.dispose()
  writeFileSync(COMPARE_REPORT,JSON.stringify({label:COMPARE_LABEL,provenance:corpus.provenance,results},null,2))
  app.quit()
 }
})
