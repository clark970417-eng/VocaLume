# -*- coding: utf-8 -*-
"""Generate the five localized VocaLume landing pages from a single template."""
from pathlib import Path

dist = Path(__file__).resolve().parents[1] / 'dist'
VERSION = '4.6.6'
ASSET_VERSION = '20261123'
SITE_ORIGIN = 'https://vocalume.vercel.app'
RELEASE_URL = f'https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v{VERSION}'

ORBIT_SVG = (
    '<svg class="language-orbit" viewBox="0 0 200 200" fill="none" aria-hidden="true">'
    '<defs>'
    '<linearGradient id="orbit-blue" x1="20" y1="24" x2="128" y2="112" gradientUnits="userSpaceOnUse">'
    '<stop offset="0%" stop-color="#dfeefb"/><stop offset="100%" stop-color="#b5cfe6"/>'
    '</linearGradient>'
    '<linearGradient id="orbit-rose" x1="76" y1="78" x2="184" y2="164" gradientUnits="userSpaceOnUse">'
    '<stop offset="0%" stop-color="#f6dfeb"/><stop offset="100%" stop-color="#dfb2c8"/>'
    '</linearGradient>'
    '<filter id="orbit-shadow" x="-15%" y="-15%" width="130%" height="140%">'
    '<feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#405d7c" flood-opacity=".14"/>'
    '</filter>'
    '</defs>'
    '<g class="orbit-bubble-a" filter="url(#orbit-shadow)">'
    '<path d="M36 42h84c11 0 18 7 18 18v32c0 11-7 18-18 18H74l-20 17 5-17H36c-11 0-18-7-18-18V60c0-11 7-18 18-18Z" '
    'fill="url(#orbit-blue)" fill-opacity=".88" stroke="#fff" stroke-opacity=".75" stroke-width="1.5"/>'
    '</g>'
    '<g class="orbit-bubble-b" filter="url(#orbit-shadow)">'
    '<path d="M84 94h80c11 0 18 7 18 18v28c0 11-7 18-18 18h-20l5 16-19-16H84c-11 0-18-7-18-18v-28c0-11 7-18 18-18Z" '
    'fill="url(#orbit-rose)" fill-opacity=".86" stroke="#fff" stroke-opacity=".75" stroke-width="1.5"/>'
    '</g>'
    '</svg>'
)

