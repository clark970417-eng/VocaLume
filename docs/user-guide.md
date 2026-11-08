# VocaLume 使用手冊

[回首頁](README.zh-TW.md) · [Extension 詳細設定](extension-guide.md) · [回報問題](https://github.com/clark970417-eng/VocaLume/issues/new/choose)

[▶ 觀看中文安裝影片（約 2 分鐘）](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.2/VocaLume-Chrome-Setup-Guide-Final-ZH.mp4)

影片以 4.6.0 的介面示範下載、解壓與載入 Extension；4.6.4 部分畫面不同。Mac 的一次性 App 連接、模型下載與首次收音，請接著完成本頁文字步驟。

## 安裝

只從 [VocaLume 4.6.4 Beta](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.4) 的 **Assets** 下載。`Source code` 是開發用原始碼，不是 App 安裝檔。第一次使用需要網路下載所選模型，請預留數 GB 空間。

### Mac

1. 「關於這台 Mac」顯示 Apple M 系列，選 `VocaLume-4.6.4-arm64.dmg`；顯示 Intel，選 `VocaLume-4.6.4.dmg`。
2. 打開 DMG，將 **VocaLume** 拖進「應用程式」，再從那裡開啟。
3. 目前尚未取得 Developer ID 簽章與公證。如果系統阻擋，先確認下載來源，再到「系統設定 → 隱私權與安全性」查看該 App 的開啟提示。不要關閉整台電腦的安全檢查。
4. 依 Quick Start 完成模型下載。品質升級與雲端服務可以稍後設定。

### Windows

執行 `VocaLume.Setup.4.6.4.exe`，完成安裝與 Quick Start。這是 x64 預覽版，尚未簽章；SmartScreen 可能顯示「無法辨識的應用程式」。僅在核對本 Repo 的下載與校驗值後決定是否繼續。此版本的 Windows 安裝與編譯有 CI 檢查，實體 Windows 電腦的長時間收音與品質仍待驗證。

### Linux

`VocaLume-4.6.4.AppImage` 為 x64 實驗性版本。賦予檔案執行權限後開啟；不同桌面環境的收音能力仍需個別確認。

### 瀏覽器 Extension

1. 下載 `vocalume-extension.zip`，解壓到固定位置，例如「文件/VocaLume Extension」。
2. Chrome 開啟 `chrome://extensions`；Opera GX 開啟 `opera://extensions`。
3. 開啟「開發人員模式」→「載入未封裝擴充功能」，選擇含 `manifest.json` 的資料夾。
4. 將 VocaLume 固定到工具列，重新整理要翻譯的網頁。

解壓後的資料夾就是 Extension 的程式，**不要刪除、搬到外接磁碟或改名**。如果只想整理下載檔，安裝完成後可移除原本的 ZIP / DMG；不要刪除「應用程式」裡的 App。

## 連接 Mac App 與 Extension

本機瀏覽器字幕需要註冊一次。先安裝相同版本的 App 與擴充功能，並開啟 App。這個註冊程式支援 Chrome、Edge 與 Opera GX。

1. 在瀏覽器擴充功能頁複製 VocaLume 的 32 字元 **ID**。
2. 開啟終端機，切換到解壓後的擴充功能資料夾。
3. 將下方的 `你的擴充功能ID` 換成剛複製的值，再執行指令。

```sh
ELECTRON_RUN_AS_NODE=1 '/Applications/VocaLume.app/Contents/MacOS/VocaLume' desktop/install-mac.cjs 你的擴充功能ID
```

4. 重新載入擴充功能與影片頁，到「語音字幕 → 翻譯方式」選「桌面程式」。

新版註冊程式使用 App 內附的執行環境。從舊版 Python 連線升級時，請用新版指令重新註冊。若下載的是較舊版本，請依該版本的 [Python 註冊步驟](installation.md#connect-the-mac-app) 安裝。Windows 使用[專用註冊步驟](windows-repair.md#在-windows-連接-extension-與本機-app)。Linux 可使用獨立 App，或在擴充功能選「瀏覽器」模式。瀏覽器模式需要 WebGPU 和網路文字翻譯。

## 第一次使用

4.6.4 的 App 與 Extension 首頁都有「**介面語言**」，可選「繁體中文」「简体中文」「English」或「跟隨系統」，並自動記住選擇。這只改變按鈕與說明，不會改變翻譯方向、字幕內容或 API 設定。此設定已包含在 4.6.4 安裝檔中。

### 聽影片、直播

1. 先讓影片播放。
2. 點 Extension →「語音字幕」，選「聽到的語言」與「翻譯成」。
3. 選「單組」或「四組」，按「開始語音字幕」。首次載入模型會比較久。
4. 原文先出現，譯文完成後補上。單組會保留目前句子直到譯文顯示；四組依序保留不同句子。
5. 按「停止收音」結束。停止鍵在收音時持續顯示，切換設定頁也找得到。

不用 Extension 時，App 的「**翻譯 / Translate**」頁可選麥克風、系統聲音或檔案，設定語言後按「**開始 / Start**」。系統只會在使用相應聲音來源時要求權限。不要同時用兩處收同一段聲音，以免重複耗用模型資源。

### 讀貼文、聊天室

到「文字翻譯」選語言，再開啟「網站文字翻譯」。預設關閉，不會因為看到外語而自動開啟。一般網站還需允許該網站；YouTube、Twitch、X、Discord、Facebook、Instagram 等使用專屬頁面規則。圖片裡的文字、影片燒錄字幕與網站封閉元件無法當成一般網頁文字讀取。

### 翻譯自己的留言

開啟文字翻譯後，在留言框輸入文字，點旁邊的翻譯按鈕；X 也支援 Tab。開啟「自動反向回覆」時，讀日文 → 中文，寫留言就是中文 → 日文。**確認譯文後自行送出**；程式不會替你發文。

## 常用設定在哪裡？

| 想調整什麼 | 到哪裡 |
| --- | --- |
| 網頁閱讀／留言語言 | Extension → 文字翻譯 |
| 語音語言、單組／四組 | Extension → 語音字幕 |
| 字體、顏色、描邊、背景 | Extension → 字幕與設定 |
| Gemini / OpenAI / Claude 等 API | Extension → 字幕與設定 → 網路翻譯服務 |
| 本機辨識／翻譯模型、詞彙 | App → Models |
| 桌面字幕外觀 | App → Subtitles |
| 記錄、支援與其他進階項目 | App → More |

文字描邊與字幕背景是不同設定。關閉描邊不會刪掉背景。App 與 Extension 的字幕外觀分開調整。

## Gemini 與其他 API

API 是選用功能。本機字幕不必填寫。選服務後填入 **API 平台提供的金鑰** 和該帳戶可用的 **模型 ID**，按儲存並允許連線。

Gemini 使用官方 `generateContent` API；程式已包含請求與回應處理。本版驗證的是本機模擬與格式檢查，**沒有使用真實 Gemini 金鑰進行呼叫**。是否能用仍取決於帳戶、模型權限、地區、額度與網路。若需要自行確認，「測試已儲存設定」會送出一個固定示範句並消耗少量 API 額度。

選擇的 API 用於網頁文字、留言與瀏覽器模式的字幕；桌面語音使用 App 裡的引擎。細節見 [API 設定說明](extension-guide.md#使用自己的-api)。

## 更新與回復舊版

1. 停止收音，結束 App。
2. 安裝新版 App 到原位置；不必刪掉模型或設定。
3. 將新 Extension ZIP 解壓到**同一個擴充功能資料夾**，覆蓋程式檔，再到擴充功能頁重新載入。
4. 重新整理原本開著的網頁。若 ID 改變，重新執行 Mac 連接步驟。

預覽版透過 GitHub 下載更新，不會靜默替換未簽章 App。發生問題可從 Releases 下載上一版的 App 與 Extension，一起回復；詳見[更新與回復](releases/README.md#roll-back)。

## 常見問題

| 現象 | 先檢查 |
| --- | --- |
| 一直顯示「翻譯中」 | 停止收音，確認 App 模型已就緒／API 設定正確，重新整理網頁再開始；不要連續重複按開始。 |
| `Native host has exited` / `host is forbidden` | App 是否仍在「應用程式」？Extension ID 是否變了？重新執行連接步驟。 |
| 有日文但沒有中文 | 查看翻譯引擎是否載入、API 是否回報錯誤；字幕記錄可重試失敗翻譯。 |
| 沒有聲音或字幕 | 確認播放中的分頁、聲音來源與系統權限；桌面模式與瀏覽器模式需各自正確設定。 |
| 電腦發熱、延遲變長 | 先用較小模型，關閉額外品質校正與不需要的聲音分析，避免同時執行遊戲或兩套模型。 |
| 中文又被翻譯／不想翻譯某網站 | 關閉網站文字翻譯，或取消該網站的允許設定；確認閱讀語言。 |

仍有問題時，到 [Issues](https://github.com/clark970417-eng/VocaLume/issues/new/choose) 附上版本、電腦、瀏覽器、語言與重現步驟。App 的支援頁可匯出診斷。不要貼 API Key、私人聊天、完整個人聲音或帳號資訊。

## 核對下載

下載頁附 `SHA256SUMS.txt` 和 `release-manifest.json`。前者是檔案校驗值，後者記錄來源版本與建置流程。Mac 可用 `shasum -a 256 檔案路徑`，Windows PowerShell 可用 `Get-FileHash 檔案路徑 -Algorithm SHA256`，將結果與清單比較。校驗值不能代替作業系統的開發者簽章。


## Copyright / 版權與使用

Free for noncommercial use. Commercial use and resale require permission. Derivative versions must credit VocaLume in their README and About interface. Third-party licenses remain unchanged.

原創部分免費供非商業使用；商用與轉售需事先取得書面同意。衍生版本須在 README 與關於介面註明來源。第三方原授權保留，舊版已授予的權利不受影響。詳見 [LICENSE](https://github.com/clark970417-eng/VocaLume/blob/main/LICENSE)。
