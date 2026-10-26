# VocaLume

Multilingual live captions, website reading and reviewable translated replies. Choose local models or an optional API provider.

[Download 4.6.0 Beta](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.0) · [繁體中文](../README.md) · [Report an issue](https://github.com/clark970417-eng/VocaLume/issues/new/choose)

## Download

| Platform | Asset |
| --- | --- |
| Apple Silicon Mac | `VocaLume-4.6.0-arm64.dmg` |
| Intel Mac | `VocaLume-4.6.0.dmg` |
| Windows x64 | `VocaLume.Setup.4.6.0.exe` |
| Linux x64, experimental | `VocaLume-4.6.0.AppImage` |
| Opera GX / Chrome extension | `vocalume-extension.zip` |

These preview installers are unsigned. Verify `SHA256SUMS.txt` and follow the [installation guide](../BETA-TESTING.md). Model weights download separately on first use.

## Get started

1. Install the desktop App and complete Quick Start. For standalone use, choose the audio source and language pair, then Start.
2. Extract the extension ZIP into a permanent folder. Open `opera://extensions` or `chrome://extensions`, enable Developer mode and choose **Load unpacked**.
3. For **Mac local browser captions**, register the connection using Python 3 from the extension folder. Replace `YOUR_EXTENSION_ID` with the ID shown by the browser:

```sh
python3 desktop/install.py --extension-id YOUR_EXTENSION_ID --app '/Applications/VocaLume.app/Contents/MacOS/VocaLume'
```

4. Reload the extension and the video page. Choose speech languages and start captions from the extension.

The bundled connection installer currently supports **macOS Opera GX / Chrome**. Windows and Linux can use the standalone desktop App; browser-only mode is also available with WebGPU and network text translation. Their equivalent browser-to-local-App setup is not included yet.

Website text translation starts disabled. Enable it only where needed. The writing assistant creates a draft for your review and never submits it. Caption appearance and optional API settings are in the extension's settings tab.

## What's new

Simpler navigation, persistent capture controls, selectable Gemini / OpenAI / Claude and compatible APIs, improved sentence boundaries, short-fragment context, name preservation and failure recovery. [Release details](releases/4.6.0.md).

Gemini's request/response contract is implemented and locally checked. No paid live-key request was made for this release; access still depends on your model, API account and quota.

## More

[User manual (Chinese)](user-guide.md) · [Privacy](../PRIVACY.md) · [Quality evaluation](quality/README.md) · [Source guide](development.md) · [Third-party notices](../THIRD_PARTY_NOTICES.md)

The desktop component derives from [LiveTranslate](https://github.com/rioX432/live-translate) with its MIT attribution preserved. Model licenses are separate. Automated checks do not establish commercial readiness, human translation quality or performance on every device.