PAGES = {
    'index.html': {
        'lang': 'zh-Hant',
        'canonical': f'{SITE_ORIGIN}/',
        'og_locale': 'zh_TW',
        'title': 'VocaLume — 讀懂、回覆，也聽懂。',
        'description': '用 VocaLume 看懂直播、閱讀外語訊息，也用自己的語言回覆。本機即時語音字幕與聊天室翻譯免費使用，支援 OBS 輸出與自選翻譯 API。',
        'og_description': '用 VocaLume 看懂直播、閱讀外語訊息，也用自己的語言回覆。本機即時語音字幕與聊天室翻譯免費使用，支援 OBS 輸出與自選翻譯 API。',
        'twitter_description': '本機即時語音字幕、跨語聊天翻譯與 OBS 主播字幕輸出，免費公開測試中。',
        'og_image_alt': 'VocaLume 即時直播字幕與跨語聊天翻譯示範介面',
        'ld_description': '本機即時語音字幕、跨語聊天翻譯與 OBS 字幕輸出工具，免費供非商業使用。',
        'skip': '跳到內容',
        'nav_label': '主要導覽',
        'nav': ('功能示範', '開始使用', '常見問題', '最新消息'),
        'lang_label': '選擇語言',
        'lang_current': '繁體中文',
        'lang_auto': '自動（依 IP 地區）',
        'eyebrow': '本機翻譯・公開測試中',
        'h1': '讀懂另一種語言，<br><em>接住每一句話。</em>',
        'lead': '直播裡的笑點、聊天室的日常、想親口說的謝謝。<br class="desktop">讓字幕跟上對話，也讓你的回覆跨過語言。',
        'cta_primary': '免費下載體驗',
        'cta_mobile': '手機文字翻譯',
        'mobile_hint': '手機版可翻譯聊天訊息。直播字幕與擴充功能請使用電腦版。',
        'note_ja': '<i>晚上好</i>',
        'preview_top': ('一個小小的語言練習', '互動示例'),
        'sender_role': '示範角色',
        'read_lang': 'zh-Hant',
        'read_result': '今天謝謝你來！',
        'reply_label': '用自己的語言回覆',
        'reply_lang_attr': '',
        'example_reply': '今天的直播很開心，下次也會來！',
        'translate_btn': ('中 → 日', '看回覆示例'),
        'preview_footer': ('讀日文 → 中文', '寫中文 → 日文'),
        'note_en': '<i lang="zh-Hant">太好了！</i>',
        'illustration_note': '預設文字示例，不是線上翻譯服務',
        'demo_video_note': '',
        'demo1': {
            'title': '語音字幕',
            'copy': '日文語音搭配繁體中文字幕。<br>也能閱讀聊天室裡的日文留言。<br>影片是 20 秒的示範。',
            'aria': 'VocaLume 日文直播字幕與聊天室翻譯的情境示範',
            'fallback': '你的瀏覽器不支援影片播放。',
            'source': '鹿乃まほろ・原直播 ↗',
            'fine': '實錄字幕，介面為模擬。<br>#まほろくりっぷ・非官方，無合作或推薦關係。',
        },
        'demo2': {
            'title': '跨語聊天',
            'copy': '先讀懂日文留言，再用繁體中文寫回覆。<br>翻成日文後，確認草稿再送出。',
            'aria': 'Discord 風格的三輪跨語對話模擬示範',
            'fine': '模擬對話；確認譯文後自行送出。',
        },
        'demo3': {
            'title': '主播雙向翻譯',
            'copy': '用 OBS 讓觀眾看到日文語音的繁中字幕；同時，主播可在自己的聊天室讀到外語留言的日文譯文。',
            'aria': '主播雙向翻譯',
            'fine': '合成日文語音示範；聊天室譯文僅主播可見。',
        },
        'features_h2': '一段對話，<br><em>兩邊都照顧到。</em>',
        'features_p': '分別設定閱讀、輸入與語音的語言。<br>想簡單一點，也能同步閱讀與回覆方向。',
        'features': [
            ('01', '聽懂正在說的話', '擷取分頁或麥克風聲音，顯示雙語字幕。切換單組或四組顯示，依習慣調整字體、顏色與描邊。', '♫'),
            ('02', '讀懂貼文與聊天', '在支援的網站翻譯外文內容。網站文字翻譯由你決定何時開啟，避免不需要的翻譯打擾。', '文'),
            ('03', '用自己的語言回覆', '輸入中文，先轉成日文草稿；檢查內容與語氣後，再由你送出。也能選擇其他支援的語言組合。', '↗'),
            ('04', '把翻譯字幕放進直播', '用桌面 App 把麥克風語音翻成字幕，再輸出到 OBS。主播也能用擴充功能閱讀 YouTube 或 Twitch 的外語留言。', '◉'),
        ],
        'how_h2': '第一次用，三步就好。',
        'how_guide_url': 'https://github.com/clark970417-eng/VocaLume/blob/main/docs/user-guide.md',
        'how_guide_label': '完整安裝說明 ↗',
        'steps': [
            ('下載並安裝', '到 GitHub 選擇適合裝置的 App，依說明安裝瀏覽器擴充功能，完成模型下載。'),
            ('選你的語言', '設定聽到的語言與翻譯語言。聊天時，也能讓閱讀與回覆自動反向同步。'),
            ('開始聽，也開始聊', '播放影片並開啟字幕；要回覆時，先翻譯草稿，再確認並自行送出。'),
        ],
        'install_note': f'{VERSION} 提供 Windows、Mac 與實驗性 Linux App，以及 Chrome／Opera GX 擴充功能。Mac 本機網頁字幕需完成一次 App 連接，請先閱讀安裝教學。',
        'faq_h2': '先把問題，<br>說清楚。',
        'faqs': [
            (False, '怎麼把字幕加到 OBS？', '在 VocaLume 桌面 App 選擇麥克風和翻譯語言，開啟 OBS 字幕輸出。在 OBS 新增文字來源，勾選「從檔案讀取」，並選取 App 顯示的字幕檔。要把字幕播給觀眾看，請將文字來源放進直播場景。'),
            (False, '翻譯一定會成功、準確嗎？', '不保證每次都成功或完全正確。音質、背景音樂、多人同時說話、口音、斷句、專有名詞，以及裝置效能與所選模型，都可能影響結果。過短或缺少上下文的句子也可能誤譯。若翻譯失敗，可依介面提示重試或查看字幕記錄；重要內容請對照原文確認。目前尚無足以代表所有裝置、語言與情境的成功率或準確率數據。'),
            (True, '真的可以免費使用嗎？', '本機辨識與翻譯不需要付費 API，使用自己的電腦運算。首次使用需下載模型；若改用自己提供的外部 API，費用依服務商計算。'),
            (False, '需要很強的電腦嗎？', '處理速度取決於裝置、模型、音訊內容與負載。建議先下載公開測試版，確認在你的裝置上是否適合；本機運算也會使用電量與硬體資源。'),
            (False, '每個網站都能使用嗎？', '網站相容性仍在持續改善。不同網站與編輯器可能有不同限制；請依安裝說明操作，有問題歡迎附上使用環境到 GitHub 回報。'),
            (False, '翻譯後會自動送出訊息嗎？', '不會。翻譯會先成為草稿，由你檢查內容，再自行送出。實際翻譯可能出現辨識或語意錯誤，重要內容請再次確認。'),
        ],
        'closing_eyebrow': '公開測試中・持續更新',
        'closing_h2': '還不是最終版本，<br>接下來，一起慢慢完善。',
        'closing_p': 'VocaLume 仍在開發中，會持續改善翻譯品質、效能與網站相容性。<br>你可以收藏專案，隨時回來查看新版本與開發進度；<br>遇到問題，或有想加入的功能，也歡迎直接留下回饋。',
        'closing_star': '收藏專案・追蹤進度 ☆',
        'closing_feedback': '提供回饋 ↗',
        'update_note': 'Star 可收藏專案；若想收到新版本通知，可在 GitHub 的 Watch → Custom 中勾選 Releases。',
        'footer_tagline': '讀懂、回覆，也聽懂。',
        'footer_issues': '回報問題 ↗',
        'footer_privacy': '隱私說明 ↗',
        'license_link': '使用授權',
        'license_text': '免費供非商業使用。商用與轉售須經授權，衍生版本須註明源自 VocaLume。',
    },
    'en.html': {
        'lang': 'en',
        'canonical': f'{SITE_ORIGIN}/en.html',
        'og_locale': 'en_US',
        'title': 'VocaLume — Read, reply, and understand.',
        'description': 'Watch streams, read foreign-language messages, and reply in your own language with VocaLume. Free local live captions, chat translation, and OBS output.',
        'og_description': 'Watch streams, read foreign-language messages, and reply in your own language with VocaLume. Free local live captions, chat translation, and OBS output.',
        'twitter_description': 'Free local live captions, cross-language chat translation, and OBS caption output in public beta.',
        'og_image_alt': 'VocaLume live stream captions and cross-language chat translation preview',
        'ld_description': 'Free local live captions, cross-language chat translation, and OBS output for desktop and browser.',
        'skip': 'Skip to content',
        'nav_label': 'Main navigation',
        'nav': ('Demos', 'Setup', 'FAQ', 'Updates'),
        'lang_label': 'Choose language',
        'lang_current': 'English',
        'lang_auto': 'Automatic (IP region)',
        'eyebrow': 'LOCAL TRANSLATION · PUBLIC BETA',
        'h1': 'Another language.<br><em>A closer connection.</em>',
        'lead': 'The jokes in a stream. The little moments in chat. A thank-you you want to share.<br class="desktop">Follow the conversation, and reply in your own language.',
        'cta_primary': 'Download for free',
        'cta_mobile': 'Mobile text translation',
        'mobile_hint': 'Translate chat messages on mobile. Live captions and the browser extension are available on desktop.',
        'note_ja': ' <i>Good evening</i>',
        'preview_top': ('A little conversation', 'Interactive example'),
        'sender_role': 'Demo character',
        'read_lang': 'en',
        'read_result': 'Thanks for coming today!',
        'reply_label': 'Reply in your own language',
        'reply_lang_attr': ' lang="en"',
        'example_reply': 'I loved today’s stream! I’ll be back next time!',
        'translate_btn': ('EN → JA', 'Show reply example'),
        'preview_footer': ('Read Japanese → English', 'Write English → Japanese'),
        'note_en': '<i lang="en">Glad to hear it!</i>',
        'illustration_note': 'Preset example, not a live translation service',
        'demo_video_note': '<p class="demo-video-language">The preview shows English translations. The original video uses Traditional Chinese.</p>',
        'demo1': {
            'title': 'Voice captions',
            'copy': 'See Japanese speech with English captions, and read translated live chat. The video below shows the same workflow.',
            'aria': 'VocaLume Japanese live-stream captions and chat translation scenario',
            'fallback': 'Your browser does not support video playback.',
            'source': 'Kano Mahoro · Source ↗',
            'fine': 'Recorded captions, simulated UI.<br>#まほろくりっぷ · Unofficial; no affiliation or endorsement.',
        },
        'demo2': {
            'title': 'Cross-language chat',
            'copy': 'Read the Japanese message in English, then write a reply in English.<br>Translate it to Japanese and review the draft before sending.',
            'aria': 'Three-round Discord-style cross-language conversation simulation',
            'fine': 'Simulated chat. Review translations before sending.',
        },
        'demo3': {
            'title': 'Creator translation',
            'copy': 'Viewers see Traditional Chinese captions for Japanese speech in OBS. The creator reads Japanese translations of foreign-language chat in a separate panel.',
            'aria': 'Creator translation',
            'fine': 'Synthesized Japanese speech; translated chat is visible only to the streamer.',
        },
        'features_h2': 'One conversation.<br><em>Both sides understood.</em>',
        'features_p': 'Choose separate languages for reading, typing, and speech.<br>Or link reading and reply directions for a simpler setup.',
        'features': [
            ('01', 'Understand spoken conversations', 'Capture tab or microphone audio for bilingual captions. Show one or four caption groups and customize fonts, colors, and outlines.', '♫'),
            ('02', 'Read posts and chat', 'Translate text on supported websites. You decide when to enable it, so translations only appear when you want them.', '文'),
            ('03', 'Reply in your own language', 'Type in English and get a Japanese draft. Check the wording and tone, then send it yourself. Other supported language pairs are available too.', '↗'),
            ('04', 'Put translated captions on stream', 'Use the desktop app to translate your microphone audio and send captions to OBS. The browser extension translates foreign-language chat on YouTube or Twitch for the streamer.', '◉'),
        ],
        'how_h2': 'Three steps to get started.',
        'how_guide_url': 'https://github.com/clark970417-eng/VocaLume/blob/main/docs/installation.md',
        'how_guide_label': 'Full installation guide ↗',
        'steps': [
            ('Download and install', 'Get the app for your device from GitHub, follow the extension setup guide, and download the models.'),
            ('Choose your languages', 'Choose the spoken and translation languages. For chat, you can link reading and reply languages in opposite directions.'),
            ('Start listening and chatting', 'Play a video and start captions. To reply, translate your draft, review it, and send it yourself.'),
        ],
        'install_note': f'{VERSION} includes Windows, Mac and experimental Linux apps plus the Chrome / Opera GX extension. Local Mac browser captions require one-time app registration; follow the installation guide.',
        'faq_h2': 'A few things<br>worth knowing.',
        'faqs': [
            (False, 'How do I add captions to OBS?', 'Choose your microphone and translation language in the VocaLume desktop app, then enable OBS caption output. Add a text source in OBS, enable Read from file, and select the caption file shown in the app. Include that text source in your stream scene so viewers can see it.'),
            (False, 'Will translations always work and be accurate?', 'Success and accuracy are not guaranteed. Audio quality, background music, overlapping speakers, accents, sentence boundaries, names, device performance, and the selected model can affect results. Short phrases without context may be mistranslated. If a translation fails, follow the interface prompts to retry or check caption history. Verify important content against the original. We do not yet have success-rate or accuracy figures representative of all devices, languages, and situations.'),
            (True, 'Is it really free?', 'Local speech recognition and translation run on your computer without a paid API. Models download on first use. Optional external APIs are billed by their providers.'),
            (False, 'Do I need a powerful computer?', 'Speed depends on your hardware, model, audio, and system load. Try the public beta to see how it performs on your device. Local processing uses battery and hardware resources.'),
            (False, 'Does it work on every website?', 'Website compatibility is still improving, and some sites or editors have limitations. Follow the setup guide and report issues on GitHub with your environment details.'),
            (False, 'Are translated messages sent automatically?', 'No. Translations become drafts for you to review and send. Recognition and translation can make mistakes, so double-check important messages.'),
        ],
        'closing_eyebrow': 'PUBLIC BETA · STILL EVOLVING',
        'closing_h2': 'This is a beginning.<br>More improvements are on the way.',
        'closing_p': 'VocaLume is not a final release. Translation quality, performance,<br>and website compatibility will continue to improve with future updates.<br>Follow the project’s progress, or tell us what could work better for you.',
        'closing_star': 'Bookmark the project ☆',
        'closing_feedback': 'Share feedback ↗',
        'update_note': 'A Star bookmarks the repository. For release notifications, use GitHub Watch → Custom → Releases.',
        'footer_tagline': 'Read, reply, and understand.',
        'footer_issues': 'Report an issue ↗',
        'footer_privacy': 'Privacy ↗',
        'license_link': 'License',
        'license_text': 'Free for noncommercial use. Commercial use and resale require permission. Derivatives must credit VocaLume.',
    },
    'ja.html': {
        'lang': 'ja',
        'canonical': f'{SITE_ORIGIN}/ja.html',
        'og_locale': 'ja_JP',
        'title': 'VocaLume — 読んで、返して、わかり合う。',
        'description': 'VocaLume は配信のリアルタイム字幕、チャット翻訳、OBS 字幕出力に対応したローカル翻訳ツール。無料で使え、自分の言葉で返信の下書きも作れます。',
        'og_description': '配信のリアルタイム字幕、チャット翻訳、OBS 字幕出力に対応した無料のローカル翻訳ツール。自分の言葉で返信の下書きも作れます。',
        'twitter_description': '配信のリアルタイム字幕・チャット翻訳・OBS 字幕出力に対応する無料ローカル翻訳ツール。',
        'og_image_alt': 'VocaLume のライブ字幕・チャット翻訳プレビュー',
        'ld_description': '配信のリアルタイム字幕、チャット翻訳、OBS 字幕出力に対応した無料ローカル翻訳ツール。',
        'skip': '本文へ移動',
        'nav_label': 'メインナビゲーション',
        'nav': ('デモ', '使い方', 'FAQ', '更新情報'),
        'lang_label': '言語を選択',
        'lang_current': '日本語',
        'lang_auto': '自動（IP の地域）',
        'eyebrow': 'ローカル翻訳・公開ベータ',
        'h1': '違う言葉でも、<br><em>もっと近くに。</em>',
        'lead': '配信の冗談も、チャットの何気ない一言も、伝えたい「ありがとう」も。<br class="desktop">会話を理解して、自分の言葉で返そう。',
        'cta_primary': '無料でダウンロード',
        'cta_mobile': 'スマホでテキスト翻訳',
        'mobile_hint': 'スマホでチャットを翻訳できます。ライブ字幕と拡張機能はパソコン版をご利用ください。',
        'note_ja': '<i lang="zh-Hant">晚上好</i>',
        'preview_top': ('小さな会話', '操作できるサンプル'),
        'sender_role': 'デモ用キャラクター',
        'read_lang': 'zh-Hant',
        'read_result': '今天謝謝你來！',
        'reply_label': '自分の言葉で返信',
        'reply_lang_attr': ' lang="zh-Hant"',
        'example_reply': '今天的直播很開心，下次也會來！',
        'translate_btn': ('ZH → JA', '返信例を見る'),
        'preview_footer': ('読む：日本語 → 繁体字中国語', '返信：繁体字中国語 → 日本語'),
        'note_en': '<i lang="zh-Hant">太好了！</i>',
        'illustration_note': '定型サンプルです。リアルタイム翻訳ではありません。',
        'demo_video_note': '',
        'demo1': {
            'title': '音声字幕',
            'copy': '日本語の音声に繁体字中国語の字幕を表示。<br>ライブチャットの日本語も翻訳できます。<br>動画は20秒の使用例です。',
            'aria': '日本語配信の字幕とチャット翻訳デモ',
            'fallback': 'お使いのブラウザーは動画再生に対応していません。',
            'source': '鹿乃まほろ・元の配信 ↗',
            'fine': '字幕は実録、画面は模擬。<br>#まほろくりっぷ・非公式、提携・推奨なし。',
        },
        'demo2': {
            'title': '多言語チャット',
            'copy': '日本語のメッセージを繁体字中国語で読み、繁体字中国語で返信を入力します。<br>日本語に翻訳し、下書きを確認してから送信します。',
            'aria': 'Discord風の多言語チャットデモ',
            'fine': '模擬会話。訳文を確認してから送信。',
        },
        'demo3': {
            'title': '配信者向け翻訳',
            'copy': 'OBS では日本語の音声に繁体字中国語の字幕を表示。配信者は自分のチャット画面で外国語コメントの日本語訳を読めます。',
            'aria': '配信者向け翻訳',
            'fine': '日本語の合成音声を使用。チャットの訳文は配信者側のみ表示。',
        },
        'features_h2': 'ひとつの会話を、<br><em>お互いに理解する。</em>',
        'features_p': '読む・書く・音声の言語を個別に設定できます。<br>読む方向と返信方向を連動させれば、設定も簡単に。',
        'features': [
            ('01', '話している内容を理解する', 'タブやマイクの音声から二言語字幕を表示。1組・4組表示を切り替え、フォント、色、縁取りも調整できます。', '♫'),
            ('02', '投稿やチャットを読む', '対応サイトのテキストを翻訳。必要なときだけ自分で有効にできます。', '文'),
            ('03', '自分の言葉で返信する', '中国語を日本語の下書きに翻訳。表現や語調を確認してから、自分で送信します。他の対応言語の組み合わせも使えます。', '↗'),
            ('04', '翻訳字幕を配信に表示', 'デスクトップアプリでマイク音声を翻訳し、字幕を OBS に出力できます。拡張機能では YouTube や Twitch の外国語コメントも読めます。', '◉'),
        ],
        'how_h2': '3つのステップで始めよう。',
        'how_guide_url': 'https://github.com/clark970417-eng/VocaLume/blob/main/docs/installation.md',
        'how_guide_label': '詳しいインストールガイド ↗',
        'steps': [
            ('ダウンロードしてインストール', 'GitHubから端末に合うアプリを入手し、拡張機能の設定ガイドに沿ってモデルをダウンロードします。'),
            ('言語を選ぶ', '音声の言語と翻訳先を選びます。チャットでは、読む方向と返信方向を逆向きに連動できます。'),
            ('聞く・話すを始める', '動画を再生して字幕を開始。返信は下書きを翻訳して確認した後、自分で送信します。'),
        ],
        'install_note': f'{VERSION} は Windows、Mac、実験的な Linux アプリと Chrome／Opera GX 拡張機能を提供しています。Mac のローカルブラウザ字幕には初回のアプリ接続設定が必要です。',
        'faq_h2': '知っておきたい<br>いくつかのこと。',
        'faqs': [
            (False, 'OBS に字幕を追加するには？', 'VocaLume のデスクトップアプリでマイクと翻訳先の言語を選び、OBS 字幕出力を有効にします。OBS でテキストソースを追加し、ファイルからの読み込みを有効にして、アプリに表示された字幕ファイルを選びます。視聴者に表示するには、そのテキストソースを配信シーンに追加してください。'),
            (False, '翻訳は必ず成功し、正確ですか？', '成功や正確さは保証されません。音質、BGM、複数人の発話、アクセント、区切り方、固有名詞、端末性能、モデルによって結果は変わります。文脈のない短い表現は誤訳されることがあります。失敗時は画面の案内に従って再試行するか、字幕履歴をご確認ください。重要な内容は原文と照合してください。全端末・全言語・全場面を代表する成功率や精度の数値は、まだありません。'),
            (True, '本当に無料ですか？', 'ローカル音声認識・翻訳は、有料APIを使わず自分のPCで処理します。初回にモデルをダウンロードします。任意の外部APIは提供元の料金がかかります。'),
            (False, '高性能なPCが必要ですか？', '速度は端末、モデル、音声、負荷によって変わります。公開ベータでご自身の端末での動作をご確認ください。ローカル処理は電力とハードウェア資源を使用します。'),
            (False, 'どのサイトでも使えますか？', '対応は改善中です。一部サイトや入力欄には制限があります。ガイドを確認し、問題があれば環境情報を添えてGitHubにご報告ください。'),
            (False, '翻訳したメッセージは自動送信されますか？', 'いいえ。翻訳は下書きになり、自分で確認・送信します。認識や翻訳は間違うことがあるため、重要なメッセージは再確認してください。'),
        ],
        'closing_eyebrow': '公開ベータ・継続的に改善中',
        'closing_h2': 'まだ完成版ではありません。<br>これから、一緒に育てていきます。',
        'closing_p': 'VocaLumeは開発中です。翻訳品質や性能、<br>サイトへの対応を、今後も改善していきます。<br>開発の進み具合をチェックしたり、使ってみた感想をお寄せください。',
        'closing_star': 'プロジェクトを保存・進捗を見る ☆',
        'closing_feedback': 'フィードバックを送る ↗',
        'update_note': 'Starでプロジェクトを保存できます。リリース通知はGitHubのWatch → Custom → Releasesで設定できます。',
        'footer_tagline': '読んで、返して、わかり合う。',
        'footer_issues': '不具合を報告 ↗',
        'footer_privacy': 'プライバシー ↗',
        'license_link': '利用ライセンス',
        'license_text': '非商用利用は無料です。商用利用・再販売には許可が必要です。派生版には VocaLume が元になっていることを明記してください。',
    },
    'ko.html': {
        'lang': 'ko',
        'canonical': f'{SITE_ORIGIN}/ko.html',
        'og_locale': 'ko_KR',
        'title': 'VocaLume — 읽고, 답하고, 이해하세요.',
        'description': 'VocaLume로 실시간 방송 자막과 외국어 채팅을 이해하고 내 언어로 답장하세요. 무료 로컬 번역과 OBS 자막 출력을 지원합니다.',
        'og_description': 'VocaLume로 실시간 방송 자막과 외국어 채팅을 이해하고 내 언어로 답장하세요. 무료 로컬 번역과 OBS 자막 출력을 지원합니다.',
        'twitter_description': '무료 로컬 실시간 방송 자막, 다국어 채팅 번역, OBS 자막 출력 도구 공개 베타.',
        'og_image_alt': 'VocaLume 실시간 방송 자막 및 다국어 채팅 번역 미리보기',
        'ld_description': '무료 로컬 실시간 방송 자막, 다국어 채팅 번역, OBS 자막 출력 도구.',
        'skip': '본문으로 이동',
        'nav_label': '주 메뉴',
        'nav': ('기능 데모', '사용법', '도움말', '업데이트'),
        'lang_label': '언어 선택',
        'lang_current': '한국어',
        'lang_auto': '자동(IP 지역)',
        'eyebrow': '로컬 번역 · 공개 베타',
        'h1': '서로 다른 언어도,<br><em>더 가까운 대화로.</em>',
        'lead': '방송 속 농담, 채팅의 소소한 순간, 전하고 싶은 고마운 마음까지.<br class="desktop">대화를 이해하고, 내 언어로 답해 보세요.',
        'cta_primary': '무료 다운로드',
        'cta_mobile': '모바일 텍스트 번역',
        'mobile_hint': '휴대폰에서 채팅을 번역할 수 있습니다. 실시간 자막과 확장 프로그램은 데스크톱에서 이용하세요.',
        'note_ja': ' <i>안녕하세요</i>',
        'preview_top': ('작은 대화', '직접 눌러 보는 예시'),
        'sender_role': '가상 인물',
        'read_lang': 'ko',
        'read_result': '오늘 와 줘서 고마워요!',
        'reply_label': '내 언어로 답하기',
        'reply_lang_attr': ' lang="ko"',
        'example_reply': '오늘 방송 정말 즐거웠어요! 다음에도 올게요!',
        'translate_btn': ('KO → JA', '답장 예시 보기'),
        'preview_footer': ('읽기: 일본어 → 한국어', '쓰기: 한국어 → 일본어'),
        'note_en': '<i lang="ko">다행이에요!</i>',
        'illustration_note': '미리 준비된 예시이며 실시간 번역 서비스가 아닙니다.',
        'demo_video_note': '<p class="demo-video-language">미리보기에는 한국어 번역이 표시됩니다. 원본 영상은 번체 중국어로 제작되었습니다.</p>',
        'demo1': {
            'title': '음성 자막',
            'copy': '일본어 음성을 한국어 자막으로 보고, 실시간 채팅의 일본어 메시지도 번역해 읽을 수 있어요.<br>아래 영상에서는 같은 사용 흐름을 보여 드려요.',
            'aria': '일본어 방송 자막 및 채팅 번역 시연',
            'fallback': '브라우저가 동영상 재생을 지원하지 않습니다.',
            'source': 'Kano Mahoro · 원본 ↗',
            'fine': '자막은 실록, 화면은 모의.<br>#まほろくりっぷ · 비공식, 제휴·추천 없음.',
        },
        'demo2': {
            'title': '다국어 채팅',
            'copy': '일본어 메시지를 한국어로 읽고 한국어로 답장을 쓰세요.<br>일본어로 번역한 뒤 초안을 확인하고 전송하세요.',
            'aria': 'Discord 스타일 다국어 채팅 시연',
            'fine': '모의 대화. 번역을 확인한 뒤 직접 전송하세요.',
        },
        'demo3': {
            'title': '스트리머 번역',
            'copy': '시청자는 OBS 방송에서 일본어 음성의 번체 중국어 자막을 보고, 스트리머는 채팅창에서 외국어 메시지의 일본어 번역을 읽습니다.',
            'aria': '스트리머 번역',
            'fine': '일본어 합성 음성 시연. 채팅 번역은 스트리머에게만 표시됩니다.',
        },
        'features_h2': '하나의 대화를,<br><em>서로 이해하도록.</em>',
        'features_p': '읽기, 쓰기, 음성 언어를 따로 설정하세요.<br>읽기와 답장 방향을 연결하면 더 간편합니다.',
        'features': [
            ('01', '음성 대화 이해하기', '탭이나 마이크의 음성으로 이중 언어 자막을 표시합니다. 자막 1개 또는 4개 그룹을 선택하고 글꼴, 색상, 외곽선을 조절할 수 있습니다.', '♫'),
            ('02', '게시물과 채팅 읽기', '지원되는 사이트의 텍스트를 번역합니다. 필요할 때 직접 켤 수 있습니다.', '文'),
            ('03', '내 언어로 답하기', '한국어를 입력해 일본어 초안으로 바꿉니다. 표현과 말투를 확인한 후 직접 전송하세요. 다른 지원 언어 조합도 사용할 수 있습니다.', '↗'),
            ('04', '번역 자막을 방송에 표시', '데스크톱 앱에서 마이크 음성을 번역하고 OBS로 자막을 출력하세요. 브라우저 확장 프로그램으로 YouTube 또는 Twitch의 외국어 채팅도 읽을 수 있습니다.', '◉'),
        ],
        'how_h2': '세 단계로 시작하세요.',
        'how_guide_url': 'https://github.com/clark970417-eng/VocaLume/blob/main/docs/installation.md',
        'how_guide_label': '전체 설치 안내 ↗',
        'steps': [
            ('다운로드 및 설치', 'GitHub에서 기기에 맞는 앱을 받고 확장 프로그램 설정 안내에 따라 모델을 다운로드하세요.'),
            ('언어 선택', '듣는 언어와 번역할 언어를 선택하세요. 채팅에서는 읽기와 답장 방향을 반대로 연결할 수 있습니다.'),
            ('듣고 대화하기', '영상을 재생하고 자막을 시작하세요. 답장할 때는 초안을 번역하고 확인한 뒤 직접 전송합니다.'),
        ],
        'install_note': f'{VERSION} 버전은 Windows, Mac, 실험용 Linux 앱과 Chrome / Opera GX 확장 프로그램을 제공합니다. Mac 로컬 브라우저 자막에는 최초 앱 연결 설정이 필요하므로 설치 안내를 확인하세요.',
        'faq_h2': '시작하기 전에<br>궁금한 점들.',
        'faqs': [
            (False, 'OBS에 자막을 어떻게 추가하나요?', 'VocaLume 데스크톱 앱에서 마이크와 번역 언어를 선택한 뒤 OBS 자막 출력을 켜세요. OBS에서 텍스트 소스를 추가하고 파일에서 읽기를 켠 다음 앱에 표시된 자막 파일을 선택하세요. 시청자에게 보여 주려면 해당 소스를 방송 장면에 추가하세요.'),
            (False, '번역은 항상 성공하고 정확한가요?', '성공과 정확성을 보장하지 않습니다. 음질, 배경 음악, 겹치는 말소리, 억양, 문장 구분, 고유명사, 기기 성능, 모델이 결과에 영향을 줍니다. 문맥이 없는 짧은 표현은 오역될 수 있습니다. 실패하면 화면 안내에 따라 다시 시도하거나 자막 기록을 확인하세요. 중요한 내용은 원문과 대조하세요. 모든 기기, 언어, 상황을 대표하는 성공률이나 정확도 수치는 아직 없습니다.'),
            (True, '정말 무료인가요?', '로컬 음성 인식과 번역은 유료 API 없이 내 컴퓨터에서 실행됩니다. 처음 사용할 때 모델을 다운로드합니다. 외부 API는 선택 사항이며 제공업체의 요금이 적용됩니다.'),
            (False, '고성능 컴퓨터가 필요한가요?', '속도는 기기, 모델, 음성, 시스템 부하에 따라 달라집니다. 공개 베타로 내 기기에서의 성능을 확인하세요. 로컬 처리는 전력과 하드웨어 자원을 사용합니다.'),
            (False, '모든 사이트에서 쓸 수 있나요?', '사이트 호환성은 개선 중이며 일부 사이트나 입력창에는 제한이 있습니다. 안내를 확인하고 문제가 있으면 사용 환경과 함께 GitHub에 알려 주세요.'),
            (False, '번역된 메시지가 자동으로 전송되나요?', '아니요. 번역은 초안으로 표시되며 직접 확인하고 전송합니다. 인식과 번역에 오류가 있을 수 있으니 중요한 메시지는 다시 확인하세요.'),
        ],
        'closing_eyebrow': '공개 베타 · 계속 개선 중',
        'closing_h2': '아직 최종 버전이 아닙니다.<br>앞으로 함께 다듬어 갑니다.',
        'closing_p': 'VocaLume은 개발 중입니다. 번역 품질과 성능,<br>사이트 호환성을 계속 개선할 예정입니다.<br>개발 소식을 확인하거나 더 나아졌으면 하는 점을 알려 주세요.',
        'closing_star': '프로젝트 저장 · 진행 상황 보기 ☆',
        'closing_feedback': '피드백 보내기 ↗',
        'update_note': 'Star로 프로젝트를 저장할 수 있습니다. 새 버전 알림은 GitHub의 Watch → Custom → Releases에서 설정하세요.',
        'footer_tagline': '읽고, 답하고, 이해하세요.',
        'footer_issues': '문제 신고 ↗',
        'footer_privacy': '개인정보 보호 ↗',
        'license_link': '사용 라이선스',
        'license_text': '비상업적 용도로 무료로 사용할 수 있습니다. 상업적 이용과 재판매에는 허가가 필요합니다. 파생 버전에는 VocaLume을 바탕으로 제작했음을 밝혀야 합니다.',
    },
    'zh-CN.html': {
        'lang': 'zh-Hans',
        'canonical': f'{SITE_ORIGIN}/zh-CN.html',
        'og_locale': 'zh_CN',
        'title': 'VocaLume — 读懂、回复，也听懂。',
        'description': '用 VocaLume 看懂直播、阅读外语消息，也用自己的语言回复。本地实时语音字幕与聊天室翻译免费使用，支持 OBS 输出与自选翻译 API。',
        'og_description': '用 VocaLume 看懂直播、阅读外语消息，也用自己的语言回复。本地实时语音字幕与聊天室翻译免费使用，支持 OBS 输出与自选翻译 API。',
        'twitter_description': '本地实时语音字幕、跨语聊天翻译与 OBS 主播字幕输出，免费公开测试中。',
        'og_image_alt': 'VocaLume 实时直播字幕与跨语聊天翻译演示界面',
        'ld_description': '本地实时语音字幕、跨语聊天翻译与 OBS 字幕输出工具，免费供非商业使用。',
        'skip': '跳到内容',
        'nav_label': '主要导览',
        'nav': ('功能演示', '开始使用', '常见问题', '最新消息'),
        'lang_label': '选择语言',
        'lang_current': '简体中文',
        'lang_auto': '自动（按 IP 地区）',
        'eyebrow': '本地翻译・公开测试中',
        'h1': '读懂另一种语言，<br><em>接住每一句话。</em>',
        'lead': '直播里的笑点、聊天室的日常、想亲口说的谢谢。<br class="desktop">让字幕跟上对话，也让你的回复跨过语言。',
        'cta_primary': '免费下载体验',
        'cta_mobile': '手机文字翻译',
        'mobile_hint': '手机版可翻译聊天消息。直播字幕和扩展程序请使用电脑版。',
        'note_ja': ' <i>晚上好</i>',
        'preview_top': ('一个小小的语言练习', '交互示例'),
        'sender_role': '示范角色',
        'read_lang': 'zh-Hans',
        'read_result': '今天谢谢你来！',
        'reply_label': '用自己的语言回复',
        'reply_lang_attr': '',
        'example_reply': '今天的直播很开心，下次也会来！',
        'translate_btn': ('中 → 日', '查看回复示例'),
        'preview_footer': ('读日文 → 中文', '写中文 → 日文'),
        'note_en': '<i lang="zh-Hans">太好了！</i>',
        'illustration_note': '预设文字示例，不是在线翻译服务',
        'demo_video_note': '<p class="demo-video-language">封面显示简体中文译文，播放后可查看繁体中文版原始演示。</p>',
        'demo1': {
            'title': '语音字幕',
            'copy': '日语语音配上简体中文字幕。<br>也能看懂直播间里的日语留言。<br>下方视频演示同样的操作流程。',
            'aria': 'VocaLume 日语直播字幕与聊天室翻译的情境演示',
            'fallback': '你的浏览器不支持视频播放。',
            'source': '鹿乃まほろ・原直播 ↗',
            'fine': '实录字幕，界面为模拟。<br>#まほろくりっぷ・非官方，无合作或推荐关系。',
        },
        'demo2': {
            'title': '跨语聊天',
            'copy': '先读懂日语消息，再用简体中文写回复。<br>翻译成日语后，确认草稿再发送。',
            'aria': 'Discord 风格的三轮跨语对话模拟演示',
            'fine': '模拟对话；确认译文后自行发送。',
        },
        'demo3': {
            'title': '主播双向翻译',
            'copy': '通过 OBS 让观众看到日语语音的繁体中文字幕，同时主播可在自己的聊天室阅读外语留言的日文译文。',
            'aria': '主播双向翻译',
            'fine': '合成日语语音演示；聊天译文仅主播可见。',
        },
        'features_h2': '一段对话，<br><em>两边都照顾到。</em>',
        'features_p': '分别设置阅读、输入与语音的语言。<br>想简单一点，也能同步阅读与回复方向。',
        'features': [
            ('01', '听懂正在说的话', '采集浏览器标签页或麦克风的声音，显示双语字幕。切换单组或四组显示，依习惯调整字体、颜色与描边。', '♫'),
            ('02', '读懂帖子与聊天', '在支持的网站翻译外文内容。网站文本翻译由你决定何时打开，避免不必要的打扰。', '文'),
            ('03', '用自己的语言回复', '输入中文，先转成日文草稿；检查内容与语气后，再由你送出。也能选择其他支持的语言组合。', '↗'),
            ('04', '把翻译字幕放进直播', '用桌面 App 翻译麦克风语音并输出字幕到 OBS。主播也能用扩展阅读 YouTube 或 Twitch 的外语留言。', '◉'),
        ],
        'how_h2': '第一次用，三步就好。',
        'how_guide_url': 'https://github.com/clark970417-eng/VocaLume/blob/main/docs/README.zh-CN.md',
        'how_guide_label': '完整安装说明 ↗',
        'steps': [
            ('下载并安装', '到 GitHub 选择适合设备的 App，依说明安装浏览器扩展程序，完成模型下载。'),
            ('选你的语言', '设置听到的语言与翻译语言。聊天时，也能让阅读与回复自动反向同步。'),
            ('开始听，也开始聊', '播放视频并打开字幕；要回复时，先翻译草稿，再确认并自行送出。'),
        ],
        'install_note': f'{VERSION} 提供 Windows、Mac 与实验性 Linux App，以及 Chrome／Opera GX 扩展程序。Mac 本地网页字幕需完成一次 App 连接，请先阅读安装教程。',
        'faq_h2': '先把问题，<br>说清楚。',
        'faqs': [
            (False, '怎么把字幕添加到 OBS？', '在 VocaLume 桌面 App 中选择麦克风和翻译语言，开启 OBS 字幕输出。在 OBS 中添加文字来源，勾选“从文件读取”，并选择 App 显示的字幕文件。要让观众看到字幕，请把文字来源放进直播场景。'),
            (False, '翻译一定会成功、准确吗？', '不保证每次都成功或完全正确。音质、背景音乐、多人同时说话、口音、断句、专有名词，以及设备性能与所选模型，都可能影响结果。过短或缺少上下文的句子也可能误译。若翻译失败，可按界面提示重试或查看字幕记录。重要内容请对照原文确认。目前尚无足以代表所有设备、语言与情境的成功率或准确率数据。'),
            (True, '真的可以免费使用吗？', '本地识别与翻译不需要付费 API，使用自己的电脑运算。首次使用需下载模型；若改用自己提供的外部 API，费用依服务商计算。'),
            (False, '需要很强的电脑吗？', '处理速度取决于设备、模型、音频内容与负载。建议先下载公开测试版，确认在你的设备上是否适合；本地运算也会使用电量与硬件资源。'),
            (False, '每个网站都能使用吗？', '网站兼容性仍在持续改善。不同网站与编辑器可能有不同限制；请依安装说明操作，有问题欢迎附上使用环境到 GitHub 报告。'),
            (False, '翻译后会自动送出消息吗？', '不会。翻译会先成为草稿，由你检查内容，再自行送出。实际翻译可能出现识别或语意错误，重要内容请再次确认。'),
        ],
        'closing_eyebrow': '公开测试中・持续更新',
        'closing_h2': '还不是最终版本，<br>接下来，一起慢慢完善。',
        'closing_p': 'VocaLume 仍在开发中，会持续改善翻译质量、性能与网站兼容性。<br>你可以收藏项目，随时回来查看新版本与开发进度；<br>遇到问题，或有想加入的功能，也欢迎直接留下反馈。',
        'closing_star': '收藏项目・追踪进度 ☆',
        'closing_feedback': '提供反馈 ↗',
        'update_note': 'Star 可收藏项目；若想收到新版本通知，可在 GitHub 的 Watch → Custom 中勾选 Releases。',
        'footer_tagline': '读懂、回复，也听懂。',
        'footer_issues': '报告问题 ↗',
        'footer_privacy': '隐私说明 ↗',
        'license_link': '使用许可',
        'license_text': '非商业用途可免费使用。商业使用或转售须经授权，衍生版本须注明源自 VocaLume。',
    },
}

