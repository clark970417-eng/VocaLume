"""Native messaging transport only. Inference runs in the full Electron app."""
import json
import os
import socket
import struct
import subprocess
import sys
import time
import threading
from pathlib import Path
try:
    from opencc import OpenCC
except ImportError:
    # The Electron pipeline already emits Traditional Chinese. Native messaging
    # transport must still start when the system Python has no optional OpenCC.
    OpenCC = None

SUPPORT = Path.home() / 'Library/Application Support/JapaneseLiveCaption'

def desktop_frame(message, payload):
    # Chromium native messaging already supplies compact JSON. Avoid copying
    # large PCM base64 strings through another JSON serialization on every cue.
    if message.get('op') == 'decode' and payload.isascii() and b'\n' not in payload:
        return payload + b'\n'
    return json.dumps(message).encode() + b'\n'

def app_executable():
    """Recover a stale registration after an app rename or reinstall."""
    candidates = []
    try:
        candidates.append(Path(json.loads((SUPPORT / 'app.json').read_text())['executable']))
    except (OSError, ValueError, KeyError, TypeError):
        pass
    for folder in [Path('/Applications'), Path.home() / 'Applications']:
        candidates.append(folder / 'VocaLume.app/Contents/MacOS/VocaLume')
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError('VocaLume app was moved or removed. Install VocaLume in Applications and open it once.')

def main():
    language_only = '--ui-language' in sys.argv[1:]
    traditional = OpenCC('s2twp') if OpenCC and not language_only else None
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    path = str(SUPPORT / ('ui.sock' if language_only else 'desktop.sock'))
    try:
        connection.connect(path)
    except OSError:
        if language_only:
            connection.close()
            raise RuntimeError('VocaLume language connection is unavailable') from None
        executable = app_executable()
        with (SUPPORT / 'app.log').open('ab') as log:
            subprocess.Popen([executable, '--jtl-companion'], stdin=subprocess.DEVNULL,
                             stdout=log, stderr=log, start_new_session=True)
        deadline = time.monotonic() + 30
        while True:
            try:
                connection.connect(path)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Desktop app did not start; inspect app.log')
                time.sleep(.2)
    output = sys.stdout.buffer
    directions = {}
    frame_limit = 8192 if language_only else 2_000_000

    def read_exact(size):
        if not language_only:
            return sys.stdin.buffer.read(size)
        # The browser may still have stdin open when the app closes its socket.
        # Avoid locking a Python buffered stream on the daemon reader thread.
        data = bytearray()
        while len(data) < size:
            chunk = os.read(0, size - len(data))
            if not chunk:
                break
            data.extend(chunk)
        return data

    def requests():
        try:
            while True:
                header = read_exact(4)
                if not header:
                    break
                if len(header) != 4:
                    raise ValueError('Truncated native header')
                size = struct.unpack('<I', header)[0]
                if size > frame_limit:
                    raise ValueError('Native request too large')
                payload = read_exact(size)
                if len(payload) != size:
                    raise ValueError('Truncated native request')
                message = json.loads(payload)
                if language_only:
                    if message.get('op') not in ('watch-ui-language', 'set-ui-language'):
                        raise ValueError('Unsupported language operation')
                else:
                    directions[message['id']] = message.get('direction', 'ja-zh')
                connection.sendall(desktop_frame(message, payload))
        finally:
            try:
                connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
    threading.Thread(target=requests, daemon=True).start()
    try:
        with connection.makefile('rb') as stream:
            while True:
                line = stream.readline(frame_limit + 1)
                if not line:
                    break
                if len(line) > frame_limit:
                    raise ValueError('Desktop response too large')
                reply = json.loads(line)
                result = reply.get('result')
                if not language_only and isinstance(result, dict):
                    if isinstance(result.get('translated'), str):
                        result['translated'] = traditional.convert(result['translated']) if traditional else result['translated']
                    if not reply.get('event') and directions.get(reply.get('id')) == 'ja-zh' and isinstance(result.get('text'), str) and 'translated' not in result:
                        result['text'] = traditional.convert(result['text']) if traditional else result['text']
                if not reply.get('event'):
                    directions.pop(reply.get('id'), None)
                data = json.dumps(reply, ensure_ascii=False).encode()
                output.write(struct.pack('<I', len(data)) + data)
                output.flush()
    finally:
        connection.close()

if __name__ == '__main__':
    main()
