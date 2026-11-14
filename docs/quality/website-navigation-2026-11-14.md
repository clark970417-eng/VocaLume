# Website navigation verification — 2026-11-14

Checked the production site at https://vocalume.vercel.app/ using the browser language menu and actual navigation clicks.

| Layout | Languages | Visible links | Correct anchor and active state |
| --- | --- | --- | --- |
| Mobile viewport, 390 × 844 | Traditional Chinese, Simplified Chinese, English, Japanese, Korean | 30/30 | 30/30 |
| Desktop viewport, 1440 × 900 | Same five languages | 30/30 | 30/30 |

Each language exposes captions, chat, OBS, setup, FAQ and updates. All labels fit within their link boxes and the viewport. Clicking each link updates the URL to the matching existing section and marks that link as selected. Mobile navigation uses two rows of three links; desktop uses one row of six.

This checks responsive browser layouts, not physical iOS or Android devices. It does not revalidate translation engines or desktop installers.

The GitHub update preserves the existing localized posters and other website functionality; only navigation labels, layout and selected-link styling change.
