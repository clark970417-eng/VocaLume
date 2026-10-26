// Conservative text evidence, shared by audio segmentation and local preparation.
// Punctuation added by ASR is not enough to finish a hanging Japanese/Chinese clause.
const trailing = /[、，,。.!！?？\s」』”"）)]*$/u;
const hanging = /(?:けれども|けれど|けど|ので|のに|という|って|そして|それで|たら|なら|ながら|のは|のを|のが|を|が|に|と|て|で|如果|假如|因為|因为|但是|可是|然後|然后|雖然|虽然|所以|而且|不是|不要|沒有|没有|還沒|还没)$/u;
export function unfinishedSentence(text) {
 const value=String(text||'').trim().replace(trailing,'');
 return hanging.test(value);
}
export function completeSentence(text,language='auto') {
 const value=String(text||'').trim();
 if(!/[。！？.!?][」』”"）)]*$/u.test(value)||unfinishedSentence(value))return false;
 // Japanese quoted intentions and predicates can reverse at the end. Require a
 // recognizable finite ending; unknown forms retain the acoustic pause guard.
 if(language==='ja'||(language==='auto'&&/[ぁ-ゖァ-ヺ]/u.test(value))){
  const stem=value.replace(trailing,'');
  return /(?:です|でした|ます|ました|ません|ませんでした|ない|なかった|だ|だった|思う|思った|できる|できた|ください|ありがとう|ございます|ございました|こんにちは|こんばんは|おはよう)(?:ね|よ|よね|か|な|ぞ|わ|んだ|んです)*$/u.test(stem);
 }
 return value.replace(trailing,'').length>=4;
}

// A recognizer need not insert punctuation for an audible sentence to finish.
// Only use this additional evidence at an acoustic pause; it must not turn a
// rolling text hypothesis into a final caption on its own.
export function completeSpokenClause(text,language='auto') {
 const value=String(text||'').trim();
 if(!value)return false;
 if(completeSentence(value,language))return true;
 // Do not infer boundaries from arbitrary unpunctuated Latin/Han words.
 if(language!=='ja'&&!(language==='auto'&&/[ぁ-ゖァ-ヺ]/u.test(value)))return false;
 return completeSentence(value.replace(trailing,'')+'。','ja');
}
