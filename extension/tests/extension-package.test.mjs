import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';

test('beta archive includes local dependencies and only the ONNX runtime used by both browser workers',()=>{
 const root=new URL('../',import.meta.url);
 const workflow=readFileSync(new URL('../.github/workflows/beta.yml',root),'utf8').replaceAll('\r\n','\n');
 const command=workflow.match(/zip -r \.\.\/beta\/vocalume-extension.zip ([\s\S]*?)\n          cd \.\./)?.[1];
 assert.ok(command,'extension archive command exists');
 const files=new Set(command.replace(/\\\n/g,' ').trim().split(/\s+/));
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
