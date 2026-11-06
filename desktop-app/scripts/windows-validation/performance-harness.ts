import { app, utilityProcess } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { WhisperLocalEngine } from '../../src/engines/stt/WhisperLocalEngine'

// Public/synthetic inputs only. These are quality spot checks, not a scored corpus.
const samples = [
  ['ja', 'zh', '明日の配信は午後八時からです。今日は配信しません。'],
  ['ja', 'zh', '薬を二錠ではなく、一錠だけ飲んでください。'],
  ['ja', 'zh', 'この動画はアーカイブに残さないそうです。'],
  ['ja', 'zh', '敵は右ではなく左にいます。まだ撃たないで。'],
  ['ja', 'zh', '田中さんが佐藤さんに本を貸しました。'],
  ['ja', 'zh', '参加できないわけじゃないけど、少し遅れます。'],
  ['ja', 'zh', '図書館のアーカイブで歴史資料を調べています。'],
  ['ja', 'zh', 'それは、ちょっと……'],
  ['en', 'zh', 'The price fell from 150 dollars to 120 dollars, not by 120 dollars.'],
  ['en', 'zh', 'Please do not restart the computer until the download has finished.'],
  ['zh', 'ja', '明天晚上八點開始直播，今天不直播。'],
  ['zh', 'en', '他沒有說一定會成功，只說可以試試看。']
] as const

const assets = process.env.VOCALUME_BENCH_ASSETS!
const label = process.env.VOCALUME_BENCH_LABEL || 'performance'
const rounds = Math.min(120, Math.max(7, Number(process.env.VOCALUME_BENCH_ROUNDS) || 7))
app.setPath('userData', assets)
app.whenReady().then(async () => {
  const start = performance.now()
  const worker = utilityProcess.fork(join(__dirname, 'slm-worker.js'), [], { stdio: 'pipe' })
  worker.stdout?.on('data', value => process.stdout.write(value))
  worker.stderr?.on('data', value => process.stderr.write(value))
  let peakWorkingSetMiB = 0
  let peakPrivateMiB = 0
  let sampledCpuSeconds = 0
  const lastCpu = new Map<number, number>()
  const intervals: number[] = []
  let lastBeat = performance.now()
  const heartbeat = setInterval(() => {
    const now = performance.now(); intervals.push(now - lastBeat); lastBeat = now
  }, 20)
  const monitor = setInterval(() => {
    const metrics = app.getAppMetrics()
    peakWorkingSetMiB = Math.max(peakWorkingSetMiB, metrics.reduce((s, m) => s + m.memory.workingSetSize / 1024, 0))
    peakPrivateMiB = Math.max(peakPrivateMiB, metrics.reduce((s, m) => s + (m.memory.privateBytes || 0) / 1024, 0))
    for (const m of metrics) {
      const cpu = m.cpu.cumulativeCPUUsage || 0
      sampledCpuSeconds += Math.max(0, cpu - (lastCpu.get(m.pid) || 0)); lastCpu.set(m.pid, cpu)
    }
  }, 250)
  const timeout = setTimeout(() => { worker.kill(); app.exit(1) }, 240_000)
  const wait = (type: string, id?: string): Promise<any> => new Promise((resolve, reject) => {
    const handler = (reply: any): void => {
      if (reply.type === 'error') { worker.off('message', handler); reject(new Error(reply.message)); return }
      if (reply.type === type && (!id || reply.id === id)) { worker.off('message', handler); resolve(reply) }
    }
    worker.on('message', handler)
  })
  try {
    const ready = wait('ready')
    worker.postMessage({type:'init',modelPath:join(assets,'HY-MT1.5-1.8B-Q4_K_M.gguf'),modelType:'hunyuan-mt-15',kvCacheQuant:true})
    await ready
    const modelReadyMs = Math.round(performance.now() - start)
    const translate = async (text: string, from: string, to: string, id: string): Promise<string> => {
      const result = wait('result', id)
      worker.postMessage({type:'translate',id,text,from,to})
      return (await result).text
    }
    const bytes = Uint8Array.from(readFileSync(join(assets,'jfk.f32')))
    const engine = new WhisperLocalEngine({modelVariant:'base'})
    const beforeWhisper = new Set(app.getAppMetrics().map(m => m.pid))
    engine.setLanguage('en'); await engine.initialize()
    const whisperChildren = app.getAppMetrics().filter(m => m.type === 'Utility' && !beforeWhisper.has(m.pid)).map(m => m.pid)
    const audioRows = []
    for (let i = 0; i < rounds; i++) {
      const t = performance.now()
      const result = await engine.processAudio(new Float32Array(bytes.buffer.slice(0)),16000)
      if (!result) throw new Error('No recognition result')
      const sttMs = performance.now() - t
      const translationStart = performance.now()
      const translated = await translate(result.text,'en','zh','audio-'+i)
      audioRows.push({round:i,sttMs,translationMs:performance.now()-translationStart,source:result.text,translated})
    }
    const qualityRows = []
    for (const [i,[from,to,source]] of samples.entries()) {
      const t = performance.now()
      const translated = await translate(source,from,to,'quality-'+i)
      qualityRows.push({from,to,source,translated,translationMs:performance.now()-t})
    }
    await engine.dispose()
    const stopStart = performance.now()
    while (app.getAppMetrics().some(m => whisperChildren.includes(m.pid)) && performance.now()-stopStart < 3000) {
      await new Promise(resolve => setTimeout(resolve,20))
    }
    const whisperStopped = whisperChildren.length > 0 && !app.getAppMetrics().some(m => whisperChildren.includes(m.pid))
    if (whisperChildren.length > 0 && !whisperStopped) throw new Error('Whisper child was not reaped after dispose')
    intervals.sort((a,b)=>a-b)
    const output = {label,workerSource:process.env.VOCALUME_BENCH_WORKERS || 'checkout',logicalCpus:availableParallelism(),rounds,whisperStopped,modelReadyMs,wallMs:performance.now()-start,
      resources:{sampledCpuSeconds,peakWorkingSetMiB,peakPrivateMiB,heartbeatP95Ms:intervals[Math.floor(intervals.length*.95)],heartbeatMaxMs:Math.max(...intervals)},audioRows,qualityRows}
    writeFileSync(join(assets,label+'.json'),JSON.stringify(output,null,2)+'\n')
    console.log('PERFORMANCE_RESULT '+JSON.stringify(output))
  } finally {
    clearTimeout(timeout); clearInterval(monitor); clearInterval(heartbeat); worker.kill()
  }
  app.exit(0)
}).catch(error => {console.error(error);app.exit(1)})
