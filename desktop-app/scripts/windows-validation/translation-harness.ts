import { app, utilityProcess } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { WhisperLocalEngine } from '../../src/engines/stt/WhisperLocalEngine'

const assets = process.env.VOCALUME_BENCH_ASSETS!
app.setPath('userData', assets)
app.whenReady().then(async () => {
  const start = performance.now()
  const worker = utilityProcess.fork(join(__dirname, 'slm-worker.js'), [], { stdio: 'pipe' })
  worker.stdout?.on('data', value => process.stdout.write(value))
  worker.stderr?.on('data', value => process.stderr.write(value))
  const timer = setTimeout(() => { worker.kill(); app.exit(1) }, 120000)
  worker.on('message', async (message: { type: string; text?: string; message?: string }) => {
    if (message.type === 'error') { console.error(message.message); clearTimeout(timer); worker.kill(); app.exit(1); return }
    if (message.type === 'ready') {
      const readyMs = Math.round(performance.now() - start)
      const bytes = readFileSync(join(assets, 'jfk.f32'))
      const pcm = Uint8Array.from(bytes)
      const engine = new WhisperLocalEngine({ modelVariant: 'base' })
      engine.setLanguage('en')
      await engine.initialize()
      const rows = []
      for (const [index, language] of (['en', 'auto', 'en', 'auto', 'en'] as const).entries()) {
        engine.setLanguage(language)
        const sttStart = performance.now()
        const result = await engine.processAudio(new Float32Array(pcm.buffer.slice(0)), 16000)
        if (!result) throw new Error('No recognition result')
        const sttMs = Math.round(performance.now() - sttStart)
        const translationStart = performance.now()
        const translated = await new Promise<string>((resolve) => {
          const onResult = (reply: {type: string; id?: string; text?: string}) => {
            if (reply.type !== 'result' || reply.id !== 'demo-' + index) return
            worker.off('message', onResult)
            resolve(reply.text ?? '')
          }
          worker.on('message', onResult)
          worker.postMessage({type: 'translate', id: 'demo-' + index, text: result.text, from: 'en', to: 'zh'})
        })
        const output = { round: index, language, sttMs, translationMs: Math.round(performance.now() - translationStart), source: result.text, translated }
        rows.push(output)
        writeFileSync(join(assets, 'translation-demo-result.json'), JSON.stringify({audioSeconds: 11, modelReadyMs: readyMs, rows}, null, 2))
        console.log('DEMO_RESULT ' + JSON.stringify(output))
      }
      clearTimeout(timer); worker.kill(); app.exit(0)
    }
  })
  worker.postMessage({type:'init',modelPath:join(assets,'HY-MT1.5-1.8B-Q4_K_M.gguf'),modelType:'hunyuan-mt-15',kvCacheQuant:true})
}).catch(error => { console.error(error); app.exit(1) })
