# Windows 啟動、翻譯效能與相容性修補報告

日期：2026-11-06（台灣時間）。這份報告記錄本次 Windows 實機調查、已修改的程式、實測成果，以及尚未完成的項目，供 Mac 上的 Codex 從 GitHub 接手。

## 結論與上傳範圍

Windows App 的核心啟動與本機音訊→翻譯元件已跑成功，找到並修正了平台預設錯誤、原生 DLL 載入衝突、下載進度負擔及來源語言未生效等問題。本報告不表示所有功能、所有裝置都已通過驗收，也不把本機測試版當成已發佈的正式 release。

本次分支以最新 `main` 的 `13d6a73` 為基礎。公開安裝檔仍是 `beta-v4.6.4`，來源為 `71cd738`。先前調查另讀取過 `codex/streamer-chat-local` 的 `da889f4`，但這次 Windows 修補分支沒有包含那批聊天室、popup、字幕拖曳等實驗功能改動。

以下是 Windows 修補及共用正確性修補；沒有改動 Mac 的 native messaging 安裝器。GPU 偵測只在 Windows 改用獨立程序，macOS/Linux 維持原有程序內路徑。這項 Mac 行為有 mock 回歸測試，未在實體 Mac 重新驗收。

## 測試環境

| 項目 | 環境 |
|---|---|
| 系統 | Windows 11 x64，25H2 |
| CPU | Intel Core i9-13980HX，32 logical processors |
| 記憶體 | 約 32 GB |
| GPU | NVIDIA GeForce RTX 4050 Laptop GPU、Intel 整合顯示 |
| STT | Whisper base，ggml-base.bin |
| 本機翻譯 | HY-MT1.5-1.8B Q4_K_M，Vulkan，33 GPU layers |
| OBS | 官方 OBS Studio 33.0.1 Windows x64 可攜版 |
| 瀏覽器載入檢查 | 獨立 Chrome for Testing 設定檔 |

沒有把使用者對話、API 金鑰、私人錄音、完整系統日誌或瀏覽器設定檔上傳。音訊示範使用公開的 whisper.cpp JFK 樣本。

## 發現與修補

### 1. Windows 原本選到 Apple 專用的 MLX Whisper

實機 Models 頁面顯示 `mlx-whisper (Apple Silicon)`。原因是 store 預設值固定為 MLX，而 renderer 只在沒有設定值時套用平台預設；Windows 因而保留了一個無法使用的引擎。

修補：新設定依平台與架構選擇 STT；Windows 上舊的 MLX、Kotoba 或 Apple Speech 設定會遷移到 Whisper Local/base。實機確認修補後顯示 `Whisper (base, fastest)`。重複遷移不會反覆覆寫已有效的設定。

檔案：`desktop-app/src/main/store.ts`、`store-migrations.ts`、`renderer/hooks/useLanguageSettings.ts`。

### 2. Whisper 與 llama 在同一 Windows 程序載入會衝突

在實際原生模組測試中，先載入 Whisper，再初始化 node-llama-cpp，出現 `ERR_DLOPEN_FAILED`、`The specified procedure could not be found`，最後是 `NoBinaryFoundError`。單獨初始化 llama 則成功取得 Vulkan 與兩張 GPU。兩套套件都包含同名但不同版本的 ggml DLL；載入順序的結果符合 Windows DLL 名稱衝突，而非只有「GPU 不夠快」。本次沒有逐一追到失敗的 DLL export symbol，因此不把確切缺失 symbol 當成已證實。

修補：Windows GPU 偵測移到獨立 Electron UtilityProcess；不在主介面／Whisper 程序載入 llama。偵測請求合併、成功結果快取，15 秒逾時會結束 probe。probe 只使用現有二進位，不在使用者機器下載或編譯原生後端。

實際隔離測試：父程序先載入 Whisper，子程序仍成功辨識 RTX 4050 與 Intel GPU；耗時 2117 ms。20 ms heartbeat 的主事件迴圈最大觀察間隔為 32 ms。這是 probe 的測量，不是整個 App 的最大互動延遲。

另外將 Whisper 原生 addon 延後到該引擎初始化時載入，讓缺少 DLL／ABI 錯誤不再因靜態 import 就阻止主介面出現。LLM 推論原本就在 utility worker 執行，仍維持該設計。

檔案：`engines/gpu-detector.ts`、`main/gpu-probe.ts`、`electron.vite.config.ts`、`engines/stt/WhisperLocalEngine.ts`。

### 3. 首次下載造成過多同步工作，重啟後可能停住

下載迴圈原本每收到一個網路資料區塊就發送進度；onboarding 回呼會同步寫入設定檔，再通知 renderer。這會把大量封包轉成磁碟 I/O 與介面更新。

