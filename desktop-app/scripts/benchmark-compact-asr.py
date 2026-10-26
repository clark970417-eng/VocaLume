"""Alternating, paired local ASR probe; model and audio must already be cached.

Usage: <MLX venv python> scripts/benchmark-compact-asr.py AUDIO_DIR REPORT.json
This measures decoding only, not microphone/browser/caption latency.
"""
import contextlib
import json
import os
from pathlib import Path
import statistics
import sys
import time
import wave

os.environ.setdefault('HF_HOME', str(Path.home() / 'Library/Caches/VocaLume/huggingface'))
os.environ.setdefault('HF_HUB_OFFLINE', '1')
import numpy as np
import mlx_whisper

root, report = map(Path, sys.argv[1:3])
rows = json.loads((root / 'manifest.json').read_text())['audio']
results = []
model = 'mlx-community/whisper-large-v3-turbo'
with contextlib.redirect_stdout(sys.stderr):
    mlx_whisper.transcribe(np.zeros(16000, dtype=np.float32), path_or_hf_repo=model,
                           language='ja', temperature=0, verbose=None, condition_on_previous_text=False)
for i, row in enumerate(rows):
    with wave.open(str(root / (row['id'] + '.wav')), 'rb') as file:
        assert file.getnchannels() == 1 and file.getframerate() == 16000 and file.getsampwidth() == 2
        audio = np.frombuffer(file.readframes(file.getnframes()), dtype='<i2').astype(np.float32) / 32768
    for compact in ([False, True] if i % 2 == 0 else [True, False]):
        options = {'without_timestamps': True} if compact else {}
        start = time.perf_counter()
        with contextlib.redirect_stdout(sys.stderr):
            result = mlx_whisper.transcribe(audio, path_or_hf_repo=model, language=row['from'],
                temperature=0, verbose=None, condition_on_previous_text=False,
                sample_len=min(448, max(48, int(len(audio) / 16000 * 24) + 24)), **options)
        results.append({'id': row['id'], 'compact': compact, 'text': result['text'].strip(),
                        'ms': 1000 * (time.perf_counter() - start), 'segments': len(result['segments'])})
report.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
for compact in [False, True]:
    print(compact, statistics.median(row['ms'] for row in results if row['compact'] == compact))
for i in range(0, len(results), 2):
    before, after = results[i:i + 2]
    if before['text'] != after['text']:
        print('Transcript changed:', before, after)
