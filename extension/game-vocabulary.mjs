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
 ['テラレイドバトル','太晶團體戰'],['きあいのタスキ','氣勢披帶'],
 ['ニャオハ','新葉喵'],['ホゲータ','呆火鱷'],['クワッス','潤水鴨'],
 ['ニャローテ','蒂蕾喵'],['アチゲータ','炙燙鱷'],['ウェルカモ','湧躍鴨'],
 ['マスカーニャ','魔幻假面喵'],['ラウドボーン','骨紋巨聲鱷'],['ウェーニバル','狂歡浪舞鴨'],
 ['コライドン','故勒頓'],['ミライドン','密勒頓'],['ウネルミナモ','波盪水'],
 ['テツノイサハ','鐵斑葉'],['サーフゴー','賽富豪'],['トドロクツキ','轟鳴月'],
 ['サケブシッポ','吼叫尾'],['イダイナキバ','雄偉牙'],['テツノブジン','鐵武者'],
 ['テツノツツミ','鐵包袱'],['テツノワダチ','鐵轍跡'],['コレクレー','索財靈'],
 ['ボチ','墓仔狗'],['ハラバリー','電肚蛙'],['リキキリン','奇麒麟'],
 ['ウミディグダ','海地鼠'],['グレンアルマ','紅蓮鎧騎'],['ソウブレイズ','蒼炎刃鬼'],
 ['ガケガニ','毛崖蟹'],['タギングル','塗標客'],['モトトカゲ','摩托蜥'],
 ['パピモッチ','狗仔包'],['ハルクジラ','浩大鯨'],['パモ','布撥'],['グルトン','愛吃豚'],['ミニーブ','迷你芙']
];
const pokemonTerms=[
 // コダック also means Kodak; never make it a context-free Pokémon name.
 ['コダック','可達鴨'],
 // Sanders and booster have ordinary meanings outside Pokémon.
 ['サンダース','雷伊布'],['ブースター','火伊布'],
 ['色違い','異色'],['個体値','個體值'],['努力値','努力值'],['種族値','種族值'],
 ['特性','特性'],['タイプ相性','屬性相剋'],['色違い厳選','刷異色'],['個体値厳選','刷個體'],
 ['でんこうせっか','電光一閃'],['10まんボルト','十萬伏特'],['かえんほうしゃ','噴射火焰'],
 ['急所','要害'],['すばやさ','速度'],['こうげき','攻擊'],['ぼうぎょ','防禦'],
 ['とくこう','特攻'],['とくぼう','特防'],['タイプ一致','屬性一致'],['相性補完','屬性互補'],
 ['夢特性','隱藏特性'],['孵化厳選','孵蛋刷個體'],['旅パ','通關隊伍'],['対戦環境','對戰環境']
];
const shooterTerms=[
 ['ヘッドショット','爆頭'],['リロード','換彈'],['リコイル','後座力'],
 ['リコイル制御','壓槍'],['腰撃ち','腰射'],['エイム','瞄準'],
 ['キャラコン','身法'],['ノックダウン','擊倒'],['ダウン','倒地'],
 ['アーマー','護甲'],['アーマー割り','破甲'],['漁夫','勸架'],
 ['射線','槍線'],['遮蔽物','掩體'],['弾薬','彈藥'],['弾切れ','沒子彈'],
 ['ランクマッチ','積分賽'],['リスポーン','重生'],['クールダウン','冷卻時間'],
 ['プリエイム','預瞄'],['ピーク','探頭'],['プリファイア','預開槍'],['ワンタップ','一槍爆頭'],
 ['フリック','甩槍'],['トラッキング','跟槍'],['クロスヘア','準星'],['感度','靈敏度'],
 ['フラッシュ','閃光彈'],['スモーク','煙霧彈'],['グレネード','手榴彈'],['カバー','掩護'],
 ['フランク','繞後'],['裏取り','包抄'],['高所','高點'],['索敵','偵查敵人'],
 ['足音','腳步聲'],['ピンを刺す','標記位置'],['確殺','補掉倒地敵人'],['蘇生','救起隊友'],
 ['フルパ','滿編隊伍'],['野良','路人隊友'],['回復','補血'],['残弾','剩餘子彈'],['撃ち合い','對槍']
];
const valorantTerms=[
 ['スパイク','輻能核心'],['ヴァンダル','暴徒'],['ファントム','幻象'],
 ['オペレーター','間諜'],['エージェント','特務'],['ジェット','婕提'],['ソーヴァ','蘇法'],
 ['セージ','聖祈'],['レイナ','蕾娜'],['オーメン','歐門'],['キルジョイ','愷宙'],
 ['サイファー','瑟符'],['レイズ','芮茲'],['ヴァイパー','薇蝮'],['フェニックス','菲尼克斯'],
 ['ブリムストーン','布史東'],['ヨル','夜戮'],['スカイ','絲凱'],['チェンバー','錢博爾'],
 ['ネオン','妮虹'],['フェイド','菲德'],['ゲッコー','蓋克'],['アストラ','亞星卓'],
 ['エコラウンド','經濟局'],['フルバイ','全裝購買'],['リテイク','回防奪點'],['設置','安裝輻能核心'],['解除','拆除輻能核心']
];
const apexTerms=[
 ['シールドバッテリー','護盾電池'],['シールドセル','小型護盾電池'],
 ['ノックダウンシールド','擊倒護盾'],['パスファインダー','探路者'],
 ['ブラッドハウンド','尋血犬'],['レイス','惡靈']
];
const minecraftTerms=[
 ['クリーパー','苦力怕'],['エンダードラゴン','終界龍'],['エンダーマン','終界使者'],
 ['ネザー','地獄'],['レッドストーン','紅石'],['作業台','工作台'],['かまど','熔爐'],
 ['エンチャント','附魔'],['スポナー','生怪磚'],['村人','村民'],['ダイヤモンド','鑽石'],
 ['ツルハシ','鎬'],['丸石','鵝卵石'],['ネザライト','獄髓'],['エリトラ','鞘翅']
];
const gameTerms=[
 ['クエスト','任務'],['メインクエスト','主線任務'],['サブクエスト','支線任務'],
 ['ボス戦','頭目戰'],['ラスボス','最終頭目'],['周回','重複刷關'],['初見プレイ','首次遊玩'],
 ['縛りプレイ','限制條件挑戰'],['ノーダメージ','無傷'],['セーブポイント','存檔點'],
 ['チェックポイント','檢查點'],['装備更新','更換裝備'],['スキルツリー','技能樹'],
 ['バフ','增益效果'],['デバフ','減益效果'],['状態異常','異常狀態'],['ドロップ率','掉落率'],
 ['リセマラ','刷首抽'],['天井','保底'],['ガチャ','抽卡'],['無課金','不課金'],['課金','課金']
];
const streamTerms=[
 ['初見です','第一次來看直播'],['ROM専','潛水觀眾'],['コメント欄','留言區'],['チャット欄','聊天室'],
 ['同時視聴','同步觀看'],['参加型','觀眾參加型'],['歌枠','歌回'],['耐久配信','耐久直播'],
 ['雑談配信','雜談直播'],['朝活','早晨直播'],['配信枠','直播場次'],['待機所','直播等待室'],
 ['配信アーカイブ','直播存檔'],['切り抜き動画','精華剪輯影片'],['メンバー限定','會員限定'],
 ['スーパーチャット','超級留言'],['メンバーシップ','頻道會員'],['チャンネル登録','訂閱頻道'],
 ['高評価','按讚'],['音量バランス','音量平衡'],['音ズレ','影音不同步'],['マイクミュート','麥克風靜音'],
 ['回線落ち','網路斷線'],['配信遅延','直播延遲'],['ネタバレ禁止','禁止劇透'],
 ['指示コメント','指揮型留言'],['推し活','應援活動'],['推し変','換推'],['箱推し','全團推'],['最推し','最喜歡的推']
];
const phrases=[['来てくれてありがとうございます','謝謝您的到來'],['来てくれてありがとう','謝謝你來'],
 ['無理しないでね','別勉強自己喔'],['お大事にしてください','請好好保重身體']];
