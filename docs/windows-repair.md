# Windows 本機連接與驗收

請從 [VocaLume 4.6.7 測試版](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.7) 下載 Windows x64 的 `VocaLume.Setup.4.6.7.exe` 與 `vocalume-extension-windows.zip`。通用版 `vocalume-extension.zip` 也附有 Windows 本機連接工具。

完整調查、測試數據、限制及 Mac Codex 接手事項：[Windows 4.6.6 實機驗收報告](reports/windows-acceptance-2026-11-06.md)。

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

1. 安裝並開啟 App。將擴充功能解壓到固定資料夾，從 Chrome、Edge 或 Opera GX 的擴充功能管理頁載入含有 `manifest.json` 的資料夾。
2. 複製該瀏覽器實際分配的 32 字母 extension ID。不同瀏覽器或路徑可能有不同 ID。
3. 在擴充功能資料夾開啟 PowerShell，將 `YOUR_EXTENSION_ID` 換成剛複製的值並執行。

   ```powershell
   & ./desktop/install-windows.ps1 -ExtensionId YOUR_EXTENSION_ID
   ```

   若 App 不在預設位置，請指定執行檔的位置。

   ```powershell
   & ./desktop/install-windows.ps1 -ExtensionId YOUR_EXTENSION_ID -App 'C:\path\VocaLume.exe'
   ```

4. 重新載入擴充功能與影片頁，在「語音字幕」選擇桌面模式。從舊版連接工具升級或 ID 變更時，請重新執行註冊。

腳本只寫入目前使用者的 Chrome、Edge、Opera native messaging 註冊，並保留原有合法 extension ID。它使用 App 內附的 Electron 執行 native host，不需要另外安裝 Node 或 Python。它不會更改 PowerShell execution policy；遇到組織政策限制時應依政策處理。

此 host 依賴 Electron RunAsNode fuse 保持啟用。若日後關閉該 fuse，需要改成獨立 host executable，不能只沿用此腳本。

上述 4.6.6 實機報告記錄了 Chrome for Testing 和 Edge 的本機橋接、文字翻譯與測試音訊轉字幕。真實網站的分頁收音、留言與 Opera GX 仍待完整驗收。
