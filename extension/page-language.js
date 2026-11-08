(() => {
  const key = 'vocalume.uiLanguage';
  const locales = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];
  const messages = {
    '翻譯中…': ['翻译中…', 'Translating…', '翻訳中…', '번역 중…'],
    '翻譯暫時失敗。': ['暂时无法翻译。', 'Translation unavailable.', '翻訳できませんでした。', '번역할 수 없습니다.'],
    '再試一次': ['再试一次', 'Retry', '再試行', '다시 시도'],
    '重新翻譯這則內容': ['重新翻译此内容', 'Retry this translation', 'この翻訳を再試行', '이 번역 다시 시도'],
    '保留原文，重新取得翻譯': ['保留原文，重新翻译', 'Keep the original and retry', '原文を残して再試行', '원문을 유지하고 다시 시도'],
    '已翻譯': ['已翻译', 'Translated', '翻訳済み', '번역 완료'],
    '翻譯留言草稿': ['翻译留言草稿', 'Translate reply draft', '返信の下書きを翻訳', '답장 초안 번역'],
    '翻譯草稿': ['翻译草稿', 'Translation draft', '翻訳の下書き', '번역 초안'],
    '放入留言框': ['放入留言框', 'Insert reply', '返信欄に挿入', '답장 입력란에 넣기'],
    '請先輸入留言。': ['请先输入留言。', 'Enter a reply first.', '返信を入力してください。', '먼저 답장을 입력하세요.'],
    '請先完成輸入法選字。': ['请先完成输入法选字。', 'Finish composing the text first.', '文字の入力を確定してください。', '먼저 글자 입력을 완료하세요.'],
    '原文已修改，請重新翻譯': ['原文已修改，请重新翻译', 'The draft changed. Translate it again.', '原文が変更されました。翻訳し直してください。', '원문이 변경되었습니다. 다시 번역하세요.'],
    '已放入譯文，確認後自行送出': ['已插入译文，请确认后发送', 'Translation inserted. Review it before sending.', '翻訳を挿入しました。確認してから送信してください。', '번역을 넣었습니다. 확인한 뒤 보내세요.'],
    '留言框未接受譯文；請複製下方草稿後貼入。': ['留言框未接受译文，请复制下方草稿后粘贴。', 'Copy the draft below and paste it into the reply field.', '下の下書きをコピーして返信欄に貼り付けてください。', '아래 초안을 복사해 답장 입력란에 붙여 넣으세요.'],
    '請複製上方草稿後貼入留言框。': ['请复制上方草稿后粘贴到留言框。', 'Copy the draft above and paste it into the reply field.', '上の下書きをコピーして返信欄に貼り付けてください。', '위 초안을 복사해 답장 입력란에 붙여 넣으세요.'],
    '可以修改草稿，再放入留言框。': ['可以修改草稿，再放入留言框。', 'Edit the draft before inserting it.', '下書きを編集してから返信欄に挿入できます。', '초안을 수정한 뒤 답장 입력란에 넣을 수 있습니다.'],
    '翻譯失敗，請再試一次。': ['翻译失败，请重试。', 'Translation failed. Try again.', '翻訳に失敗しました。再試行してください。', '번역에 실패했습니다. 다시 시도하세요.'],
    '擴充功能已重新載入。請先保留未送出的留言，再重新整理此頁恢復翻譯。': ['扩展程序已重新加载。请先保存未发送的留言，再刷新此页。', 'The extension reloaded. Save your draft, then refresh this page.', '拡張機能が再読み込みされました。下書きを保存し、ページを更新してください。', '확장 프로그램이 다시 로드되었습니다. 초안을 보관한 뒤 페이지를 새로고침하세요.'],
    'Tab：翻譯並放入留言框；確認後自行送出': ['Tab：翻译并填入留言框，确认后发送', 'Tab: translate and insert the reply', 'Tab：翻訳して返信欄に挿入', 'Tab: 번역 후 답장 입력란에 넣기'],
    'Tab 或點一下翻譯；長按可拖曳位置，確認後自行送出': ['按 Tab 或点击翻译，长按可拖动', 'Press Tab or click to translate. Hold to drag.', 'Tab キーまたはクリックで翻訳。長押しで移動。', 'Tab을 누르거나 클릭해 번역하세요. 길게 눌러 이동할 수 있습니다.'],
    '暫定字幕，句尾會校正': ['暂定字幕，句尾会校正', 'Draft caption', '仮字幕', '임시 자막'],
    '已確認字幕': ['已确认字幕', 'Final caption', '確定字幕', '확정 자막'],
    '翻譯未完成 · 可在「字幕記錄」重試': ['翻译未完成，可在字幕记录中重试', 'Translation incomplete. Retry from Caption history.', '翻訳未完了。字幕履歴から再試行できます。', '번역 미완료. 자막 기록에서 다시 시도할 수 있습니다.'],
    '翻譯未完成': ['翻译未完成', 'Translation incomplete', '翻訳未完了', '번역 미완료'],
    '正在聆聽／翻譯…': ['正在聆听或翻译…', 'Listening or translating…', '聞き取り・翻訳中…', '듣는 중 또는 번역 중…'],
    '翻譯貼文': ['翻译帖子', 'Translate post', '投稿を翻訳', '게시물 번역'],
    '翻譯留言': ['翻译留言', 'Translate comment', 'コメントを翻訳', '댓글 번역'],
    '貼文已更新，請再按一次翻譯。': ['帖子已更新，请重新翻译。', 'The post changed. Translate it again.', '投稿が更新されました。翻訳し直してください。', '게시물이 변경되었습니다. 다시 번역하세요.'],
    '直播語音字幕': ['直播语音字幕', 'Live speech captions', 'ライブ音声字幕', '실시간 음성 자막'],
    '開始語音字幕': ['开始语音字幕', 'Start speech captions', '音声字幕を開始', '음성 자막 시작'],
    '停止語音字幕': ['停止语音字幕', 'Stop speech captions', '音声字幕を停止', '음성 자막 중지'],
    '字幕已停止。': ['字幕已停止。', 'Captions stopped.', '字幕を停止しました。', '자막을 중지했습니다.'],
    '等待此分頁的聲音。': ['正在等待此标签页的声音。', 'Waiting for tab audio.', 'タブの音声を待っています。', '탭 소리를 기다리는 중입니다.'],
    '正在接收分頁聲音': ['正在接收标签页声音', 'Listening to tab audio', 'タブの音声を聞き取り中', '탭 소리를 듣는 중'],
    '字幕已停止，可重新開始。': ['字幕已停止，可以重新开始。', 'Captions stopped. You can start again.', '字幕を停止しました。再開できます。', '자막이 중지되었습니다. 다시 시작할 수 있습니다.'],
    '直播字幕暫時無法使用。': ['暂时无法使用直播字幕。', 'Live captions are temporarily unavailable.', 'ライブ字幕は一時的に利用できません。', '실시간 자막을 일시적으로 사용할 수 없습니다.']
  };

  function resolve(preference) {
    if (locales.includes(preference)) return preference;
    for (const language of navigator.languages?.length ? navigator.languages : [navigator.language]) {
      if (/^zh(?:-|$)/i.test(language)) return /^zh-(?:CN|SG|Hans)(?:-|$)/i.test(language) ? 'zh-CN' : 'zh-TW';
      const base = String(language).toLowerCase().split('-')[0];
      if (locales.includes(base)) return base;
    }
    return 'en';
  }

  const bound = new WeakMap();
  let preference, revision = 0;
  const locale = () => resolve(preference);
  const text = value => messages[value]?.[locales.indexOf(locale()) - 1] ?? value;
  function label(code, zh) {
    if (locale() === 'zh-TW') return zh;
    if (locale() === 'zh-CN') return ({ko: '韩', de: '德', it: '意', vi: '越', id: '印尼'})[code] ?? zh;
    return code.toUpperCase();
  }
  function render(element, property, read) {
    const value = read();
    if (property === 'textContent') {
      const first = element.firstChild;
      if (first?.nodeType === 3) {
        if (first.nodeValue !== value) first.nodeValue = value;
      } else if (element.textContent !== value) element.textContent = value;
    } else if (element.getAttribute(property) !== value) element.setAttribute(property, value);
  }
  function bind(element, value, property = 'textContent') {
    let fields = bound.get(element);
    if (!fields) {
      fields = new Map();
      bound.set(element, fields);
      element.setAttribute('data-vocalume-ui', '');
    }
    if (fields.get(property)?.value === value) return;
    const read = typeof value === 'function' ? value : () => text(value);
    fields.set(property, {value, read});
    render(element, property, read);
  }
  function refresh() {
    for (const element of document.querySelectorAll('[data-vocalume-ui]')) {
      for (const [property, {read}] of bound.get(element) ?? []) render(element, property, read);
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, key)) return;
    revision++;
    preference = changes[key].newValue;
    refresh();
  });
  chrome.storage.local.get(key).then(settings => {
    if (!revision) { preference = settings[key]; refresh(); }
  }).catch(() => {});
  window.addEventListener('languagechange', refresh);
  globalThis.VocaLumePageLanguage = {text, label, bind};
})();
