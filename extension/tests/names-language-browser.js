// Manual Opera smoke test. Run only when captions are idle; restore preferences.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = async payload => {
  const result = await chrome.runtime.sendMessage(payload);
  if (!result?.ok) throw new Error(result?.error || '沒有收到回應');
  return result.text;
};
document.querySelector('#test').onclick = async event => {
  const button = event.target, out = document.querySelector('#result');
  button.disabled = true;
  const keys = ['websiteTextOptInEnabled', 'languageSettings', 'speechMode'];
  const prior = await chrome.storage.local.get(keys), lines = [];
  const show = text => { lines.push(text); out.textContent = lines.join('\n'); };
  let changed = false;
  try {
    const before = await request({type:'health'});
    if (before.running || before.draining) throw new Error('請先停止語音收音，再開始文字測試');
    show(`版本：${chrome.runtime.getManifest().version}`);
    changed = true;
    await chrome.storage.local.set({websiteTextOptInEnabled:true, speechMode:'desktop', languageSettings:{...prior.languageSettings, readSource:'ja', readTarget:'zh', typeSource:'zh', typeTarget:'ja'}});
    const completed = selector => {
      const value = document.querySelector(selector)?.textContent || '';
      return value && !/翻譯中|重試|翻譯失敗/.test(value) ? value : '';
    };
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline && (!completed('#title-case .jtl-title') || !completed('#ja-case .jtl-translation'))) await wait(200);
    const title = completed('#title-case .jtl-title'), chat = completed('#ja-case .jtl-translation');
    if (!title.includes('まほろ') || !chat.includes('まほろ') || !/不會|不来|不來/.test(chat)) throw new Error('日文標題／留言的人名或否定未保留');
    show(`通過：標題 → ${title}`);
    show(`通過：留言 → ${chat}`);
    if (document.querySelector('#zh-case .jtl-translation,#name-case .jtl-translation')) throw new Error('中文或純人名多出翻譯');
    show('通過：中文含日文人名、純人名均未新增翻譯列');
    const original = '我很喜歡まほろちゃん，今天直播辛苦了！';
    const unchanged = await request({type:'translate', direction:'ja-zh', text:original});
    if (unchanged !== original) throw new Error('已有中文的內容被改寫');
    show('通過：已是中文的內容保持原樣');
    const draft = await request({type:'make-draft', direction:'zh-ja', text:'まほろ今天不會直播，明天八點才開始。'});
    if (!draft.draft.includes('まほろ') || !/[\u3040-\u30ff]/u.test(draft.draft.replace('まほろ','')) || !draft.mode.includes('本機')) throw new Error('中翻日草稿未使用本機或遺失人名');
    show(`通過：本機中翻日草稿 → ${draft.draft}`);
    document.querySelector('#ja-case #message').textContent = '這已經是中文，まほろ今天辛苦了';
    await wait(750);
    if (document.querySelector('#ja-case .jtl-translation')) throw new Error('留言改成中文後仍保留舊翻譯');
    show('通過：同一留言位置改成中文，舊翻譯已清除');
    const after = await request({type:'health'});
    if (after.running !== before.running) throw new Error('語音狀態被改變');
    show('全部通過：語音收音狀態未變動。');
  } catch (error) { show(`失敗：${error.message}`); }
  finally {
    if (changed) {
      await chrome.storage.local.set(prior);
      await chrome.storage.local.remove(keys.filter(key => !Object.hasOwn(prior,key)));
      show('原本的文字、語言與引擎選擇已恢復。');
    }
    button.disabled = false;
  }
};
