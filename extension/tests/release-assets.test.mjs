import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

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
    for(const name of ['cloud-api.mjs','ui-language.mjs','ui-messages.mjs','ui-messages-zh-cn.mjs','popup-locale.mjs','desktop/install.py','desktop/relay.py','desktop/host.py','desktop/translation_support.py','desktop/LIVE_TRANSLATE_LICENSE','INSTALL.md','THIRD_PARTY_NOTICES.md','LICENSE']) writeFileSync(join(source,name),'fixture');
    for(const name of [`VocaLume-${version}-arm64.dmg`,`VocaLume-${version}.dmg`,`VocaLume-${version}-arm64-mac.zip`,`VocaLume-${version}-mac.zip`,`VocaLume.Setup.${version}.exe`,`VocaLume-${version}.AppImage`]) writeFileSync(join(assets,name),Buffer.alloc(1024));
    const zip = join(assets,'vocalume-extension.zip');
    execFileSync('zip',['-qr',zip,'.'],{cwd:source});
    const args = [script,assets,`beta-v${version}`,'a'.repeat(40),'https://github.com/clark970417-eng/VocaLume/actions/runs/1'];
    const result = spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const provenance = readFileSync(join(assets,'release-manifest.json'));
    const digest = createHash('sha256').update(provenance).digest('hex');
    assert.match(readFileSync(join(assets,'SHA256SUMS.txt'),'utf8'),new RegExp(`${digest}  release-manifest.json`));
    execFileSync('zip',['-dq',zip,'ui-messages-zh-cn.mjs']);
    const missingLocale = spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
    assert.notEqual(missingLocale.status,0);
    assert.match(missingLocale.stderr,/ui-messages-zh-cn\.mjs/);
    execFileSync('zip',['-q',zip,'ui-messages-zh-cn.mjs'],{cwd:source});
    execFileSync('zip',['-dq',zip,'desktop/relay.py']);
    assert.notEqual(spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'}).status,0);
    rmSync(join(assets,`VocaLume-${version}.dmg`));
    assert.notEqual(spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'}).status,0);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
