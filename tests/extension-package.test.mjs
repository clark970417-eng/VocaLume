import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('beta archive includes every local static module dependency',()=>{
 const root=new URL('../',import.meta.url);
 const workflow=readFileSync(new URL('.github/workflows/beta.yml',root),'utf8');
 const command=workflow.match(/zip -r beta\/vocalume-extension.zip ([\s\S]*?)\n      - uses:/)?.[1];
 assert.ok(command,'extension archive command exists');
 const files=new Set(command.replace(/\\\n/g,' ').trim().split(/\s+/));
 for(const file of files){
  if(!/\.(?:m?js)$/.test(file))continue;
  const source=readFileSync(new URL(file,root),'utf8');
  for(const match of source.matchAll(/^import\s+(?:[^'"\n]*?\sfrom\s*)?['"](\.\/[^'"?]+)(?:\?[^'"]*)?['"]/gm)){
   const dependency=new URL(match[1],new URL(file,root)).href.slice(root.href.length);
   assert.ok(files.has(dependency),`${file} imports ${dependency}, missing from beta archive`);
  }
 }
});
