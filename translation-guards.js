// Shared by classic content scripts, the extension worker and desktop engines.
// Preserve attested names; never guess a person's kanji from their pronunciation.
(() => {
  const names = ['鹿乃まほろ', '兎田ぺこら', '博衣こより', 'まほろ', 'マホロ', 'Mahoro', 'ミリプロ'];
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const kana = /[\u3040-\u30ff]/u;
  const han = /[\u3400-\u9fff]/u;
  const honorific = /^(?:ちゃん|さん|さま|様|くん|君|たん)/u;
  const chineseEvidence = /[這这們们嗎吗麼么覺觉讓让還还會会說说]|你好|您好|謝謝|谢谢|今天|明天|昨天|辛苦了|喜歡|喜欢|已經|已经|真的|中文|[我你您][是有在不沒没想要也很能愛爱]|(?:好|太)(?:可愛|可爱|看|聽|听)/u;

  function nameSpans(value, glossary = []) {
    const text = String(value || '');
    const entries = new Map(names.map(source => [source, source]));
    // Explicit preserve-as-written entries also work for other personal names.
    for (const entry of glossary) if (entry.source?.trim() && entry.source === entry.target) entries.set(entry.source, entry.target);
    const overridden = glossary.filter(entry => entry.source?.trim() && entry.target && entry.source !== entry.target);
    // A user term wins even if it is a longer compound containing a default name.
    const overrides = overridden.flatMap(entry => [...text.matchAll(new RegExp(escape(entry.source), 'gu'))]
      .map(match => ({start: match.index, end: match.index + entry.source.length, source: entry.source, target: entry.target})));
    const pattern = new RegExp([...entries.keys()].sort((a,b) => b.length-a.length).map(escape).join('|'), 'giu');
    const spans = [];
    for (const match of text.matchAll(pattern)) {
      const start = match.index, source = match[0], tail = text.slice(start + source.length);
      if (/^[A-Za-z]+$/u.test(source) && (/[A-Za-z0-9_]/u.test(text[start-1] || '') || /^[A-Za-z0-9_]/u.test(tail))) continue;
      const suffix = honorific.exec(tail)?.[0] || '';
      // Do not protect the unrelated word まほろば or the character マホロア.
      if (['まほろ','マホロ'].includes(source) && !suffix && /^[\u3040-\u30ff]/u.test(tail) && !/^(?:の|は|が|を|に|と|も|で|へ|って|より|から|です|だ[よねっ]|だった|じゃ)/u.test(tail)) continue;
      const end = start + source.length + suffix.length;
      const custom = overrides.find(entry => entry.start < end && entry.end > start);
      if (custom) {
        // An exact name mapping can be enforced without prompting the model to
        // invent a spelling. More complex custom compounds keep their old path.
        if (custom.start === start && custom.end === start + source.length) spans.push({start, end, source: text.slice(start,end), target: custom.target + suffix});
        continue;
      }
      spans.push({start, end, source: text.slice(start,end), target: text.slice(start,end)});
    }
    return spans.filter((span,index) => !spans.slice(0,index).some(previous => span.start < previous.end));
  }

  function protectNames(value, glossary = []) {
    const source = String(value || ''), spans = nameSpans(source, glossary);
    let prefix = 'NAME';
    while ((source + glossary.map(entry=>entry.target).join('')).toUpperCase().includes(prefix)) prefix = 'V' + prefix;
    let text = '', cursor = 0;
    const entries = spans.map((span,index) => ({...span, token:`[${prefix}${index}]`}));
    for (const entry of entries) {text += source.slice(cursor,entry.start) + entry.token; cursor = entry.end;}
    text += source.slice(cursor);
    function restore(value, partial = false) {
      let result = String(value || '');
      for (const [index,entry] of entries.entries()) {
        const marker = new RegExp(`[\\[［]\\s*${prefix}\\s*${index}\\s*[\\]］]`, 'giu');
        if (!partial && !marker.test(result)) throw new Error('翻譯遺漏人名，請重試');
        marker.lastIndex = 0;
        result = result.replace(marker, () => entry.target);
      }
      if (partial && entries.length) {
        // Never expose an incomplete internal marker in streaming captions.
        const start = Math.max(result.lastIndexOf('['), result.lastIndexOf('［'));
        if (start >= 0 && !/[\]］]/u.test(result.slice(start))) result = result.slice(0,start);
      }
      if (!partial && new RegExp(`[\\[［]\\s*${prefix}\\s*\\d`, 'iu').test(result)) throw new Error('翻譯人名標記不完整，請重試');
      return result;
    }
    const body = spans.reduceRight((text,span) => text.slice(0,span.start) + text.slice(span.end), source);
    return {text, entries, body, restore: value => restore(value), restorePartial: value => restore(value,true)};
  }

  function alreadyTargetLanguage(value, from, to) {
    if (from === to) return true;
    const body = protectNames(value).body.replace(/https?:\/\/\S+|@[A-Za-z0-9_]+/gu,'');
    if (to === 'zh') return han.test(body) && !kana.test(body) && !/[\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f]/u.test(body)
      && !/[A-Za-z]{3,}/u.test(body.replace(/\bw+\b/giu,'')) && chineseEvidence.test(body);
    if (to === 'ja') return kana.test(body) && !chineseEvidence.test(body) && !/[\uac00-\ud7af]/u.test(body);
    return false;
  }

  function shouldTranslateReading(value, from, to) {
    const text = String(value || '').trim();
    if (!text || from === to || alreadyTargetLanguage(text,from,to)) return false;
    if (from === 'ja' && globalThis.VocaLumeStreamerVocabulary?.isStandaloneGreeting(text)) return true;
    const body = protectNames(text).body;
    const pattern = {ja:kana, zh:han, ko:/[\uac00-\ud7af]/u, ru:/[\u0400-\u04ff]/u, ar:/[\u0600-\u06ff]/u, th:/[\u0e00-\u0e7f]/u}[from] || /[A-Za-zÀ-ž]/u;
    return pattern.test(body);
  }
  globalThis.VocaLumeTranslationGuards = Object.freeze({protectNames,alreadyTargetLanguage,shouldTranslateReading});
})();
