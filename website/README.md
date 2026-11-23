# VocaLume website

Live website: https://vocalume.vercel.app/

The product site includes Traditional Chinese, Simplified Chinese, English, Japanese and Korean pages, responsive layouts, interactive localized video posters, a mobile translation PWA (`/mobile/`), and installation instructions. It is served as static HTML/CSS/JavaScript with zero client-side framework or bundler dependencies.

## Preview

From this folder, run `python3 -m http.server 4173 --directory dist` (or `npm run preview`) and open http://localhost:4173. The checked-in site does not require a build step.

## Update

- Main localized pages (`dist/*.html`) are generated from `scripts/build-main-pages.py`, and download pages (`dist/download/*.html`) are generated from `scripts/build-download-pages.py`. Run `npm run build:pages` after editing copy or layout templates.
- Shared styling lives in `dist/site.css` and `dist/download.css`; shared behavior lives in `dist/app.js`, `dist/language.js`, `dist/demo-posters.js`, `dist/demo-autoplay.js`, and `dist/download-os.js`.
- Update the live-stream and chat preview translations in `dist/demo-posters.js`. The previews keep the Japanese source text. The Japanese page uses Traditional Chinese as the example translation target.
- Vercel serves `dist/` as configured in `vercel.json`, including static asset caching and security headers. Credentials, deployment account settings, and local environment files are excluded.

## Media and downloads

The stream excerpt retains source attribution and the non-affiliation notice. Browser/chat framing is a simulation, identified in the site. Videos are demonstration media, not standalone software assets. Installer downloads point to the verified GitHub Releases assets; repository and release links also point to GitHub. Model downloads and optional external API services require network access.

## Automatic website language

First home-page visits use `/api/site-language`: KR → Korean; JP → Japanese; TW/HK/MO → Traditional Chinese; CN/SG → Simplified Chinese; other countries → English. Missing location/service failure falls back to browser language. Manual preferences take priority, including selecting the current language during a pending lookup. Explicit localized pages do not geolocate. The `/api/site-language` endpoint is private/no-store and returns no IP.

## Tests

Run `npm test` (or `node --test tests/*.test.mjs`).
