# VocaLume dual-stream lab

From the lab worktree, run `node scripts/dual-live-lab.mjs`. This uses Playwright from the main checkout's desktop-app dependencies. If the Playwright-managed browser is unavailable, set `VOCALUME_LAB_CHROMIUM` to a compatible Chrome for Testing executable.

The launcher opens two windows with fresh temporary profiles and loads VocaLume in browser mode in both. Open a different live stream in each window, select the subtitle languages and start captions from each window's extension toolbar. Press Enter in the terminal to close both lab windows and discard their temporary profiles.

Use `--smoke` to launch both profiles headlessly, verify the installed extensions have independent settings and close them. Run `node --test extension/tests/dual-live-lab.test.mjs` to check that simulated recognition events produce separate subtitles and stopping one capture leaves the other active.

Actual concurrent audio capture, model performance and translation quality are still unmeasured. This lab uses two profiles. Shared-profile capture and concurrent desktop-mode sessions require separate changes.
