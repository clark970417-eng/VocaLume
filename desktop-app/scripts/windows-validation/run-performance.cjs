// Requires the three public assets used by run-benchmark.cjs (including jfk.f32).
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
if (process.platform !== 'win32' || !process.argv[2]) throw new Error('Usage: node scripts/windows-validation/run-performance.cjs ASSETS [LABEL]')
const root = path.resolve(__dirname, '../..')
const assets = path.resolve(process.argv[2])
const label = process.argv[3] || 'performance'
const packagedResources = process.argv[4] ? path.resolve(process.argv[4]) : null
if (packagedResources && !fs.existsSync(path.join(packagedResources,'app.asar'))) throw new Error('Packaged app.asar not found')
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid output label')
for (const name of ['jfk.f32','models/ggml-base.bin','HY-MT1.5-1.8B-Q4_K_M.gguf']) {
  if (!fs.existsSync(path.join(assets,name))) throw new Error('Missing asset: '+name)
}
const entry = path.join(root,'out/main/verify-resource.cjs')
try {
  require('esbuild').buildSync({entryPoints:[path.join(__dirname,'performance-harness.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',
    define:packagedResources ? {__dirname:JSON.stringify(path.join(packagedResources,'app.asar/out/main'))} : {}})
  const env = {...process.env,VOCALUME_BENCH_ASSETS:assets,VOCALUME_BENCH_LABEL:label,VOCALUME_BENCH_WORKERS:packagedResources?'packaged':'checkout'}
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'),[entry],{env,encoding:'utf8',timeout:255000,windowsHide:true,maxBuffer:10000000})
  fs.writeFileSync(path.join(assets,label+'.log'),(result.stdout||'')+'\n'+(result.stderr||''))
  console.log('Result:',result.status,'Report:',path.join(assets,label+'.json'))
  if (result.status !== 0) { console.error(result.error?.message || result.stderr); process.exitCode=1 }
} finally { fs.rmSync(entry,{force:true}) }
