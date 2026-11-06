import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WhisperLocalEngine } from '../../src/engines/stt/WhisperLocalEngine'
import { HaasJaEngine } from '../../src/engines/stt/HaasJaEngine'
import { SenseVoiceSherpaEngine } from '../../src/engines/stt/SenseVoiceSherpaEngine'
import type { STTEngine } from '../../src/engines/types'

const assets=process.env.VOCALUME_BENCH_ASSETS!
const corpusRoot=process.env.VOCALUME_ASR_CORPUS!
app.setPath('userData',assets)
const normalize=(s:string):string=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')
function distance(a:string,b:string):number {
  const x=Array.from(a),y=Array.from(b);let row=y.map((_,i)=>i+1);row.unshift(0)
  for(let i=0;i<x.length;i++) {const next=[i+1];for(let j=0;j<y.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(x[i]!==y[j])));row=next}
  return row[y.length]
}
app.whenReady().then(async()=>{
 const corpus=JSON.parse(readFileSync(join(corpusRoot,'corpus.json'),'utf8'))
 const variants:Array<[string,()=>STTEngine]>=[
  ['whisper-base',()=>new WhisperLocalEngine({modelVariant:'base'})],
  ['kotoba-v2-q5',()=>new WhisperLocalEngine({modelVariant:'kotoba-v2.0'})],
  ['haas-q8-fast',()=>new HaasJaEngine(false)],
  ['haas-q8-hints',()=>new HaasJaEngine(true)],
  ['haas-q8-cpu',()=>new HaasJaEngine(false,'cpu')],
  ['sensevoice-int8',()=>new SenseVoiceSherpaEngine()]
 ]
 const reports:any[]=[]
 for(const [name,create] of variants) {
  const selected=process.env.VOCALUME_COMPARE_VARIANTS?.split(',')
  if(selected&&!selected.includes(name))continue
  let last=performance.now();let gaps:number[]=[]
  const beat=setInterval(()=>{const now=performance.now();gaps.push(now-last);last=now},20)
  const engine=create();engine.setLanguage?.('ja')
  const start=performance.now();await engine.initialize();const initMs=performance.now()-start
  await new Promise(resolve=>setTimeout(resolve,25))
  const initMaxGapMs=Math.max(...gaps);gaps=[]
  const rows=[]
  try {
   // Separate first-call warmup from measured clips; every model sees the same audio.
   const warm=corpus.rows[0],warmBytes=Uint8Array.from(readFileSync(join(corpusRoot,'corpus',warm.id+'.f32')))
   const warmStart=performance.now();await engine.processAudio(new Float32Array(warmBytes.buffer),warm.sampleRate)
   const firstCallMs=performance.now()-warmStart
   for(const clip of corpus.rows) {
    const bytes=Uint8Array.from(readFileSync(join(corpusRoot,'corpus',clip.id+'.f32')))
    const t=performance.now();let text='',error:string|undefined
    try {text=(await engine.processAudio(new Float32Array(bytes.buffer),clip.sampleRate))?.text||''}catch(e){error=String(e)}
    const ref=normalize(clip.reference),hyp=normalize(text)
    rows.push({id:clip.id,seconds:clip.seconds,reference:clip.reference,text,ms:performance.now()-t,edits:distance(ref,hyp),characters:Array.from(ref).length,error})
   }
   const sorted=rows.map(r=>r.ms).sort((a,b)=>a-b)
   await new Promise(resolve=>setTimeout(resolve,25))
   const report={name,initMs,initMaxGapMs,inferenceMaxGapMs:Math.max(...gaps),firstCallMs,clips:rows.length,cer:rows.reduce((s,r)=>s+r.edits,0)/rows.reduce((s,r)=>s+r.characters,0),medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor(sorted.length*.95)],audioSeconds:rows.reduce((s,r)=>s+r.seconds,0),inferenceMs:rows.reduce((s,r)=>s+r.ms,0),empty:rows.filter(r=>!r.text).length,errors:rows.filter(r=>r.error).length,rows}
   reports.push(report);console.log('ASR_SUMMARY '+JSON.stringify({...report,rows:undefined}))
   const filename=process.env.VOCALUME_COMPARE_OUTPUT==='isolated'?'comparison-isolated.json':'comparison.json'
   writeFileSync(join(corpusRoot,filename),JSON.stringify({dataset:corpus.dataset,config:corpus.config,split:corpus.split,seed:corpus.seed,normalization:'NFKC; lowercase; letters and numbers only; micro CER',reports},null,2)+'\n')
  } finally {clearInterval(beat);await engine.dispose()}
 }
 app.exit(0)
}).catch(e=>{console.error(e);app.exit(1)})
