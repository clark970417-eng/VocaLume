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
test('release completeness gate covers native files and checksums the provenance', () => {
  const script = resolve('scripts/verify-release-assets.mjs');
  const root = mkdtempSync(join(tmpdir(),'vocalume-release-test-'));
  try {
    const version = JSON.parse(readFileSync(resolve('extension/manifest.json'), 'utf8')).version, assets = join(root,'assets'), source = join(root,'extension');
    mkdirSync(assets); mkdirSync(join(source,'desktop'),{recursive:true});
    writeFileSync(join(source,'manifest.json'),JSON.stringify({version,name:'VocaLume'}));
    for(const name of ['cloud-api.mjs','ui-language.mjs','ui-messages.mjs','ui-messages-zh-cn.mjs','ui-messages-ja.mjs','ui-messages-ko.mjs','ui-messages-desktop-ja.mjs','ui-messages-desktop-ko.mjs','website-language.mjs','website-language-content.js','page-language.js','popup-locale.mjs','desktop/install.py','desktop/relay.py','desktop/host.py','desktop/translation_support.py','desktop/install-windows.ps1','desktop/windows-host.cjs','desktop/install-mac.cjs','desktop/capture-lease.mjs','desktop/LIVE_TRANSLATE_LICENSE','INSTALL.md','THIRD_PARTY_NOTICES.md','LICENSE']) writeFileSync(join(source,name),'fixture');
    for(const name of [`VocaLume-${version}-arm64.dmg`,`VocaLume-${version}.dmg`,`VocaLume-${version}-arm64-mac.zip`,`VocaLume-${version}-mac.zip`,`VocaLume.Setup.${version}.exe`,`VocaLume-${version}.AppImage`]) writeFileSync(join(assets,name),Buffer.alloc(1024));
    const zip = join(assets,'vocalume-extension.zip');
    const makeArchive=(exclude=[])=>execFileSync(python,['-I','-c',
      'import pathlib,sys,json,zipfile; root=pathlib.Path(sys.argv[1]); skip=set(json.loads(sys.argv[3])); z=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED); [(z.write(p,p.relative_to(root).as_posix())) for p in root.rglob("*") if p.is_file() and p.relative_to(root).as_posix() not in skip]; z.close()',source,zip,JSON.stringify(exclude)]);
    makeArchive();
    const args = [script,assets,`beta-v${version}`,'a'.repeat(40),'https://github.com/clark970417-eng/VocaLume/actions/runs/1'];
    const result = spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const provenance = readFileSync(join(assets,'release-manifest.json'));
    const digest = createHash('sha256').update(provenance).digest('hex');
    assert.match(readFileSync(join(assets,'SHA256SUMS.txt'),'utf8'),new RegExp(`${digest}  release-manifest.json`));
    makeArchive(['ui-messages-zh-cn.mjs']);
    const missingLocale = spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
    assert.notEqual(missingLocale.status,0);
    assert.match(missingLocale.stderr,/ui-messages-zh-cn\.mjs/);
    makeArchive(['desktop/relay.py']);
    assert.notEqual(spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'}).status,0);
    rmSync(join(assets,`VocaLume-${version}.dmg`));
    assert.notEqual(spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'}).status,0);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
