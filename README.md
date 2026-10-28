# VocaLume

![VocaLume](docs/brand/VocaLume-logo-hd.png)

**Read, reply, and understand what you hear.** Multilingual live captions, website translation, and translated reply drafts — with local models or your own API.

**讀懂、回覆，也聽懂。** 即時雙語字幕、網站與留言翻譯，可使用本機模型或自己的 API。

[Download 4.6.0 Beta](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.0) · [Installation guide](docs/installation.md) · [繁體中文](docs/README.zh-TW.md) · [Report a problem](https://github.com/clark970417-eng/VocaLume/issues/new/choose)

Latest source builds include **English / 繁體中文** interfaces. Use **Interface language / 介面語言** at the top of the App or extension; the choice is remembered and does not change your translation languages. Published 4.6.0 installers predate this interface-language update.

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

## 繁體中文快速開始

1. 在[下載頁](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.0)選擇適合電腦的安裝檔；Mac M 系列選 `arm64.dmg`，Windows 選 `.exe`。
2. 安裝 App；擴充功能 ZIP 解壓到固定資料夾後，在 `opera://extensions` 或 `chrome://extensions` 開啟開發人員模式並「載入未封裝擴充功能」。Mac 本機字幕需要[一次性連接 App](docs/user-guide.md#連接-mac-app-與-extension)。
3. 選擇聽到的語言、譯文語言與聲音來源，再按「開始」。網站文字翻譯需自行開啟，翻譯留言後也由你確認送出。

新版原始碼／本機版本可在首頁的**介面語言**選擇「繁體中文」或「English」，會記住選擇，且不改變翻譯方向。公開的 4.6.0 安裝檔尚未包含這次介面語言更新。

[完整中文說明](docs/README.zh-TW.md) · [安裝與使用手冊](docs/user-guide.md) · [問題回報](https://github.com/clark970417-eng/VocaLume/issues/new/choose)

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
