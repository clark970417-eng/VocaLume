const path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),assets=path.resolve(process.argv[2]||''),corpus=path.resolve(process.argv[3]||'')
if(process.platform!=='win32'||!process.argv[3])throw new Error('Usage: node scripts/windows-validation/run-japanese-comparison.cjs MODEL_ASSETS CORPUS_ROOT')
const entry=path.join(root,'out/main/verify-japanese.cjs')
try {
 require('esbuild').buildSync({entryPoints:[path.join(__dirname,'compare-japanese.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external'})
 const env={...process.env,VOCALUME_BENCH_ASSETS:assets,VOCALUME_ASR_CORPUS:corpus};delete env.ELECTRON_RUN_AS_NODE
 const result=spawnSync(require('electron'),[entry],{env,encoding:'utf8',timeout:900000,windowsHide:true,maxBuffer:20000000})
 fs.writeFileSync(path.join(corpus,'comparison.log'),(result.stdout||'')+'\n'+(result.stderr||''))
 console.log((result.stdout||'').split('\n').filter(s=>s.startsWith('ASR_SUMMARY')).join('\n'))
 if(result.status!==0){console.error(result.error?.message||result.stderr);process.exitCode=1}
} finally{fs.rmSync(entry,{force:true})}
