import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {endpoint,decoder}=createRequire(import.meta.url)('../desktop/windows-host.cjs');
test('Windows host uses the same endpoint hash as the desktop app',()=>{
 const directory='C:\\Users\\測試\\Library\\Application Support\\JapaneseLiveCaption';
 assert.equal(endpoint(directory),'\\\\.\\pipe\\japanese-live-caption-'+createHash('sha256').update(directory).digest('hex').slice(0,20));
 assert.equal(endpoint(directory,'win32',true),endpoint(directory)+'-ui-language');
 assert.equal(endpoint('/tmp/vocalume','darwin',true),'/tmp/vocalume/ui.sock');
});
test('Windows language helper leaves the app closed if its pipe is absent',()=>{
 const host=fileURLToPath(new URL('../desktop/windows-host.cjs',import.meta.url));
 const result=spawnSync(process.execPath,[host,'--ui-language'],{
  env:{...process.env,HOME:'nonexistent-vocalume-test-user',USERPROFILE:'nonexistent-vocalume-test-user'},
  encoding:'utf8',timeout:5000
 });
 assert.equal(result.error,undefined);
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/VocaLume language connection is unavailable/);
});
test('native messages handle fragmented UTF-8 and multiple frames',()=>{
 const messages=[],feed=decoder(message=>messages.push(message));
 const frame=value=>{const body=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(4);header.writeUInt32LE(body.length);return Buffer.concat([header,body]);};
 const data=Buffer.concat([frame({id:1,text:'你好'}),frame({id:2,op:'status'})]);
 for(const byte of data)feed(Buffer.from([byte]));
 assert.deepEqual(messages,[{id:1,text:'你好'},{id:2,op:'status'}]);
});
test('native transport refuses oversized input before buffering its payload',()=>{
 const header=Buffer.alloc(4);header.writeUInt32LE(2000001);
 assert.throws(()=>decoder(()=>{})(header),/length/);
});
