# Windows 修補版使用方式（尚未發佈 release）

這份文件適用於 Windows 修補分支的原始碼建置。GitHub 現有的 4.6.4 安裝檔不會因為分支更新而自動改變。

完整調查、測試數據、限制及 Mac Codex 接手事項：[Windows 實機修補報告](reports/windows-validation-2026-11-06.md)。

## 建置 App

在 `desktop-app` 執行：

```powershell
npm ci
npm run typecheck
npm test -- --maxWorkers=2
npm run build
npm run package:win
```

App 首次使用仍需下載及載入模型。Windows Auto 本機模式優先選 HY-MT1.5 1.8B，來源語言已知時請直接選定；需要 7B 模型時可手動選擇。模型大小與翻譯品質存在取捨，不代表 1.8B 在所有內容上與 7B 相同。

## 在 Windows 連接 extension 與本機 App

1. 將 extension 放在固定資料夾，從 Chrome／Edge／Opera 的擴充功能管理頁載入未封裝擴充功能。
2. 複製該瀏覽器實際分配的 32 字母 extension ID。不同瀏覽器或路徑可能有不同 ID。
3. 在 extension 資料夾執行：

```powershell
& ./desktop/install-windows.ps1 -ExtensionId YOUR_EXTENSION_ID
```

若 App 不是預設安裝位置：

```powershell
& ./desktop/install-windows.ps1 -ExtensionId YOUR_EXTENSION_ID -App 'C:\path\VocaLume.exe'
```

4. 重新載入 extension，選擇桌面模式。

腳本只寫入目前使用者的 Chrome、Edge、Opera native messaging 註冊，並保留原有合法 extension ID。它使用 App 內附的 Electron 執行 native host，不需要另外安裝 Node 或 Python。它不會更改 PowerShell execution policy；遇到組織政策限制時應依政策處理。

此 host 依賴 Electron RunAsNode fuse 保持啟用。若日後關閉該 fuse，需要改成獨立 host executable，不能只沿用此腳本。

目前驗證到 native host ↔ App 的實際通訊，尚未完成一般 Chrome／Edge／Opera 中所有字幕及翻譯情境的端到端驗收。請勿把「已註冊」寫成「所有瀏覽器功能已通過」。
