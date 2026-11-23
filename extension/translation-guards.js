// Shared by classic content scripts, the extension worker and desktop engines.
// Preserve attested names; never guess a person's kanji from their pronunciation.
(() => {
  const names = [
    '鹿乃まほろ', 'Kano Mahoro', 'まほろ', 'マホロ', 'Mahoro', 'ミリプロ',
    '甘狼このみ', '音ノ乃のの', 'あくび・でもんすぺーど', '音ノ瀬らこ', 'ゆらぎゆら',
    '小廻こま', '眠雲ツクリ', '雨夜リズ', '虹深°ぬふ', '夕霧レイ',
    'ホロライブ', 'hololive', 'ホロスターズ', 'holostars', 'ときのそら', '星街すいせい',
    'Hoshimachi Suisei', 'さくらみこ', 'Sakura Miko', '白上フブキ', 'Shirakami Fubuki',
    '大神ミオ', '猫又おかゆ', '戌神ころね', '大空スバル', '兎田ぺこら', 'Usada Pekora',
    '宝鐘マリン', 'Houshou Marine', '不知火フレア', '白銀ノエル', '角巻わため', '常闇トワ',
    '姫森ルーナ', '雪花ラミィ', '桃鈴ねね', '獅白ぼたん', '尾丸ポルカ', 'ラプラス・ダークネス',
    '鷹嶺ルイ', '博衣こより', 'Hakui Koyori', '風真いろは',
    'にじさんじ', 'NIJISANJI', '月ノ美兎', '壱百満天原サロメ', 'ChroNoiR',
    'ぶいすぽっ', 'VSPO!', '花芽すみれ', '花芽なずな', '小雀とと', '一ノ瀬うるは', '胡桃のあ',
    '兎咲ミミ', '空澄セナ', '橘ひなの', '八雲べに', '藍沢エマ', '紫宮るな', '猫汰つな',
    '小森めと', '夢野あかり', '紡木こかげ', '初音ミク', 'Hatsune Miku',
    'YouTube', 'Twitch', 'Discord', 'Bilibili', 'HoYoverse', 'VocaLume'
  ];
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const kana = /[\u3040-\u30ff]/u;
  const han = /[\u3400-\u9fff]/u;
  const honorific = /^(?:ちゃん|さん|さま|様|くん|君|たん)/u;
  const chineseEvidence = /[這这們们嗎吗麼么覺觉讓让還还會会說说]|你好|您好|謝謝|谢谢|今天|明天|昨天|辛苦了|喜歡|喜欢|已經|已经|真的|中文|[我你您][是有在不沒没想要也很能愛爱]|(?:好|太)(?:可愛|可爱|看|聽|听)/u;
  const scripts = {ja:kana, zh:han, ko:/\p{Script=Hangul}/u, ru:/\p{Script=Cyrillic}/u, ar:/\p{Script=Arabic}/u, th:/\p{Script=Thai}/u};
  const latinLanguages = new Set(['en','es','fr','de','pt','it','vi','id','nl','pl']);
  const latin = /\p{Script=Latin}/u;
  const latinWord = /[\p{Script=Latin}\p{M}\p{N}_]/u;
  const knownNamePattern = new RegExp(names.sort((a,b) => b.length-a.length).map(escape).join('|'), 'giu');
  const ordinaryHonorifics = new Set([
    '皆', 'みな', 'みんな', 'たく', '沢山', 'たくさん', 'お母', 'お父', 'お姉', 'お兄', 'おじい', 'おばあ',
    'おじ', 'おば', 'お子', '父', '母', 'お客', '客', '神', '仏', '大家', '奥', '患者', '看護師', '店員',
    '先生', '先輩', '後輩', '社長', '店長', '管理人', '配信者', '視聴者', '配信主', '実況者', '製作者',
    '運営', '作者', '作家', 'スタッフ', 'リスナー', 'ゲーム', 'モンスター', 'キャラ', 'ママ', 'パパ',
    '猫', 'ねこ', '犬', 'いぬ', 'うさぎ', 'くま', 'ライオン', 'パンダ', '赤', '赤ん坊',
    '魚屋', '八百屋', '花屋', '本屋', 'パン屋', 'おつかれ', 'お疲れ', 'ごちそう',
    '秘密', '内緒', 'ひみつ', 'ないしょ', '非公開', '未公開', '不明', '未定', '未登録', '匿名', '本名',
    '無し', 'なし', 'ない', 'なん', 'なに', '何', 'こんにちは', 'こんばんは', 'ありがとう',
    '선생', '작가', '작곡가', '가수', '배우', '스트리머', '시청자', '손', '손님', '고객', '하나', '하나님',
    '부모', '부모님', '사장', '사장님', '엄마', '아빠', '여러분', '관리자', '운영자', '의사', '형', '언니'
  ]);
  const latinName = "\\p{Lu}(?:[\\p{Ll}\\p{M}]+(?:\\p{Lu}[\\p{Ll}\\p{M}]+)*|(?=[’'-]))(?:[’'-]\\p{Lu}?[\\p{Ll}\\p{M}]+)*";
  const latinFullName = `${latinName}(?:[ \\t]+${latinName}){1,2}`;
  const introducedName = `(?:\\p{Script=Han}{1,4}(?:[\\p{Script=Hiragana}\\p{Script=Katakana}ー]{1,6})?|\\p{Script=Hiragana}{2,6}|[\\p{Script=Katakana}ー]{2,10}(?:・[\\p{Script=Katakana}ー]{2,10})?|${latinName}(?:[ \\t]+${latinName}){0,2})`;
  // Bare 我叫 can mean "I asked/called someone", and 名前は can introduce a
  // statement about a name. Apply these checks only to unquoted candidates.
  const chineseCausativeObject = /^(?:大家|朋友|同[學学]|同事|[媽妈][媽妈]|爸爸|老[師师]|小孩|[鄰邻]居|客人)/u;
  const chineseCausativeAction = /(?:等等|等[著着]|看看|[過过回][來来]|出去|[進进][來来去]|回家|[離离][開开]|起床|坐下|吃[飯饭]|[說说][話话])$/u;
  const japaneseNamePredicates = new Set([
    'まだ', 'まだまだ', 'もう', '大切', '大事', '重要', '必要', '不要', '自由', '適当', '微妙',
    '難しい', '珍しい', '長い', '短い', '同じ', '別々', '普通', '漢字', 'ひらがな', 'カタカナ'
  ]);
  const namePatterns = [
    // A handle is an identifier. An @ inside an email address is excluded.
    /(?<![\p{L}\p{M}\p{N}._%+\-@])(?<name>[@＠][A-Za-z0-9_]{1,30})(?![A-Za-z0-9_])/dgu,
    /(?:お?名前は|本名は|ハンドルネームは|名字(?:叫|是)|姓名(?:叫|是)|暱稱是|昵称是)\s*[「『“"](?<name>[^」』”"\r\n]{1,36})(?=[」』”"])/dgu,
    /[「『](?<name>[^」』\r\n]{1,36})(?=[」』]と(?:いう|言う)(?:名前|人|方|ライバー|配信者))/dgu,
    new RegExp(`(?<japaneseIntroduction>お?名前は|本名は|ハンドルネームは)[ \\t]*(?<name>${introducedName})(?=[ \\t]*(?:です|でございます|だよ)(?:$|[\\s\\p{P}]))`, 'dgu'),
    new RegExp(`(?:^|[\\s、，,。！？!?]|(?:私は|わたしは|僕は|ぼくは|俺は|わたくしは))(?<name>${introducedName})(?=と申します(?:$|[\\s\\p{P}]))`, 'dgu'),
    /(?:^|[\s。！？!?，,、])(?<chineseIntroduction>我叫|我名叫|我姓)(?<name>[\p{Script=Han}]{2,4})(?=$|[\s，,。！!？?、])/dgu,
    new RegExp(`(?<![\\p{L}\\p{M}])(?:[Mm]y name is|[Hh]er name is|[Hh]is name is|[Tt]heir name is|[Mm]r\\.?|[Mm]s\\.?|[Mm]rs\\.?|[Dd]r\\.?)\\s+(?<name>${latinName}(?:[ \\t]+${latinName}){0,2})(?![\\p{Script=Latin}\\p{M}])`, 'dgu'),
    new RegExp(`(?<![\\p{L}\\p{M}])(?<name>${latinFullName})(?=\\s+(?:said|asked|replied|wrote|joined|is live)\\b)`, 'dgu'),
    new RegExp(`(?<![\\p{Script=Latin}\\p{M}])(?<name>${latinName}(?:[ \\t]+${latinName}){0,2})(?<suffix>ちゃん|さん|さま|様|くん|君|たん)`, 'dgu'),
    /(?:(?<!\p{Script=Han})|(?<=喜歡|喜欢|認識|认识|謝謝|谢谢))(?<name>\p{Script=Han}{2,4}(?:[\p{Script=Hiragana}\p{Script=Katakana}ー]{1,5})?)(?<suffix>ちゃん|さん|さま|様|くん|君|たん)/dgu,
    /(?<![\p{Script=Katakana}ー・])(?<name>[\p{Script=Katakana}ー]{3,10}(?:・[\p{Script=Katakana}ー]{2,10})?)(?<suffix>ちゃん|さん|さま|様|くん|君|たん)/dgu,
    /(?:^|[\s、，,。！？!?:：「『])(?<name>[\p{Script=Hiragana}]{2,5})(?<suffix>ちゃん|さん|くん|たん)(?=$|[\s\p{P}]|は|が|を|に|と|の|も|で|へ|です)/dgu,
    /(?<!\p{Script=Hangul})(?<name>\p{Script=Hangul}{2,4})(?<suffix>[ \t]*[씨님])(?=(?:은|는|이|가|을|를|과|와|께서|께|한테|에게|도)?(?!\p{Script=Hangul}))/dgu,
    /(?:제 이름은|이름은)\s+(?<name>\p{Script=Hangul}{2,4})(?=(?:입니다|이에요|예요)(?!\p{Script=Hangul}))/dgu
  ];

  function inferredNames(text) {
    const spans = [];
    for (const pattern of namePatterns) {
      for (const match of text.matchAll(pattern)) {
        const {name, suffix = '', chineseIntroduction, japaneseIntroduction} = match.groups;
        const [start, nameEnd] = match.indices.groups.name;
        if (!/^[\p{L}\p{M}\p{N}@＠][\p{L}\p{M}\p{N}_・.'’° \t-]*$/u.test(name) ||
            ordinaryHonorifics.has(name) || /^(?:我|你|他|她|它|一[個个]|[個个]|[什甚][麼么]|外送|救護車|救护车|今[日天]|昨日|明日|先週|来週)/u.test(name)) continue;
        if (!suffix && /[\p{Script=Han}].*(?:ない|ません|かった|らしい)$/u.test(name)) continue;
        if (chineseIntroduction === '我叫' && (chineseCausativeObject.test(name) || chineseCausativeAction.test(name))) continue;
        if (japaneseIntroduction && japaneseNamePredicates.has(name)) continue;
        // Compound common nouns such as お客さん and ご近所さん are not names.
        if (suffix && /^(?:お|ご|御)\p{Script=Han}/u.test(text.slice(Math.max(0,start-1),nameEnd))) continue;
        spans.push({start, nameEnd, end:nameEnd + suffix.length});
      }
    }
    return spans;
  }

  const literalPattern = /https?:\/\/[^\s<>"'`「」『』（）【】。！？、，；]+|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|`[^`\r\n]+`/giu;

  function literalSpans(value) {
    return [...value.matchAll(literalPattern)].map(match => {
      let text = match[0];
      if (/^https?:/iu.test(text)) {
        text = text.replace(/[.,!?:;\]]+$/u, '');
        while (text.endsWith(')') && (text.match(/\)/gu)?.length || 0) > (text.match(/\(/gu)?.length || 0)) {
          text = text.slice(0, -1);
        }
      }
      return {index: match.index, text};
    });
  }

  function stripLiterals(value) {
    let text = String(value || '');
    for (const literal of literalSpans(text).reverse()) {
      text = text.slice(0, literal.index) + text.slice(literal.index + literal.text.length);
    }
    return text.replace(/(?<![\p{Script=Latin}\p{N}._%+\-@])[@＠#][A-Za-z0-9_]+\b/gu, '');
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
    // Explicit preserve-as-written entries also work for other personal names.
    const preserved = glossary.filter(entry => entry.source?.trim() && entry.source === entry.target);
    const overridden = glossary.filter(entry => entry.source?.trim() && entry.target && entry.source !== entry.target);
    // A user term wins even if it is a longer compound containing a default name.
    const overrides = overridden.flatMap(entry => [...text.matchAll(new RegExp(escape(entry.source), 'gu'))]
      .map(match => ({start: match.index, end: match.index + entry.source.length, source: entry.source, target: entry.target})));
    const pattern = preserved.length ?
      new RegExp([...names,...preserved.map(entry => entry.source)].sort((a,b) => b.length-a.length).map(escape).join('|'), 'giu') : knownNamePattern;
    const literals = literalSpans(text);
    const spans = [];
    function addName(start, nameEnd, end) {
      if (literals.some(literal => literal.index < end && literal.index + literal.text.length > start)) return;
      const source = text.slice(start,end);
      const custom = overrides.find(entry => entry.start < end && entry.end > start);
      // An exact name mapping can be enforced without guessing a spelling.
      // More complex custom compounds keep their existing glossary path.
      if (custom && (custom.start !== start || custom.end !== nameEnd)) return;
      spans.push({start, end, source, target:custom ? custom.target + text.slice(nameEnd,end) : source});
    }
    for (const match of text.matchAll(pattern)) {
      const start = match.index, source = match[0], tail = text.slice(start + source.length);
      if ((latin.test(source[0]) && latinWord.test(text[start-1] || '')) ||
          (latin.test(source.at(-1)) && latinWord.test(tail[0] || ''))) continue;
      const suffix = honorific.exec(tail)?.[0] || '';
      // Do not protect the unrelated word まほろば or the character マホロア.
      if (['まほろ','マホロ'].includes(source) && !suffix && /^[\u3040-\u30ff]/u.test(tail) && !/^(?:の|は|が|を|に|と|も|で|へ|って|より|から|です|だ[よねっ]|だった|じゃ)/u.test(tail)) continue;
      addName(start, start + source.length, start + source.length + suffix.length);
    }
    for (const {start,nameEnd,end} of inferredNames(text)) {
      if (!spans.some(span => start < span.end && end > span.start)) addName(start,nameEnd,end);
    }
    for (const {index, text: literal} of literals) {
      spans.push({start:index,end:index+literal.length,source:literal,target:literal});
    }
    return spans.sort((a,b) => a.start-b.start);
  }

  const withoutSpans = (source, spans) => spans.reduceRight((text,span) => text.slice(0,span.start) + text.slice(span.end), source);

  function protectNames(value, glossary = [], terminology = []) {
    const source = String(value || ''), spans = nameSpans(source, glossary);
    // Selected unambiguous terms use the same lossless markers as names.
    // A glossary hint alone is advisory and small models may transliterate it.
    for (const entry of terminology) {
      if (!entry.source || !entry.target) continue;
      for (let at=source.indexOf(entry.source);at>=0;at=source.indexOf(entry.source,at+1)) {
        const end=at+entry.source.length;
        if (/^w{2,}$/i.test(entry.source) &&
            (/[\p{Script=Latin}\d_]/u.test(source[at-1]||'') ||
             /^(?:[\p{Script=Latin}\d_]|\.[a-z0-9])/iu.test(source.slice(end)))) continue;
        if (spans.some(span=>at<span.end && end>span.start)) continue;
        if (/^[\p{Script=Katakana}ー]/u.test(entry.source) && /[\p{Script=Katakana}ー]/u.test(source[at-1]||'')) continue;
        if (/[\p{Script=Katakana}ー]$/u.test(entry.source) && /[\p{Script=Katakana}ー]/u.test(source[end]||'')) continue;
        spans.push({start:at,end,source:entry.source,target:entry.target});
      }
    }
    spans.sort((a,b)=>a.start-b.start);
    let prefix = 'NAME';
    const existing = [source,...spans.map(span => span.target)].join(' ').normalize('NFKC').toUpperCase();
    while (existing.includes(prefix)) prefix = 'V' + prefix;
    let text = '', cursor = 0;
    const entries = spans.map((span,index) => ({...span, token:`[${prefix}${index}]`}));
    for (const entry of entries) {text += source.slice(cursor,entry.start) + entry.token; cursor = entry.end;}
    text += source.slice(cursor);
    const widePrefix = prefix.replace(/[A-Z]/g, char => String.fromCharCode(char.charCodeAt(0) + 0xfee0));
    const marker = new RegExp(`[\\[［]\\s*(?:${prefix}|${widePrefix})\\s*([0-9０-９]+)\\s*[\\]］]`, 'giu');
    const unfinishedMarker = new RegExp(`[\\[［]\\s*(?:${prefix}|${widePrefix})\\s*[0-9０-９]`, 'iu');
    function restore(value, partial = false) {
      const output = String(value || '');
      const seen = new Set();
      let result = output.replace(marker, (original, digits) => {
        const index = Number(digits.normalize('NFKC'));
        if (!entries[index]) return partial ? '' : original;
        if (seen.has(index)) {
          if (partial) return '';
          throw new Error('翻譯重複了人名，請重試');
        }
        seen.add(index);
        return entries[index].target;
      });
      if (partial && entries.length) {
        // Never expose an incomplete internal marker in streaming captions.
        const start = Math.max(result.lastIndexOf('['), result.lastIndexOf('［'));
        if (start >= 0 && !/[\]］]/u.test(result.slice(start))) result = result.slice(0,start);
      }
      if (!partial && unfinishedMarker.test(result)) throw new Error('翻譯人名標記不完整，請重試');
      if (!partial && seen.size !== entries.length) {
        // Some providers leave the exact name in the result instead of a marker.
        // Count each literal occurrence only once, excluding restored markers.
        const literalOutput = output.replace(marker, ' ');
        const occupied = [];
        const missing = entries.filter((_,index) => !seen.has(index)).sort((a,b) => b.target.length-a.target.length);
        for (const {target} of missing) {
          const match = [...literalOutput.matchAll(new RegExp(escape(target), 'gu'))].find(({index}) => {
            const end = index + target.length;
            return !occupied.some(([start,stop]) => index < stop && end > start) &&
              !(latin.test(target[0]) && latinWord.test(literalOutput[index-1] || '')) &&
              !(latin.test(target.at(-1)) && latinWord.test(literalOutput[end] || ''));
          });
          if (!match) throw new Error('翻譯遺漏人名，請重試');
          occupied.push([match.index, match.index + target.length]);
        }
      }
      return result;
    }
    const body = withoutSpans(source,spans);
    return {text, entries, body, restore: value => restore(value), restorePartial: value => restore(value,true)};
  }

  function alreadyTargetLanguage(value, from, to) {
    if (from === to) return true;
    const text = String(value || '');
    return matchesTargetLanguage(stripLiterals(withoutSpans(text,nameSpans(text))),to);
  }

  function matchesTargetLanguage(body, to) {
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
    if (!text || from === to || isNonLinguisticText(text)) return false;
    const body = stripLiterals(withoutSpans(text,nameSpans(text)));
    if (matchesTargetLanguage(body,to)) return false;
    if (from === 'ja' && globalThis.VocaLumeStreamerVocabulary?.isStandaloneGreeting(text)) return true;
    // Kanji-only Japanese headlines and signs are common. Strong Chinese
    // evidence still prevents translating target-language comments.
    return hasLanguageText(body,from) || (from === 'ja' && han.test(body) && !chineseEvidence.test(body));
  }

  function shouldTranslateWriting(value, from) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (from !== 'ja') return hasLanguageText(text,from);
    return !!globalThis.VocaLumeStreamerVocabulary?.isStandaloneGreeting(text) ||
      kana.test(stripLiterals(text)) || han.test(stripLiterals(text));
  }
  const chatDetections = new Map();

  function hasEnglishChatSyntax(body) {
    if (!/^[a-z\s\p{P}\p{N}\p{S}]+$/iu.test(body)) return false;
    // Require a recognizable phrase rather than guessing from Latin letters.
    return /\b(?:i (?:really |just )?(?:enjoyed|loved|liked) (?:your|this|the)|(?:thanks|thank you) (?:so much )?for (?:the|your|this|streaming)|(?:i|we) (?:can['’]t|cannot) wait (?:for|to))\b/iu.test(body);
  }

  async function streamerChatDirection(value, target, detectLanguage) {
    const text = String(value || '');
    const body = stripLiterals(withoutSpans(text,nameSpans(text))).replace(/\b(?:w+|lol|gg)\b|(?:^|\s)[草ｗ]+(?=\s|\p{P}|$)/giu, '').trim();
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
  globalThis.VocaLumeTranslationGuards = Object.freeze({protectNames,alreadyTargetLanguage,shouldTranslateReading,shouldTranslateWriting,isNonLinguisticText,hasLanguageText,streamerChatDirection});
})();
