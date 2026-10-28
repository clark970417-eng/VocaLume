# Idle pages and stale translation results — 2026-10-28

Maintenance update to the 4.6.0 source and local installation. Capture waiting, VAD thresholds and model selection are unchanged.

## Changes

- Social/general-page subtitle status requests back off to ten seconds when capture is inactive. Hidden pages skip status requests, DOM scanning and subtitle rendering. Visibility restoration requests the latest state immediately. Active polling retains its 700 ms cadence, and pushed caption updates bypass idle backoff. A newer push invalidates an older status response.
- Social reading jobs retain the language direction and settings revision that created them. Queued duplicate messages share one job while at least one consumer is still valid. An older job cannot populate the current cache or remove a newer job with the same key. Per-page result caching retains at most 500 recently used translations.
- Desktop streaming results check the language/glossary context revision as well as their session and utterance. Reconfiguration invalidates queued finals and speculative results while preserving the lock held by active recognition. Whole-chunk results and errors are ignored after stop or reconfiguration; stale results do not enter context or the translation cache. Language changes clear prior-language reference history.

## Verification

- 48 focused extension tests passed: social reading, settings changes, duplicate-message ownership, idle/hidden-page behavior, pushed-caption races, controlled editors, caption display and runtime diagnostic contracts.
- 77 focused desktop tests passed: streaming and whole-chunk processing, stale result suppression, settings changes during recognition/translation, translation caching, recognition reuse, sentence preparation and speech tone. Models and network responses were stubbed.
- TypeScript and production-build checks passed. Scoped lint reported zero errors and five existing explicit-`any` test warnings.
- Packaged and installed the Apple Silicon App. Verified packaged runtime bytes against the built output, renderer/VAD assets, portable native-library paths and its local ad-hoc signature. The original icon checksum matches. The App opened in Ready state and its read-only status reported capture inactive. The prior App was retained as a local rollback copy.
- Reloaded the existing Opera GX unpacked extension through its manager. The manager showed Reloaded and the VocaLume enabled toggle remained on. Existing web pages were not reloaded to avoid losing unsent user input.

These tests establish the covered behavior, not real-model accuracy, measured CPU/temperature improvement, or end-to-end speed. No model, paid API, live message submission or long-duration benchmark is used. Existing pages need a normal refresh to receive the updated content script; preserve unsent drafts first.
