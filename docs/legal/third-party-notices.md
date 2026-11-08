# Third-party runtime and design references

The Windows installer includes the Haas-ja-v1.0 Q8_0 GGUF model from Third Intelligence, converted by Sakasegawa, under Apache-2.0. It also includes speech.cpp v0.10.1 by Sakasegawa under MIT. The license texts are installed beside the model and runtime.

- [Haas-ja Q8_0 model and license](https://huggingface.co/sakasegawa/Haas-ja-v1.0-GGUF)
- [speech.cpp runtime license](https://github.com/nyosegawa/speech.cpp/blob/v0.10.1/LICENSE)


The existing bundled Transformers.js / ONNX Runtime code is preserved in whisper-runtime.js. ONNX Runtime Web is Copyright Microsoft Corporation, licensed under MIT. Transformers.js is licensed under Apache-2.0. Embedded notices remain in the bundle.

Design references (no third-party source copied for the new orchestration):
- https://github.com/ufal/whisper_streaming — LocalAgreement inspired the consecutive hypothesis prefix comparison. This implementation compares Japanese characters, not word timestamps, and is not the upstream algorithm verbatim.
- https://github.com/Superactive-AI/inbrowser-ai — dedicated inference worker and speech segmentation.

Silero V5 model is distributed from the pinned npm package `@ricky0123/vad-web@0.0.29`, under `vendor/silero/`. See its bundled LICENSE for Silero MIT and ricky0123 ISC notices. SHA-256: `2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f`. The recurrent ONNX input/output contract follows https://github.com/ricky0123/vad/blob/master/packages/web/src/models/v5.ts . The model is loaded locally; no microphone or cloud audio upload is used.

The local Taiwan Traditional Chinese converter uses the browser module from `opencc-js@1.4.2`. The MIT license and the Apache 2.0 notice for the dictionary data are included under `vendor/opencc/`.

Commercial product pages informed interaction design only. Their private implementation and advertised latency were not independently verified.

## Optional model evaluation and downloads (3.8)

Hy-MT2 7B is downloaded separately from
[Tencent's model repository](https://huggingface.co/tencent/Hy-MT2-7B-GGUF), pinned
to revision `ab8472660ac61fac25f1af43fac2599d52a8a775`. Model weights are not included
in this Git repository or the application archive; consult the model repository
for its applicable license and usage terms.

The recognition evaluation also used
[mlx-qwen3-asr](https://github.com/moona3k/mlx-qwen3-asr) 0.4.0 and
[Qwen3-ASR-0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) in an isolated local
Python environment. These are evaluation dependencies, not a bundled or enabled
production recognition path. See the 3.8 test report for the rejected results.


## Optional Windows acoustic models

Speaker labels use the [3D-Speaker CAM++ checkpoint](https://www.modelscope.cn/models/iic/speech_campplus_sv_zh-cn_16k-common) (Apache-2.0) in [Sherpa ONNX's model format](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models). Laughter detection uses the [Xiaomi CED-Mini checkpoint](https://huggingface.co/mispeech/ced-mini) (Apache-2.0) from the [Sherpa ONNX int8 conversion](https://huggingface.co/k2-fsa/sherpa-onnx-ced-mini-audio-tagging-2024-04-19/tree/4da6df50dc47b25f91074b5ef7df4c1cc0dd7d4d), with class names from [Google AudioSet](https://research.google.com/audioset/). These assets are downloaded only when the corresponding setting is enabled. The app verifies the SHA-256 digest of each download.

## VocaLume original material

Clark-owned VocaLume contributions are covered by the root [VocaLume Noncommercial License](../../LICENSE). The MIT file in `desktop-app/LICENSE` is a retained upstream notice, not a license replacement for all VocaLume contributions. All third-party permissions below remain unchanged. Prior grants are not revoked.
