/** Authored text-only A/B probe. Bundle against baseline/candidate engine sources.
 * Uses an isolated userData profile and existing models; no browser or capture. */
import {app} from 'electron'
import {appendFileSync,writeFileSync} from 'fs'
import {HunyuanMT15Translator} from '../src/engines/translator/HunyuanMT15Translator'
import type {Language} from '../src/engines/types'
const {COMPARE_PROFILE,COMPARE_REPORT,COMPARE_LABEL}=process.env
if(!COMPARE_PROFILE||!COMPARE_REPORT||!COMPARE_LABEL)throw new Error('Set isolated profile, report and label')
app.setPath('userData',COMPARE_PROFILE)
const cases:Array<[Language,Language,string]>=[
 ['ja','zh','今日はもう遊べませんが、昨日は最後まで遊べました。'],
 ['ja','zh','右じゃなくて、左の扉を開けてください。'],
 ['ja','zh','あと三回と言いましたが、今日はもう一回だけにします。'],
 ['ja','zh','明日も来られるかはまだ分かりません。待たなくて大丈夫です。'],
 ['zh','ja','今天沒辦法看到最後，明天再來看！'],
 ['zh','ja','我昨天沒能來，今天終於趕上了！'],
 ['zh','ja','不是右邊，是左邊喔。'],
 ['zh','ja','不好意思，我還不太懂日文，請問明天幾點開始呢？']
]
const concurrent:Array<[Language,Language,string]>=[
 ['ja','zh','昨日じゃなくて、来週の金曜日に変更になりました。'],
 ['ja','zh','左から二番目の箱を開けてください。'],
 ['zh','ja','我明天晚上還會來看，今天先去睡了。'],
 ['zh','ja','今天辛苦了，請好好休息。']
]
app.whenReady().then(async()=>{
 const engine=new HunyuanMT15Translator()
 const record=(r:object)=>{appendFileSync(COMPARE_REPORT,JSON.stringify(r)+'\n');console.log(JSON.stringify(r))}
 writeFileSync(COMPARE_REPORT,JSON.stringify({type:'metadata',label:COMPARE_LABEL,model:'HY-MT1.5-1.8B-Q4_K_M',date:new Date().toISOString(),scope:'Authored text-only local inference, no audio, repeated inputs intentional'})+'\n')
 try{
  const start=performance.now();await engine.initialize();record({type:'init',ms:performance.now()-start})
  for(const [from,to,text] of cases)for(const kind of ['unique','repeat']){
   const began=performance.now(),translated=await engine.translate(text,from,to,{previousSegments:[]})
   if(!translated.trim())throw new Error('Empty translation')
   record({type:'result',kind,from,to,text,translated,ms:performance.now()-began})
  }
  for(const [from,to,text] of concurrent){
   const began=performance.now(),translated=await Promise.all([engine.translate(text,from,to,{previousSegments:[]}),engine.translate(text,from,to,{previousSegments:[]})])
   if(translated.some(t=>!t.trim()))throw new Error('Empty shared translation')
   record({type:'result',kind:'concurrent-pair',from,to,text,translated,ms:performance.now()-began})
  }
 }catch(error){record({type:'error',error:String(error)});process.exitCode=1}
 finally{await engine.dispose();app.quit()}
})
