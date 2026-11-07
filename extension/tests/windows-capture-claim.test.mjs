import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,copyFileSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

const {decoder}=createRequire(import.meta.url)('../desktop/windows-host.cjs');

test('Windows standalone native claim is passive, exclusive and reusable after release',
 {skip:process.platform!=='win32',timeout:8000},async()=>{
  const directory=mkdtempSync(join(tmpdir(),'jtl-passive-claim-'));
  const host=join(directory,'windows-host.cjs');
  const preload=join(directory,'test-profile.cjs');
  const config=join(directory,'windows-app.json');
  copyFileSync(new URL('../desktop/windows-host.cjs',import.meta.url),host);
  writeFileSync(preload,"require('node:os').homedir=()=>process.argv[2];\n");
  // This nonexistent executable also ensures that an accidental App launch
  // would fail the request instead of touching the user's real installation.
  writeFileSync(config,JSON.stringify({executable:join(directory,'must-not-launch.exe')}));
  const clients=[];
  function client(){
   const child=spawn(process.execPath,['--require',preload,host,directory],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   const closed=once(child,'exit');
   const pending=new Map();
   let id=0,stderr='';
   child.stderr.on('data',data=>{stderr+=data.toString();});
   child.stdout.on('data',decoder(message=>{
    const accept=pending.get(message.id);
    if(accept){pending.delete(message.id);accept.resolve(message);}
   }));
   child.on('exit',()=>{
    for(const request of pending.values())request.reject(new Error('Native test host exited '+stderr));
    pending.clear();
   });
   const request=(op,subscription)=>new Promise((resolve,reject)=>{
    const requestId=++id,body=Buffer.from(JSON.stringify({op,subscription,id:requestId,launch:false}));
    const header=Buffer.alloc(4);header.writeUInt32LE(body.length);
    pending.set(requestId,{resolve,reject});
    child.stdin.write(Buffer.concat([header,body]));
   });
   clients.push({child,closed});
   return request;
  }
  try{
   const first=client(),second=client();
   assert.deepEqual((await first('browser-claim','one')).result,{role:'browser',coordinated:true});
   assert.equal((await second('browser-claim','two')).result.role,'busy');
   await first('release-capture','one');
   assert.deepEqual((await second('browser-claim','two')).result,{role:'browser',coordinated:true});
  }finally{
   for(const {child} of clients)child.stdin.end();
   await Promise.allSettled(clients.map(({closed})=>closed));
   for(const file of [config,preload,host])unlinkSync(file);
   rmdirSync(directory);
  }
 });
