# VocaLume

![VocaLume](brand/VocaLume-logo-hd.png)

**讀懂、回覆，也聽懂。** 影片雙語字幕、網站文字與留言翻譯，支援日文、中文、英文等 14 種語言。本機模型為主要選項，也可使用自己的 API。

[下載 4.6.0 Beta](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.0) · [使用手冊](user-guide.md) · [English](../README.md) · [回報問題](https://github.com/clark970417-eng/VocaLume/issues/new/choose)

新版原始碼／本機版本的 App 與 Extension 都可在首頁的**介面語言**選擇「繁體中文」「English」或「跟隨系統」。語言會記住，不影響原文與譯文方向。公開 4.6.0 安裝檔尚未包含這次介面更新。

## 下載哪個檔案？

在下載頁的 **Assets** 找到適合你的版本：

| 電腦 | 安裝檔 |
| --- | --- |
| Mac，Apple M 系列 | `VocaLume-4.6.0-arm64.dmg` |
| Mac，Intel | `VocaLume-4.6.0.dmg` |
| Windows 64 位元 | `VocaLume.Setup.4.6.0.exe` |
| Linux x64（實驗性） | `VocaLume-4.6.0.AppImage` |
| Opera GX / Chrome 擴充功能 | `vocalume-extension.zip` |

目前是**未簽章的公開預覽版**。首次開啟可能出現系統提示，請依[安裝說明](user-guide.md#安裝)操作；下載頁附有檔案校驗值。模型首次使用需要另外下載。

## 三步開始

1. **安裝 App**，完成「快速開始」的模型下載。獨立使用時，在首頁選擇聲音來源、原文與翻譯語言，再按「開始」。
2. **安裝 Extension**：解壓到固定資料夾，在 `opera://extensions` 開啟開發人員模式，按「載入未封裝擴充功能」。Mac 本機字幕還需[連接 App](user-guide.md#連接-mac-app-與-extension)。
3. **開啟影片**，點 VocaLume →「語音字幕」→ 選語言 → 開始。讀貼文與翻譯留言則在「文字翻譯」開啟；不會替你送出留言。

Mac 的本機瀏覽器連接目前支援 Opera GX / Chrome。Windows、Linux 可使用獨立 App，Extension 可選瀏覽器模式；**尚未提供同樣的本機連接安裝流程**。瀏覽器模式需要 WebGPU、模型下載與網路文字翻譯。

## 4.6.0 有什麼不同？

- App 與 Extension 集中常用操作，字幕外觀更容易找到，停止收音按鈕持續可見。
- 可選 Gemini、OpenAI、Claude 等 API 與模型；不使用 API 也可使用本機引擎。
- 改善分段、短句前後文、名字保留、翻譯失敗恢復；單組與四組字幕都保留對應譯文。
- 新增固定日中雙向品質語料、人工審查表與長時間測試流程。[版本詳情](releases/4.6.0.md)

## 需要幫助？

- [安裝、更新、第一次收音與常見問題](user-guide.md)
- [Extension 操作與 API 設定](extension-guide.md)
- [測試結果與尚待驗證項目](quality/README.md) · [版本記錄](../CHANGELOG.md)
- [隱私](legal/privacy.md) · [第三方來源與授權](legal/third-party-notices.md) · [原始碼導覽](development.md)

辨識與翻譯仍可能出錯，尤其是多人重疊、音效、名字與極短句。現有自動檢查不代表已完成雙語人工驗收或所有電腦的實機測試。桌面部分衍生自 [LiveTranslate](https://github.com/rioX432/live-translate)，保留原作者 MIT 授權；模型另有各自授權。
