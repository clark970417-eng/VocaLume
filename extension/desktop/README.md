# VocaLume native messaging

The current desktop integration uses the complete application in
[desktop-app](../../desktop-app/INTEGRATION.md). The Mac and Windows
installers register a transport using the App's bundled Electron runtime.
Chrome can use browser-only captions without opening the App. When the App
already captures matching system audio, Chrome displays the same subtitles.

Follow the [Mac connection guide](../../docs/installation.md#connect-the-mac-app)
or [Windows connection guide](../../docs/installation.md#connect-the-windows-app).
Use the App and extension from the same build.

For a manual Python relay registration, pass the desktop executable path
with `--app`. Translation is handled by the installed VocaLume application.
