# VocaLume 4.6.0 安裝

完整圖文操作項目：[使用手冊](https://github.com/clark970417-eng/VocaLume/blob/main/docs/user-guide.md)。

1. 將這個 ZIP 解壓到固定資料夾，例如「文件/VocaLume Extension」。不要裝好後刪除或搬走。
2. Opera GX 開啟 `opera://extensions`，啟用「開發人員模式」，按「載入未封裝擴充功能」，選擇含 `manifest.json` 的資料夾。
3. 回到影片或網站，重新整理，點工具列的 VocaLume 圖示。網站文字翻譯預設關閉；需要時自行開啟。

## 使用 Mac 本機字幕

先從 [4.6.0 下載頁](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.0) 安裝 App 到「應用程式」，打開並完成模型下載。瀏覽器與 App 之間還需一次連接設定：

1. 電腦需已安裝 Python 3；此連接程式本身不需要安裝額外 Python 套件。
2. 在 `opera://extensions` 複製 VocaLume 的 32 字元 ID。
3. 在終端機進入本資料夾，執行以下指令。將 `你的擴充功能ID` 換成剛複製的值：

```sh
python3 desktop/install.py --extension-id 你的擴充功能ID --app '/Applications/VocaLume.app/Contents/MacOS/VocaLume'
```

4. 重新載入擴充功能與影片頁，選「語音字幕 → 翻譯方式 → 桌面程式」，再開始收音。

這個安裝器目前支援 **macOS 的 Opera GX / Google Chrome**。Windows、Linux、Edge 尚未提供相同的本機連接安裝流程；請使用獨立桌面 App，或在 Extension 選瀏覽器模式。瀏覽器模式需要支援 WebGPU 的環境，第一次會下載辨識模型，文字翻譯需要網路。

## 使用 Gemini 或其他 API

進入 Extension「字幕與設定 → 網路翻譯服務」，選擇服務、填入該帳戶可用的模型 ID 和 API Key，儲存並允許連線。API 為選用功能；聊天訂閱不一定包含 API 額度。不要把金鑰放進 GitHub 或問題回報。

## 更新既有安裝

停止收音後，將新版解壓到原來的 Extension 資料夾，再到擴充功能頁按「重新載入」，最後重新整理影片頁。保留相同資料夾與 ID；如果改成新 ID，需要重新連接 App。

本版是尚未簽章的公開預覽版。請從上述官方 Repo 下載，並依下載頁的 `SHA256SUMS.txt` 核對檔案。
