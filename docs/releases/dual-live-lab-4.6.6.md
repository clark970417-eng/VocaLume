# VocaLume 4.6.6 雙直播字幕實驗版

用兩個獨立的 Chrome 個人資料，同時翻譯兩個分頁的聲音。這個 ZIP 的 `extension/` 內是 4.6.6 的通用擴充功能。

## 開始

1. 把 ZIP 解壓到新的固定資料夾。保留平常使用的 VocaLume 和它的資料夾。
2. 在 Chrome 右上角的個人資料選單建立兩個新的個人資料。兩個都可不登入，各開一個視窗。
3. 在兩個視窗各自打開 `chrome://extensions`，開啟「開發人員模式」，按「載入未封裝項目」，選取解壓後的 `extension/` 資料夾。這兩個實驗用個人資料都跳過 App 連接註冊。
4. 在第一個視窗播放一場直播，點該分頁的 VocaLume 圖示。「語音字幕 → 翻譯方式」選「瀏覽器 · 辨識＋網路翻譯」，保留 Whisper Small FP32，選好語言並開始收音。到第二個視窗用另一場直播重複操作。
5. 在要停止的視窗按「停止收音」。另一個視窗可以繼續。測完可在各自的擴充功能頁移除實驗用的 VocaLume。

需要桌面版 Chrome、可用的 WebGPU 和網路。兩個個人資料首次使用各需下載語音模型。語音辨識使用電腦資源，文字會送往網路翻譯服務。雙路會增加記憶體、GPU 與電力用量。若發熱或延遲累積，先停一路。

## 驗證範圍

Apple Silicon Mac 使用兩個獨立的 Chrome 設定檔，同時翻譯兩場公開 Twitch 直播約 4 分鐘。首筆完整譯文分別約 7.51 與 5.41 秒。停止一路後，另一路仍有新譯文。

[Test report](https://github.com/clark970417-eng/VocaLume/blob/main/docs/reports/mac-dual-live-captions-2026-11-08.md)

[回報問題](https://github.com/clark970417-eng/VocaLume/issues/new/choose)

---

# VocaLume 4.6.6 dual-stream captions lab

Translate audio from two tabs at once using separate Chrome profiles. The `extension/` folder contains the universal VocaLume 4.6.6 extension.

## Start

1. Extract the ZIP to a new, permanent folder. Keep your everyday VocaLume installation and its folder.
2. Create two fresh Chrome profiles from the profile menu. You can continue without signing in. Open a window in each profile.
3. In each window, go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the extracted `extension/` folder. Skip desktop App registration for these lab profiles.
4. Play one stream in the first window and open VocaLume from that tab. In **Speech captions**, set the translation engine to **Browser**, keep Whisper Small FP32, choose your languages, and start capture. Repeat in the other window with a different stream.
5. Use **Stop capture** in the window you want to stop. The other window can keep going. You can remove the lab extension from both profiles when finished.

Requires desktop Chrome, working WebGPU, and internet access. Each profile downloads its speech model on first use. Recognition runs on your computer and text is sent to the online translation service. Two sessions use more memory, GPU time, and power. Stop one if heat or delay builds up.

## What was tested

Two separate Chrome profiles captured two public Twitch streams on Apple Silicon for about four minutes. The first complete translations arrived after 7.51 and 5.41 seconds. One stream continued after the other stopped.

[Test report](https://github.com/clark970417-eng/VocaLume/blob/main/docs/reports/mac-dual-live-captions-2026-11-08.md)

[Report a problem](https://github.com/clark970417-eng/VocaLume/issues/new/choose)
