#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
runtime=https://github.com/nyosegawa/speech.cpp/releases/download/v0.10.1/speech-0.10.1-macos-arm64-metal.zip
model=https://huggingface.co/sakasegawa/Haas-ja-v1.0-GGUF/resolve/6b965d5007ba780585de51549d57a8c1c0d67c7e
curl -fLsS --retry 3 "$runtime" -o "$stage/runtime.zip"
curl -fLsS --retry 3 "$model/Haas-616M-ja-v1.0-Q8_0.gguf" -o "$stage/haas-q8.gguf"
(
  cd "$stage"
  shasum -a 256 -c <<'SUMS'
ff24f6f58c9d2dedb01caa88ba043ae845c76eff228e4cbfae5de749174404c1  runtime.zip
cd5f60b2f1c411404b83fca4a65e3ce30a26d9e951b6a346529e65f22758afeb  haas-q8.gguf
SUMS
  unzip -q runtime.zip speech libspeech.4.dylib
)
curl -fLsS --retry 3 "$model/LICENSE" -o "$stage/Haas-ja-LICENSE.txt"
curl -fLsS --retry 3 https://raw.githubusercontent.com/nyosegawa/speech.cpp/v0.10.1/LICENSE -o "$stage/speech.cpp-LICENSE.txt"
dest=resources/haas-ja-arm64
mkdir -p "$dest"
install -m 755 "$stage/speech" "$stage/libspeech.4.dylib" "$dest/"
install -m 644 "$stage/haas-q8.gguf" "$stage/"*LICENSE.txt "$dest/"
