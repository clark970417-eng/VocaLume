# English and Traditional Chinese interfaces

[Home](../../README.md) · [中文手冊](../user-guide.md)

The desktop App and extension popup now have a visible **Interface language / 介面語言** selector: English, Traditional Chinese, or the first supported system preference. The choice persists independently in each App/browser profile. Changing it does not restart capture, invoke a translation model, or change source/target language selections.

Desktop interface copy covers navigation, settings, onboarding, accessible labels, help text and common status/error messages. Product/model/device names and third-party error details may retain their original spelling. The extension retains its Chinese interface and can switch its popup copy to English. Translation content, caption previews, draft text, API field values and personal terminology are not interface copy.

The root README now includes visible Chinese quick-start instructions alongside English and links to the full Chinese guide. The desktop README points to the current VocaLume guides. Public 4.6.0 release assets were not republished; those installers predate this change, as noted in the README.

## Checks

| Check | Result |
| --- | --- |
| Desktop unit tests | 855 passed |
| Extension tests | 294 passed, including five language-contract tests |
| Existing desktop interface checks | 16 passed; one opt-in audio check skipped |
| New language interface checks | Three passed, then rerun successfully against the final build |
| Type checking / lint | Passed; lint retains 16 pre-existing warnings, no errors |
| Production build | Passed; source/build provenance verified |
| Apple Silicon package | Runtime, source/build hashes, assets, portable native addon and deep ad-hoc signature verified |

The language tests exercise English→Chinese→English, all four desktop sections, first-run language selection before model download, persistence after reload, and preservation of unsaved language choices, dummy API inputs and original caption previews. The extension browser test locally fulfills all resources and makes no real provider requests.

The installed App was rebuilt and its Chinese interface was observed on the user's Mac. Opera GX's existing root-loaded extension was reloaded without changing its extension ID or permissions. Its interface-language choice is checked through the installed popup. One previous rollback App and the original product icon are retained.

This is interface regression evidence. No speech benchmark, long capture session, paid API request or social message was part of this UI update. The prior speech-quality limitations remain unchanged.
