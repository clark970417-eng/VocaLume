/** Validate a complete unsigned beta asset set, then generate provenance/checksums.
 * Run from the checked-out repository. No credentials or machine paths are saved. */
import {readFileSync, writeFileSync, statSync, createReadStream} from 'node:fs';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const [directory, tag, commit, workflow] = process.argv.slice(2);
const version = JSON.parse(readFileSync('manifest.json')).version;
if (!directory || tag !== `beta-v${version}` || !/^[0-9a-f]{40}$/.test(commit || '') || !/^https:\/\/github\.com\/clark970417-eng\/VocaLume\/actions\/runs\/\d+$/.test(workflow || '')) throw new Error('Expected asset directory, matching beta tag, commit SHA and repository Actions URL');
const root = resolve(directory);
const names = [`VocaLume-${version}-arm64.dmg`, `VocaLume-${version}.dmg`,
  `VocaLume-${version}-arm64-mac.zip`, `VocaLume-${version}-mac.zip`,
  `VocaLume.Setup.${version}.exe`, `VocaLume-${version}.AppImage`, 'vocalume-extension.zip'];
for (const name of names) if (statSync(join(root, name)).size < 1000) throw new Error(`Missing or empty package: ${name}`);
const extension = join(root, 'vocalume-extension.zip');
const manifest = JSON.parse(execFileSync('unzip', ['-p', extension, 'manifest.json'], {encoding:'utf8'}));
if (manifest.version !== version || !manifest.name.includes('VocaLume')) throw new Error('Wrong extension manifest');
const entries = new Set(execFileSync('unzip', ['-Z1', extension], {encoding:'utf8'}).trim().split('\n'));
for (const required of ['cloud-api.mjs','desktop/install.py','desktop/relay.py','desktop/host.py','desktop/translation_support.py','desktop/LIVE_TRANSLATE_LICENSE','INSTALL.md','THIRD_PARTY_NOTICES.md']) {
  if (!entries.has(required)) throw new Error(`Extension installer dependency missing: ${required}`);
}
const provenance = {tag, commit, builtAt:new Date().toISOString(), workflow, signed:false, channel:'beta', version,
  assets:names, physicalBrowserBridgeScope:'macOS Opera GX / Chrome; other desktop installers are separate from browser native-host setup'};
writeFileSync(join(root, 'release-manifest.json'), JSON.stringify(provenance, null, 2) + '\n');
const checksums = [];
for (const name of [...names, 'release-manifest.json'].sort()) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(root, name))) hash.update(chunk);
  checksums.push(`${hash.digest('hex')}  ${name}`);
}
writeFileSync(join(root, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
console.log(`Verified ${names.length} packages and checksummed their provenance manifest`);
