# -*- coding: utf-8 -*-
from pathlib import Path
from html import escape as e
import re
dist = Path(__file__).resolve().parents[1] / 'dist'
out = dist / 'download'
out.mkdir(exist_ok=True)
base='https://github.com/clark970417-eng/VocaLume/releases/download/beta-v4.6.7/'
texts={
'index.html':dict(lang='zh-Hant',title='下載 VocaLume',intro='公開測試版 4.6.7。下載不需要 GitHub 帳號。',notice='請下載適合你電腦的版本，再依照下方步驟安裝。',app='下載 Mac 應用程式',ext='下載擴充功能',mac='Mac · Apple 晶片',macnote='適用 M1、M2、M3、M4、M5 等 Apple 晶片。不是 Intel 版。',extnote='適用電腦版 Chrome／Opera GX。請解壓到固定資料夾，再載入擴充功能。',need='要在 Mac 瀏覽器使用本機字幕，需下載兩個檔案並完成下方連接步驟。單獨使用桌面應用程式時，可直接開啟應用程式。',pending='Windows、Intel Mac 與 Linux 也提供 4.6.7；請到 GitHub Release 選擇適合的平台。',warning='測試版尚無 Apple Developer ID 簽章或公證。首次使用需下載模型，翻譯可能出錯，速度依電腦效能而異。',setup='安裝與第一次使用',steps=['開啟 DMG，將 VocaLume 拖入「應用程式」，再從那裡開啟並完成模型下載。若系統阻擋，先確認來源，再到「系統設定 → 隱私權與安全性」查看提示；不要關閉整台電腦的安全防護。','解壓縮擴充功能 ZIP，將資料夾保留在「文件」等固定位置。Chrome 開啟 chrome://extensions；Opera GX 開啟 opera://extensions。啟用「開發人員模式」，按「載入未封裝擴充功能」，選擇含 manifest.json 的資料夾。','Mac 網頁本機字幕需用已安裝的 VocaLume 連接擴充功能。在擴充功能管理頁複製 ID；開啟「終端機」，輸入 cd 加一個空格，把擴充功能資料夾拖進去，按 Enter。將下方 YOUR_EXTENSION_ID 換成你的 ID 後執行。','重新載入擴充功能並重新整理影片頁。播放影片，在「語音字幕」選桌面 App、設定語言後開始。首次模型載入需等待；有原文與譯文才算完成。收音時，請擇一使用桌面應用程式或擴充功能。'],checks='核對檔案 SHA-256',checknote='可用下方校驗碼檔案核對下載完整性；校驗碼不能取代正式開發者簽章。',back='回網站',help='這是電腦版軟體。手機可看介紹與影片，請在電腦下載安裝。',video='Chrome 安裝步驟影片（繁體中文）',videonote='影片以 4.6.0 錄製，4.6.7 的部分介面可能不同。請依上方步驟完成應用程式連接。',video_fallback='你的瀏覽器不支援影片播放。'),
'en.html':dict(lang='en',title='Download VocaLume',intro='Public beta 4.6.7. No GitHub account required.',notice='Download the version for your computer and follow the installation steps below.',app='Download Mac app',ext='Download extension',mac='Mac · Apple Silicon',macnote='For M1–M5 and other Apple Silicon Macs. Not for Intel.',extnote='For desktop Chrome / Opera GX. Extract the ZIP into a permanent folder, then load the extension.',need='Local browser captions on Mac need both downloads and the connection steps below. The standalone desktop app does not require the extension.',pending='4.6.7 is also available for Windows, Intel Mac and Linux. Choose your platform on GitHub Releases.',warning='This beta has no Apple Developer ID signature or notarization. Models download on first use. Translation can be wrong; speed depends on your computer.',setup='Install and get started',steps=['Open the DMG, drag VocaLume into Applications, then launch it there and download the models. If macOS blocks it, verify the source and review System Settings → Privacy & Security. Do not disable system-wide security.','Extract the extension ZIP to a permanent folder. Open chrome://extensions in Chrome or opera://extensions in Opera GX. Enable Developer mode, choose Load unpacked, and select the folder containing manifest.json.','Connect the extension to your installed VocaLume app for local Mac browser captions. Copy the extension ID from the extension manager. In Terminal, type cd followed by a space, drag in the extracted extension folder, then press Enter. Replace YOUR_EXTENSION_ID below with your ID and run the command.','Reload the extension and refresh the video page. Play a video, choose the desktop app and languages in Live captions, then start. Wait for initial model loading. Confirm both source and translated text appear. Do not start capture from the app and extension simultaneously.'],checks='Verify SHA-256 checksums',checknote='Checksums help verify file integrity; they do not replace a developer signature.',back='Back to website',help='These are desktop downloads. You can explore the website on a phone; install the app and extension on a computer.',video='Chrome installation video (Traditional Chinese)',videonote='The video was recorded with 4.6.0. Some controls may look different in 4.6.7. Follow the written steps above to connect the app.',video_fallback='Your browser does not support video playback.'),
'ja.html':dict(lang='ja',title='VocaLume をダウンロード',intro='公開ベータ 4.6.7。GitHub アカウントは不要です。',notice='お使いのパソコンに合ったバージョンを選び、下の手順でインストールしてください。',app='Mac アプリをダウンロード',ext='拡張機能をダウンロード',mac='Mac · Apple シリコン',macnote='M1〜M5 などの Apple シリコン搭載 Mac 用。Intel Mac 用ではありません。',extnote='パソコン版 Chrome／Opera GX 用。ZIP を固定のフォルダに展開して読み込みます。',need='Mac のローカルブラウザ字幕には両方のファイルと、下記の接続設定が必要です。単体アプリだけを使う場合、拡張機能は不要です。',pending='Windows、Intel Mac、Linux 用の 4.6.7 も GitHub Releases からダウンロードできます。',warning='Apple Developer ID 署名・公証のないベータ版です。初回にモデルをダウンロードします。誤訳する場合があり、速度はパソコンによって異なります。',setup='インストールと初回設定',steps=['DMG を開き、VocaLume を「アプリケーション」にドラッグして起動し、モデルをダウンロードします。ブロックされた場合は配布元を確認して「システム設定 → プライバシーとセキュリティ」を確認してください。システム全体の保護を無効にしないでください。','拡張機能の ZIP を固定のフォルダに展開します。Chrome で chrome://extensions、Opera GX で opera://extensions を開き、デベロッパーモードを有効にして「パッケージ化されていない拡張機能を読み込む」で manifest.json のあるフォルダを選びます。','Mac のブラウザーでローカル字幕を使うには、インストールした VocaLume と拡張機能を接続します。拡張機能の ID をコピーし、ターミナルで cd と半角スペースを入力して展開先のフォルダをドラッグし、Enter を押します。以下の YOUR_EXTENSION_ID を実際の ID に置き換えて実行します。','拡張機能を再読み込みし、動画ページを更新します。動画を再生し、音声字幕でデスクトップアプリと言語を選んで開始します。原文と訳文の両方を確認してください。アプリと拡張機能で同時に二重録音しないでください。'],checks='SHA-256 を確認',checknote='チェックサムはファイルの整合性確認用で、開発者署名の代わりではありません。',back='サイトに戻る',help='パソコン用ソフトウェアです。スマートフォンでは紹介をご覧いただき、インストールはパソコンで行ってください。',video='Chrome のインストール動画（繁体字中国語）',videonote='動画は 4.6.0 で収録しています。4.6.7 では一部の表示が異なる場合があります。アプリは上記の手順で接続してください。',video_fallback='お使いのブラウザーは動画の再生に対応していません。'),
'ko.html':dict(lang='ko',title='VocaLume 다운로드',intro='공개 베타 4.6.7. GitHub 계정 없이 다운로드할 수 있습니다.',notice='컴퓨터에 맞는 버전을 다운로드하고 아래 설치 안내를 따라 주세요.',app='Mac 앱 다운로드',ext='확장 프로그램 다운로드',mac='Mac · Apple Silicon',macnote='M1~M5 등 Apple Silicon Mac용입니다. Intel Mac용이 아닙니다.',extnote='컴퓨터용 Chrome / Opera GX에서 사용합니다. ZIP을 고정 폴더에 압축 해제한 뒤 불러오세요.',need='Mac 로컬 브라우저 자막은 두 파일과 아래 연결 설정이 모두 필요합니다. 독립 앱만 사용할 때는 확장 프로그램이 필요하지 않습니다.',pending='Windows, Intel Mac, Linux용 4.6.7도 GitHub Releases에서 다운로드할 수 있습니다.',warning='Apple Developer ID 서명 및 공증이 없는 베타입니다. 처음 사용할 때 모델을 다운로드합니다. 오역이 발생할 수 있고 속도는 컴퓨터 성능에 따라 다릅니다.',setup='설치 및 처음 사용하기',steps=['DMG를 열고 VocaLume를 응용 프로그램 폴더로 옮긴 뒤 실행하여 모델을 다운로드하세요. 차단되면 출처를 확인하고 시스템 설정 → 개인정보 보호 및 보안을 확인하세요. 시스템 전체 보안을 끄지 마세요.','확장 프로그램 ZIP을 고정 폴더에 압축 해제하세요. Chrome에서는 chrome://extensions, Opera GX에서는 opera://extensions를 열고 개발자 모드를 켠 뒤 manifest.json이 있는 폴더를 압축 해제된 확장 프로그램으로 로드하세요.','Mac 브라우저에서 로컬 자막을 쓰려면 설치한 VocaLume 앱과 확장 프로그램을 연결하세요. 확장 프로그램 ID를 복사하세요. 터미널에서 cd와 공백을 입력하고 압축 해제한 폴더를 끌어 넣은 뒤 Enter를 누르세요. 아래 YOUR_EXTENSION_ID를 실제 ID로 바꿔 실행하세요.','확장 프로그램과 동영상 페이지를 새로고침하세요. 동영상을 재생하고 음성 자막에서 데스크톱 앱과 언어를 선택한 뒤 시작하세요. 원문과 번역이 모두 나오는지 확인하세요. 앱과 확장 프로그램에서 동시에 녹음을 시작하지 마세요.'],checks='SHA-256 확인',checknote='체크섬은 파일 무결성을 확인하며 개발자 서명을 대체하지 않습니다.',back='웹사이트로 돌아가기',help='컴퓨터용 소프트웨어입니다. 휴대폰에서는 소개와 영상을 보고 설치는 컴퓨터에서 진행하세요.',video='Chrome 설치 영상(번체 중국어)',videonote='영상은 4.6.0에서 녹화했습니다. 4.6.7에서는 일부 화면이 다를 수 있습니다. 위의 안내에 따라 앱을 연결하세요.',video_fallback='이 브라우저에서는 영상을 재생할 수 없습니다.')}
texts['zh-CN.html'] = dict(
    lang='zh-Hans',
    title='下载 VocaLume',
    intro='公开测试版 4.6.7。下载无需 GitHub 账号。',
    notice='请选择适合你电脑的版本，再按下方步骤安装。',
    app='下载 Mac 应用',
    ext='下载扩展程序',
    mac='Mac · Apple 芯片',
    macnote='适用于搭载 Apple 芯片的 Mac，例如 M1 至 M5 系列。',
    extnote='适用于电脑版 Chrome 和 Opera GX。请解压到固定文件夹，然后加载扩展程序。',
    need='要在 Mac 浏览器中使用本地字幕，请下载应用和扩展程序，并完成下方的连接步骤。单独使用桌面应用时，直接打开应用即可。',
    pending='Windows、Intel Mac 和 Linux 也提供 4.6.7。请在 GitHub 发布页面选择适合你设备的版本。',
    warning='该测试版尚未获得 Apple Developer ID 签名或公证。首次使用需下载模型。翻译可能出错，速度取决于电脑性能。',
    setup='安装与首次使用',
    steps=[
        '打开 DMG 文件，将 VocaLume 拖到“应用程序”文件夹，再从该文件夹打开应用并下载模型。若 macOS 阻止打开，请先核实文件来源，再到“系统设置 → 隐私与安全性”查看提示。请保持系统安全防护开启。',
        '解压扩展程序的 ZIP 文件，将文件夹保存在“文稿”等固定位置。在 Chrome 中打开 chrome://extensions，或在 Opera GX 中打开 opera://extensions。开启“开发者模式”，点击“加载已解压的扩展程序”，选择包含 manifest.json 的文件夹。',
        '在 Mac 浏览器中使用本地字幕时，请将扩展程序连接到已安装的 VocaLume 应用。在扩展程序管理页复制扩展程序 ID。打开“终端”，输入 cd 和一个空格，再将解压后的扩展程序文件夹拖入终端并按回车键。将下方的 YOUR_EXTENSION_ID 替换成你的 ID，然后运行该命令。',
        '重新加载扩展程序并刷新视频页面。播放视频，在“语音字幕”中选择桌面应用，设置语言后开始。等待模型首次加载，确认页面显示原文和译文。请在桌面应用和扩展程序中任选一个开始采集音频。',
    ],
    checks='核对 SHA-256 校验值',
    checknote='使用下方的校验文件确认下载内容是否完整。数字签名用于验证发布者身份。',
    back='返回网站',
    help='这是电脑版软件。你可以用手机浏览介绍和视频，请在电脑上下载安装。',
    video='Chrome 安装视频（繁体中文）',
    videonote='视频使用 4.6.0 录制，4.6.7 的部分界面可能有所不同。请按照上方的文字步骤连接应用。',
    video_fallback='你的浏览器不支持播放视频。',
)
command = (
    "ELECTRON_RUN_AS_NODE=1 '/Applications/VocaLume.app/Contents/MacOS/VocaLume' "
    'desktop/install-mac.cjs YOUR_EXTENSION_ID'
)
release_labels = {
    'zh-Hant': ('公開測試版', 'GitHub 發行版'),
    'zh-Hans': ('公开测试版', 'GitHub 发布页面'),
    'en': ('Public beta', 'GitHub Releases'),
    'ja': ('公開ベータ', 'GitHub リリース'),
    'ko': ('공개 베타', 'GitHub 릴리스'),
}

