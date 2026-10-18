// Curated Japanese / Taiwan Traditional Chinese names, not sentence rewrites.
// Ambiguous mechanics need an explicit game context in the same input.
const pokemonNames=[
 ['ポケモン','寶可夢'],['ピカチュウ','皮卡丘'],['イーブイ','伊布'],
 ['リザードン','噴火龍'],['フシギダネ','妙蛙種子'],['ゼニガメ','傑尼龜'],
 ['カビゴン','卡比獸'],['ゲンガー','耿鬼'],['ミュウツー','超夢'],
 ['ルカリオ','路卡利歐'],['ゲッコウガ','甲賀忍蛙'],['サーナイト','沙奈朵'],
 ['ガブリアス','烈咬陸鯊'],['ニンフィア','仙子伊布'],['ミミッキュ','謎擬Q'],
 ['シャワーズ','水伊布'],['エーフィ','太陽伊布'],['ブラッキー','月亮伊布'],
 ['リーフィア','葉伊布'],['グレイシア','冰伊布'],
 ['コイキング','鯉魚王'],['ギャラドス','暴鯉龍'],
 ['モンスターボール','精靈球'],['マスターボール','大師球'],
 ['ポケモンセンター','寶可夢中心'],['テラスタル','太晶化'],
 ['テラレイドバトル','太晶團體戰'],['きあいのタスキ','氣勢披帶']
];
const pokemonTerms=[
 // コダック also means Kodak; never make it a context-free Pokémon name.
 ['コダック','可達鴨'],
 // Sanders and booster have ordinary meanings outside Pokémon.
 ['サンダース','雷伊布'],['ブースター','火伊布'],
 ['色違い','異色'],['個体値','個體值'],['努力値','努力值'],['種族値','種族值'],
 ['特性','特性'],['タイプ相性','屬性相剋'],['色違い厳選','刷異色'],['個体値厳選','刷個體'],
 ['でんこうせっか','電光一閃'],['10まんボルト','十萬伏特'],['かえんほうしゃ','噴射火焰']
];
const shooterTerms=[
 ['ヘッドショット','爆頭'],['リロード','換彈'],['リコイル','後座力'],
 ['リコイル制御','壓槍'],['腰撃ち','腰射'],['エイム','瞄準'],
 ['キャラコン','身法'],['ノックダウン','擊倒'],['ダウン','倒地'],
 ['アーマー','護甲'],['アーマー割り','破甲'],['漁夫','勸架'],
 ['射線','槍線'],['遮蔽物','掩體'],['弾薬','彈藥'],['弾切れ','沒子彈'],
 ['ランクマッチ','積分賽'],['リスポーン','重生'],['クールダウン','冷卻時間']
];
const valorantTerms=[
 ['スパイク','輻能核心'],['ヴァンダル','暴徒'],['ファントム','幻象'],
 ['オペレーター','間諜'],['エージェント','特務'],['ジェット','婕提'],['ソーヴァ','蘇法']
];
const apexTerms=[
 ['シールドバッテリー','護盾電池'],['シールドセル','小型護盾電池'],
 ['ノックダウンシールド','擊倒護盾'],['パスファインダー','探路者'],
 ['ブラッドハウンド','尋血犬'],['レイス','惡靈']
];
export const entries=Object.freeze([
 ...[['VALORANT','特戰英豪'],['Apex Legends','Apex 英雄'],['Counter-Strike 2','絕對武力 2'],['PUBG','絕地求生']].map(([ja,zh])=>({ja,zh,domain:'title',standalone:true})),
 ...pokemonNames.map(([ja,zh])=>({ja,zh,domain:'pokemon',standalone:true})),
 ...pokemonTerms.map(([ja,zh])=>({ja,zh,domain:'pokemon',standalone:false})),
 ...shooterTerms.map(([ja,zh])=>({ja,zh,domain:'shooter',standalone:false})),
 ...valorantTerms.map(([ja,zh])=>({ja,zh,domain:'valorant',standalone:false})),
 ...apexTerms.map(([ja,zh])=>({ja,zh,domain:'apex',standalone:false}))
].map(Object.freeze));

