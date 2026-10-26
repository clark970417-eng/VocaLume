import { LANG_NAMES_ZH } from '../engines/language-names'

/** Keep the separately measured Japanese/Chinese templates unchanged. Other
 * Chinese-related pairs must never inherit the wrong target's output guidance. */
export function multilingualTranslationInstruction(from: string, to: string, text = ''): string | undefined {
  if ((from === 'ja' && to === 'zh') || (from === 'zh' && to === 'ja')) return undefined
  const source = LANG_NAMES_ZH[from] ?? from, target = LANG_NAMES_ZH[to] ?? to
  if (to === 'zh' || to === 'zh-Hant') {
    return `将以下${source}文本翻译为台湾繁体中文，完整保留原意、否定、数字、时态、称呼和语气；只输出译文，不要额外解释：\n\n`
  }
  if (from === 'zh' || from === 'zh-Hant') {
    const markers = [...new Set(text.match(/\[(?:V)*NAME\d+\]/gu) || [])];
    const preserve = markers.length ? `必须逐字保留这些标记：${markers.join('、')}。` : '';
    return `将以下文本翻译为${target}，不要额外解释。${preserve}\n\n`
  }
  return undefined
}
