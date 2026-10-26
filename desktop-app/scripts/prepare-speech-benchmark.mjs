/** macOS-only reproducible synthetic controls; no microphone or network. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {join,resolve} from 'node:path'
const destination=resolve(process.argv[2]||'.test-out/speech-455');mkdirSync(destination,{recursive:true})
const fixture=JSON.parse(readFileSync('../extension/tests/fixtures/speech-quality-4.5.5.json','utf8'))
const ffmpeg=resolve('node_modules/ffmpeg-static/ffmpeg'),rows=[]
for(const row of fixture.audio){
 const aiff=join(destination,row.id+'.aiff'),wav=join(destination,row.id+'.wav')
 execFileSync('say',['-v',row.from==='ja'?'Kyoko':'Meijia','-r','180','-o',aiff,row.text])
 execFileSync(ffmpeg,['-v','error','-y','-i',aiff,'-ar','16000','-ac','1','-c:a','pcm_s16le',wav])
 rows.push({...row,sha256:createHash('sha256').update(readFileSync(wav)).digest('hex')})
}
writeFileSync(join(destination,'manifest.json'),JSON.stringify({...fixture,audio:rows},null,2))
console.log(JSON.stringify({directory:destination,cases:rows.length,scope:'local synthetic controls'}))
