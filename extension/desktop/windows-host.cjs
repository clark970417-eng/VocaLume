// Native messaging transport. Run with the installed Electron executable in Node mode.
const { createConnection } = require('node:net');
const { createHash } = require('node:crypto');
const { homedir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');

function endpoint(directory) {
  return '\\\\.\\pipe\\japanese-live-caption-' + createHash('sha256').update(directory).digest('hex').slice(0, 20);
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
  const config = JSON.parse(readFileSync(join(__dirname, 'windows-app.json'), 'utf8'));
  const address = endpoint(join(homedir(), 'Library/Application Support/JapaneseLiveCaption'));
  const connect = () => new Promise((resolve, reject) => {
    const socket = createConnection(address);
    socket.once('error', reject);
    socket.once('connect', () => { socket.removeListener('error', reject); resolve(socket); });
  });
  let socket;
  try { socket = await connect(); }
  catch {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    spawn(config.executable, ['--jtl-companion'], { env, detached: true, windowsHide: true, stdio: 'ignore' }).unref();
    const deadline = Date.now() + 30000;
    while (!socket) {
      try { socket = await connect(); }
      catch (error) {
        if (Date.now() >= deadline) throw new Error('VocaLume did not open its companion pipe: ' + error.message);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }
  const fail = error => { process.stderr.write(String(error.message || error) + '\n'); socket.destroy(); process.exitCode = 1; process.stdin.destroy(); };
  process.stdin.on('data', chunk => {
    try { decode(chunk); } catch (error) { fail(error); }
  });
  const decode = decoder(message => { if (!socket.write(JSON.stringify(message) + '\n')) process.stdin.pause(); });
  socket.on('drain', () => process.stdin.resume());
  process.stdin.on('end', () => socket.end());
  process.stdin.on('error', fail);
  let pending = '';
  socket.setEncoding('utf8');
  socket.on('data', chunk => {
    pending += chunk;
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      const body = Buffer.from(pending.slice(0, end)); pending = pending.slice(end + 1);
      if (body.length > 1048576) return fail(new Error('Native response exceeds browser limit'));
      const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
      if (!process.stdout.write(Buffer.concat([header, body]))) socket.pause();
    }
    if (Buffer.byteLength(pending) > 1048576) fail(new Error('Oversized desktop response'));
  });
  process.stdout.on('drain', () => socket.resume());
  process.stdout.on('error', fail);
  socket.on('error', fail);
  socket.on('close', () => { process.stdin.destroy(); });
}
module.exports = { endpoint, decoder };
if (require.main === module) main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
