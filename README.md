# VocaLume

![VocaLume](docs/brand/VocaLume-logo-hd.png)

**Free local translation for streams and conversations.** Read bilingual captions, understand chats, and turn your reply into another language before sending it yourself.

**免費在自己的電腦翻譯直播與聊天。** 看雙語字幕、讀懂聊天室，打中文也能翻成日文再回覆。

[Website & video demos](https://vocalume.vercel.app/) · [繁體中文說明](docs/README.zh-TW.md) · [Latest download](https://github.com/clark970417-eng/VocaLume/releases/latest)

## Download

Click the link for your computer. You do not need the **Source code** files.

| Your computer | Installer |
| --- | --- |
| Windows x64 | [Download](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.0/VocaLume.Setup.4.6.0.exe) |
| Mac · Apple Silicon (M1–M5) | [Download](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.0/VocaLume-4.6.0-arm64.dmg) |
| Mac · Intel | [Download](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.0/VocaLume-4.6.0.dmg) |
| Linux x64 · experimental | [Download](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.0/VocaLume-4.6.0.AppImage) |
| Opera GX / Chrome extension | [Download](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.0/vocalume-extension.zip) |

Not sure which Mac you have? Open ** → About This Mac** and check the chip or processor.

## Start in three steps

1. **Install the app and download its models.** Choose the audio source, spoken language, and translation language.
2. **For website features, install the extension too.** Extract the ZIP to a permanent folder. In `opera://extensions` or `chrome://extensions`, turn on Developer mode and choose **Load unpacked**. Keep that folder.
3. **Start captions or translate a draft.** Play a video and start voice captions, or enable text translation on a supported website. Review translated replies and send them yourself.

[Step-by-step installation & troubleshooting](docs/installation.md) · [中文使用手冊](docs/user-guide.md)

## What can it do?

- **Listen:** bilingual captions, with one or four caption groups.
- **Read:** translate posts, titles, and chat on supported sites.
- **Reply:** translate your draft without repeatedly copying it into another app.
- **Customize:** choose language pairs, caption fonts, colors, outlines, and backgrounds.
- **Choose an engine:** local models, or your own optional Gemini, OpenAI, Claude, or compatible API.

## Before you try it

- **Local mode is free and needs no paid API.** Models download on first use. Speed depends on your computer and its workload; optional external APIs have their own charges.
- **This is a public beta.** Recognition and translation can fail or be inaccurate. Check important content against the original.
- **macOS and Windows desktop apps are available; Linux is experimental.** The local browser connection currently supports macOS Opera GX / Chrome and requires [one-time setup](docs/installation.md#connect-the-mac-app). Windows/Linux can use the standalone app. Browser-only captions need WebGPU and network translation; an equivalent native connection installer is not included yet.
- **Installers are unsigned previews.** Follow the installation guide if your system displays a warning.
- **Interface languages:** current source/local builds offer English and Traditional Chinese. Published 4.6.0 installers predate that interface update. Website language choices are separate from app and translation languages.

## Help shape the next version

[Report a problem or suggest a feature](https://github.com/clark970417-eng/VocaLume/issues/new). Include your system and what happened; never share passwords or API keys. Star the repository to save it, or use **Watch → Custom → Releases** for release notifications.

<details>
<summary>For developers: project files, tests, and credits</summary>

| Folder | Contents |
| --- | --- |
| [extension](extension/) | Browser extension and native connection |
| [desktop-app](desktop-app/) | Desktop app and local engines |
| [docs](docs/) | Guides, release notes, quality reports, legal notices |
| [scripts](scripts/) | Packaging and maintenance |

[Development](docs/development.md) · [Quality results & limitations](docs/quality/README.md) · [4.6.0 changes](docs/releases/4.6.0.md) · [Privacy](docs/legal/privacy.md) · [Third-party notices](docs/legal/third-party-notices.md)

Automated checks are not equivalent to bilingual human review or testing on every device. Desktop components derive in part from [LiveTranslate](https://github.com/rioX432/live-translate), retaining its MIT license. Models have separate licenses.

</details>
