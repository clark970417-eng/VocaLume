# Install and use VocaLume

[Download 4.6.0 Beta](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.0) · [Home](../README.md) · [完整中文手冊](user-guide.md)

## Desktop App

Choose the installer for your computer from the release's **Assets** list. The automatically generated “Source code” ZIP is for development, not an App installer.

- **Mac:** choose `arm64.dmg` for Apple M-series or the other DMG for Intel. Drag VocaLume into Applications and launch it there. This beta is unsigned; verify the download, then review its prompt in System Settings → Privacy & Security if macOS blocks the first launch. Do not disable system-wide security checks.
- **Windows x64:** run `VocaLume.Setup.4.6.0.exe`. SmartScreen may identify this unsigned preview as an unrecognized App. Check the repository and checksum before deciding whether to continue.
- **Linux x64:** the AppImage is experimental. Give the file permission to execute, then launch it. Audio support varies by desktop environment.

Complete **Quick Start** and wait for the model download. Reserve several GB for models. Quality upgrades and cloud services are optional. In **Translate**, choose the audio source and languages, then press **Start**. Stop capture before changing models. Allow microphone or system-audio permission only when using that source.

## Browser extension

1. Extract `vocalume-extension.zip` into a permanent folder, such as Documents/VocaLume Extension.
2. Open `opera://extensions` in Opera GX or `chrome://extensions` in Chrome.
3. Enable **Developer mode**, click **Load unpacked**, and select the folder containing `manifest.json`.
4. Pin VocaLume to the toolbar and refresh the video or website.

Keep the extracted folder: it is the installed extension. Do not delete it after loading. If you cloned the source repository instead of downloading the extension ZIP, load the repository's **extension/** folder.

## Connect the Mac App

Local browser captions require this one-time registration. The bundled installer currently supports **macOS Opera GX / Chrome**.

1. Install VocaLume in Applications and open it once. Python 3 must already be available. The relay needs no extra Python packages; the optional MLX recognition engine has its own environment requirements. New users can start with the App's Whisper Local engine.
2. Copy VocaLume's 32-character extension ID from the browser's extension page.
3. Open Terminal in the extracted extension folder. Replace `YOUR_EXTENSION_ID` below with that ID:

```sh
python3 desktop/install.py --extension-id YOUR_EXTENSION_ID --app '/Applications/VocaLume.app/Contents/MacOS/VocaLume'
```

4. Reload the extension and the video page. In VocaLume's speech tab, select the desktop engine and start captions.

Do not omit `--app`; that selects the retained legacy Python inference host. If your App or extension ID changes, repeat registration. No audio is sent during registration.

Windows and Linux have standalone desktop installers, but this ZIP does not yet include their equivalent browser native-host installation. Use the standalone App or choose browser-only mode in the extension. Browser mode requires WebGPU, an initial recognition-model download and network text translation.

## First captions and replies

Play a video, open the extension's **語音字幕** (Speech captions) tab, choose languages and single-pair or four-entry captions, then start. Source text appears before its translation. The Stop button remains visible while capture is active.

For posts and chats, open **文字翻譯** (Text translation) and enable website translation when needed. It starts disabled. Allow the current site if prompted by the extension. For replies, type your message, use the translation button, review the result, and send it yourself. The extension never submits messages automatically.

Subtitle appearance is under **字幕與設定** (Captions & settings). Desktop appearance is configured separately in the App's **Subtitles** tab. The text outline and caption background are separate controls.

## Optional Gemini and other APIs

Open Captions & settings → network translation service, choose a provider, and enter a model ID your API account can use and its API key. Save and allow the chosen connection. A chat subscription does not necessarily include API access.

Gemini's official `generateContent` request and response format is implemented and locally checked. No real Gemini key was called for this release; account access, model availability and quota remain unverified. The optional connection-test button sends one fixed sample sentence and may use API credit.

An explicitly selected API applies to website text, reply drafts and browser-mode caption translation. Desktop speech uses the engine selected in the App. See [detailed settings](extension-guide.md#使用自己的-api). Never publish keys in issues or screenshots.

## Updating

Stop capture and quit the App, then install the new version in the same location. Replace the extension files in the same permanent directory, reload it in the extension manager, and refresh already-open websites. Keep the same extension ID and downloaded models. If the ID changes, register the Mac connection again.

Unsigned preview updates open the GitHub download page rather than silently replacing the App. For rollback, install an older App and matching extension from Releases; see [rollback instructions](releases/README.md#roll-back).

## Troubleshooting

| Problem | Check first |
| --- | --- |
| Stuck on “Translating…” | Stop capture, check that the model or API is ready, refresh the page, then restart once. |
| Native host exited / forbidden | Check App location and extension ID, then repeat Mac registration. |
| Source text but no translation | Check the translation engine and error status. Failed captions can be retried from the transcript. |
| No sound or captions | Check the playing tab, selected audio source and required permissions. |
| Excess heat or growing delay | Use a smaller model and avoid running two inference sessions or a demanding game at once. |
| Unwanted page translation | Turn off website translation or revoke the site's opt-in in VocaLume. |

Report the App/extension versions, computer, browser, languages and reproduction steps in [Issues](https://github.com/clark970417-eng/VocaLume/issues/new/choose). Exclude keys, private conversations and personal recordings.

## Verify downloads

Compare your file's SHA-256 with `SHA256SUMS.txt` from the release. On macOS use `shasum -a 256 <file>`; in Windows PowerShell use `Get-FileHash <file> -Algorithm SHA256`. The `release-manifest.json` identifies the source commit and build. Checksums do not replace developer signing.
