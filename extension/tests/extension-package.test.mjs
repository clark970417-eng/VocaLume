import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync,rmdirSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const workflow=readFileSync(new URL('../.github/workflows/beta.yml',root),'utf8').replaceAll('\r\n','\n');
const command=workflow.match(/zip -r \.\.\/beta\/vocalume-extension.zip ([\s\S]*?)\n          cd \.\./)?.[1];
assert.ok(command,'extension archive command exists');
const packagePaths=[...new Set(command.replace(/\\\n/g,' ').trim().split(/\s+/))];

test('beta archive includes local dependencies and only the ONNX runtime used by both browser workers',()=>{
 const files=new Set(packagePaths);
 const directories=[...files].filter(file=>statSync(new URL(file,root)).isDirectory());
 const checkFile=(file,owner)=>{
  assert.ok(files.has(file)||directories.some(directory=>file.startsWith(`${directory}/`)),
   `${file} referenced by ${owner} is missing from the beta archive`);
  assert.ok(statSync(new URL(file,root)).isFile(),`${file} must be a file`);
 };
 // whisper-runtime.js is the WebGPU bundle. It loads this same pair when
 // the workers run WebGPU speech recognition or CPU-based Silero VAD.
 assert.ok(files.has('ort'),'the archive includes the runtime directory');
 assert.deepEqual(readdirSync(new URL('ort/',root)).sort(),[
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm'
 ]);
 for(const file of ['desktop/install-windows.ps1','desktop/windows-host.cjs','desktop/install-mac.cjs','desktop/capture-lease.mjs']){
  checkFile(file,'native browser setup');
 }
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
 const manifestFiles=[manifest.background.service_worker,manifest.action.default_popup,
  ...Object.values(manifest.icons),...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap(script=>[...(script.js??[]),...(script.css??[])]),
  ...(manifest.web_accessible_resources??[]).flatMap(entry=>entry.resources)];
 for(const file of manifestFiles)checkFile(file,'manifest.json');
 for(const file of files){
  if(!/\.(?:[cm]?js|html)$/.test(file))continue;
  const source=readFileSync(new URL(file,root),'utf8');
  const references=[...source.matchAll(/^(?:import\s+(?:[^'"\n]*?\sfrom\s*)?|export\s+[^'"\n]*?\sfrom\s*)['"](\.\.?\/[^'"?]+)(?:\?[^'"]*)?['"]/gm)];
  // The bundled Whisper runtime also contains JSDoc imports and fallback URLs
  // for unused features. Its actual model assets are checked separately.
  if(file!=='whisper-runtime.js'){
   references.push(...source.matchAll(/(?:\bimport|\bnew Worker|\.addModule|chrome\.runtime\.getURL)\(\s*['"]([^'"?]+)(?:\?[^'"]*)?['"]/g));
   references.push(...source.matchAll(/\bnew URL\(\s*['"](\.\.?\/[^'"]+[^/'"])['"]\s*,\s*import\.meta\.url\)/g));
  }
  if(file.endsWith('.html'))references.push(...source.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=['"]([^'"]+)['"]/g));
  for(const [,reference] of references){
   const dependency=new URL(reference,new URL(file,root));
   if(dependency.href.startsWith(root.href))checkFile(dependency.href.slice(root.href.length),file);
  }
 }
});

test('Windows companion omits only macOS setup helpers and retains byte-identical browser assets', t=>{
 const temporary=mkdtempSync(join(tmpdir(),'vocalume-windows-extension-'));
 const universal=join(temporary,'universal.zip');
 const windows=join(temporary,'windows.zip');
 t.after(()=>{
  rmSync(universal,{force:true});
  rmSync(windows,{force:true});
  rmdirSync(temporary);
 });
 const python=process.env.VOCALUME_TEST_PYTHON || process.env.VOCALUME_PYTHON || (process.platform==='win32'?'python':'python3');
 execFileSync(python,['-I','-c',`
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
with ZipFile(sys.argv[1], "w", ZIP_DEFLATED) as archive:
    for name in sys.argv[2:]:
        source = Path(name)
        for file in sorted(source.rglob("*")) if source.is_dir() else [source]:
            if file.is_file():
                archive.write(file, file.as_posix())
    archive.writestr("INSTALL.md", "Universal installation")
    for name in ("LICENSE", "PRIVACY.md", "THIRD_PARTY_NOTICES.md"):
        archive.writestr(name, name)
`,universal,...packagePaths],{cwd:fileURLToPath(root)});
 execFileSync(python,['-I',fileURLToPath(new URL('../scripts/package-windows-extension.py',root)),universal,windows]);
 const archive=JSON.parse(execFileSync(python,['-I','-c',`
import json, sys
from zipfile import ZipFile
with ZipFile(sys.argv[1]) as universal, ZipFile(sys.argv[2]) as windows:
    base = set(universal.namelist())
    current = set(windows.namelist())
    print(json.dumps({
        "removed": sorted(base - current),
        "added": sorted(current - base),
        "changed": sorted(name for name in base & current if universal.read(name) != windows.read(name)),
        "guide": windows.read("INSTALL.md").decode("utf-8")
    }))
`,universal,windows],{encoding:'utf8'}));
 assert.deepEqual(archive.removed,[
  'desktop/capture-lease.mjs','desktop/host.py','desktop/install-mac.cjs','desktop/install.py',
  'desktop/relay.py','desktop/requirements.txt','desktop/translation_support.py'
 ]);
 assert.deepEqual(archive.added,[]);
 assert.deepEqual(archive.changed,['INSTALL.md']);
 assert.ok(statSync(windows).size<statSync(universal).size);
 assert.match(archive.guide,/desktop\/install-windows\.ps1/);
 assert.doesNotMatch(archive.guide,/desktop\/install(?:-mac\.cjs|\.py)/);
 assert.match(workflow,/name: browser-extension-Windows\n\s+path: beta\/vocalume-extension-windows\.zip/);
});
