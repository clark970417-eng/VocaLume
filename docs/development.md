# 原始碼與文件導覽

新用戶請先看[下載與使用手冊](user-guide.md)。根目錄保留瀏覽器執行檔，因為 Opera 的未封裝擴充功能直接從這裡載入；搬動整個根目錄可能改變 Extension ID。

| 位置 | 用途 |
| --- | --- |
| `manifest.json`、根目錄 JS/MJS/CSS/HTML | Extension 執行程式 |
| `desktop-app/src` | Electron App、辨識與翻譯引擎 |
| `desktop` | macOS 瀏覽器連接與保留的舊 Python host |
| `tests` | 可執行回歸檢查與固定測試資料；不是下載安裝檔 |
| `docs/quality` | 品質基準、人工審查與實機驗收 |
| `docs/retests` | 各版本已完成的驗證證據 |
| `docs/archive` | 舊交接、比較與階段進度；不代表現況 |
| `docs/releases` | 對使用者的版本說明 |
| `docs/brand` | Logo 與原始圖示 |
| `.github/workflows`、`scripts` | CI、安裝檔與發布檢查 |

模型、API 金鑰、個人錄音、`.test-out` 與打包產物不放進 Git。發布 ZIP 只收執行需要的檔案、連接安裝器與說明，不含整個原始碼、測試結果或歷史報告。

## 本機開發

需 Node.js 22.12 或更新版本。下列自動檢查不會呼叫付費 API：

```sh
node --test tests/*.test.mjs
cd desktop-app
npm ci
npm run typecheck
npm test -- --run
npm run build
```

模型實測見[品質流程](quality/README.md)；瀏覽器操作見[驗證紀錄](retests/4.6.0.md)。`tests/capture.html` 是使用自備合成聲音的瀏覽器測試頁，不會替使用者發送留言。

## 發布

App、Extension、lockfile 版本需一致。`node scripts/check-release-version.mjs beta-v4.6.0` 可先檢查。`beta-v*` 標籤觸發跨平台未簽章預覽建置；全部必要產物齊全後才發布 Release。`v*` 正式流程另需簽章憑證，不能拿 Beta 輸出冒充簽章版。

`scripts/verify-release-assets.mjs` 檢查七個必要下載包、Extension 版本與連接依賴，再生成來源 manifest 與包含 manifest 在內的 SHA-256 清單。新增公開版本時更新 README 的下載版本與 `docs/releases/版本.md`。

桌面部分保留 [上游 MIT 授權](../desktop-app/LICENSE)；第三方和模型資訊在[授權說明](../THIRD_PARTY_NOTICES.md)。