export const entries=Object.freeze([
 ...[['VALORANT','特戰英豪'],['Apex Legends','Apex 英雄'],['Counter-Strike 2','絕對武力 2'],['PUBG','絕地求生'],['マインクラフト','Minecraft'],['モンスターハンター','魔物獵人']].map(([ja,zh])=>({ja,zh,domain:'title',standalone:true})),
 ...pokemonNames.map(([ja,zh])=>({ja,zh,domain:'pokemon',standalone:true})),
 ...pokemonTerms.map(([ja,zh])=>({ja,zh,domain:'pokemon',standalone:false})),
 ...shooterTerms.map(([ja,zh])=>({ja,zh,domain:'shooter',standalone:false})),
 ...valorantTerms.map(([ja,zh])=>({ja,zh,domain:'valorant',standalone:false})),
 ...apexTerms.map(([ja,zh])=>({ja,zh,domain:'apex',standalone:false})),
 ...minecraftTerms.map(([ja,zh])=>({ja,zh,domain:'minecraft',standalone:false})),
 ...gameTerms.map(([ja,zh])=>({ja,zh,domain:'game',standalone:false})),
 ...streamTerms.map(([ja,zh])=>({ja,zh,domain:'stream',standalone:false})),
 ...phrases.map(([ja,zh])=>({ja,zh,domain:'phrase',standalone:true}))
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
 if(/ポケモン|ポケットモンスター|寶可夢|神奇寶貝|pokemon|pokémon/iu.test(s)||pokemonNames.some(([ja,zh])=>termSpans(s,ja).length||termSpans(s,zh).length))result.add('pokemon');
 if(/\bVALORANT\b|ヴァロラント|特戰英豪/iu.test(s))result.add('valorant');
 if(/\bAPEX\b|エーペックス|Apex英雄|Apex 英雄/iu.test(s))result.add('apex');
 if(/\bMinecraft\b|マインクラフト|マイクラ|麥塊/iu.test(s))result.add('minecraft');
 if(result.has('valorant')||result.has('apex')||/\b(?:FPS|CS2|PUBG|ADS)\b|Counter-Strike\s*2|絕對武力\s*2|絕地求生|カウンターストライク|槍戰|枪战|銃撃|ヘッドショット|リロード|リコイル|腰撃ち|爆頭|換彈|壓槍/iu.test(s))result.add('shooter');
 if(result.size||/ゲーム|遊戲|游戏|モンスターハンター|モンハン|魔物獵人|原神|\bRPG\b/iu.test(s))result.add('game');
 if(/配信|直播|リスナー|切り抜き|推し|台主|主播|スパチャ|メンバーシップ|チャンネル|VTuber/iu.test(s))result.add('stream');
 return result;
}

// Build matching order once. Expanding the catalogue must not sort or rebuild
// every evolution phrase for every caption or chat message.
const evolution=entries.filter(e=>e.domain==='pokemon'&&(e.standalone||e.zh.endsWith('伊布')))
 .map(e=>({ja:e.ja+'に進化',zh:'進化成'+e.zh,domain:'pokemon',standalone:false}));
// Spoken Japanese uses this reading rather than the Latin brand spelling.
// Keep the canonical reverse translation VALORANT and the catalogue count stable.
const japaneseAliases=[{ja:'ヴァロラント',zh:'特戰英豪',domain:'title',standalone:true}];
const sourceEntries={ja:[...entries,...japaneseAliases],zh:entries};
const ordered=Object.fromEntries(['ja','zh'].map(key=>[key,[...sourceEntries[key],...evolution].sort((a,b)=>b[key].length-a[key].length)]));

/** Exact unambiguous names only; no question/negation/punctuation stripping. */
export function gameTermTranslation(text,from,to){
 if(!supported(from,to))return undefined;
 const s=normalize(text).trim(),key=from==='ja'?'ja':'zh',out=to==='ja'?'ja':'zh';
 return sourceEntries[key].find(e=>e.standalone&&normalize(e[key])===s)?.[out];
}

/** Bounded, longest-first hints. Existing personal terminology always wins. */
export function selectGameTerminology(text,from,to,existing=[]){
 if(!supported(from,to))return [];
 const s=normalize(text),context=domains(s),key=from==='ja'?'ja':'zh',out=to==='ja'?'ja':'zh';
 const selected=[],covered=[];
 // Keep the direction of evolving INTO a named Pokémon; a bare name hint can
 // leave a small model treating that Pokémon as the one evolving instead.
 for(const term of ordered[key]){
  // Full greetings are exact-message shortcuts, not terminology. Passing a
  // complete translated clause as a glossary hint made small models omit
  // adjacent sentences (e.g. 魚が逃げた。来てくれてありがとう。).
  if(term.domain==='phrase')continue;
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
