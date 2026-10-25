# Changelog

This file records user-facing changes. Public preview builds use `beta-vX.Y.Z` tags; stable builds use `vX.Y.Z` tags.

## 4.5.3 - 2026-10-25

- Reuse identical recognized audio within a cue and conservatively reuse quiet tails, with context, PCM and speech-evidence guards. Preserve accepted final sentences when optional drafts are throttled.
- Add bounded Japanese recognition vocabulary for personal terms and relevant streamer/game names; keep auto-detection and other source languages unprompted.
- Send short MLX audio in memory with the same PCM16 samples as the previous temporary WAV transport; retain file transport for large inputs.
- Reduce optional draft work under measured memory pressure and expose memory status in extension diagnostics. Preserve existing thermal protection and gradual recovery.
- Keep capture waiting, silence thresholds, model choices and translation settings unchanged. See [measurements, tests and limits](docs/retests/4.5.3.md); reduced processing does not imply a guaranteed end-to-end latency gain.
- Public preview installer assets remain 4.4.5; 4.5.3 is the current source and local installation.

## 4.5.2 - 2026-10-25

- Answer a small allowlist of standalone Japanese replies without local model inference, while respecting cancellation and custom terminology. Ambiguous replies such as `大丈夫` and `やばい`, names, quotations and longer sentences remain on the model path.
- Preserve open meaning in `明日は？`, `それはちょっと…` and isolated `ません`; do not invent a weekday, adjective or missing verb.
- Recover more already-captured Japanese continuations, including colloquial contractions, negative adjective endings and quoted speech. The broader rules require a proven contiguous audio cut; existing bounded context and speaker/language guards remain.
- No additional audio wait, silence threshold, preview interval, second translation pass or model-size change. Longer recovered input still has a small inference cost; see [paired measurements and limits](docs/retests/4.5.2.md).
- Public preview installer assets remain 4.4.5; 4.5.2 is the current source and tested local installation.

## 4.5.1 - 2026-10-25

- Recover adjacent Japanese grammatical continuations from recognized source text before final translation. Examples include `逃げて / しまいました`, `配信する / つもりはありません`, and `勝てるかも / しれません`. Show the recovered clause in the new caption instead of hiding it in model instructions.
- Bound source context to the preceding clause (120 characters). Check capture adjacency and known speaker/language changes; clear it on restart, model/language or glossary changes. Expanded source text participates in translation cache keys.
- Join bare polite verb endings only at an explicitly measured contiguous capture cut. Validate capture positions against the received audio length.
- Allow a recent unfinished clause up to four additional seconds before the mandatory audio cut, with a 12-second maximum. Ordinary short replies keep the existing pause behavior.
- Preserve the open meaning of `それはちょっと…` instead of inventing an adjective such as “exaggerated”.
- Verification and limits: [4.5.1 checks](docs/retests/4.5.1.md). Public preview installer assets remain 4.4.5.

## 4.5.0 - 2026-10-25

- Reuse the final speech transcript only when the cue, PCM prefix and last detected speech position are unchanged and appended audio is quiet. Missing evidence or new speech causes normal recognition.
- Prepare complete HY-MT Japanese/Chinese sentences without displaying a provisional translation. Promote only exact source/language/engine/glossary matches, including the saved SimulMT path; cancel changed or stopped work.
- Require fresh recognition evidence for the shorter 480 ms complete-sentence pause; retain longer guards for hanging clauses. Reserve additional idle time when measured recognition becomes slow.
- Expand the bidirectional game/livestream vocabulary from 78 to 244 pairs. Retain context checks, personal glossary priority and bounded prompt hints. Avoid adding “helping” to thanks for coming.
- Recognize the spoken title ヴァロラント as 特戰英豪. Keep whole greetings out of longer-sentence terminology prompts: they could cause HY-MT 1.5 to translate only the greeting and drop an adjacent clause.
- Add optional speech punctuation/laughter styles to desktop settings and the extension: natural, ww, 笑 and 草. macOS includes a local sound classifier; uncertain, slow or thermally constrained analysis is skipped. Other desktop platforms use explicit transcript markers.
- Add a high-resolution wordmark and retain the original application icon; sharpen the extension header icon.
- Verification: 190 extension tests, 706 desktop tests, type checking, production build and local macOS signature checks. See [measured scope](docs/retests/4.5.0.md) and [tone guide](docs/speech-tone.md).
- Desktop and extension source/local installation are 4.5.0. Public preview installer assets remain 4.4.5; this is not a newly notarized public installer release.