const normalize=s=>String(s||'').normalize('NFKC');
const supported=(from,to)=>(from==='ja'&&to==='zh')||(from==='zh'&&to==='ja');
function termSpans(text,term){
 const spans=[];
 for(let at=text.indexOf(term);at>=0;at=text.indexOf(term,at+1)){
  const before=text[at-1]||'',after=text[at+term.length]||'';
  // ダウン must not match ダウンロード, nor an English title a longer word.
  if(/^[\p{Script=Katakana}ー]/u.test(term)&&/[\p{Script=Katakana}ー]/u.test(before))continue;
  if(/[\p{Script=Katakana}ー]$/u.test(term)&&/[\p{Script=Katakana}ー]/u.test(after))continue;
  if(/^[A-Za-z0-9]/.test(term)&&/[A-Za-z0-9_]/.test(before))continue;
  if(/[A-Za-z0-9]$/.test(term)&&/[A-Za-z0-9_]/.test(after))continue;
  spans.push([at,at+term.length]);
 }
 return spans;
}
function domains(text){
 const s=normalize(text),result=new Set();
 if(/ポケモン|ポケットモンスター|寶可夢|神奇寶貝|pokemon|pokémon/iu.test(s)||pokemonNames.some(([ja,zh])=>s.includes(ja)||s.includes(zh)))result.add('pokemon');
 if(/\bVALORANT\b|ヴァロラント|特戰英豪/iu.test(s))result.add('valorant');
 if(/\bAPEX\b|エーペックス|Apex英雄|Apex 英雄/iu.test(s))result.add('apex');
 if(result.has('valorant')||result.has('apex')||/\b(?:FPS|CS2|PUBG|ADS)\b|Counter-Strike\s*2|絕對武力\s*2|絕地求生|カウンターストライク|槍戰|枪战|銃撃|ヘッドショット|リロード|リコイル|腰撃ち|爆頭|換彈|壓槍/iu.test(s))result.add('shooter');
 return result;
}

/** Exact unambiguous names only; no question/negation/punctuation stripping. */
export function gameTermTranslation(text,from,to){
 if(!supported(from,to))return undefined;
 const s=normalize(text).trim(),key=from==='ja'?'ja':'zh',out=to==='ja'?'ja':'zh';
 return entries.find(e=>e.standalone&&normalize(e[key])===s)?.[out];
}

/** Bounded, longest-first hints. Existing personal terminology always wins. */
export function selectGameTerminology(text,from,to,existing=[]){
 if(!supported(from,to))return [];
 const s=normalize(text),context=domains(s),key=from==='ja'?'ja':'zh',out=to==='ja'?'ja':'zh';
 const selected=[],covered=[];
 // Keep the direction of evolving INTO a named Pokémon; a bare name hint can
 // leave a small model treating that Pokémon as the one evolving instead.
 const evolution=entries.filter(e=>e.domain==='pokemon'&&(e.standalone||e.zh.endsWith('伊布')))
  .map(e=>({ja:e.ja+'に進化',zh:'進化成'+e.zh,domain:'pokemon',standalone:false}));
 for(const term of [...entries,...evolution].sort((a,b)=>b[key].length-a[key].length)){
  if(!term.standalone&&!context.has(term.domain))continue;
  const source=term[key];
  if(source===term[out])continue;
  const spans=termSpans(text,source).filter(([start,end])=>!covered.some(([a,b])=>a<=start&&b>=end));
  if(!spans.length)continue;
  if(existing.some(e=>e.source&&(normalize(e.source).includes(normalize(source))||normalize(source).includes(normalize(e.source)))))continue;
  // A short name can also occur independently: 伊布 ... 仙子伊布 needs both.
  selected.push({source,target:term[out]});
  covered.push(...spans);
  if(selected.length===8)break;
 }
 return selected;
}
