# Install and use VocaLume

[Download 4.6.6 Beta](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.6) · [Home](../README.md) · [完整中文手冊](user-guide.md)

[Chinese installation video (~2 minutes)](https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.2/VocaLume-Chrome-Setup-Guide-Final-ZH.mp4). The video uses the 4.6.0 interface. Follow the written steps below for the current App connection, model download and first capture.

## Desktop App

Choose the installer for your computer from the release's **Assets** list. The automatically generated “Source code” ZIP is for development, not an App installer.

- **Mac:** choose `VocaLume-4.6.6-arm64.dmg` for Apple M-series or `VocaLume-4.6.6.dmg` for Intel. Drag VocaLume into Applications and launch it there. This beta is unsigned; verify the download, then review its prompt in System Settings → Privacy & Security if macOS blocks the first launch. Do not disable system-wide security checks.
- **Windows x64:** run `VocaLume.Setup.4.6.6.exe`. SmartScreen may identify this unsigned preview as an unrecognized App. Check the repository and checksum before deciding whether to continue.
- **Linux x64:** `VocaLume-4.6.6.AppImage` is experimental. Give the file permission to execute, then launch it. Audio support varies by desktop environment.

Complete **Quick Start** and wait for the model download. Reserve several GB for models. Quality upgrades and cloud services are optional. In **Live translation**, choose the audio source and languages, then press **Start**. Stop capture before changing models. Allow microphone or system-audio permission only when using that source.

## Browser extension

1. Download `vocalume-extension-windows.zip` for Windows Chrome or Edge, or the universal `vocalume-extension.zip` for Chrome, Edge or Opera GX. Both ZIPs include Windows connection tools. Extract one ZIP into a permanent folder, such as Documents/VocaLume Extension.
2. Open `chrome://extensions` in Chrome, `edge://extensions` in Edge or `opera://extensions` in Opera GX.
3. Enable **Developer mode**, click **Load unpacked**, and select the folder containing `manifest.json`.
4. Pin VocaLume to the toolbar and refresh the video or website.

Keep the extracted folder: it is the installed extension. Do not delete it after loading. If you cloned the source repository instead of downloading the extension ZIP, load the repository's **extension/** folder.

## Connect the Mac App

Local browser captions require a one-time registration. Use the matching Mac App and universal extension ZIP.

1. Install VocaLume in Applications and open it once.
2. Copy VocaLume's 32-character ID from Chrome, Edge or Opera GX's extension page.
3. Open Terminal in the extracted extension folder and replace `YOUR_EXTENSION_ID` with the copied ID.

   ```sh
   ELECTRON_RUN_AS_NODE=1 '/Applications/VocaLume.app/Contents/MacOS/VocaLume' desktop/install-mac.cjs YOUR_EXTENSION_ID
   ```

4. Reload the extension and the video page. In VocaLume's speech tab, select the desktop engine and start captions.

The connection uses the App's bundled runtime. If your earlier download only contains `desktop/install.py`, use Python 3 with `python3 desktop/install.py --extension-id YOUR_EXTENSION_ID --app '/Applications/VocaLume.app/Contents/MacOS/VocaLume'` for that matching older App and extension. Run the new installer once when updating an older Python connection. Registration sends no audio.

## Connect the Windows App

Use the matching Windows x64 App and extension ZIP from the release.

1. Install and open VocaLume.
2. Copy VocaLume's 32-character ID from the browser's extension page.
3. Open PowerShell in the extracted extension folder. Replace `YOUR_EXTENSION_ID` with the copied ID and run:

   ```powershell
   & ./desktop/install-windows.ps1 -ExtensionId YOUR_EXTENSION_ID
   ```

4. Reload the extension and your video tab. In VocaLume's speech tab, select the desktop engine and start captions.

The script uses the App's bundled runtime. If the App is installed in a different location, pass its executable path with `-App`. See the [Windows setup guide](windows-repair.md#在-windows-連接-extension-與本機-app) for the full command and verified browser coverage.

## Linux

On Linux, use the standalone App or browser-only mode. Browser mode requires WebGPU, an initial recognition-model download and network text translation.

## First captions and replies

Play a video, open the extension's **語音字幕** (Speech captions) tab, choose languages and single-pair or four-entry captions, then start. Source text appears before its translation. The Stop button remains visible while capture is active.

For posts and chats, open **文字翻譯** (Text translation) and enable website translation when needed. It starts disabled. Allow the current site if prompted by the extension. For replies, type your message, use the translation button, review the result, and send it yourself. The extension never submits messages automatically.

Discord and Twitch keep their own editor state. VocaLume updates that state through the editor's input flow; if a site rejects insertion, a selectable translated draft remains below the controls. Copy that draft and paste it into the original composer. Finish any IME character selection before translating. Failed page/chat translations have a **↻ 再試一次** (Retry) button.

Subtitle appearance is under **字幕與設定** (Captions & settings). Desktop appearance is configured separately in the App’s **Subtitles & OBS** tab. The text outline and caption background are separate controls.

## Optional Gemini and other APIs

Open Captions & settings → network translation service, choose a provider, and enter a model ID your API account can use and its API key. Save and allow the chosen connection. A chat subscription does not necessarily include API access.

Gemini's official `generateContent` request and response format is implemented and locally checked. No real Gemini key was called for this release; account access, model availability and quota remain unverified. The optional connection-test button sends one fixed sample sentence and may use API credit.

An explicitly selected API applies to website text, reply drafts and browser-mode caption translation. Desktop speech uses the engine selected in the App. See [detailed settings](extension-guide.md#使用自己的-api). Never publish keys in issues or screenshots.

## Updating

Stop capture and quit the App, then install the new version in the same location. Replace the extension files in the same permanent directory, reload it in the extension manager, and refresh already-open websites. Keep the same extension ID and downloaded models. Run the matching connection command again when updating an older native companion or if the extension ID changes.

Unsigned preview updates open the GitHub download page rather than silently replacing the App. For rollback, install an older App and matching extension from Releases; see [rollback instructions](releases/README.md#roll-back).

## Troubleshooting

| Problem | Check first |
| --- | --- |
| Stuck on “Translating…” | Stop capture, check that the model or API is ready, refresh the page, then restart once. |
| Native host exited / forbidden | Check App location and extension ID, then repeat registration for your platform. |
| Source text but no translation | Check the translation engine and error status. Failed captions can be retried from the transcript. |
| No sound or captions | Check the playing tab, selected audio source and required permissions. |
| Excess heat or growing delay | Use a smaller model and avoid running two inference sessions or a demanding game at once. |
| Unwanted page translation | Turn off website translation or revoke the site's opt-in in VocaLume. |

Report the App/extension versions, computer, browser, languages and reproduction steps in [Issues](https://github.com/clark970417-eng/VocaLume/issues/new/choose). Exclude keys, private conversations and personal recordings.

## Verify downloads

Compare your file's SHA-256 with `SHA256SUMS.txt` from the release. Use `shasum -a 256 <file>` on macOS, `sha256sum <file>` on Linux or `Get-FileHash <file> -Algorithm SHA256` in Windows PowerShell. The `release-manifest.json` identifies the source commit and build. Checksums do not replace developer signing.