## Extension 4.4.10 - 2026-10-25

- Send desktop speech for translation in shorter cues: seek a 160 ms voice-detection pause after four seconds, preserve early breaths and recognized unfinished clauses, and cap uninterrupted audio at eight seconds instead of twenty. Keep the complete audio in order and retain the desktop engine's preceding translation context.
- Stop merging queued final audio under the newest cue ID. Every source draft now retains its matching final, including after decoder recovery. Four-entry captions use separate cue rows instead of joining an entire uninterrupted monologue.
- Distinguish waiting from failed translations on the overlay. Failed recordings remain available under **Listen → Caption records → Retry failed translations**, and recovered final results can replace an earlier failure. Single-pair captions still wait for the current translation before advancing.
- Extension-only change; compatible with the installed desktop 4.4.8. Public preview installers remain 4.4.5. See [verification](docs/retests/4.4.10-extension.md).

## Extension 4.4.9 - 2026-10-25

- Replace the long popup with four task tabs: Read text, Write replies, Listen to audio and Settings. Keep navigation and save feedback visible while advanced controls scroll.
- Add guided reply steps, clear opt-in/site-access status, one-click language swaps, and an explanation of synchronized reading/writing directions. Preserve the existing 14 languages, preferences and manual text opt-in.
- Put speech start/stop controls above the fold, retain model-loading progress, and keep failed actions visible and retryable. Preserve complete-sentence captions and pending translations after stopping capture.
- Group caption appearance, optional cloud keys and diagnostics under Settings. Label original/translated text colors independently of the selected language; keep outline and background controls separate.
- Add keyboard tab navigation, labeled controls, persistent task selection, and empty transcript guidance. See the [quick guide](docs/extension-guide.md) and [verification](docs/retests/4.4.9-extension.md).
- This is an extension-only update. Desktop remains 4.4.8; public preview installers remain 4.4.5.

## 4.4.8 - 2026-10-25

- Coalesce identical local translation requests. Completed results are reused for five minutes in a bounded, memory-only desktop cache; language direction, model options, writing style, full text and terminology remain part of the key.
- Cancel each waiting caller independently. Shared inference is cancelled only when all callers stop waiting; failed, cancelled and empty results never become cached translations.
- Merge duplicate local requests from browser page text, captions and drafts before sending them to the native bridge.
- Retain existing prompts, models, complete-sentence handling and caption order. Keep website text translation opt-in from 4.4.7.
- See [verification and measured scope](docs/retests/4.4.8.md). This improves repeated/concurrent identical text; it does not claim faster inference for every new sentence.

## Extension 4.4.7 - 2026-10-25

- Website text translation now requires explicit opt-in in the popup, including dedicated social sites. New and existing installations start off until the user chooses to enable it; the choice persists.
- Turning text translation off also hides typing controls, without starting or stopping speech captions.
- Desktop remains 4.4.5. Automated extension checks passed; Opera reload could not be verified because the computer-use service disconnected.

## Extension 4.4.6 - 2026-10-20

- Add dedicated Discord message-body selection. Translate complete multi-line messages below each message instead of channel titles, usernames, role labels or live-region announcements.
- Enable Discord as a dedicated site and show it in the extension's supported-site hint. The selected reading language still controls which messages translate.
- This browser-only patch is compatible with desktop 4.4.5; the desktop app and public 4.4.5 installers are unchanged.

## 4.4.5 - 2026-10-18

