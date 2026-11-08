#!/usr/bin/env bash
set -euo pipefail
resource="$1/Contents/Resources/haas-ja"
test -x "$resource/speech"
test -f "$resource/libspeech.4.dylib"
test -s "$resource/Haas-ja-LICENSE.txt"
test -s "$resource/speech.cpp-LICENSE.txt"
test "$(lipo -archs "$resource/speech")" = arm64
test "$(shasum -a 256 "$resource/haas-q8.gguf" | cut -d ' ' -f 1)" = cd5f60b2f1c411404b83fca4a65e3ce30a26d9e951b6a346529e65f22758afeb
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
HOME="$scratch" "$resource/speech" asr "$resource/haas-q8.gguf" --device cpu --format text ../extension/tests/japanese-fixture.wav > "$scratch/transcript"
LC_ALL=en_US.UTF-8 grep -Eq '[ぁ-んァ-ン一-龯]' "$scratch/transcript"