LANG_OPTIONS = [
    ('zh-Hant', '繁體中文'),
    ('zh-Hans', '简体中文'),
    ('en', 'English'),
    ('ja', '日本語'),
    ('ko', '한국어'),
]


def render_page(t: dict) -> str:
    lang = t['lang']
    options_html = (
        f'<button type="button" role="menuitemradio" aria-checked="false" data-language="auto">'
        f'<span>{t["lang_auto"]}</span><span class="language-check" aria-hidden="true">✓</span></button>'
    ) + ''.join(
        f'<button type="button" role="menuitemradio" aria-checked="{"true" if code == lang else "false"}" data-language="{code}">'
        f'<span lang="{code}">{label}</span><span class="language-check" aria-hidden="true">✓</span></button>'
        for code, label in LANG_OPTIONS
    )

    nav_demo, nav_how, nav_faq, nav_updates = t['nav']
    features_html = ''.join(
        f'<article><span class="feature-number">{num}</span><div><h3>{h3}</h3><p>{p}</p></div><span aria-hidden="true">{icon}</span></article>'
        for num, h3, p, icon in t['features']
    )
    steps_html = ''.join(
        f'<li><span>{idx}</span><h3>{h3}</h3><p>{p}</p></li>'
        for idx, (h3, p) in enumerate(t['steps'], start=1)
    )
    faqs_html = ''.join(
        f'<details{" open" if is_open else ""}><summary>{q}<span aria-hidden="true">＋</span></summary><p>{a}</p></details>'
        for is_open, q, a in t['faqs']
    )

    d1, d2, d3 = t['demo1'], t['demo2'], t['demo3']
    note = t['demo_video_note']

    return f'''<!doctype html>
<html lang="{lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#fce2ed">
  <meta name="description" content="{t['description']}">
  <title>{t['title']}</title>
  <link rel="canonical" href="{t['canonical']}">
  <link rel="alternate" hreflang="zh-Hant" href="{SITE_ORIGIN}/">
  <link rel="alternate" hreflang="zh-Hans" href="{SITE_ORIGIN}/zh-CN.html">
  <link rel="alternate" hreflang="en" href="{SITE_ORIGIN}/en.html">
  <link rel="alternate" hreflang="ja" href="{SITE_ORIGIN}/ja.html">
  <link rel="alternate" hreflang="ko" href="{SITE_ORIGIN}/ko.html">
  <link rel="alternate" hreflang="x-default" href="{SITE_ORIGIN}/en.html">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="VocaLume">
  <meta property="og:locale" content="{t['og_locale']}">
  <meta property="og:title" content="{t['title']}">
  <meta property="og:description" content="{t['og_description']}">
  <meta property="og:url" content="{t['canonical']}">
  <meta property="og:image" content="{SITE_ORIGIN}/assets/og-card.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="{t['og_image_alt']}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{t['title']}">
  <meta name="twitter:description" content="{t['twitter_description']}">
  <meta name="twitter:image" content="{SITE_ORIGIN}/assets/og-card.jpg">
  <link rel="icon" href="assets/vocalume.png">
  <link rel="stylesheet" href="site.css?v={ASSET_VERSION}">
  <script type="application/ld+json">{{"@context":"https://schema.org","@type":"SoftwareApplication","name":"VocaLume","applicationCategory":"UtilitiesApplication","operatingSystem":"Windows, macOS, Linux","softwareVersion":"{VERSION}","inLanguage":"{lang}","url":"{t['canonical']}","downloadUrl":"{RELEASE_URL}","description":"{t['ld_description']}","offers":{{"@type":"Offer","price":"0","priceCurrency":"USD"}}}}</script>
</head>
<body>
  <a class="skip" href="#main">{t['skip']}</a>
  <header class="nav"><a class="brand" href="#"><img src="assets/design/vocalume.webp" alt="" width="39" height="39"><span>VocaLume</span></a><nav aria-label="{t['nav_label']}"><a href="#demo">{nav_demo}</a><a href="#how">{nav_how}</a><a href="#questions">{nav_faq}</a><a href="#updates">{nav_updates}</a></nav><div class="language-picker" data-language-menu><button class="language-trigger" id="site-language" type="button" aria-label="{t['lang_label']}" aria-haspopup="menu" aria-expanded="false" aria-controls="language-options"><svg class="language-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.8" ry="8.5"/><path d="M3.5 12h17M5 7.5h14M5 16.5h14"/></svg><span>{t['lang_current']}</span><svg class="language-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button><div class="language-options" id="language-options" role="menu" aria-label="{t['lang_label']}" hidden>{options_html}</div></div><a class="nav-github" href="https://github.com/clark970417-eng/VocaLume" target="_blank" rel="noreferrer">GitHub ↗</a></header>
  <main id="main">
    <section class="hero wrap" id="hero-section">
      <div class="hero-copy"><p class="eyebrow"><span></span> {t['eyebrow']}</p><h1>{t['h1']}</h1><p class="lead">{t['lead']}</p><div class="actions"><a class="button primary" href="{RELEASE_URL}" target="_blank" rel="noreferrer">{t['cta_primary']} <span aria-hidden="true">↓</span></a><a class="button secondary" href="/mobile/">{t['cta_mobile']} <span aria-hidden="true">↗</span></a></div><p class="mobile-install-hint">{t['mobile_hint']}</p></div>
      <div class="hero-art">{ORBIT_SVG}<span class="float-note note-ja"><span lang="ja">こんばんは</span>{t['note_ja']}</span><div class="conversation-preview"><div class="preview-top"><span class="three-dots" aria-hidden="true">● ● ●</span><span>{t['preview_top'][0]}</span><span class="live-dot">{t['preview_top'][1]}</span></div><div class="message-row"><span class="avatar">M</span><div><p class="sender">Mika <span>{t['sender_role']}</span></p><p class="jp" lang="ja">今日は来てくれてありがとう！</p><p class="zh" id="read-result" lang="{t['read_lang']}">{t['read_result']}</p></div></div><div class="reply-preview"><span class="reply-label">{t['reply_label']}</span><p id="example-reply"{t['reply_lang_attr']}>{t['example_reply']}</p><button id="translate-example" aria-controls="example-answer" aria-expanded="false" type="button">{t['translate_btn'][0]} <span>{t['translate_btn'][1]}</span></button><p class="example-answer" id="example-answer" hidden lang="ja">今日の配信、楽しかった！次も見に来るね！</p></div><div class="preview-footer"><span>{t['preview_footer'][0]}</span><span>{t['preview_footer'][1]}</span></div></div><span class="float-note note-en"><span lang="ja">よかった！</span>{t['note_en']}</span><p class="illustration-note">{t['illustration_note']}</p></div>
    </section>

    <div class="demo-gallery wrap">
      <section class="demo-section wrap" id="demo" aria-labelledby="demo-heading"><h2 class="demo-card-heading" id="demo-heading"><span class="demo-card-icon" aria-hidden="true" style="--demo-icon:url(assets/design/microphone.svg)"></span><span>{d1['title']}</span></h2><div class="section-heading"><p>{d1['copy']}</p></div><div class="video-shell"><video id="video-slot" controls controlsList="nodownload" playsinline preload="none" poster="assets/demo-poster.webp" aria-label="{d1['aria']}" muted loop><source src="assets/demo.mp4" type="video/mp4">{d1['fallback']}</video></div>{note}<div class="video-caption"><a href="https://www.youtube.com/watch?v=KISmMEKMBjk&t=1465s" target="_blank" rel="noreferrer">{d1['source']}</a></div><p class="fine">{d1['fine']}</p></section>
      <section class="demo-section chat-demo wrap" id="chat-demo" aria-labelledby="chat-demo-heading"><h2 class="demo-card-heading" id="chat-demo-heading"><span class="demo-card-icon" aria-hidden="true" style="--demo-icon:url(assets/design/messages.svg)"></span><span>{d2['title']}</span></h2><div class="section-heading"><p>{d2['copy']}</p></div><div class="video-shell"><video controls controlsList="nodownload" playsinline preload="none" poster="assets/chat-poster.webp" aria-label="{d2['aria']}" muted loop><source src="assets/chat-demo.mp4" type="video/mp4">{d1['fallback']}</video></div>{note}<p class="fine">{d2['fine']}</p></section>
      <section class="demo-section wrap" id="obs-demo" aria-labelledby="obs-demo-heading"><h2 class="demo-card-heading" id="obs-demo-heading"><span class="demo-card-icon" aria-hidden="true" style="--demo-icon:url(assets/design/broadcast.svg)"></span><span>{d3['title']}</span></h2><div class="section-heading"><p>{d3['copy']}</p></div><div class="video-shell"><video controls controlsList="nodownload" playsinline preload="none" poster="assets/obs-poster.webp" aria-label="{d3['aria']}" muted loop><source src="assets/obs-demo.mp4" type="video/mp4">{d1['fallback']}</video></div><p class="fine">{d3['fine']}</p></section>
    </div>

    <section class="capabilities wrap" id="features-section"><div class="feature-intro"><h2>{t['features_h2']}</h2><p>{t['features_p']}</p></div><div class="feature-list">{features_html}</div></section>
    <section class="how-section" id="how"><div class="wrap"><div class="section-heading"><div><h2>{t['how_h2']}</h2></div><a class="text-link" href="{t['how_guide_url']}" target="_blank" rel="noreferrer">{t['how_guide_label']}</a></div><ol class="steps">{steps_html}</ol><p class="install-note">{t['install_note']}</p></div></section>
    <section class="faq wrap" id="questions"><div><h2>{t['faq_h2']}</h2></div><div class="faq-list">{faqs_html}</div></section>
    <section class="closing wrap" id="updates"><span class="closing-spark" aria-hidden="true">✧</span><p class="eyebrow">{t['closing_eyebrow']}</p><h2>{t['closing_h2']}</h2><p>{t['closing_p']}</p><div class="actions"><a class="button secondary" href="https://github.com/clark970417-eng/VocaLume" target="_blank" rel="noreferrer">{t['closing_star']}</a><a class="button primary" href="https://github.com/clark970417-eng/VocaLume/issues/new" target="_blank" rel="noreferrer">{t['closing_feedback']}</a></div><p class="update-note">{t['update_note']}</p></section>
  </main>
  <footer class="footer wrap"><a class="brand" href="#"><img src="assets/design/vocalume.webp" alt="" width="29" height="29"><span>VocaLume</span></a><p>{t['footer_tagline']}</p><a href="https://github.com/clark970417-eng/VocaLume/issues" target="_blank" rel="noreferrer">{t['footer_issues']}</a><a href="https://github.com/clark970417-eng/VocaLume/blob/main/docs/legal/privacy.md" target="_blank" rel="noreferrer">{t['footer_privacy']}</a></footer>
  <aside class="license-note wrap">© 2026 Clark · VocaLume · <a href="/license.txt">{t['license_link']}</a><p>{t['license_text']}</p></aside>
  <script type="module" src="app.js?v={ASSET_VERSION}"></script>
  <script src="language.js?v={ASSET_VERSION}"></script>
</body>
</html>
'''


if __name__ == '__main__':
    for filename, copy in PAGES.items():
        (dist / filename).write_text(render_page(copy), encoding='utf-8')
