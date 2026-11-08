# Windows 4.6.6 本機功能補測與 Haas-JA 評估

## Windows 從 4.6.6 升級到 4.6.7（2026-11-08）

| 功能 | 公開 4.6.6 安裝包 | 更新後的 4.6.7 |
| --- | --- | --- |
| 桌面即時翻譯字幕 | 使用原有的浮動字幕 | 在「字幕與 OBS → 字幕顯示」可選單組完整譯文或最近四組正式雙語字幕。選擇會套用到即時翻譯。 |
| 瀏覽器即時翻譯 | Release 提供通用擴充功能 | 可搭配 Windows 專用 ZIP 連接桌面 App。使用擴充功能的瀏覽器模式時，正式譯文優先並依原文順序送出。 |
| OBS 即時字幕 | 可用字幕檔 | 可繼續使用字幕檔，也可透過本機 WebSocket 推送到指定的文字（GDI+）來源。 |

若剛裝好 4.6.6，可從 [4.6.7 Release](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.7) 下載 Windows x64 安裝程式覆蓋更新。要使用瀏覽器本機連接，再更新至同版的 Windows 專用擴充功能。Windows 字幕功能來自 [PR #8](https://github.com/clark970417-eng/VocaLume/pull/8)，可另看 [4.6.6 到更新版的原始碼比較](https://github.com/clark970417-eng/VocaLume/compare/beta-v4.6.6...567bbdca48cdabe4f940fd79e9700d80b758b735)。

下方保留 4.6.6 的實機驗收。4.6.7 的封裝驗證見 [GitHub Actions](https://github.com/clark970417-eng/VocaLume/actions/runs/42486209883)。這次沒有在使用者的 Windows 裝置重新量測翻譯速度，Mac 的雙路直播延遲不適用於 Windows。

日期：2026-11-06。這份報告取代同日早期報告的「目前驗收狀態」；早期數據保留作歷史紀錄。分支 `codex/windows-performance-report` 已合併 main `6be9be6`（4.6.6），延續 PR #2。修補原始碼、測試通過、實機驗收及正式 release 是不同狀態。

## 已完成與仍未通過

| 項目 | 最新結果與範圍 |
|---|---|
| App 單元測試 | **通過：904 項／99 個檔案，0 跳過** |
| App／extension 介面測試 | **通過：完整一輪 42 項，0 跳過**。pipeline Start/Stop 使用公開 WAV 作 Chromium 麥克風 fixture，模型為實際本機模型 |
| Extension 單元測試 | **通過：303 項，0 失敗、0 跳過**。修正 Python 選擇、Windows junction fixture 與 ZIP 工具依賴，保留實際斷言 |
| TypeScript／production build | **通過**：node、web typecheck 與正式 build |
| 新安裝／升級／解除安裝 | **通過限定路徑**：正式 NSIS 在工作區驗證目錄安裝 4.6.4 → 升級修補版 4.6.6 → 移除 → 重裝；exit code 均 0；移除 exe、保留使用者設定與保存標記。非所有安裝磁碟／權限情境 |
| Chrome for Testing／Microsoft Edge extension | **通過本機橋接**：真正載入 extension、Windows registry → launcher → host → App；瀏覽器斷網下文字翻譯、PCM → Haas-JA → 本機翻譯、extension background 回覆草稿成功。不是所有網站功能驗收 |
| 真實檔案翻譯 | **通過**：UI 匯入英文 WAV → FFmpeg → SenseVoice → HY-MT1.5 → 雙語字幕；日文 WAV → Haas-JA → 繁中字幕 |
| 編輯／搜尋／UTF-8 匯出 | **通過**：保留中文、數字及 emoji；只有原生存檔對話框以測試路徑替代，renderer、IPC、磁碟寫入皆實際執行 |
| 資料夾監看 | **通過**：監看後真正新增 WAV、自動翻譯。原生選擇資料夾對話框使用受控路徑 |
| 九種媒體實檔 | **通過**：MP3／FLAC／OGG／M4A／MP4／WebM／MKV／AVI／TS，實際轉檔後經 production IPC 解碼；另有 WAV。非所有 codec 組合 |
| 大型媒體取消 | **通過來源與封裝內容**：180 秒檔案收到處理進度後取消，回傳 cancelled，未處理完整檔案並釋放解碼程序 |
| OBS | **通過**：官方 OBS Studio 33.0.1 真實文字來源讀取 App 字幕檔、渲染英文／繁中，再更新為日文／繁中；取得並目視核對兩張不同渲染截圖。沒有推流到公開平台 |
| Windows 電腦聲音 | **通過短時端到端**：播放公開日語 WAV，實際 Windows loopback → VAD → Haas-JA → 本機翻譯 → 字幕 → 停止 |
| 實體麥克風 | **通過裝置開關與訊號**：Realtek、48 kHz、非零 RMS，正確停止。已知語句端到端用 WAV 麥克風 fixture；現場真人多說話者準確性仍未驗收 |
| DeepFilterNet3 | **通過功能性測試**：同一公開日語樣本混入固定種子 10 dB 白噪音，開／關各跑完整 pipeline；確認 filterReady，未把 fallback 當成功。兩者 CER 均 1.41%，此單例不能證明一般降噪增益 |
| Haas GPU／CPU | **通過此機**：Q8 GPU、CPU 各跑 60 段；無空結果或引擎錯誤。其他 GPU／驅動／記憶體條件未驗收 |
| 虛擬麥克風 | **未通過：功能受阻**。缺 optional naudiodon native binary 及虛擬音訊驅動，不能以 mock 測試代替實際輸出；未安裝驅動或更動安全設定 |
| 付費 API／雲端即時 | **未驗收：依使用者選擇保留**，沒有使用付費金鑰 |
| 真實網站 tabCapture、聊天室讀取／回填 | **未完整驗收**。fixture 介面與 background 本機翻譯通過；未完成真實網站音訊擷取到字幕、各網站登入／DOM 全流程；沒有送出貼文 |
| 長時間／多人／遊戲共用 GPU | **未驗收**：短時流程不等於數小時穩定性；仍有整體流程主執行緒延遲峰值需調查 |
| Mac／Linux 實體裝置、Opera、無 WebGPU 裝置、故意破壞 DLL／GPU 驅動 | **未驗收**。Windows 結果及跨平台 mock 不代替實體驗收 |
| HY-MT1.5 vs 7B 翻譯品質 | **未完成代表性比較**。本輪主要比較日語語音辨識，不宣稱翻譯模型準確率全面提升 |
| GitHub 正式 release | **未發佈本輪修補 release**。本機已產出並測試 NSIS；PR 原始碼更新不會取代既有下載檔 |

封裝內容另以相同版本 Electron 載入 `app.asar/out/main/index.js`，完成上述九階段流程；驗證包含 asar／unpacked 原生模組及 worker。NSIS 本體另作實際安裝生命週期測試，不把此測試寫成所有原生安裝 GUI 操作都已驗收。

## 新發現與修補

1. Windows 英語自動路由已改 SenseVoice，但缺 sherpa-onnx-node 依賴。加入 optional SDK、int8 模型路徑、非同步建立／decode、下載背壓及進度節流。實際 build 曾把 NAPI SDK 打包到錯誤 chunks 路徑，導致找不到 native binary；現在 external SDK 並 asarUnpack，增加 sensevoice-worker 入口。
2. 單純 async API 仍會在主程序同步載入 DLL。Windows SenseVoice 改獨立 UtilityProcess，傳入模型根目錄、序列化要求、逾時／停止失效處理；原生推論與 DLL 載入不再放主事件迴圈。generic worker client 保留 Whisper 路徑，新增 null 結果與 progress 測試。
3. Haas 啟動合併請求、60 秒啟動上限、15 秒辨識上限、取消與過期結果丟棄；失敗依 STTEngine 契約回傳 null。Windows 限制四執行緒、子程序 BelowNormal、auto GPU→CPU；缺 runtime／模型時明確回到可用 Whisper，避免自動選日語即不可啟動。
4. 日語自動路由改 Haas fast，仍保留明確選擇 recommended 的設定。此評測固定 phrase hints 沒提高 CER，反而增加耗時，因此不作預設。此共用路由改動沒有實體 Mac 驗收。
5. release extension ZIP 原本漏掉 Windows 安裝器與 host，即使 repo 有檔案，下載 ZIP 仍不能完整安裝。已補 beta workflow 並增加封裝斷言；ZIP 驗證使用 Python 標準庫，免依賴外部 zip/unzip。
6. 清掉原來跳過的測試：MLX probe 指定可用 Python；Mac 版本安全判斷單元測試明確 mock 平台；Start/Stop 使用模型及公開音訊 fixture。這些不表示在 Windows 執行 Apple 專用引擎。

## Haas-JA 與舊模型：實測保留新模型

同一台 Windows 11／i9-13980HX／32 GB／RTX 4050 Laptop，google/fleurs `ja_jp/test` 共 650 段中固定 seed `20261106` 抽 60 段，合計 779.1 秒。各模型輸入相同 16 kHz 單聲道 PCM，指定 ja。CER 採 NFKC、轉小寫、只保留字母與數字，micro Levenshtein。不是整個 test split，也未確認是否與各模型訓練集重疊。

| 實際部署變體 | 暖機辨識中位數 | p95 | CER（越低越好） |
|---|---:|---:|---:|
| Whisper base GPU | 116.4 ms | 193.1 ms | 26.52% |
| Kotoba Whisper v2 Q5 GPU | 383.2 ms | 442.4 ms | 6.81% |
| Haas-JA Q8 fast GPU | **46.0 ms** | **122.0 ms** | **4.66%** |
| Haas-JA Q8 phrase hints GPU | 54.9 ms | 135.6 ms | 4.66% |
| Haas-JA Q8 CPU 四執行緒 | 894.4 ms | 1924.0 ms | 4.70% |
| SenseVoice int8 CPU 二執行緒 | 397.2 ms | 824.8 ms | 7.60% |

此部署組合 Haas fast 對 Kotoba 暖機中位數約快 8.3 倍、CER 少 2.15 個百分點；逐段 28 段較好、21 段相同、11 段較差，並非每句都較好。**沿用 Haas 作日語預設，保留備援。**不同模型、量化與加速後端的比較代表這台機器的實際選項，不是架構公平競賽。

冷啟動不能忽略：初次 GPU kernel／檔案快取未暖時 Haas 初始化曾約 10.8 秒，後續隔離重跑約 1.08 秒；上表不包含載入、VAD 等待、翻譯或網路，不應拿 46 ms 當完整字幕延遲。CPU-only 明顯較慢，不能保證其他 Windows 電腦與 Mac M5 一樣順。

最後隔離重跑 Whisper／Haas／SenseVoice 各 60 段，CER 與前輪相同。主程序 20 ms heartbeat 的初始化最大觀察間隔依序 34.1／74.6／31.9 ms，辨識階段 38.5／39.6／34.7 ms。這支持隔離引擎未長時間阻塞主事件迴圈；**完整 UI 流程仍觀察到約 1.23 秒峰值（語言切換＋頁面 reload 階段），尚未釐清來源，整機不卡頓不能標通過**。這個觀察也不是 CPU 使用率或完整系統延遲的量測。

品質資料：[逐段結果與摘要](data/haas-ja-comparison-2026-11-06.json)、[隔離重跑](data/haas-ja-isolated-2026-11-06.json)。未上傳私人錄音、App 設定、金鑰、原始系統日誌及瀏覽器設定檔。

## 來源與重現

- 音訊：[google/fleurs 日語 test parquet](https://huggingface.co/datasets/google/fleurs/tree/refs%2Fconvert%2Fparquet/ja_jp/test)，FLEURS，CC-BY-4.0；原資料與授權請見 [dataset card](https://huggingface.co/datasets/google/fleurs)。parquet SHA256 `e954b67e934b9a31d7a74a070a75225379660d50c8d1aacdb755852c57f23e6b`。
- 新模型：[sakasegawa/Haas-ja-v1.0-GGUF](https://huggingface.co/sakasegawa/Haas-ja-v1.0-GGUF)，Q8 SHA256 `cd5f60b2f1c411404b83fca4a65e3ce30a26d9e951b6a346529e65f22758afeb`；Windows runtime：[speech.cpp v0.10.1](https://github.com/nyosegawa/speech.cpp/releases/tag/v0.10.1)，官方 Windows x64 Vulkan ZIP SHA256 `a8fe0e4b4f463c460e7ace9d38c363bec08b254cac5a7f764b7967af35d4fa1a`，與官方 SHA256SUMS 核對。
- 舊模型：[kotoba-tech/kotoba-whisper-v2.0-ggml](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0-ggml)，Q5 SHA256 `4a3b92192b5d3578ff854a5876213e2e27af0c2d357492c2d14271e82c303658`。
- 腳本：`desktop-app/scripts/windows-validation/` 的 `run-japanese-comparison.cjs`、`run-acceptance.cjs`、`run-browser-acceptance.cjs`、`run-audio-acceptance.cjs`。需事先準備模型、對應 corpus manifest／16 kHz WAV／f32；OBS 驗收需要本機已啟用且有密碼的 WebSocket。腳本不包含驅動安裝或付費 API。
- `desktop-app` 執行 `npm run typecheck`、`npm run build`、指定 `TEST_PYTHON` 後 `npm test`。E2E 設 `PLAYWRIGHT_CHANNEL=chrome`、`JTL_AUDIO_TEST=1`、`JTL_TEST_MODELS`、`JTL_TEST_MIC_FILE` 後 `npm run test:e2e`。Extension 測試指定 `VOCALUME_TEST_PYTHON`，依 repo 既有 Node test runner 執行。

## Mac Codex 接手重點

先讀此表，勿將歷史「未通過」誤認成仍失敗的自動測試。下一步優先處理剩餘 UI 峰值、虛擬麥克風依賴／驅動安裝體驗、真實網站 tabCapture 與長時間資源量測；付費 API 等使用者另行授權。正式發佈前在原生 Windows CI／目標電腦重建、核對資產與 checksum，再發佈新的 release。
