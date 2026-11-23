import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const python=process.env.VOCALUME_TEST_PYTHON || process.env.VOCALUME_PYTHON || (process.platform==='win32'?'python':'python3');

test('release version checks reject a mismatched tag', () => {
  const result = spawnSync(process.execPath, ['scripts/check-release-version.mjs','beta-v0.0.0'], {encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/does not match/);
});
test('release gate verifies both extension packages and checksums their provenance', () => {
  const script = resolve('scripts/verify-release-assets.mjs');
  const windowsPackager = resolve('scripts/package-windows-extension.py');
  const root = mkdtempSync(join(tmpdir(),'vocalume-release-test-'));
  try {
    const version = JSON.parse(readFileSync(resolve('extension/manifest.json'), 'utf8')).version, assets = join(root,'assets'), source = join(root,'extension');
    mkdirSync(assets); mkdirSync(join(source,'desktop'),{recursive:true});
    writeFileSync(join(source,'manifest.json'),JSON.stringify({version,name:'VocaLume'}));
    for(const name of ['cloud-api.mjs','ui-language-sync.mjs','ui-language.mjs','ui-messages.mjs','ui-messages-zh-cn.mjs','ui-messages-ja.mjs','ui-messages-ko.mjs','ui-messages-desktop-ja.mjs','ui-messages-desktop-ko.mjs','website-language.mjs','website-language-content.js','page-language.js','popup-locale.mjs','desktop/install.py','desktop/relay.py','desktop/host.py','desktop/translation_support.py','desktop/install-windows.ps1','desktop/windows-host.cjs','desktop/install-mac.cjs','desktop/capture-lease.mjs','desktop/requirements.txt','desktop/LIVE_TRANSLATE_LICENSE','INSTALL.md','PRIVACY.md','THIRD_PARTY_NOTICES.md','LICENSE']) writeFileSync(join(source,name),'fixture');
    for(const name of [`VocaLume-${version}-arm64.dmg`,`VocaLume-${version}.dmg`,`VocaLume-${version}-arm64-mac.zip`,`VocaLume-${version}-mac.zip`,`VocaLume.Setup.${version}.exe`,`VocaLume-${version}.AppImage`]) writeFileSync(join(assets,name),Buffer.alloc(1024));
    const zip = join(assets,'vocalume-extension.zip');
    const windowsZip = join(assets,'vocalume-extension-windows.zip');
    const makeArchive=(exclude=[], destination=zip)=>execFileSync(python,['-I','-c',
      'import pathlib,sys,json,zipfile; root=pathlib.Path(sys.argv[1]); skip=set(json.loads(sys.argv[3])); z=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED); [(z.write(p,p.relative_to(root).as_posix())) for p in root.rglob("*") if p.is_file() and p.relative_to(root).as_posix() not in skip]; z.close()',source,destination,JSON.stringify(exclude)]);
    makeArchive();
    const makeWindowsArchive = (from = zip) => execFileSync(python, ['-I', windowsPackager, from, windowsZip]);
    makeWindowsArchive();
    const args = [script,assets,`beta-v${version}`,'a'.repeat(40),'https://github.com/clark970417-eng/VocaLume/actions/runs/1'];
    const result = spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const provenance = readFileSync(join(assets,'release-manifest.json'));
    assert.ok(JSON.parse(provenance).assets.includes('vocalume-extension-windows.zip'));
    const checksums = readFileSync(join(assets,'SHA256SUMS.txt'),'utf8').split('\n');
    for (const name of ['release-manifest.json', 'vocalume-extension.zip', 'vocalume-extension-windows.zip']) {
      const digest = createHash('sha256').update(readFileSync(join(assets, name))).digest('hex');
      assert.ok(checksums.includes(`${digest}  ${name}`));
    }
    makeArchive(['ui-messages-zh-cn.mjs']);
    const missingLocale = spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
    assert.notEqual(missingLocale.status,0);
    assert.match(missingLocale.stderr,/ui-messages-zh-cn\.mjs/);
    makeArchive(['desktop/relay.py']);
    assert.notEqual(spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'}).status,0);
    const windowsInput = join(root, 'windows-input.zip');
    makeArchive();
    makeArchive(['desktop/windows-host.cjs'], windowsInput);
    makeWindowsArchive(windowsInput);
    const missingWindowsHost = spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
    assert.notEqual(missingWindowsHost.status,0);
    assert.match(missingWindowsHost.stderr,/vocalume-extension-windows\.zip: desktop\/windows-host\.cjs/);
    writeFileSync(windowsZip, readFileSync(zip));
    const wrongWindowsContents = spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
    assert.notEqual(wrongWindowsContents.status,0);
    assert.match(wrongWindowsContents.stderr,/Unexpected macOS installer dependency in vocalume-extension-windows\.zip/);
    writeFileSync(join(source,'manifest.json'),JSON.stringify({version:'0.0.0',name:'VocaLume'}));
    makeArchive([], windowsInput);
    writeFileSync(join(source,'manifest.json'),JSON.stringify({version,name:'VocaLume'}));
    makeWindowsArchive(windowsInput);
    const wrongWindowsVersion = spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
    assert.notEqual(wrongWindowsVersion.status,0);
    assert.match(wrongWindowsVersion.stderr,/Wrong extension manifest in vocalume-extension-windows\.zip/);
    makeWindowsArchive();
    rmSync(join(assets,`VocaLume-${version}.dmg`));
    assert.notEqual(spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'}).status,0);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