### YouTube navigation and recycled translations

- Remove the previous video's translated title when the current title no longer matches the reading language, including Japanese-to-Chinese video navigation.
- Give each translation request ownership of its display line so a late, older result cannot overwrite or remove a newer translation on a recycled node.
- Restore translations when a heading returns after its translation line was removed.
- Handle X draft translation at window capture before document/editor shortcut handlers, avoiding a conflicting Tab handler in the tested profile. IME, modified Tab and unrelated editors retain normal behavior.
- See [verification](docs/retests/4.4.5.md).

## 4.4.4 - 2026-10-18

### Contextual game vocabulary

- Add 78 Japanese / Taiwan Traditional Chinese term pairs: Pokémon names and mechanics, game titles, common shooter vocabulary, VALORANT weapons and agents, and Apex items and characters.
- Translate exact unambiguous names without model inference. Sentences retain negation and other content; they are not replaced by dictionary entries.
- Select at most eight matching, longest-first term hints. Ambiguous terms require the corresponding game's context, and katakana boundaries prevent ダウン from matching ダウンロード.
- Pass contextual hints through local Llama translation modes and configured browser chat-model providers. Plain machine-translation APIs do not accept these sentence hints.
- Preserve explicit terminology supplied in the desktop translation context. Keep existing creator greetings and thermal scheduling.
- See [the vocabulary and sources](docs/game-vocabulary.md) and [verification](docs/retests/4.4.4.md).

## 4.4.3 - 2026-10-18

### Reduce sustained recognition load

- Leave actual idle time after slow rolling recognition instead of immediately starting the next decode when the old start-based interval has elapsed.
- Remove the 2.5-second preview cadence ceiling. Adapt optional recognition to observed service time, thermal state and CPU speed limits on the desktop and browser paths.
- Prioritize accepted final sentences and pause speculative drafts at critical OS pressure. Full source audio and final translation remain in order; optional extra draft recognition and preview diarization pause while warm.
- Recover gradually after cooling, at one step per 30 seconds, rather than immediately restoring full-rate work on a nominal reading.
- Show skipped drafts, cooling recovery and paused previews in extension diagnostics.
- Include all statically imported runtime modules in the beta extension archive and verify that dependency list.
- Keep the same recognition and translation models. See [thermal behavior and limits](docs/thermal-performance.md) and [verification](docs/retests/4.4.3.md).

## 4.4.2 - 2026-10-18

### Creator greetings

- Recognize eight creator-specific Japanese greetings, including こんまほ / konmaho and おつかの / otsukano supplied by the user, with case, width, katakana, elongation and emoji handling.
- Translate standalone greetings without model inference; normalize only an opening greeting in a longer Japanese sentence, retaining its remaining content and names.
- Recognize standalone romanized greetings in Japanese-reading website adapters. Preserve ordinary English, unknown name combinations, questions, quoted expressions, hashtags and handles for normal translation.
- Keep Chinese-to-Japanese writing in standard Japanese rather than inventing a creator catchphrase. Desktop personal terminology overrides the built-in greeting translation.
- Share one catalogue between the extension and local desktop translator. See [the vocabulary and sources](docs/streamer-vocabulary.md).

## 4.4.1 - 2026-10-18

### Faster local written drafts

- Default Chinese-to-Japanese drafts to the caption model so the first reply does not silently load the larger 7B draft model.
- Add a fast / quality model choice in the extension. Quality uses the desktop draft-model preference while idle; active captions keep their model to avoid hardware contention.
- Isolate cached drafts by model choice and writing style, so switching settings takes effect immediately.
- Use VocaLume in native application menus while preserving the existing settings and model directory.
- Include all ordered-caption, native recovery, terminology and original-icon changes from 4.4.0.

## 4.4.0 - 2026-10-18

### Ordered local Japanese / Chinese captions

