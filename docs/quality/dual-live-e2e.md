# Dual-stream browser integration test

This macOS test uses two separate Chrome for Testing profiles. Each runs the VocaLume extension in browser mode and captures a different synthetic Japanese clip. The test checks that both profiles show their own complete Traditional Chinese subtitles, then stops the first profile and checks that the second still translates a new clip.

## Run

1. Install the development dependencies with `npm ci --prefix desktop-app`.
2. Run `cd desktop-app && npx playwright install chromium && cd ..`.
3. Verify that the macOS Kyoko voice is available with `say -v '?'`. If necessary, download Kyoko in System Settings under Accessibility → Read & Speak.
4. Run `node scripts/dual-live-e2e.mjs`. Set `VOCALUME_TEST_CHROMIUM` only if using a different Chrome for Testing executable.

Keep roughly 3 GB of free disk space for the two browser profiles and their speech models. Whisper inference runs on the machine. Internet access is required for the model download and for the default browser text translation service, which receives only the synthetic fixture text. The script generates all audio on demand and removes its temporary profiles when it exits. It does not use your everyday browser profile or require an API key.

A pass validates concurrent browser-mode tab capture, real recognition and translation, overlay delivery, and isolation when one stream stops. The fixture tab is local to the test even though it uses a YouTube URL to load the normal caption overlay. Chrome for Testing allows the test extension to start capture without an interactive toolbar click. Public livestreams, sustained performance, a shared browser profile, and concurrent desktop-mode capture are separate tests.
