# Privacy notice for preview builds

VocaLume does not automatically post messages. Writing translation inserts a reviewable draft; the user decides whether to submit it.

## Data processed locally

Local recognition and local translation engines process audio and text on the user's computer. Captions, settings, glossaries, model files, and saved session records remain on that computer unless the user exports or deletes them.

## Data sent to providers

Browser translation and any cloud engine the user enables may send captured audio, recognized speech, page text, chat text, or a writing draft to the selected provider. That provider's privacy terms apply. API credentials are stored in the browser's local extension storage or the desktop application's local settings store. They are not intentionally included in project telemetry or GitHub reports.

## Website access

When website text translation is enabled, the extension can read pages you visit to find visible titles, comments, chat messages, and message editors. YouTube, Twitch, TikTok, Bilibili, X, Facebook, and Instagram use dedicated page rules; other websites use conservative semantic rules. It adds translations and draft controls to matching content. It does not submit a post automatically.

## Diagnostics and feedback

Preview testers choose what to share through GitHub. The optional in-app diagnostic export contains the app version, operating system and architecture, total memory, selected engine and language identifiers, non-content audio settings, and the last 20 session health summaries. It excludes API keys, raw audio, recognized speech, subtitles, translations, and browsing history. Testers should still review the file before posting it.

## Deletion

Users can clear browser extension storage, delete saved sessions in the application, remove downloaded models and uninstall the application. Uninstalling may leave local application data so a reinstall can retain settings; it can be deleted manually from the operating system's application-data location.

Security problems should be reported privately through the repository's GitHub Security Advisory form rather than a public issue.


## Website language selection

On the first home-page visit, the website requests a language suggestion from its own hosting service, using the country header supplied by Vercel. The application endpoint returns only a language code; it does not store or return an IP address or contact an external IP lookup provider. Normal hosting access logs are subject to the hosting provider's policies. Missing location/service failure falls back to browser language. A manual language choice is saved in this browser's local storage and takes priority. Explicit localized page links remain unchanged unless a saved manual preference applies. VPNs can affect the detected country.

網站首次開啟首頁時，依 Vercel 提供的網路所在地區建議語言；無法判斷時使用瀏覽器語言。語言判斷程式不儲存或回傳 IP，也不呼叫外部 IP 查詢服務；主機平台的一般存取紀錄仍依其政策處理。手動選擇保存在目前瀏覽器並優先使用，VPN 可能影響地區判斷。
