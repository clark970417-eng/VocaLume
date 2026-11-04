# VocaLume

![VocaLume](brand/VocaLume-logo-hd.png)

**免費看直播雙語字幕，也能打中文、翻成日文再回覆。**

為想看懂外語直播、跟不同語言的朋友聊天的人製作。語音、閱讀和打字可分別選擇翻譯語言，不只限於日文。

[網站與影片示範](https://vocalume.vercel.app/) · [最新下載頁](https://github.com/clark970417-eng/VocaLume/releases/latest) · [English](../README.md)

[简体中文](README.zh-CN.md)

## 先下載適合電腦的版本

直接點連結即可，不必找 GitHub 的檔案列表。**Source code 是原始碼，不是安裝程式。**

| 你的電腦 | 下載 |
| --- | --- |
| Windows x64 | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.0/VocaLume.Setup.4.6.0.exe) |
| Mac · Apple Silicon (M1–M5) | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.1/VocaLume-4.6.1-arm64.dmg) |
| Mac · Intel | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.0/VocaLume-4.6.0.dmg) |
| Linux x64 · 實驗性 | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.0/VocaLume-4.6.0.AppImage) |
| Opera GX / Chrome 擴充功能 | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.1/vocalume-extension.zip) |

目前 Mac Apple 晶片版與擴充功能提供 **4.6.1 預覽版**；其他平台仍為 **4.6.0**，尚未包含全部最新修正。

不知道 Mac 是哪種？點 ** → 關於這台 Mac**，查看「晶片」或「處理器」。

## 三步開始使用

1. **安裝 App、下載模型：** 選擇聲音來源、聽到的語言，以及要翻譯成的語言。
2. **要在網站用，也裝擴充功能：** ZIP 解壓到固定資料夾，Chrome 開啟 `chrome://extensions`；Opera GX 開啟 `opera://extensions`，然後開啟「開發人員模式」，選「載入未封裝擴充功能」。**這個資料夾不能刪除。**
   **Mac 本機網頁字幕還需完成[一次性連接 App](user-guide.md#連接-mac-app-與-extension)。** 只下載、安裝兩個檔案還不夠；Windows／Linux 目前請用獨立 App 進行本機翻譯。
3. **開始看字幕或回覆：** 播放影片並開始語音字幕；網站文字翻譯可自行開啟。回覆時先翻譯、確認內容，再自行送出。

[完整安裝、更新與疑難排解](user-guide.md)

## 可以拿來做什麼？

- **聽懂直播：** 顯示雙語字幕，可選單組或四組。
- **讀懂文字：** 翻譯支援網站的貼文、標題和聊天室。
- **方便回覆：** 先用熟悉的語言打字，再翻成對方的語言，不必一直切出去複製貼上。
- **調成喜歡的樣子：** 選擇語言方向、字幕大小、顏色、外框與背景。
- **自行選擇引擎：** 使用本機模型，或選填自己的 Gemini、OpenAI、Claude 等 API。

## 使用前知道這幾件事就好

- **本機模式免費，不需要付費 API。** 首次需下載模型，速度依電腦效能與負載而異；選用外部 API 則依服務商收費。
- **目前是公開測試版。** 辨識與翻譯可能失敗或翻錯，重要內容請對照原文。
- **提供 Mac、Windows App；Linux 為實驗性。** Mac 本機瀏覽器字幕支援 Opera GX／Chrome，需要[一次性連接 App](user-guide.md#連接-mac-app-與-extension)。Windows／Linux 可使用獨立 App；瀏覽器模式需要 WebGPU 與網路文字翻譯，目前沒有同樣的本機連接安裝流程。
- **安裝檔尚未簽章／公證。** 遇到系統提示請參考使用手冊。
- **中文介面：** 4.6.1 Apple 晶片版與擴充功能提供繁體中文、簡體中文與英文介面；其他 4.6.0 安裝檔尚未包含此更新。網站介面語言與 App、翻譯語言是不同設定。

## 一起讓它更好用

遇到問題或想要的新功能，歡迎[留下回饋](https://github.com/clark970417-eng/VocaLume/issues/new)。附上系統、操作情況與不含個資的截圖即可，**不要提供密碼或 API 金鑰**。

## 收藏專案，追蹤最新版本 ⭐

1. 打開 [VocaLume GitHub 首頁](https://github.com/clark970417-eng/VocaLume)，登入 GitHub；沒有帳號可先[免費註冊](https://github.com/signup)。**下載不需要帳號。**
2. 在專案頁右上方按 **Star ☆**；變成 **Starred ★** 就代表收藏成功。手機版的位置可能不同。
3. **想收到新版通知：** 在同一頁按 **Watch → Custom → 勾選 Releases → Apply**。若已顯示 Watching，可開啟該選單調整通知。
4. 之後也能直接打開 [最新版本下載頁](https://github.com/clark970417-eng/VocaLume/releases/latest)，確認版本、閱讀更新內容並下載。

**Star 是收藏，不會自動訂閱新版通知，也不會自動更新 App。** 新版通知由 GitHub 處理，實際接收方式依你的帳號通知設定。收到通知後，停止收音並依本頁的更新步驟安裝。

<details>
<summary>更多設定、測試記錄與授權</summary>

[擴充功能與 API 設定](extension-guide.md) · [測試結果與待驗證項目](quality/README.md) · [4.6.0 更新](releases/4.6.0.md) · [開發說明](development.md) · [隱私](legal/privacy.md) · [第三方來源與授權](legal/third-party-notices.md)

自動檢查不代表已完成雙語人工驗收或所有電腦的實機測試。桌面部分衍生自 [LiveTranslate](https://github.com/rioX432/live-translate)，保留原作者 MIT 授權；模型另有各自授權。

</details>
