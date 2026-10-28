# VocaLume desktop App / 桌面程式

Local-first live captions and translation for macOS, Windows and Linux. This folder contains the desktop source and local translation engines.

提供 macOS、Windows 與 Linux 的本機即時字幕及翻譯；此資料夾包含桌面程式與本機引擎原始碼。

- [Download & quick start / 下載與快速開始](../README.md)
- [中文安裝與使用手冊](../docs/user-guide.md) · [English installation](../docs/installation.md)
- [Development guide / 開發說明](../docs/development.md)

Latest source builds offer **English / 繁體中文** in the language selector at the top of the settings window. The preference is remembered independently of speech/translation languages.

新版原始碼／本機版本可在首頁的「**介面語言**」切換繁體中文、英文或跟隨系統；不影響翻譯語言與模型設定。公開 4.6.0 安裝檔尚未包含此更新。

## Development / 開發

Requires Node.js 22.12+ and platform build tools. See the development guide before building native dependencies.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

Packaging always rebuilds and verifies source/build provenance. Local UI checks use isolated profiles and do not need model downloads.

打包前會重新編譯並驗證來源；介面檢查使用獨立設定，不需要下載模型。

The desktop component derives from [LiveTranslate](https://github.com/rioX432/live-translate). Original MIT attribution is retained in [LICENSE](LICENSE); model licenses are separate.
