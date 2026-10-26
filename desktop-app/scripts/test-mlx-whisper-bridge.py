"""Transport parity checks without loading or downloading a recognition model."""
import base64
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
import wave
from contextlib import redirect_stdout
from unittest.mock import patch

import numpy as np

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).resolve().parents[1] / 'resources/mlx-whisper-bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class AudioTransportTest(unittest.TestCase):
    def setUp(self):
        bridge.whisper_model = 'test-model'
        self.calls = []
        def transcribe(audio, **options):
            self.calls.append((audio.copy(), options))
            return {'text': 'まだ押さないで。', 'language': 'ja'}
        self.module = patch.dict(sys.modules, {'mlx_whisper': types.SimpleNamespace(transcribe=transcribe)})
        self.module.start()
        self.addCleanup(self.module.stop)

    def request(self, **kwargs):
        output = io.StringIO()
        with redirect_stdout(output):
            bridge.transcribe(**kwargs)
        return json.loads(output.getvalue())

    def test_inline_and_wav_are_sample_identical(self):
        pcm = np.array([-32767, -2, 0, 2, 32767] * 4000, dtype='<i2').tobytes()
        with tempfile.NamedTemporaryFile(suffix='.wav') as audio_file:
            with wave.open(audio_file.name, 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(pcm)
            legacy = self.request(audio_path=audio_file.name, language='ja')
            inline = self.request(audio_pcm16=base64.b64encode(pcm).decode(), language='ja')
        self.assertEqual(legacy, inline)
        np.testing.assert_array_equal(self.calls[0][0], self.calls[1][0])
        self.assertEqual(self.calls[0][1], self.calls[1][1])

    def test_invalid_payloads_never_reach_model(self):
        for payload in ['!', base64.b64encode(b'x').decode(), 'A' * 853340, 123]:
            with self.subTest(payload_type=type(payload)):
                self.assertIn('error', self.request(audio_pcm16=payload))
        self.assertEqual(self.calls, [])

    def test_invalid_rates_never_reach_model(self):
        for rate in [0, -1, 192001, 16000.5, True]:
            self.assertIn('error', self.request(audio_pcm16='AAAAAA==', sample_rate=rate))
        self.assertEqual(self.calls, [])

    def test_empty_or_silent_payload_does_not_infer(self):
        for rate in [16000, 48000]:
            for payload in ['', 'AAAAAA==']:
                self.assertEqual(self.request(audio_pcm16=payload, sample_rate=rate)['text'], '')
        self.assertEqual(self.calls, [])

    def test_vocabulary_only_applies_to_explicit_japanese(self):
        audio = base64.b64encode(np.array([1000] * 16000, dtype='<i2').tobytes()).decode()
        for language in ['ja', 'en', None]:
            self.request(audio_pcm16=audio, language=language, initial_prompt='鹿乃まほろ')
        self.assertEqual(self.calls[0][1]['initial_prompt'], '鹿乃まほろ')
        self.assertNotIn('initial_prompt', self.calls[1][1])
        self.assertNotIn('initial_prompt', self.calls[2][1])
        self.assertFalse(self.calls[0][1]['condition_on_previous_text'])

    def test_compact_decoding_is_bounded_by_audio_length_and_language(self):
        for language, seconds, compact in [('ja', 12, True), ('zh', 2, True),
                                           ('ja', 13, False), ('en', 2, False), (None, 2, False)]:
            audio = base64.b64encode(np.full(seconds * 16000, 1000, dtype='<i2').tobytes()).decode()
            self.request(audio_pcm16=audio, language=language)
            self.assertEqual(self.calls[-1][1]['without_timestamps'], compact)


if __name__ == '__main__':
    unittest.main()