windows_connection_labels = {
    'zh-Hant': '在 Windows 使用本機網頁字幕時，請下載同版 Windows App 與擴充功能。查看連接步驟',
    'zh-Hans': '在 Windows 使用本地网页字幕时，请下载同版本的 Windows 应用和扩展程序。查看连接步骤',
    'en': 'For local Windows browser captions, download the matching Windows app and extension. See connection steps',
    'ja': 'Windows のブラウザーでローカル字幕を使うには、同じバージョンの Windows アプリと拡張機能が必要です。接続手順を見る',
    'ko': 'Windows 브라우저에서 로컬 자막을 쓰려면 같은 버전의 Windows 앱과 확장 프로그램을 다운로드하세요. 연결 방법 보기',
}

alternate_links = '\n'.join(
    f'<link rel="alternate" hreflang="{copy["lang"]}" href="/download/{filename}">'
    for filename, copy in texts.items()
)

for file, t in texts.items():
    beta_label, releases_label = release_labels[t['lang']]
    source = (dist / file).read_text(encoding='utf-8')
    skip = re.search(r'<a class="skip" href="#main">.*?</a>', source)[0]
    header = re.search(r'<header.*?</header>', source, re.S)[0]
    header = header.replace('href="#"', f'href="../{file}"')
    header = header.replace('href="#', f'href="../{file}#').replace('src="assets/', 'src="../assets/')

    cards = f'''<div class="download-cards">
  <article><span class="download-number">01</span><h2>{e(t['mac'])}</h2><p>{e(t['macnote'])}</p><a class="button primary" href="{base}VocaLume-4.6.7-arm64.dmg">{e(t['app'])} ↓</a><small>4.6.7 · DMG</small></article>
  <article><span class="download-number">02</span><h2>Chrome / Opera GX</h2><p>{e(t['extnote'])}</p><a class="button primary" href="{base}vocalume-extension.zip">{e(t['ext'])} ↓</a><small>4.6.7 · ZIP</small></article>
</div>'''
    steps = '\n'.join(
        '<li><p>' + e(text) + '</p>'
        + ('<pre><code>' + e(command) + '</code></pre>' if i == 2 else '')
        + '</li>'
        for i, text in enumerate(t['steps'])
    )
    html = f'''<!doctype html>
<html lang="{t['lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="{e(t['need'])}">
<title>{e(t['title'])} · 4.6.7</title>
<link rel="icon" href="../assets/vocalume.png">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="../mobile.css">
<link rel="stylesheet" href="../download.css">
{alternate_links}
</head>
<body>
{skip}
{header}
<main class="download-main wrap" id="main">
<p class="eyebrow">VocaLume · 4.6.7 · {e(beta_label)}</p>
<h1>{e(t['title'])}</h1>
<p class="download-intro">{e(t['intro'])}</p>
<p class="download-notice">{e(t['notice'])}</p>
<p>{e(t['need'])}</p>
{cards}
<p class="mobile-install-hint">{e(t['help'])}</p>
<p class="download-limit">{e(t['pending'])} <a href="https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.7">{e(releases_label)} →</a></p>
<p class="download-limit"><a href="https://github.com/clark970417-eng/VocaLume/blob/main/docs/installation.md#connect-the-windows-app">{e(windows_connection_labels[t['lang']])} →</a></p>
<p class="download-warning">{e(t['warning'])}</p>
<section id="setup">
  <h2>{e(t['setup'])}</h2>
  <ol class="download-steps">
{steps}
  </ol>
</section>
<section>
  <h2>{e(t['video'])}</h2>
  <video controls controlsList="nodownload" playsinline preload="none" aria-label="{e(t['video'])}"><source src="../assets/install-guide-zh.mp4" type="video/mp4">{e(t['video_fallback'])}</video>
  <p>{e(t['videonote'])}</p>
</section>
<section>
  <h2>{e(t['checks'])}</h2>
  <p>{e(t['checknote'])}</p>
  <a class="button secondary" href="{base}SHA256SUMS.txt">SHA256SUMS.txt ↓</a>
</section>
<a class="text-link" href="../{file}">← {e(t['back'])}</a>
</main>
<footer class="footer wrap"><a class="brand" href="../{file}">VocaLume</a><p>4.6.7 · {e(beta_label)}</p></footer>
<script src="../language.js"></script>
</body>
</html>
'''
    (out / file).write_text(html, encoding='utf-8')
# Install guide and checksums are checked in under dist/. Update them when publishing assets.
