# Windows 第二輪：回應速度、資源使用與翻譯品質

> 最新狀態：請以 [Windows 4.6.6 本機驗收與 Haas-JA 報告](windows-acceptance-2026-11-06.md) 為準。以下為早期調查歷史；原先 2 項失敗／跳過現已補測通過，最新為 App 904、介面 42、extension 303 項全通過。OBS、安裝生命週期與音訊補測結果及尚未驗收事項見新報告。

日期：2026-11-06（台灣時間）。接續 [Windows 修補及驗收報告](windows-validation-2026-11-06.md)，本輪已完成程式修補與下列實測；不代表舊報告的全部未通過項目已完成。

本輪另外合併主分支 `75c8ad3` 的 4.6.5 更新，保留 Haas-ja 與聊天室功能；已解決 companion 衝突，保留 Windows 平台選擇及新的 Haas 適用性檢查。以下前後對照先在原 4.6.4 衍生 Windows 分支量測，再對合併 4.6.5 後的程式及打包內 worker 重新驗證。

## 修正了甚麼

1. **Whisper 完全移出 Windows App 主程序。** 原本即使 transcribe 是非同步，首次 import 原生 addon 仍在主程序執行。基準測試的 20 ms heartbeat 曾相隔 1157.6 ms 才執行。現在由獨立 Electron UtilityProcess 載入 DLL 與解碼，主程序只處理請求／回覆。這也進一步隔離 Whisper 與 llama 的同名 DLL。
2. **限制背景推論 CPU 執行緒。** Windows Whisper 最多 4 條、llama 最多 6 條；較少核心的電腦改用邏輯 CPU 數的一半，最低 1 條。兩個推論子程序使用 Below Normal 優先序，介面與收音主程序維持原優先序。這不是整個 App CPU 百分比的硬上限。
3. **增加 GPU 餘裕。** llama 自動 offload 的 VRAM 計算預留總量 20%、最高 2 GiB，供桌面與其他程式使用。這是估算器的安全餘裕，不會保留一塊獨佔顯示記憶體，也不是 GPU 使用率上限。仍沿用模型與記憶體安全檢查。
4. **停止與故障會釋放背景工作。** Whisper 初始化 30 秒、單次辨識 120 秒未完成會結束該子程序；之後可重建。dispose 會結束子程序、拒絕未完成請求，並讓排隊的舊音訊失效，避免按停止後又重新載入。模型下載完成才建立 Whisper worker。
5. **額外草稿模型的 context 有界限。** Windows draft context 使用 2048 tokens 與相同執行緒預算，避免預設 auto context 依模型上限放大；草稿初始化失敗時清理已建立資源。主要模型既有 2048 context 不變。
6. **不在 Windows 使用時即場編譯 llama。** 使用已安裝的二進位；缺少後端會回報錯誤，避免使用者啟動時突然進行下載／編譯工作。
7. **修正一個實測雙重否定錯譯。** 「参加できないわけじゃないけど、少し遅れます。」原輸出「雖然不能參加，但會稍微遲一些。」。加強提示仍未改善，因此另加範圍受限的結果修正，現在為「雖然也不是不能參加，但會稍微遲一些。」。只處理直接參加能力句首，排除引述與後面再出現參加條件的句子；普通否定不會反轉。

CPU／程序隔離只套用 Windows。Mac/Linux 的原生載入與資源預設路徑保留；共用的日中語意修正有單元測試，但未在實體 Mac 重新驗收。