修補：百分比改變時才通知，非完成事件最多約每 250 ms 一次。另一個錯誤是把已儲存的 `downloading` 當作仍在執行的證據；程序中斷後該值會殘留。現在以當前程序的 Promise 判斷及合併下載工作，Tier 2 也有獨立的活躍工作鎖。

這是由程式路徑與恢復測試確認的修補。沒有完成受控的大型下載前後 CPU 比較，因此不宣稱已量化整體下載時的效能提升。

檔案：`engines/model-downloader.ts`、`main/onboarding-downloader.ts`。

### 4. 所選來源語言沒有傳給 Windows Whisper

原本 Windows Whisper 固定 `language: auto`，辨識結果再靠字形猜語言。法文等拉丁字母語言可能被標成英文，短漢字日文名稱也可能被標成中文。

修補：實作既有 STTEngine 的 `setLanguage`，讓來源語言實際傳給解碼器；auto 仍可使用。每個請求保存自己的語言設定，避免排隊期間被後續變更誤標。另外顯式設定 `translate: false`，因為 addon 預設會把語音直接翻成英文，這不符合原文字幕＋後續翻譯的流程。

### 5. 短漢字詞被當成無意義日文刪除

原過濾器把中文字也歸進日文短句文法判斷，會拒絕「東京」、「台北」、「你好」。現在純漢字短詞不套用假名／日文文法啟發式。原有重複內容、符號、無意義假名等測試仍通過。

這項修補避免已知的誤刪，不代表可以僅從文字精確判斷所有 Whisper 幻覺。仍保留其他既有過濾規則及其限制。

### 6. Windows Auto 對模型大小的選擇過於積極

原本只要 `hasGpu` 就選 Hunyuan 7B，沒有把 GPU 存在與可用 VRAM／即時負載分開。Windows Auto 現在優先使用 HY-MT1.5 1.8B；手動選 7B、外部 API、其他平台的 Auto 行為保留。

這是降低預設資源負擔的取捨。沒有在同一套多語評測集證明 1.8B 與 7B 品質相同，不應寫成「模型變小而品質完全不變」。

### 7. ONNX 與啟動容錯

ONNX 的 `tryCreatePipeline` 失敗回傳 false，但備援用了 `??`，因此沒有執行 WASM。改為 boolean fallback，並測試 WebGPU 失敗後會建立 WASM pipeline。

瀏覽器 companion named pipe 啟動失敗時，獨立 App 原本可能因未處理的 rejection 無法開啟。現在記錄錯誤並讓獨立主介面繼續啟動。這不表示 companion 本身已自動恢復。

### 8. Windows extension 本機連接補件

公開 extension 的 `desktop/install.py` 與 relay 是 Mac 路徑／Unix socket 實作，不能直接作為 Windows 本機連接安裝器。新增 `install-windows.ps1` 與 `windows-host.cjs`，使用目前使用者的 native messaging 註冊、App 自帶 Electron runtime，以及既有 Windows named pipe 協定。

native host ↔ App 實際 framed request 通過，曾觀察到 48 ms 暖機往返；這不是完整瀏覽器字幕延遲。獨立 Chrome for Testing 中 extension 已載入、來源路徑正確且沒有停用原因。但一般瀏覽器的完整讀取／回覆／音訊字幕路徑仍未驗收。

操作方式與 RunAsNode fuse 限制見 [Windows 修補版使用方式](../windows-repair.md)。Mac 安裝器未修改。

## 實際音訊→繁體中文測試

