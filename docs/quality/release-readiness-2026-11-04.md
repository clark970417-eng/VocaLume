# VocaLume 4.6.3 public beta release check — 2026-11-04

## Result

The checked distribution is suitable for a **public beta**, with the limitations below disclosed. This is not a claim of universal website compatibility or measured translation accuracy on every device.

## Verified in this check

- Desktop automated tests: **858/858**, 88 files, one worker; no translation models loaded.
- Extension automated tests: **296/296**. These cover editor/draft updates, bounded translation recovery, caption queues and platform fixtures; they do not send real messages.
- Desktop TypeScript checks passed. Full npm audit: **0 known vulnerabilities** at check time.
- Packaging compatibility smoke passed: ASAR, builder patterns, FileList/EJS, universal import and temp cleanup.
- Version agreement: App, lockfile and Extension **4.6.3**.
- Release build workflow passed for macOS arm64/x64, Windows x64, Linux x64 and Extension: https://github.com/clark970417-eng/VocaLume/actions/runs/41846705856 . Build success is not physical-device verification.
- GitHub asset digests matched all **8** entries in SHA256SUMS.txt. Anonymous partial-download requests succeeded for both Mac DMGs, Windows installer, Linux AppImage and Extension ZIP.
- Live website: all five language pages refer to the 4.6.3 GitHub release; seven shared images/scripts/styles/video resources return successfully. Browser UI inspection confirmed current download link, reply example and language menu. Existing already-open tabs needed refresh to show the new version.
- GitHub release starts with installation/download instructions; detailed documentation links resolve locally. Fixed remaining current-user-guide and README references to 4.6.2. The older tutorial video intentionally retains its 4.6.2 asset URL and explains the older demonstrated UI.
- Native installer help command succeeded without changing browser registration.
- Copyright terms and upstream MIT notices remain distinct.

## Not newly verified / limitations

- No models, live audio capture, paid APIs, long thermal soak, physical Windows/Linux session or real external message sending were run in this check. Translation success/accuracy and latency are not newly measured.
- `/Applications/VocaLume.app` reports **4.6.0**. The local installed App was not replaced or used as evidence for 4.6.3 runtime behavior.
- macOS browser native connection needs the documented one-time setup. Windows/Linux standalone installers do not imply the same browser native-host support.
- Installers are unsigned/public beta. Linux remains experimental. First use needs model downloads and suitable resources.
- Release 4.6.3 embedded documentation reflects its tagged build; online guides contain the later version-link corrections. Existing release binaries were not silently replaced.
