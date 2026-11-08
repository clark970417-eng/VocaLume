import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {claimMacCapture} from '../desktop/capture-lease.mjs';

const {installMac}=createRequire(import.meta.url)('../desktop/install-mac.cjs');

// Override the interpreter on Windows, where python3 may be a Store alias.
const python = process.env.VOCALUME_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

test('native installer preserves another browser extension origin',async()=>{
 const home=await mkdtemp(join(tmpdir(),'jtl-install-'));
 const folder=join(home,'Library/Application Support/Google/Chrome/NativeMessagingHosts');
 await mkdir(folder,{recursive:true});
 const target=join(folder,'org.jtl.companion.json');
 const oldId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',nextId='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
 await writeFile(target,JSON.stringify({allowed_origins:[`chrome-extension://${oldId}/`]}));
 const result=spawnSync(python,['extension/desktop/install.py','--extension-id',nextId],{cwd:process.cwd(),env:{...process.env,HOME:home,USERPROFILE:home},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const manifest=JSON.parse(await readFile(target,'utf8'));
 assert.deepEqual(manifest.allowed_origins,[`chrome-extension://${oldId}/`,`chrome-extension://${nextId}/`]);
});

test('relay imports without the optional OpenCC package',()=>{
 const code="import importlib.util; s=importlib.util.spec_from_file_location('relay','extension/desktop/relay.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); assert m.OpenCC is None";
 const result=spawnSync(python,['-I','-c',code],{cwd:process.cwd(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('relay finds VocaLume after an obsolete registered application was deleted',()=>{
 const code=`import importlib.util, tempfile, pathlib, json
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('relay','extension/desktop/relay.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as root:
 m.SUPPORT=pathlib.Path(root)
 (m.SUPPORT/'app.json').write_text(json.dumps({'executable':'/missing/Old.app/Contents/MacOS/Old'}))
 with patch.object(pathlib.Path,'is_file',autospec=True,side_effect=lambda path: path.as_posix()=='/Applications/VocaLume.app/Contents/MacOS/VocaLume'):
  assert pathlib.Path(m.app_executable()).as_posix()=='/Applications/VocaLume.app/Contents/MacOS/VocaLume'
`;
 const result=spawnSync(python,['-c',code],{cwd:process.cwd(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('an unavailable external Whisper cache falls back without changing its link',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vocalume-cache-link-'));
 await writeFile(join(root,'not-a-directory'),'blocked');
 // NTFS junctions exercise the same unavailable external-directory case without
 // requiring Developer Mode or elevated symbolic-link privileges on Windows.
 await symlink(join(root,'not-a-directory','cache'),join(root,'external-link'),process.platform==='win32'?'junction':'dir');
 const code=`import ast, os, pathlib, sys, tempfile
from pathlib import Path
source=ast.parse(pathlib.Path('desktop-app/resources/mlx-whisper-bridge.py').read_text(encoding='utf-8'))
function=next(node for node in source.body if isinstance(node,ast.FunctionDef) and node.name=='configure_model_cache')
exec(compile(ast.Module(body=[function],type_ignores=[]),'cache','exec'))
root=sys.argv[1]
if True:
 os.environ['HF_HOME']=root+'/external-link'
 os.environ.pop('HF_HUB_CACHE',None);os.environ.pop('HUGGINGFACE_HUB_CACHE',None)
 link=pathlib.Path(os.environ['HF_HOME']);before=link.lstat()
 old=pathlib.Path.home
 pathlib.Path.home=classmethod(lambda cls:pathlib.Path(root))
 try:
  result=configure_model_cache()
  assert result.is_dir() and 'vocalume' in str(result).lower()
  assert os.path.lexists(link)
  after=link.lstat()
  assert before.st_ino==after.st_ino
  assert getattr(before,'st_reparse_tag',None)==getattr(after,'st_reparse_tag',None)
  if sys.platform!='win32':assert link.is_symlink()
 finally:pathlib.Path.home=old
`;
 try {
  const result=spawnSync(python,['-I','-c',code,root],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
 } finally {await rm(root,{recursive:true,force:true});}
});

test('Mac registration uses the installed App, supports custom names and preserves valid origins',async()=>{
 const root=await mkdtemp(join(tmpdir(),"vocalume-mac-install-'"));
 try{
  const contents=join(root,'VocaLume (test).app','Contents');
  const appDir=join(contents,'MacOS'),helpers=join(contents,'Resources','bridge-scripts','bin');
  await mkdir(appDir,{recursive:true});await mkdir(helpers,{recursive:true});
  const app=join(appDir,'VocaLume');
  await writeFile(app,'fixture',{mode:0o700});
  const extensionId='a'.repeat(32),secondId='b'.repeat(32);
  assert.throws(()=>installMac({extensionId,app,home:root}),/matching VocaLume Mac App/);
  await writeFile(join(helpers,'capture-claim-helper'),'fixture',{mode:0o700});
  const launcher=installMac({extensionId,app,home:root});
  assert.equal(installMac({extensionId:secondId,app,home:root}),launcher);
  const script=await readFile(launcher,'utf8');
  assert.match(script,/ELECTRON_RUN_AS_NODE=1 "\$executable"/);
  assert.match(script,/native-host\.cjs/);
  for(const browser of ['Google/Chrome','Google/ChromeForTesting','Microsoft Edge','com.operasoftware.OperaGX']){
   const file=join(root,'Library/Application Support',browser,'NativeMessagingHosts','org.jtl.companion.json');
   const manifest=JSON.parse(await readFile(file,'utf8'));
   assert.equal(manifest.path,launcher);
   assert.deepEqual(manifest.allowed_origins,[`chrome-extension://${extensionId}/`,`chrome-extension://${secondId}/`]);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

test('capture lease distinguishes busy and bad helpers, and returns a release handle',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vocalume-capture-helper-'));
 try{
  const helper=join(root,'helper.cjs');
  await writeFile(helper,'process.exit(75)');
  assert.equal(await claimMacCapture(process.execPath,helper),null);
  await writeFile(helper,'process.stdout.write("X");process.stdin.resume()');
  await assert.rejects(claimMacCapture(process.execPath,helper),/Invalid VocaLume capture lock response/);
  await writeFile(helper,'process.stdout.write("1");process.stdin.resume()');
  const release=await claimMacCapture(process.execPath,helper);
  assert.equal(typeof release,'function');
  release();
 }finally{await rm(root,{recursive:true,force:true});}
});
