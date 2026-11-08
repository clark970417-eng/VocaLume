# VocaLume browser extension for Windows

1. Download [the Windows x64 App](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.7/VocaLume.Setup.4.6.7.exe) and [the Windows extension](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.7/vocalume-extension-windows.zip) from the [4.6.7 Beta release](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.7). Run the App installer and complete **Quick Start** to download the models.
2. Extract `vocalume-extension-windows.zip` to a permanent folder. Open `chrome://extensions` in Chrome, `edge://extensions` in Edge or `opera://extensions` in Opera GX. Enable **Developer mode**, select **Load unpacked**, and choose the folder containing `manifest.json`.
3. Copy the 32-character extension ID shown by your browser. Open PowerShell in the extracted extension folder and replace `YOUR_EXTENSION_ID` with the copied ID.

   ```powershell
   & ./desktop/install-windows.ps1 -ExtensionId YOUR_EXTENSION_ID
   ```

   If you installed the App outside the default location, pass its executable path.

   ```powershell
   & ./desktop/install-windows.ps1 -ExtensionId YOUR_EXTENSION_ID -App 'C:\path\VocaLume.exe'
   ```

The installer uses the App’s bundled runtime. Reload the extension and your video tab. In VocaLume's speech panel, select the desktop engine for local subtitles. You can also use the browser engine with a compatible WebGPU adapter and network text translation.

To update, keep the extracted folder and extension ID. Stop capture, remove the previous extension files, then extract the new ZIP to that same folder. Reload the extension and refresh any open video tabs. Run the connection command again when upgrading from an older companion or if the extension ID changes.

[繁體中文使用手冊](https://github.com/clark970417-eng/VocaLume/blob/main/docs/user-guide.md) · [Windows 設定與疑難排解](https://github.com/clark970417-eng/VocaLume/blob/main/docs/windows-repair.md)
