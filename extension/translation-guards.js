// Shared by classic content scripts, the extension worker and desktop engines.
// Preserve attested names; never guess a person's kanji from their pronunciation.
(() => {
  const names = ['鹿乃まほろ', '兎田ぺこら', '博衣こより', 'まほろ', 'マホロ', 'Mahoro', 'ミリプロ'];
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const kana = /[\u3040-\u30ff]/u;
  const han = /[\u3400-\u9fff]/u;
  const honorific = /^(?:ちゃん|さん|さま|様|くん|君|たん)/u;
  const chineseEvidence = /[這这們们嗎吗麼么覺觉讓让還还會会說说]|你好|您好|謝謝|谢谢|今天|明天|昨天|辛苦了|喜歡|喜欢|已經|已经|真的|中文|[我你您][是有在不沒没想要也很能愛爱]|(?:好|太)(?:可愛|可爱|看|聽|听)/u;
  const scripts = {ja:kana, zh:han, ko:/\p{Script=Hangul}/u, ru:/\p{Script=Cyrillic}/u, ar:/\p{Script=Arabic}/u, th:/\p{Script=Thai}/u};
  const latinLanguages = new Set(['en','es','fr','de','pt','it','vi','id','nl','pl']);
  const latin = /\p{Script=Latin}/u;

  function stripLiterals(value) {
    return String(value || '').replace(/https?:\/\/\S+/giu, '')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu, '')
      .replace(/(?:^|\s)[@#][A-Za-z0-9_]+\b/gu, '');
  }

  // Script evidence, not a language classifier: French and English share Latin.
  function hasLanguageText(value, language) {
    const script = scripts[language] || (latinLanguages.has(language) ? latin : null);
    return !!script && [...stripLiterals(value)].some(char => /\p{L}/u.test(char) && script.test(char));
  }

  function isNonLinguisticText(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    // Preserve literal-only lines in otherwise translatable comments. Ordinary
    // words (including Han-only Japanese) must still enter the normal route.
    return !/\p{L}/u.test(stripLiterals(text));
  }

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

  function protectNames(value, glossary = [], terminology = []) {
    const source = String(value || ''), spans = nameSpans(source, glossary);
    // Selected unambiguous terms use the same lossless markers as names.
    // A glossary hint alone is advisory and small models may transliterate it.
    for (const entry of terminology) {
      if (!entry.source || !entry.target) continue;
      for (let at=source.indexOf(entry.source);at>=0;at=source.indexOf(entry.source,at+1)) {
        const end=at+entry.source.length;
        if (spans.some(span=>at<span.end && end>span.start)) continue;
        if (/^[\p{Script=Katakana}ー]/u.test(entry.source) && /[\p{Script=Katakana}ー]/u.test(source[at-1]||'')) continue;
        if (/[\p{Script=Katakana}ー]$/u.test(entry.source) && /[\p{Script=Katakana}ー]/u.test(source[end]||'')) continue;
        spans.push({start:at,end,source:entry.source,target:entry.target});
      }
    }
    spans.sort((a,b)=>a.start-b.start);
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
    const body = stripLiterals(protectNames(value).body);
    if (to === 'zh') return han.test(body) && !kana.test(body) && !/[\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f]/u.test(body)
      && !/[A-Za-z]{3,}/u.test(body.replace(/\bw+\b/giu,'')) && chineseEvidence.test(body);
    if (to === 'ja') return kana.test(body) && !chineseEvidence.test(body) && !/[\uac00-\ud7af]/u.test(body);
    // Among supported languages these scripts have distinct targets. Require
    // every remaining letter to match, so mixed source sentences still translate.
    // Never guess English vs French, Spanish, Vietnamese, etc. from Latin alone.
    if (['ko','ru','ar','th'].includes(to)) {
      const letters = body.match(/\p{L}/gu) || [];
      return letters.length > 0 && letters.every(char => scripts[to].test(char));
    }
    return false;
  }

  function shouldTranslateReading(value, from, to) {
    const text = String(value || '').trim();
    if (!text || from === to || isNonLinguisticText(text) || alreadyTargetLanguage(text,from,to)) return false;
    if (from === 'ja' && globalThis.VocaLumeStreamerVocabulary?.isStandaloneGreeting(text)) return true;
    const body = protectNames(text).body;
    return hasLanguageText(body,from);
  }
  const chatDetections = new Map();

  function hasEnglishChatSyntax(body) {
    if (!/^[a-z\s\p{P}\p{N}\p{S}]+$/iu.test(body)) return false;
    // Require a recognizable phrase rather than guessing from Latin letters.
    return /\b(?:i (?:really |just )?(?:enjoyed|loved|liked) (?:your|this|the)|(?:thanks|thank you) (?:so much )?for (?:the|your|this|streaming)|(?:i|we) (?:can['’]t|cannot) wait (?:for|to))\b/iu.test(body);
  }

  async function streamerChatDirection(value, target, detectLanguage) {
    const body = stripLiterals(protectNames(value).body).replace(/\b(?:w+|lol|gg)\b|(?:^|\s)[草ｗ]+(?=\s|\p{P}|$)/giu, '').trim();
    const letters = body.match(/\p{L}/gu) || [];
    if (letters.length < 2 || body.length > 3000) return null;
    const strongScripts = ['ja', 'ko', 'ru', 'ar', 'th'].filter(code => scripts[code].test(body));
    if (strongScripts.length > 1) return null;
    let source = strongScripts[0];
    if (!source && chineseEvidence.test(body) && han.test(body)) source = 'zh';
    if (!source && detectLanguage && (letters.length >= 4 || han.test(body))) {
      if (!chatDetections.has(body)) {
        if (chatDetections.size >= 256) chatDetections.delete(chatDetections.keys().next().value);
        chatDetections.set(body, Promise.resolve().then(() => detectLanguage(body)).then(result => {
          const top = result.languages?.[0];
          const code = top?.language?.toLowerCase().split('-')[0];
          const isSupportedLatin = latinLanguages.has(code) && code !== 'nl' && code !== 'pl';
          const wordCount = (body.match(/\p{Script=Latin}+/gu) || []).length;
          const confidentLatinSentence = isSupportedLatin && wordCount >= 4 && top.percentage >= 95;
          if (result.isReliable && top?.percentage >= 80 && (scripts[code] || isSupportedLatin)) return code;
          if (hasEnglishChatSyntax(body)) return 'en';
          return confidentLatinSentence ? code : null;
        }).catch(() => {
          chatDetections.delete(body);
          return null;
        }));
      }
      source = await chatDetections.get(body);
    }
    return source && source !== target ? source + '-' + target : null;
  }
  globalThis.VocaLumeTranslationGuards = Object.freeze({protectNames,alreadyTargetLanguage,shouldTranslateReading,isNonLinguisticText,hasLanguageText,streamerChatDirection});
})();
