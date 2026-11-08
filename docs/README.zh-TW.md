# VocaLume

![VocaLume](brand/VocaLume-logo-hd.png)

**免費看直播雙語字幕，也能打中文、翻成日文再回覆。**

為想看懂外語直播、跟不同語言的朋友聊天的人製作。語音、閱讀和打字可分別選擇翻譯語言，不只限於日文。

[網站與影片示範](https://vocalume.vercel.app/) · [4.6.7 測試版下載](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.7) · [English](../README.md)

[简体中文](README.zh-CN.md)

## 先下載適合電腦的版本

選擇適合電腦的 App。要在瀏覽器看即時字幕，再下載一種擴充功能 ZIP。通用 ZIP 也包含 Windows 連接工具。**Source code** 是開發用原始碼。

| 你的電腦 | 下載 |
| --- | --- |
| Windows x64 | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.7/VocaLume.Setup.4.6.7.exe) |
| Mac · Apple Silicon (M1–M5) | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.7/VocaLume-4.6.7-arm64.dmg) |
| Mac · Intel | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.7/VocaLume-4.6.7.dmg) |
| Linux x64 · 實驗性 | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.7/VocaLume-4.6.7.AppImage) |
| Windows 擴充功能（Chrome / Edge） | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.7/vocalume-extension-windows.zip) |
| 通用擴充功能（Chrome / Edge / Opera GX） | [點這裡下載](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.7/vocalume-extension.zip) |

上方是 **4.6.7 測試版** App 與擴充功能，請依電腦平台下載。

不知道 Mac 是哪種？點 ** → 關於這台 Mac**，查看「晶片」或「處理器」。

## 三步開始使用

1. **安裝 App、下載模型：** 選擇聲音來源、聽到的語言，以及要翻譯成的語言。
2. **要在網站用，也裝擴充功能：** ZIP 解壓到固定資料夾，在 Chrome 開啟 `chrome://extensions`，Edge 開啟 `edge://extensions`，Opera GX 開啟 `opera://extensions`。接著開啟「開發人員模式」，選「載入未封裝擴充功能」。**這個資料夾不能刪除。**
   要在瀏覽器使用本機字幕，請依 [Mac](user-guide.md#連接-mac-app-與-extension) 或 [Windows](user-guide.md#連接-windows-app-與-extension) 的步驟連接一次。Linux 可用獨立 App 或擴充功能的瀏覽器模式。
3. **開始看字幕或回覆：** 播放影片並開始語音字幕；網站文字翻譯可自行開啟。回覆時先翻譯、確認內容，再自行送出。

[完整安裝、更新與疑難排解](user-guide.md)

## 可以拿來做什麼？

- **聽懂直播：** 顯示雙語字幕，可選單組或四組。
- **讀懂文字：** 翻譯支援網站的貼文、標題和聊天室。
- **方便回覆：** 先用熟悉的語言打字，再翻成對方的語言，不必一直切出去複製貼上。
- **直播字幕與聊天：** 將譯文或雙語字幕輸出到 OBS，並把支援的直播聊天室留言翻成自己看得懂的語言。
- **調成喜歡的樣子：** 選擇語言方向、字幕大小、顏色、外框與背景。
- **自行選擇引擎：** 使用本機模型，或選填自己的 Gemini、OpenAI、Claude 等 API。

## 使用前知道這幾件事就好

- **本機模式免費，不需要付費 API。** 首次需下載模型，速度依電腦效能與負載而異；選用外部 API 則依服務商收費。
- **目前是公開測試版。** 辨識與翻譯可能失敗或翻錯，重要內容請對照原文。
- **提供 Mac、Windows App；Linux 為實驗性。** Windows 本機瀏覽器字幕的測試範圍可參考[實機驗收報告](reports/windows-acceptance-2026-11-06.md)。瀏覽器模式的語音字幕需要 WebGPU 與網路翻譯。
- **安裝檔尚未簽章／公證。** 遇到系統提示請參考使用手冊。
- **介面語言。** App 與擴充功能提供繁體中文、簡體中文、英文、日文與韓文。Windows 或 Mac 連接後可同步介面語言，翻譯語言可另外設定。

## 一起讓它更好用

遇到問題或想要的新功能，歡迎[留下回饋](https://github.com/clark970417-eng/VocaLume/issues/new)。附上系統、操作情況與不含個資的截圖即可，**不要提供密碼或 API 金鑰**。

## 收藏專案，追蹤最新版本 ⭐

1. 打開 [VocaLume GitHub 首頁](https://github.com/clark970417-eng/VocaLume)，登入 GitHub；沒有帳號可先[免費註冊](https://github.com/signup)。**下載不需要帳號。**
2. 在專案頁右上方按 **Star ☆**；變成 **Starred ★** 就代表收藏成功。手機版的位置可能不同。
3. **想收到新版通知：** 在同一頁按 **Watch → Custom → 勾選 Releases → Apply**。若已顯示 Watching，可開啟該選單調整通知。
4. 之後也能直接打開 [版本列表](https://github.com/clark970417-eng/VocaLume/releases)，確認版本、閱讀更新內容並下載。

**Star 是收藏，不會自動訂閱新版通知，也不會自動更新 App。** 新版通知由 GitHub 處理，實際接收方式依你的帳號通知設定。收到通知後，停止收音並依本頁的更新步驟安裝。

<details>
<summary>更多設定、測試記錄與授權</summary>

[擴充功能與 API 設定](extension-guide.md) · [測試結果與待驗證項目](quality/README.md) · [4.6.7 更新](releases/4.6.7.md) · [開發說明](development.md) · [隱私](legal/privacy.md) · [第三方來源與授權](legal/third-party-notices.md)

自動檢查不代表已完成雙語人工驗收或所有電腦的實機測試。桌面部分衍生自 [LiveTranslate](https://github.com/rioX432/live-translate)，保留原作者 MIT 授權；模型另有各自授權。

</details>
