// Native messaging transport for Windows and macOS. Electron supplies Node.
const { createConnection, createServer } = require('node:net');
const { createHash } = require('node:crypto');
const { homedir } = require('node:os');
const { dirname, join, posix } = require('node:path');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');

function endpoint(directory, platform = 'win32', languageOnly = false) {
  if (platform === 'darwin') return posix.join(directory, languageOnly ? 'ui.sock' : 'desktop.sock');
  return '\\\\.\\pipe\\japanese-live-caption-' + createHash('sha256').update(directory).digest('hex').slice(0, 20) + (languageOnly ? '-ui-language' : '');
}
function decoder(onMessage, limit = 2000000) {
  let buffer = Buffer.alloc(0);
  return chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (!length || length > limit) throw new Error('Invalid native message length');
      if (buffer.length < length + 4) break;
      onMessage(JSON.parse(buffer.subarray(4, length + 4).toString('utf8')));
      buffer = buffer.subarray(length + 4);
    }
  };
}
async function main() {
  const mac = process.platform === 'darwin';
  const languageOnly = process.argv.includes('--ui-language');
  const executable = languageOnly ? undefined : mac ? process.execPath : JSON.parse(readFileSync(join(__dirname, 'windows-app.json'), 'utf8')).executable;
  const support = mac ? __dirname : join(homedir(), 'Library/Application Support/JapaneseLiveCaption');
  const address = endpoint(support, process.platform, languageOnly);
  const responseLimit = languageOnly ? 8192 : 1048576;
  const claimAddress = address + '-capture';
  const connect = () => new Promise((resolve, reject) => {
    const socket = createConnection(address);
    socket.once('error', reject);
    socket.once('connect', () => { socket.removeListener('error', reject); resolve(socket); });
  });
  let socket, claim, closed = false;
  const release = () => {
    const held = claim;
    claim = undefined;
    held?.release();
  };
  const close = () => { closed = true; release(); socket?.destroy(); process.stdin.destroy(); };
  const fail = error => {
    process.stderr.write(String(error.message || error) + '\n');
    process.exitCode = 1;
    close();
  };
  const writeFrame = body => {
    if (body.length > responseLimit) return fail(new Error('Native response exceeds browser limit'));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    if (!process.stdout.write(Buffer.concat([header, body]))) socket?.pause();
  };
  const reply = (id, result) => writeFrame(Buffer.from(JSON.stringify({ id, ok: true, result })));

  function bind(connected) {
    if (closed) { connected.destroy(); return null; }
    socket = connected;
    let pending = '';
    socket.setEncoding('utf8');
    socket.on('drain', () => process.stdin.resume());
    socket.on('data', chunk => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        writeFrame(Buffer.from(pending.slice(0, end)));
        pending = pending.slice(end + 1);
      }
      if (Buffer.byteLength(pending) > responseLimit) fail(new Error('Oversized desktop response'));
    });
    socket.on('error', fail);
    socket.on('close', close);
    return socket;
  }

  async function appConnection(launch) {
    if (socket) return socket;
    try { return bind(await connect()); }
    catch (error) {
      if (!launch || closed) return null;
    }
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, ['--jtl-companion'], { env, detached: true, windowsHide: true, stdio: 'ignore' });
    let launchError;
    child.once('error', error => { launchError = error; });
    child.unref();
    const deadline = Date.now() + 30000;
    while (!closed) {
      try { return bind(await connect()); }
      catch (error) {
        if (launchError || Date.now() >= deadline) throw new Error('VocaLume did not open its companion connection: ' + (launchError || error).message);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    return null;
  }

  async function claimBrowser() {
    if (mac) {
      const { claimMacCapture } = await import('./capture-lease.mjs');
      const helper = join(dirname(executable), '../Resources/bridge-scripts/bin/capture-claim-helper');
      return claimMacCapture(helper, claimAddress);
    }
    return new Promise((resolve, reject) => {
      const server = createServer(peer => peer.destroy());
      server.once('error', error => {
        if (error.code === 'EADDRINUSE') resolve(null); else reject(error);
      });
      server.listen(claimAddress, () => { server.unref(); resolve(() => server.close()); });
    });
  }

  async function handle(message) {
    if (closed) return;
    const { id, op, subscription } = message;
    if (languageOnly) {
      if (op !== 'watch-ui-language' && op !== 'set-ui-language') throw new Error('Unsupported language operation');
      const connection = await appConnection(false);
      if (!connection) throw new Error('VocaLume language connection is unavailable');
      if (!connection.write(JSON.stringify(message) + '\n')) process.stdin.pause();
      return;
    }
    if (op === 'browser-claim') {
      if (typeof subscription !== 'string' || !/^[a-z0-9_-]{1,64}$/iu.test(subscription)) throw new Error('Invalid live caption subscription');
      if (claim) {
        reply(id, { role: claim.subscription === subscription ? 'browser' : 'busy', coordinated: true });
        return;
      }
      // Browser-only capture must not launch Electron. It can still reserve
      // the same named pipe that a later App start would need.
      const connection = await appConnection(false);
      if (!connection) {
        const releaseClaim = await claimBrowser();
        if (closed) { releaseClaim?.(); return; }
        if (releaseClaim) claim = { subscription, release: releaseClaim };
        reply(id, { role: releaseClaim ? 'browser' : 'busy', coordinated: !!releaseClaim });
        return;
      }
    }
    if (op === 'release-capture' && claim?.subscription === subscription) {
      release();
      reply(id, { stopped: true });
      return;
    }
    const connection = await appConnection(message.launch !== false && !['release-capture', 'stop'].includes(op));
    if (!connection) {
      reply(id, op === 'status' ? { captureActive: false, desktopUI: false } : { stopped: true });
      return;
    }
    if (!connection.write(JSON.stringify(message) + '\n')) process.stdin.pause();
  }

  let queued = Promise.resolve();
  if (languageOnly && !await appConnection(false)) throw new Error('VocaLume language connection is unavailable');

  const decode = decoder(message => { queued = queued.then(() => handle(message)).catch(fail); }, languageOnly ? 8192 : 2000000);
  process.stdin.on('data', chunk => { try { decode(chunk); } catch (error) { fail(error); } });
  process.stdin.on('end', close);
  process.stdin.on('error', fail);
  process.stdout.on('drain', () => socket?.resume());
  process.stdout.on('error', fail);
}
module.exports = { endpoint, decoder };
if (require.main === module) main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