依據本機安裝版本的型別／原始碼核對設定，並參考 [llama 執行緒與記憶體選項](https://node-llama-cpp.withcat.ai/api/type-aliases/LlamaOptions)、[context 選項](https://node-llama-cpp.withcat.ai/api/type-aliases/LlamaContextOptions)。網站文件可能比專案安裝版本更新，實作以本機型別為準。

## 實機比較

同一台 Windows 11、i9-13980HX（32 logical CPUs）、32 GB RAM、RTX 4050／Intel GPU；同一個 Whisper base、HY-MT1.5 1.8B Q4_K_M、Vulkan 33 GPU layers。沒有縮小模型或降低辨識／翻譯的輸出長度。

| 指標 | 修補前 | 修補後 | 打包內 worker |
|---|---:|---:|---:|
| 主程序 heartbeat 最大間隔 | 1157.6 ms | 35.3 ms | 35.7 ms |
| heartbeat 第 95 百分位 | 31.4 ms | 31.8 ms | 31.9 ms |
| 暖機辨識平均（11 秒音訊） | 74.8 ms | 77.0 ms | 76.0 ms |
| 暖機翻譯平均 | 370.2 ms | 370.1 ms | 369.2 ms |
| 暖機辨識＋翻譯平均 | 445.0 ms | 447.1 ms | 445.2 ms |
| 翻譯模型 ready | 5769 ms | 5437 ms | 5469 ms |

每組 7 輪音訊，暖機平均排除第 0 輪。輸入是公開 whisper.cpp JFK WAV，辨識與繁體中文譯文在各輪相同。本表顯示的是保留翻譯速度並改善主程序回應；不是宣稱翻譯全面加速。模型 ready 受檔案快取影響，不能當作冷啟動提升比例。

heartbeat 的最大間隔在本次測試下降約 97%；第 95 百分位接近。這是無介面 benchmark 主程序的計時，不是整台電腦的輸入延遲，也不是所有使用者都會達到的數字。

### 資源與重複測試

- 60 輪相同音訊全部完成，暖機辨識＋翻譯平均 445.5 ms，heartbeat 最大間隔 35.6 ms。結束時實際觀察到 Whisper 子程序離開。整段約 37.6 秒，不能寫成小時級耐久測試。
- 修補前工作集峰值約 2029.6 MiB。修補後不同輪次約 1968.4–2584.5 MiB；60 輪約 2303.7 MiB，打包內 worker 約 2217.8 MiB。隔離程序有額外成本，**沒有證明 RAM 用量整體下降**。
- 短測累積 Electron 程序 CPU time：基準 15.10 秒，修補後約 9.51–10.08 秒；工作耗時、快取與排程會影響數字，不能單獨推導電腦整體 CPU 降低比例。數據不包含所有外部程式與 GPU 記憶體。
- 新增資源預算、初始化／解碼逾時、原生錯誤、子程序崩潰、dispose／重建、過期音訊及語意保護測試。

### 合併 4.6.5 後重新驗證

- TypeScript／build 再次通過；Desktop 892 通過、2 跳過；E2E 一次執行 41 通過、1 跳過。
- Extension 現為 302 項：300 通過、2 失敗，仍為原符號連結權限與 zip 工具問題，不標成全通過。
- 最新 checkout 及 folder 打包內 worker 都完成真實翻譯與停止釋放。數據見下方兩份 4.6.5 JSON；打包內 worker 的 heartbeat 最大 32.7 ms。
- CI 曾抓到兩項 GPU fixture 在 Linux 誤走原生路徑：測試未明確設定 Windows 平台。已新增每項測試前的平台設定及結束後的平台／mock 清理；本機重跑通過，遠端結果由 PR Checks 保留。
- 新的 Haas-ja 需要另外安裝 speech.cpp runtime 與 haas-q8.gguf；本機沒有該套資產，因此其實機速度／品質仍為 **未通過**，不能套用 Whisper 的結果。

## 準確度的證據範圍

另跑 12 個人工建立的短句，包含日→中、中→日、中→英、英→中，檢查時間、數字、否定、借書方向、遊戲方向、存檔情境與未完句。11 句前後輸出相同，1 句雙重否定修正如上。這些是固定短句抽查，**不是 12 句都完全正確的評分，也沒有算出通用準確率**。敬稱、複雜長句、噪音、多語語音與其他模型仍需要較大且獨立的評測集。

## 驗證結果

| 項目 | 結果 |
|---|---|
| TypeScript 兩個專案檢查／production build | 通過 |
| Desktop 單元測試 | 892 通過、2 原有跳過；跳過項目仍未通過驗收 |
| 完整介面 E2E，一次執行 | 41 通過、1 原有跳過；使用 PLAYWRIGHT_CHANNEL=chrome |
| 真實 Whisper＋翻譯 worker | 通過，包含 60 輪與停止釋放 |
| Windows folder 打包 | 通過，包含 whisper-worker.js |
| 打包內 ASAR worker／原生套件整合 | 通過；由同版本開發 Electron 執行測試 harness，載入打包內兩個 worker 與依賴 |
| 新 NSIS 安裝／升級／解除安裝 | 未通過：本輪未重新驗收 |
| OBS／遊戲並行的長時間真實收音 | 未通過：本輪未完成 |
| 其他 CPU／GPU、低記憶體、無 GPU 電腦 | 未通過：本輪僅測上述硬體 |
| Mac/Linux 實機與全面多語準確率 | 未通過：未完成 |

本機產物為 `repaired-app-resource-465/win-unpacked/VocaLume.exe`（合併最新 4.6.5；第一輪產物另存 repaired-app-resource-optimized） 所在的完整資料夾，必須保留同層檔案。沒有發佈新的正式 release，也沒有把以前的完整功能未驗收項目改成通過。

## 重現與原始數據

下載既有 Windows benchmark 所需的公開資產並先執行 build；`run-benchmark.cjs` 會準備 JFK PCM 與模型目錄。

```powershell
cd desktop-app
npm run build
node scripts/windows-validation/run-benchmark.cjs C:\path\to\assets
node scripts/windows-validation/run-performance.cjs C:\path\to\assets resource-check
$env:VOCALUME_BENCH_ROUNDS='60'
node scripts/windows-validation/run-performance.cjs C:\path\to\assets resource-60
Remove-Item Env:VOCALUME_BENCH_ROUNDS
# optional: verify workers inside a packaged app, using matching Electron runtime
node scripts/windows-validation/run-performance.cjs C:\path\to\assets resource-package C:\path\to\win-unpacked\resources
```

數據：[基準](data/resource-baseline.json)、[第一次修補測量](data/resource-optimized.json)、[語意修補後](data/resource-optimized-final.json)、[60 輪](data/resource-60-rounds.json)、[打包內 worker](data/resource-packaged.json)、[合併 4.6.5 重測](data/resource-465.json)、[4.6.5 打包內 worker](data/resource-465-packaged.json)。只含公開／人工測試文字及彙總數據，沒有私人錄音、金鑰、瀏覽器資料或系統完整日誌。