- Keep recognized source drafts visible while translating completed sentences once on local HY-MT engines.
- Preserve sentence order in single-pair mode, including late translations and out-of-order completion; four-entry mode continues filling matching rows.
- Tolerate short breathing pauses; use recognition punctuation and hanging-clause evidence to choose a longer pause before finalization. This remains a heuristic, not perfect semantic sentence detection.
- Retain completed desktop audio in single-pair mode and adapt preview frequency to measured processing time and OS thermal / CPU speed-limit signals.

### Written translation and native recovery

- Add natural, livestream-viewer and polite Chinese-to-Japanese writing styles in the extension. General writing no longer assumes the reader is a streamer.
- Restrict ambiguous platform terminology to matching contexts and isolate memoized drafts by language pair and writing style.
- Restore Tab translation in X composers, protect edits made during translation and leave submission to the user.
- Recover text requests once after a native-host disconnect and repair stale application launch registrations after a rename or reinstall.
- Recover an inaccessible external Whisper cache into a VocaLume-owned local cache; preserve that working local cache when the external disk returns.
- Package the original blue/green speech-bubble and orange-waveform icon for macOS and Windows.
- Keep all product names and package names as VocaLume. Legacy native identity and storage directories remain compatible with existing profiles.

## 4.3.0 - 2026-09-29

### VocaLume branding

- Renamed the desktop application, browser extensions, release packages, documentation, and GitHub repository to **VocaLume**.
- Kept the existing application ID, storage path, encryption key, native messaging identity, and plugin manifest filename for upgrade compatibility.
- Updated in-app support, privacy, update, and release links to the renamed repository.

## 4.2.2 - 2026-09-22

### Quieter website translation

- Kept automatic translation on YouTube, Twitch, X, TikTok, Bilibili, Facebook, and Instagram.
- Changed all other websites to per-host opt-in from the extension popup.
- Prevented ChatGPT and similar general conversation pages from receiving automatic translation rows under user messages.
- Preserved tab-audio captions on general websites even when page-text translation is off.
- Added a regression test proving a general conversation hostname stays untouched until explicitly enabled.

## 4.2.1 - 2026-09-22

### Website coverage

- Enabled page translation on ordinary HTTP and HTTPS websites.
- Added dedicated Facebook and Instagram rules for titles, comments, chat, and writing editors.
- Preserved specialized YouTube, Twitch, X, TikTok, and Bilibili adapters.
- Added a conservative fallback for semantic titles, chats, comments, replies, and message editors on other websites.
- Added all-frame support so compatible embedded chat and comment surfaces can be translated.

### Safer writing translation

- Kept generated replies as reviewable drafts; the extension never presses a site's submit button.
- Limited the general writing control to fields identified as comments, messages, chat, replies, or posts.
- Excluded search, login, password, email, phone, and URL fields from the general adapter.

### Languages and captions

- Kept independent language choices for page reading, typed replies, and spoken captions.
- Kept the optional synchronized mode that reverses the reading pair for typed replies.
- Retained movable bilingual captions, display modes, transcript history, configurable colors, background, opacity, and fully removable text outline.

### Reliability and packaging

- Aligned the extension and desktop app at version 4.2.1.
- Verified 129 extension tests and 668 desktop tests.
- Passed desktop TypeScript checks, production build, macOS deep signature verification, and an Opera GX start/stop integration run.

### Known limits

- Text drawn into images, video, canvas, or inaccessible closed components is not available to page scripts.
- General website matching is intentionally conservative; unusual custom editors may need a dedicated adapter.
- Public beta packages are unsigned and can trigger operating-system warnings. Follow [BETA-TESTING.md](BETA-TESTING.md).

## 4.2.0 - 2026-09-22

- Added production-style beta packaging for macOS, Windows, Linux, and the Chromium extension.
- Added checksums, provenance metadata, update channels, rollback guidance, and public feedback templates.
- Expanded multilingual caption, translation-engine, TTS, virtual-microphone, and compatibility support.

## 4.1.1 - 2026-09-22

- Added an unsigned cross-platform preview and excluded the unsupported Windows audio backend from Windows packaging.
