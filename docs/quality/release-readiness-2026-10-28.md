# Release-readiness assessment — October 28, 2026

[Home](../../README.md) · [Quality procedure](README.md) · [Earlier interrupted soak](4.6.0.md)

**Local App and extension checks passed within the scope below. This is not completed commercial qualification or proof that every platform delivers messages correctly. No social message was sent.** The version remains 4.6.0; existing public release assets are not replaced by this assessment.

## Software and package checks

| Check | Result |
| --- | --- |
| Desktop regression tests | 855 passed across 88 files |
| Extension regression tests | 289 passed |
| Native relay / MLX bridge checks | 5 / 6 passed |
| Desktop UI | 16 passed; one opt-in audio test skipped |
| Isolated social-composer browser checks | 22 passed |
| Type checking | Passed without modifying production output |
| Lint | No errors; 16 existing warnings (unused variables and explicit-any) |
| Installed Apple Silicon package | Source/build hashes, renderer assets, runtime, portable native addon and deep ad-hoc signature verified |

Packaging previously allowed an older compiled output to be installed after source changes. The build now records source and output hashes; packaging rejects stale/missing records, tampering and development artifacts. Type checking no longer emits test/declaration files into production output. The installed App was rebuilt from the updated source and opened successfully with the original icon.

## Social draft coverage

The isolated browser suite loads the production content scripts and styles into locally fulfilled pages. It checks both the button and Tab shortcut, multiline text and emoji, the editor-owned value captured by a fixture submit action, no automatic submission, and separation from Send controls.

| Platform adapter | Button + Tab | Submitted fixture value |
| --- | --- | --- |
| YouTube | Passed | Japanese draft |
| X | Passed | Japanese draft |
| Discord | Passed | Japanese draft |
| Twitch | Passed | Japanese draft |
| Facebook | Passed | Japanese draft |
| Instagram | Passed | Japanese draft |
| TikTok | Passed | Japanese draft |
| Bilibili | Passed | Japanese draft |

Four additional active-IME checks and two rejected-editor recovery checks passed. A rejected replacement leaves a copyable draft and an explicit status instead of pretending the site's submission state changed.

These are controlled DOM/editor models in an isolated Chrome instance, without account cookies or real network submissions. They do not establish compatibility with every current logged-in editor variant, mobile site, native social App, or server delivery. Real recipients were not authorized, so delivery was not tested.

## Real-model evidence

The frozen authored corpus completed 28 audio, 28 text and eight context cases on an Apple M5 with 16 GB RAM, using MLX Whisper large-v3-turbo and HY-MT1.5 1.8B Q4_K_M. There were no blank outputs or recorded pipeline errors. Audio and text used separately initialized translation passes; timing excludes live capture, VAD and display.

The baseline automatic meaning checks flagged three audio cases and two text cases. These are review signals, not an accuracy percentage. One flag was an acceptable Japanese synonym for “do not fire”; another exposed a real contraction mistranslation. A name-recognition error required explicit personal vocabulary.

- `それ取っといて。まだ使わないから。` previously became “leave it alone / have not used it.” After conservative written-contraction expansion, the focused output was `請把它留著吧。反正我還沒有使用它的需求呢。`.
- `写真を撮っといて。後で見たいから。` produced `請先拍下照片吧。我之後會再去看的。` in the focused check.
- The same Chinese name audio was recognized as `陆乃` without a hint and as `鹿乃` with the explicit personal term `鹿乃`. This does not guarantee unknown names or justify automatically guessing their spelling.
- **Known semantic limitation:** `今は放っといて。一人にして。` still produced `現在就讓它保持原狀吧。獨自一人就好。`, losing the implied “leave me alone.” A fluent output can still be wrong. The ticket variant also needs human review for the nuance of keeping something for later.

Focused text calls took approximately 206–276 ms; these are individual observations, not a controlled before/after speed improvement. No capture waiting or silence threshold was increased. The full baseline was not rerun after the focused fixes, so no new full-corpus pass claim is made.

Sanitized authored outputs and hashes: [baseline](2026-10-28/evaluation.json), [focused checks](2026-10-28/focused.json). They contain no account credentials, private messages or local profile paths.

## Actual Opera GX capture

The reloaded installed extension and newly compiled installed App completed the four-group capture fixture through the desktop route. Both Japanese clauses received Chinese translations, including the adjacent “fish escaped” clause. Two completed groups remained visible and capture stopped normally. One playback does not test four-group rotation under a long session.

Single-group capture also completed: seven visible updates included both Chinese translations; captions cleared afterward, with the observed hide time 84 ms after the declared deadline. Both tests stopped capture and restored the extension's previous language/display preferences. The App retained Auto-detect → English and its original microphone selection, with “Engine ready” shown afterward.

The installed package was verified again after installation: 7,092 archive entries, matching source/build/runtime, required renderer assets, a portable native addon and a valid deep ad-hoc signature. This is not notarization. The temporary pre-install copy was removed after these checks; one existing rollback App was retained.

## Remaining qualification work

- Independent bilingual review, including implicit subjects, names, tense and negation.
- Current logged-in platform editor variants and actual delivery to an explicitly approved recipient.
- A completed 1–2 hour varied-content capture session; the earlier 46-minute interrupted test remains incomplete.
- Physical 8 GB / Intel Macs and representative Windows hardware. CI builds do not replace these.
- Real provider account/quota checks where needed; no paid Gemini request was made.
- Developer ID / notarization and Windows signing. A local ad-hoc signature is not a commercial distribution signature.

These gaps prevent a claim that all features, translation accuracy or commercial release quality have been fully validated.
