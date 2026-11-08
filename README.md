# VocaLume

![VocaLume](docs/brand/VocaLume-logo-hd.png)

**Free local translation for streams and conversations.** Read bilingual captions, understand chats, and turn your reply into another language before sending it yourself.

**免費在自己的電腦翻譯直播與聊天。** 看雙語字幕、讀懂聊天室，打中文也能翻成日文再回覆。

[Website & video demos](https://vocalume.vercel.app/) · [繁體中文說明](docs/README.zh-TW.md) · [4.6.6 beta downloads](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.6)

[简体中文](docs/README.zh-CN.md)

## Download

Click the link for your computer. You do not need the **Source code** files.

| Your computer | Installer |
| --- | --- |
| Windows x64 | [Download](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/VocaLume.Setup.4.6.6.exe) |
| Mac · Apple Silicon (M1–M5) | [Download](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/VocaLume-4.6.6-arm64.dmg) |
| Mac · Intel | [Download](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/VocaLume-4.6.6.dmg) |
| Linux x64 · experimental | [Download](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/VocaLume-4.6.6.AppImage) |
| Opera GX / Chrome extension | [Download](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.6/vocalume-extension.zip) |

Not sure which Mac you have? Open ** → About This Mac** and check the chip or processor.

**4.6.6 beta** installers and the extension are linked above. [Release notes](docs/releases/4.6.6.md)

## Start in three steps

1. **Install the app and download its models.** Choose the audio source, spoken language, and translation language.
2. **For website features, install the extension too.** Extract the ZIP to a permanent folder. In Chrome, open `chrome://extensions`; in Opera GX, open `opera://extensions`. Then turn on Developer mode and choose **Load unpacked**. Keep that folder.
   Local browser captions need a one-time [Mac app connection](docs/installation.md#connect-the-mac-app). On Windows, [local browser captions require the separate preview packages](docs/installation.md#connect-the-windows-app). The public 4.6.6 extension still supports text translation on Windows. Linux can use the standalone app or browser-only mode.
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
- **macOS and Windows desktop apps are available; Linux is experimental.** The Mac browser connection has been tested with Chrome and Opera GX. On Windows, the local connection has been tested with Chrome and Edge. See the [Windows acceptance report](docs/reports/windows-acceptance-2026-11-06.md) for the coverage. Browser-only captions need WebGPU and network translation.
- **Installers are unsigned previews.** Follow the installation guide if your system displays a warning.
- **Interface languages:** 4.6.6 app and extension downloads offer English, Traditional Chinese and Simplified Chinese. Japanese and Korean interface options are available when building from the current source. Website and translation languages are separate settings.

## Help shape the next version

[Report a problem or suggest a feature](https://github.com/clark970417-eng/VocaLume/issues/new). Include your system and what happened; never share passwords or API keys. 

### Save the project and get release notifications ⭐

1. Open the [GitHub project](https://github.com/clark970417-eng/VocaLume) and sign in, or [create a free account](https://github.com/signup). Downloads do not require an account.
2. Click **Star ☆** near the top of the repository. **Starred ★** means it is saved. Mobile placement may differ.
3. To subscribe to new releases, choose **Watch → Custom → Releases → Apply**. If it already says Watching, open that menu to adjust your subscription.
4. Bookmark the [release list](https://github.com/clark970417-eng/VocaLume/releases) to check versions and download updates.

A Star saves the repository; it does not subscribe you to releases or update the app automatically. GitHub delivers notifications according to your account settings. Stop capture before installing an update.

<details>
<summary>For developers: project files, tests, and credits</summary>

| Folder | Contents |
| --- | --- |
| [extension](extension/) | Browser extension and native connection |
| [desktop-app](desktop-app/) | Desktop app and local engines |
| [website](website/) | Multilingual product website and installation pages |
| [docs](docs/) | Guides, release notes, quality reports, legal notices |
| [scripts](scripts/) | Packaging and maintenance |

[Development](docs/development.md) · [Quality results & limitations](docs/quality/README.md) · [4.6.6 changes](docs/releases/4.6.6.md) · [Privacy](docs/legal/privacy.md) · [Third-party notices](docs/legal/third-party-notices.md)

Automated checks are not equivalent to bilingual human review or testing on every device. Desktop components derive in part from [LiveTranslate](https://github.com/rioX432/live-translate), retaining its MIT license. Models have separate licenses.

Windows preview builds and testing: [實機調查與效能報告](docs/reports/windows-validation-2026-11-06.md) · [修補版建置與 extension 連接](docs/windows-repair.md).

</details>


## Copyright / 版權與使用

Free for noncommercial use. Commercial use and resale require permission. Derivative versions must credit VocaLume in their README and About interface. Third-party licenses remain unchanged.

原創部分免費供非商業使用；商用與轉售需事先取得書面同意。衍生版本須在 README 與關於介面註明來源。第三方原授權保留，舊版已授予的權利不受影響。詳見 [LICENSE](https://github.com/clark970417-eng/VocaLume/blob/main/LICENSE)。
