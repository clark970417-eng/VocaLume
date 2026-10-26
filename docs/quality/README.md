# 語音品質驗收

[回首頁](../../README.md) · [操作驗證](../retests/4.6.0.md) · [固定語料](../../tests/fixtures/product-quality-v1.json)

這套流程用來累積可以比較的證據。**目前仍是公開預覽版，尚未完成商售品質驗收。** 不能以 CI、合成聲音或自動字串符合率代替雙語人工審查。

## 四種證據分開看

| 項目 | 衡量什麼 | 不能證明什麼 |
| --- | --- | --- |
| 自動程式檢查 | 排序、失敗恢復、設定、API 格式、可編譯 | 聽得準、翻得準 |
| 固定語料 | 14 句日→中、14 句中→日與 8 組日文前後文；辨識與翻譯分開看 | 真實直播所有口音與語境 |
| 連續測試 | 至少 60 分鐘，最慢字幕、熱狀態、缺字與中斷 | 多種內容、所有電腦都穩定 |
| 人工／實機 | 雙語者檢查漏譯、否定、時態、名字；比較 Mac / Windows | 尚未執行的裝置或情境 |

## 固定語料 v1

語料包含快語速、口語省略、否定、時態、數字、名字、合成遊戲音效、輪流說話與重疊說話。標準答案記錄「應保留的意思」，不要求唯一譯法。

音訊使用 macOS 的 Kyoko、Meijia、Tingting 系統聲音。日文第二個「說話者」是 Kyoko 的變調版本；遊戲音效是固定合成訊號。這些是可重跑的壓力樣本，**不是真實不同日本人的錄音、口音測試或實際遊戲錄音**。

生成後的 manifest 記錄每個 WAV 的 SHA-256。不同版本、電腦必須使用同一份 WAV 與 manifest；重新合成的音訊不能直接當成完全相同的基準。先凍結案例與預期意思，再測量；不要為了讓結果通過而修改預期。

## 開發者重跑方式

以下指令在 `desktop-app` 資料夾執行。需 Node.js 22.12+、已安裝的依賴、Mac MLX Whisper 環境與 HY-MT1.5 Q4_K_M 模型。此 v1 自動音訊執行器使用 Apple Silicon 的 MLX；Windows 使用下面的實機流程，目前不能直接執行此 MLX 指令。

```sh
# 只生成一次；新版本比較沿用同一組輸出
node scripts/prepare-product-quality.mjs .test-out/product-quality-v1
node scripts/build-speech-benchmark.cjs out/speech-benchmark-product-v1
```

建立**新的隔離測試設定目錄**，僅將其中 `models` 連結到已有模型資料夾；不要複製含 API Key 的設定。接著使用自己的絕對路徑執行：

```sh
COMPARE_PROFILE=/absolute/path/to/isolated-profile \
CORPUS_AUDIO_DIR=/absolute/path/to/product-quality-v1 \
COMPARE_REPORT=/absolute/path/to/quality.json \
COMPARE_LABEL=4.6.0-product-v1 \
node_modules/.bin/electron out/speech-benchmark-product-v1/quality.js
```

這項檢查輸出每句實際辨識、翻譯、ASR／翻譯時間與 CER（字元錯誤率），另跑同一句的純文字翻譯以辨別錯誤來源。計時**不含收音、VAD、網頁顯示**。自動意思檢查只是待人工查看的訊號，不應寫成「準確率」。

### 60 分鐘連續處理

```sh
COMPARE_PROFILE=/absolute/path/to/isolated-profile \
COMPARE_AUDIO=/absolute/path/to/repository/tests/japanese-fixture.wav \
COMPARE_REPORT=/absolute/path/to/soak.json \
COMPARE_LABEL=4.6.0-repeated-synthetic-ja \
COMPARE_ROUNDS=274 \
node_modules/.bin/electron out/speech-benchmark-product-v1/paced.js
```

10.722 秒固定日文聲音加 2.5 秒靜音，274 輪約 60 分鐘，經過真正 Silero、分段、辨識與翻譯。每輪保存進度；提早關閉或錯誤不能記為完成。記錄 p50 / p95 / p99 / 最大耗時、最慢十句、前後半段差異與熱狀態。延遲從**擷取區塊結束**算到翻譯完成，不是從使用者耳朵聽到聲音到畫面顯示的完整延遲。

重複輸入可能受快取幫助；這不是不同內容的未快取吞吐量。測試沒有操作實際瀏覽器或麥克風；仍需另跑完整畫面測試和 1–2 小時真實內容。請勿同時跑另一個模型測試，並記錄當時是否有遊戲、錄影或建置工作。

```sh
node scripts/report-product-quality.mjs \
  ../tests/fixtures/product-quality-v1.json \
  /absolute/path/to/quality.json /absolute/path/to/soak.json \
  /absolute/path/to/report-directory
```

產生 `summary.json` 與 `human-review.json`。缺少案例、空白輸出、未滿一小時或提早終止都不會通過自動完整性檢查。通過仍不是商售資格。

## 雙語人工審查

請實際懂日文與中文的人聽固定音訊，填寫 `human-review.json` 的審查者及每列評分。音訊、純文字與前文案例分開評分：

- **0**：沒有此類錯誤。
- **1**：小錯，主要意思仍可理解。
- **2**：改變意思或漏掉關鍵內容。

評分欄位是漏譯、否定、時態、名字、自然度；填上修正或原因。否定、人物、時間或重要動作錯誤需優先修復；不能只看句子是否流暢。任何 2 分都不能標成驗收通過。表格缺列、重複列、未填審查者或對不上來源報告雜湊也不會通過。程式產生的表格預設全部留白，沒有冒充人工完成。

## 裝置與真實內容

| 建議驗證組別 | 執行內容 | 狀態 |
| --- | --- | --- |
| Apple Silicon Mac，16 GB | 同一語料、60–120 分鐘、Opera 單組／四組 | 本機個別操作測試已有記錄，完整結果見本資料夾 |
| Apple Silicon Mac，8 GB | 相同設定；特別看記憶體與熱壓力 | 待實機 |
| Intel Mac | 原生 Whisper；相同語料與時間 | 待實機 |
| Windows 11，Intel／AMD、16 GB、內顯 | 原生 Whisper；相同語料與時間 | 待實機 |
| Windows 11，NVIDIA 獨顯、16 GB 以上 | 記錄 GPU 型號、驅動與相同引擎 | 待實機 |

這些是驗證組別，不是已全部支援或已測過的宣稱。CI 的 Mac / Windows runner 只算建置與程式檢查。每台記錄 OS、CPU、GPU、RAM、引擎／模型、插電與否、背景工作、測試時間、缺失字幕和最慢樣本。

真實內容請使用可授權的音訊，日中兩個方向各含正常語速、快語速、不同說話者、遊戲音效與重疊。私人錄音與聊天室不要提交到公開 Repo。比較版本時保持模型、音訊、設定一致，至少重跑三次才討論改善；目前沒有宣稱新的速度提升。

## 發布門檻

本版可作為 Beta 收集回饋。要宣稱商售品質，還缺：完成雙語人工審查、在上述實機組別跑相同條件、至少 1–2 小時不同內容的完整收音／畫面測試，以及簽章與各平台安裝驗證。

延遲目標應先按產品模式訂定，再觀察是否達標；不能只選最快樣本。建議先要求無崩潰／永久等待、每句都有完成或明確錯誤、無關鍵否定／時態誤譯，並以 p95 與 p99 而非平均值決定使用體驗是否可接受。
