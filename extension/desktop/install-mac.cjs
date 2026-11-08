// Run with the installed VocaLume executable in Node mode.
const { constants, accessSync, chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { dirname, join, resolve } = require('node:path');
const { homedir } = require('node:os');

const hostName = 'org.jtl.companion';
const validOrigin = /^chrome-extension:\/\/[a-p]{32}\/$/;
const defaultExecutable = 'VocaLume.app/Contents/MacOS/VocaLume';
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
const browsers = ['Google/Chrome', 'Google/ChromeForTesting', 'Microsoft Edge', 'com.operasoftware.OperaGX'];

function writeConfig(path, content, mode = 0o600) {
  const temporary = path + '.' + randomUUID();
  writeFileSync(temporary, content, { mode, flag: 'wx' });
  renameSync(temporary, path);
}
function installMac({ extensionId, app = process.execPath, home = homedir() }) {
  if (typeof extensionId !== 'string' || !/^[a-p]{32}$/.test(extensionId)) throw new Error('Expected a 32-character Chromium extension ID');
  const executable = resolve(app);
  if (!/\.app\/Contents\/MacOS\/[^/\r\n]+$/.test(executable.replaceAll('\\', '/'))) {
    throw new Error('Run the installer using the executable inside your VocaLume.app');
  }
  accessSync(executable, constants.X_OK);
  try { accessSync(join(dirname(executable), '../Resources/bridge-scripts/bin/capture-claim-helper'), constants.X_OK); }
  catch { throw new Error('Install the matching VocaLume Mac App before registering the extension'); }
  const applicationSupport = join(home, 'Library/Application Support');
  const support = join(applicationSupport, 'JapaneseLiveCaption');
  mkdirSync(support, { recursive: true, mode: 0o700 });
  chmodSync(support, 0o700);
  writeConfig(join(support, 'native-host.cjs'), readFileSync(join(__dirname, 'windows-host.cjs')));
  writeConfig(join(support, 'capture-lease.mjs'), readFileSync(join(__dirname, 'capture-lease.mjs')));
  writeConfig(join(support, 'app-executable'), executable + '\n');

  const launcher = join(support, 'launch-native');
  writeConfig(launcher, [
    '#!/bin/sh',
    'support=' + quote(support),
    'IFS= read -r executable < "$support/app-executable" || executable=',
    'if [ ! -x "$executable" ]; then executable="$HOME/Applications/' + defaultExecutable + '"; fi',
    'if [ ! -x "$executable" ]; then executable="/Applications/' + defaultExecutable + '"; fi',
    'if [ ! -x "$executable" ]; then echo "Open the installed VocaLume App, then reload the extension." >&2; exit 1; fi',
    'exec /usr/bin/env ELECTRON_RUN_AS_NODE=1 "$executable" "$support/native-host.cjs"',
    ''
  ].join('\n'), 0o700);
  const origin = `chrome-extension://${extensionId}/`;
  for (const browser of browsers) {
    const folder = join(applicationSupport, browser, 'NativeMessagingHosts');
    const file = join(folder, hostName + '.json');
    mkdirSync(folder, { recursive: true });
    let previous;
    try { previous = JSON.parse(readFileSync(file, 'utf8')).allowed_origins; }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    const allowedOrigins = new Set([origin, ...(Array.isArray(previous) ? previous.filter(value => typeof value === 'string' && validOrigin.test(value)) : [])]);
    const manifest = { name: hostName, description: 'VocaLume local desktop connection', path: launcher, type: 'stdio', allowed_origins: [...allowedOrigins].sort() };
    writeConfig(file, JSON.stringify(manifest, null, 2) + '\n');
  }
  return launcher;
}

module.exports = { installMac };
if (require.main === module) {
  try {
    if (process.platform !== 'darwin') throw new Error('This installer runs on macOS.');
    installMac({ extensionId: process.argv[2] });
    console.log('VocaLume connected. Reload the extension and choose desktop mode.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