輸入為 [whisper.cpp 的 11 秒 JFK WAV](https://github.com/ggml-org/whisper.cpp/blob/master/samples/jfk.wav)。使用實際 `WhisperLocalEngine` 與 production `slm-worker`，沒有用假的翻譯回覆。這是元件整合測試，不包含麥克風收音、VAD、字幕顯示、OBS 或網頁串流的延遲。

| 暖機設定 | 辨識平均 | 辨識＋翻譯平均 |
|---|---:|---:|
| 原行為：auto 語言偵測 | 101.5 ms | 490.5 ms |
| 改用選定的英文 | 78 ms | 455 ms |
| 本樣本耗時降低 | 23.2% | 7.2% |

每種暖機設定各兩次，交替執行，模型相同；五次辨識與譯文相同。暖機數字沒有包含模型載入。該次模型準備 5540 ms，第一輪辨識 663 ms、翻譯 417 ms；更早未暖機執行觀察到約 8 秒準備、4 秒首次辨識、2.2 秒翻譯。檔案／GPU 快取明顯影響首次使用。

原文：

> And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.

實際模型輸出：

> 所以，我的美國同胞們，不要問你的國家能為你做什麼，而要問你能為你的國家做什麼。

原始數據：[音訊翻譯對照](data/windows-translation-demo.json)、[Whisper 設定對照](data/windows-whisper-benchmark.json)。這是單一清晰英語樣本，不能推論所有語言、口音、噪音、多人對話或直播都有同樣改善，也不能當成全面準確度評分。

### 重跑元件測試

在 Windows 的 `desktop-app` 執行 `npm ci`、`npm run build`。把以下三個公開檔案下載到同一個測試資料夾，不要提交模型權重：

- [jfk.wav](https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav)
- [ggml-base.bin](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin)
- [HY-MT1.5-1.8B-Q4_K_M.gguf](https://huggingface.co/tencent/HY-MT1.5-1.8B-GGUF/resolve/main/HY-MT1.5-1.8B-Q4_K_M.gguf)

```powershell
node scripts/windows-validation/run-benchmark.cjs C:\path\to\assets
& ./node_modules/electron/dist/electron.exe scripts/windows-validation/native-smoke.cjs
# 可選：重現同程序載入順序；在已觀察的環境會失敗，其他 DLL／驅動組合可能不同。
& ./node_modules/electron/dist/electron.exe scripts/windows-validation/native-smoke.cjs --same-process
```

benchmark 會使用本機權重、產生 `translation-demo-result.json` 與本機日誌，不使用雲端、麥克風或瀏覽器。腳本執行後會刪除暫存編譯入口；若中斷後要打包，先重新 `npm run build`。

## 驗證狀態

| 功能／檢查 | 結果與限制 |
|---|---|
| 公開 4.6.4 Windows 安裝檔 | 曾安裝並開啟，下載 checksum 與官方一致 |
| 本機修補版 App | 建置與可攜包啟動通過，Translate／Models 畫面檢查通過 |
| 最終 Windows-only 分支 | 872 項桌面測試通過、2 項略過；兩個 TypeScript 專案及 production build 通過 |
| Extension | 先前合併實驗分支時 295 通過、5 失敗；原主線測試時 294 通過、5 失敗。5 項涉及 Python/Mac 安裝測試與 zip 工具，不能稱全套通過。此 Windows-only 分支不包含實驗分支增加的測試 |
| 原生 GPU 隔離 | 實際 Whisper＋GPU probe 共存通過；Mac 分支只有 mock 回歸測試 |
| 音訊翻譯 | 公開 WAV → 真實辨識 → 真實繁中譯文通過 |
| FFmpeg | mp3、wav、flac、ogg、matroska、mov/mp4/m4a、mpegts、avi、webm 格式 probe 通過 |
| Native messaging | host ↔ App 通過；瀏覽器到字幕顯示的全路徑尚未通過 |
| OBS | 官方可攜版可開啟；App 字幕檔 generation 的自動測試通過。OBS 文字來源已建立，但檔案選擇操作受工具限制，未完成實際字幕渲染驗收 |
| 現場麥克風／電腦聲音 | 沒有完整持續使用驗收，不宣稱延遲與準確度已達標 |
| 檔案翻譯、編輯、匯出、監看資料夾 | 有既有自動測試，沒有完整真實媒體 UI 驗收 |
| DeepFilterNet3 降噪 | 沒有完成同一噪音語音的開／關比較 |
| BYOK／付費 API | 未使用真實金鑰測試 |
| 虛擬麥克風 | 仍未解決：打包時缺少 optional naudiodon native 套件 |

## 給 Mac Codex 的接手順序

1. 先閱讀這份報告與 Windows setup 文件，檢查 Windows 分支 diff。不要只看到測試通過數字就標記全部功能完成。
2. 重新跑 `npm run typecheck`、`npm test -- --maxWorkers=2`、`npm run build`。要 package 前請最後再 build，避免 typecheck 的 tsbuildinfo 或手動診斷檔污染 out，被 build-provenance gate 擋下。
3. Mac 必須實測既有 MLX／Apple Speech／native relay。共用 Whisper／文字過濾修正有跨平台影響，不能用 Windows 結果替代 Mac 驗收。
4. 在 Windows 完成一般 Chrome／Edge／Opera 的 native messaging、字幕、讀取及回覆測試；目前不能只靠獨立測試瀏覽器的載入紀錄。
5. 完成 OBS 檔案更新渲染、檔案翻譯及監看資料夾、降噪開關的真實音訊流程。
6. 另行修復／建置 naudiodon，或清楚停用不支援的虛擬麥克風功能。不要安靜地把 optional dependency 缺失當成成功。
7. 新增不同語言、噪音、專有名詞、數字、否定句的 holdout 音訊／翻譯評測，再決定較大模型、量化或 decoding 選項。單一 JFK 片段不夠。
8. 驗收後才重新建置、核對 checksum 並發佈 Windows release。這次原始碼上傳不會自動更新舊安裝檔。
