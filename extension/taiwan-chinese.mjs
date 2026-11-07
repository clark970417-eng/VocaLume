import { Converter, ConverterFactory, Locale } from './vendor/opencc/cn2t.mjs';

const { normalizationChain, conversionChain } = Locale.configs.s2twp;
const [simplifiedDictionaries, taiwanDictionaries] = conversionChain;
let simplifiedCharacters;
let simplifiedToTaiwan;
let traditionalToTaiwan;

function compactTaiwanConverter() {
  // Provider output requested as zh-TW rarely contains unambiguous Simplified
  // characters. Keep the remaining phrase mappings (一只 → 一隻, for example)
  // without building the entire Simplified segmentation trie on this path.
  const ambiguousDictionaries = simplifiedDictionaries.map(dict => dict.split('|').filter(entry => {
    const source = entry.slice(0, entry.indexOf(' '));
    return source && Array.from(source).every(character => !simplifiedCharacters.has(character));
  }).join('|')).filter(Boolean);
  return ConverterFactory(...normalizationChain, ambiguousDictionaries, taiwanDictionaries);
}

/** Convert provider text before putting protected names and literals back. */
export function normalizeTaiwanChinese(output) {
  if (typeof output !== 'string' || !/\p{Script=Han}/u.test(output)) return output;
  simplifiedCharacters ??= new Set(simplifiedDictionaries.at(-1).split('|').flatMap(entry => {
    const [source, ...targets] = entry.split(' ');
    return source && !targets.includes(source) ? [source] : [];
  }));
  for (const character of output) {
    if (simplifiedCharacters.has(character)) {
      simplifiedToTaiwan ??= Converter({ from: 'cn', to: 'twp' });
      return simplifiedToTaiwan(output);
    }
  }
  traditionalToTaiwan ??= compactTaiwanConverter();
  return traditionalToTaiwan(output);
}

const broadcastEvidence = /生配信|生放送|ライブ(?:配信)?|配信(?:者|枠|開始|終了)|視聴|チャンネル|スパチャ|リアタイ|(?:今日|明日|今夜|昨日|本日|今週|来週|次回|今回)の配信|配信を(?:見|観|始|終|休)/u;
const deliveryEvidence = /(?:メール|データ|情報|通知|ニュース|楽曲|音楽|電子書籍|更新|広告|アプリ|ソフトウェア)(?:の|を)?配信|配信(?:する|される)(?:メール|データ|情報|通知|ニュース|楽曲|音楽|電子書籍|更新|広告|アプリ)|ラジオ|ポッドキャスト/u;

function broadcastSense(source, reference) {
  if (!/配信/u.test(source) || deliveryEvidence.test(source)) return false;
  const cues = source.split(/[。！？!?\n]+/u).filter(cue => /配信/u.test(cue));
  return cues.every(cue => broadcastEvidence.test(cue)) ||
    (cues.length === 1 && broadcastEvidence.test(reference) && !deliveryEvidence.test(reference));
}

export function applyTaiwanLivestreamTerminology(source, output, reference = '') {
  if (typeof output !== 'string' || !broadcastSense(source, reference)) return output;
  return output.replace(/廣播(?!電臺|電台|節目|劇|電視)/gu, '直播');
}
