/** Bundle the current harness against either working sources or a frozen Git
 * revision. Run from desktop-app; never replaces the production build. */
const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')
const {build} = require('esbuild')
const [destination, revision] = process.argv.slice(2)
if (!/^out\/speech-benchmark-[a-z0-9-]+$/.test(destination || '')) throw Error('Expected out/speech-benchmark-NAME [Git revision]')
const root = path.resolve('..')
const baseline = revision && cp.execFileSync('git', ['rev-parse', '--verify', revision + '^{commit}'], {encoding:'utf8'}).trim()
fs.mkdirSync(destination, {recursive:true})
const snapshot = relative => cp.execFileSync('git', ['show', baseline + ':' + relative], {encoding:'utf8'})
if (baseline) fs.writeFileSync(path.join(destination, 'mlx-whisper-bridge.py'), snapshot('desktop-app/resources/mlx-whisper-bridge.py'))
const plugin = {name:'frozen-production', setup(builder) {
  builder.onLoad({filter:/\.(ts|mjs|js)$/}, args => {
    const relative = path.relative(root, args.path)
    if (relative.includes('node_modules') || relative.startsWith('..')) return
    const production = relative.startsWith('desktop-app/src/') || !relative.includes('/')
    let contents = baseline && production ? snapshot(relative) : fs.readFileSync(args.path, 'utf8')
    if (baseline && relative.endsWith('/SubprocessBridge.ts')) {
      contents = contents.replace("return join(__dirname, '../../resources', scriptName)",
        "return scriptName === 'mlx-whisper-bridge.py' ? join(__dirname, scriptName) : join(__dirname, '../../resources', scriptName)")
      if (!contents.includes("join(__dirname, scriptName)")) throw Error('Baseline bridge layout changed; audit the snapshot resolver')
    }
    return {contents,loader:args.path.endsWith('.ts')?'ts':'js',resolveDir:path.dirname(args.path)}
  })
}}
build({entryPoints:{recovery:'scripts/benchmark-translation-recovery.ts',names:'scripts/benchmark-name-preservation.ts',quality:'scripts/benchmark-speech-quality.ts',paced:'scripts/benchmark-captions.ts',cuts:'scripts/benchmark-audio-cuts.ts','slm-worker':'src/main/slm-worker.ts'},
  outdir:destination,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[plugin]})
  .catch(error=>{console.error(error);process.exitCode=1})
