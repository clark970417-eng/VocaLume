// One catalogue for classic content scripts, the background module and desktop.
// Only attested spellings are listed; never generate a greeting from any name.
(() => {
  const entries = [
    { creator:'鹿乃まほろ', aliases:['こんまほ','konmaho'], standard:'こんにちは', chinese:'你好', kind:'hello' },
    { creator:'鹿乃まほろ', aliases:['おつかの','otsukano'], standard:'お疲れさまでした', chinese:'辛苦了', kind:'thanks' },
    { creator:'兎田ぺこら', aliases:['こんぺこ','konpeko'], standard:'こんにちは', chinese:'你好', kind:'hello' },
    { creator:'兎田ぺこら', aliases:['おつぺこ','otsupeko'], standard:'お疲れさまでした', chinese:'辛苦了', kind:'thanks' },
    { creator:'兎田ぺこら', aliases:['おはぺこ','ohapeko'], standard:'おはようございます', chinese:'早安', kind:'morning' },
    { creator:'兎田ぺこら', aliases:['おやすみぺこ','oyasumipeko'], standard:'おやすみなさい', chinese:'晚安', kind:'goodnight' },
    { creator:'博衣こより', aliases:['こんこよ','konkoyo'], standard:'こんにちは', chinese:'你好', kind:'hello' },
    { creator:'博衣こより', aliases:['おつこよ','otsukoyo'], standard:'お疲れさまでした', chinese:'辛苦了', kind:'thanks' }
  ].map(entry=>Object.freeze({...entry,aliases:Object.freeze(entry.aliases)}));
  const escape = value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const hiragana = value=>value.replace(/[\u30a1-\u30f6]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60));
  const katakana = value=>value.replace(/[\u3041-\u3096]/g,char=>String.fromCharCode(char.charCodeAt(0)+0x60));
  const lookup = value=>hiragana(value.normalize('NFKC')).toLowerCase();
  const decoration = '[\\s\\p{P}\\p{S}\\p{M}\\u200d\\ufe0fー〜～~]';
  const whole=new RegExp(`^(${decoration}*)([\\p{L}]+?)(${decoration}*)$`,'u');
  const aliases=new Map(entries.flatMap(entry=>entry.aliases.map(alias=>[alias,entry])));
  const rules=entries.flatMap(entry=>entry.aliases.map(alias=>({
    entry,
    // A salutation at the start of a sentence can be explained to any model
    // using standard Japanese, without changing its source caption or names.
    opening:new RegExp(`^([\\s\\p{S}\\p{M}\\u200d\\ufe0f]*)(?:${escape(alias)}|${escape(katakana(alias))})${entry.kind==='thanks'?'(?:でした)?':''}[ー〜～~]*(?=[\\s、，,.。!！…]|$)`,'iu')
  })));

  function greetingTranslation(value) {
    const text=String(value||'').trim();
    // A question or a quoted word is content about a greeting, not a greeting.
    if(/[?？「」『』“”"'#＃@＠]/u.test(text))return undefined;
    const normalized=lookup(text);
    const match=whole.exec(normalized);if(!match)return undefined;
    let entry=aliases.get(match[2]);
    if(!entry&&match[2].endsWith('でした')){
      const past=aliases.get(match[2].slice(0,-3));if(past?.kind==='thanks')entry=past;
    }
    if(!entry)return undefined;
    const suffix=match[3].replace(/[ー~〜]+/gu,'～');
    return match[1]+entry.chinese+(/[。.!！～]/u.test(suffix)?'':'！')+suffix;
  }
  function normalizeGreetingSource(value) {
    const text=String(value||'');
    for(const {entry,opening} of rules){
      if(opening.test(text))return text.replace(opening,(_match,leading)=>leading+entry.standard);
    }
    return text;
  }
  globalThis.VocaLumeStreamerVocabulary=Object.freeze({
    entries:Object.freeze(entries),
    creatorNames:Object.freeze([...new Set(entries.map(entry=>entry.creator))]),
    greetingTranslation,normalizeGreetingSource,
    isStandaloneGreeting:text=>greetingTranslation(text)!==undefined
  });
})();
