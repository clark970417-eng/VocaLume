# VocaLume

![VocaLume](docs/brand/VocaLume-logo-hd.png)

**Read, reply, and understand what you hear.** Multilingual live captions, website translation, and translated reply drafts — with local models or your own API.

[Download 4.6.0 Beta](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.0) · [Installation guide](docs/installation.md) · [繁體中文](docs/README.zh-TW.md) · [Report a problem](https://github.com/clark970417-eng/VocaLume/issues/new/choose)

## Download

Open the release page and choose a file under **Assets**:

| Your computer | Download |
| --- | --- |
| Mac with Apple M-series chip | `VocaLume-4.6.0-arm64.dmg` |
| Mac with Intel processor | `VocaLume-4.6.0.dmg` |
| Windows x64 | `VocaLume.Setup.4.6.0.exe` |
| Linux x64 — experimental | `VocaLume-4.6.0.AppImage` |
| Opera GX / Chrome extension | `vocalume-extension.zip` |

These are **unsigned preview builds**. Follow the installation guide if your operating system displays a warning. Model weights download separately on first use.

## Get started

1. **Install the App** and finish Quick Start. For standalone captions, choose your audio source and languages, then press Start.
2. **Install the extension:** extract its ZIP into a permanent folder, open `opera://extensions` or `chrome://extensions`, enable Developer mode, and select **Load unpacked**. Mac local captions also need the [one-time App connection](docs/installation.md#connect-the-mac-app).
3. **Open a video**, choose the spoken and subtitle languages in VocaLume, and start captions. Enable website translation separately when you want it.

The local browser connection currently supports **macOS Opera GX / Chrome**. Windows and Linux can use the standalone App; browser-only captions require WebGPU and network translation. Their equivalent native connection installer is not included yet.

## What you can do

- Read bilingual captions in single-pair or four-entry mode.
- Translate posts, titles and chats on supported websites.
- Translate your reply, review it, and send it yourself.
- Adjust subtitle size, colors, outline and background.
- Choose Gemini, OpenAI, Claude or a compatible API — optional.

[What's new in 4.6.0](docs/releases/4.6.0.md) · [Detailed controls](docs/extension-guide.md) · [Quality evaluation](docs/quality/README.md)

## Project folders

| Folder | Contents |
| --- | --- |
| [extension](extension/) | Browser extension, native connection and extension tests |
| [desktop-app](desktop-app/) | Desktop App and local translation engines |
| [docs](docs/) | Guides, release notes, quality reports and legal notices |
| [scripts](scripts/) | Release packaging and maintenance tools |

[Development guide](docs/development.md) · [Privacy](docs/legal/privacy.md) · [Third-party notices](docs/legal/third-party-notices.md)

Recognition and translation can still make mistakes, especially with overlapping speech, names and very short phrases. Human quality review and broader device testing remain in progress. The desktop component derives from [LiveTranslate](https://github.com/rioX432/live-translate), with its MIT attribution preserved; model licenses are separate.
