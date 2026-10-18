# Changelog

This file records user-facing changes. Public preview builds use `beta-vX.Y.Z` tags; stable builds use `vX.Y.Z` tags.

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
