import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('native installer preserves another browser extension origin',async()=>{
 const home=await mkdtemp(join(tmpdir(),'jtl-install-'));
 const folder=join(home,'Library/Application Support/Google/Chrome/NativeMessagingHosts');
 await mkdir(folder,{recursive:true});
 const target=join(folder,'org.jtl.companion.json');
 const oldId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',nextId='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
 await writeFile(target,JSON.stringify({allowed_origins:[`chrome-extension://${oldId}/`]}));
 const result=spawnSync('python3',['desktop/install.py','--extension-id',nextId],{cwd:process.cwd(),env:{...process.env,HOME:home},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const manifest=JSON.parse(await readFile(target,'utf8'));
 assert.deepEqual(manifest.allowed_origins,[`chrome-extension://${oldId}/`,`chrome-extension://${nextId}/`]);
});

test('relay imports without the optional OpenCC package',()=>{
 const code="import importlib.util; s=importlib.util.spec_from_file_location('relay','desktop/relay.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); assert m.OpenCC is None";
 const result=spawnSync('python3',['-I','-c',code],{cwd:process.cwd(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('relay finds VocaLume after an obsolete registered application was deleted',()=>{
 const code=`import importlib.util, tempfile, pathlib, json
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('relay','desktop/relay.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as root:
 m.SUPPORT=pathlib.Path(root)
 (m.SUPPORT/'app.json').write_text(json.dumps({'executable':'/missing/Old.app/Contents/MacOS/Old'}))
 with patch.object(pathlib.Path,'is_file',autospec=True,side_effect=lambda path: str(path)=='/Applications/VocaLume.app/Contents/MacOS/VocaLume'):
  assert m.app_executable()=='/Applications/VocaLume.app/Contents/MacOS/VocaLume'
`;
 const result=spawnSync('python3',['-c',code],{cwd:process.cwd(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('an unavailable external Whisper cache falls back without changing the symlink',()=>{
 const code=`import ast, os, pathlib, sys, tempfile
from pathlib import Path
source=ast.parse(pathlib.Path('desktop-app/resources/mlx-whisper-bridge.py').read_text())
function=next(node for node in source.body if isinstance(node,ast.FunctionDef) and node.name=='configure_model_cache')
exec(compile(ast.Module(body=[function],type_ignores=[]),'cache','exec'))
with tempfile.TemporaryDirectory() as root:
 os.environ['HF_HOME']=root+'/external-link'
 blocked=pathlib.Path(root+'/not-a-directory');blocked.write_text('blocked')
 pathlib.Path(os.environ['HF_HOME']).symlink_to(blocked/'cache')
 old=pathlib.Path.home
 pathlib.Path.home=classmethod(lambda cls:pathlib.Path(root))
 try:
  result=configure_model_cache()
  assert result.is_dir() and 'vocalume' in str(result).lower()
  assert pathlib.Path(root+'/external-link').is_symlink()
 finally:pathlib.Path.home=old
`;
 const result=spawnSync('python3',['-c',code],{cwd:process.cwd(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
