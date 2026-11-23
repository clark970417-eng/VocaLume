import type { LlamaText, LlamaTextInputValue } from 'node-llama-cpp'
import { selectApplicableGlossary } from '../engines/translator/glossary-utils'

const JA_KO_LIVE_TERMS = [
  { source: '枠を取り直して', target: '방송을 다시 켜고' },
  { source: '枠取り直して', target: '방송을 다시 켜고' },
  { source: '枠を取り直す', target: '방송을 다시 켜다' },
  { source: '枠取り直す', target: '방송을 다시 켜다' },
  { source: 'スパチャ', target: '슈퍼챗' },
  { source: '初見さん', target: '처음 오신 시청자' },
  { source: '雑談枠', target: '잡담 방송' },
  { source: '回線落ち', target: '인터넷 연결 끊김' },
  { source: 'クールタイム', target: '쿨타임' }
]

const JA_ZH_LIVE_TERMS = [
  { source: 'スパチャ', target: '超級留言' },
  { source: '初見さん', target: '第一次來的觀眾' },
  { source: '常連さん', target: '常來的觀眾' },
  { source: '雑談枠', target: '聊天直播' }
]

const LIVE_RESTART = /(?:枠を?取り直(?:す|して|そう))/u
const NON_STREAM_FRAME = /予約|病院|OCR|認識範囲|選択範囲|画面の枠|額縁/iu

const tag = '<|plamo:tag|>'
const msg = '<|plamo:msg|>'
const lang = '<|plamo:key|>lang<|plamo:val|>'

function plamoLanguage(code: string): string {
  const normalized = code.toLowerCase()
  return normalized === 'zh' ? 'zh-hant' : normalized
}

export function plamoTraditionalCaptionTerms(text: string, from: string, to: string) {
  if (from !== 'ja' || plamoLanguage(to) !== 'zh-hant') return []
  const terms = selectApplicableGlossary(text, JA_ZH_LIVE_TERMS) ?? []
  const restart = text.match(LIVE_RESTART)?.[0]
  if (restart && /配信|放送|すぐ戻る/u.test(text) && !NON_STREAM_FRAME.test(text)) {
    return [...terms, { source: restart, target: '重開直播' }]
  }
  return terms
}

/** PFML3 keeps the matched terms separate from the text to translate. */
export async function buildPlamo3Prompt(
  text: string,
  from: string,
  to: string,
  glossary?: Array<{ source: string; target: string }>
): Promise<LlamaText> {
  const { LlamaText, SpecialTokensText } = await import('node-llama-cpp')
  const tokens = (text: string) => new SpecialTokensText(text)
  const terms = new Map<string, string>()
  const sourceLanguage = plamoLanguage(from)
  const targetLanguage = plamoLanguage(to)
  if (sourceLanguage === 'ja' && targetLanguage === 'ko') {
    for (const { source, target } of selectApplicableGlossary(text, JA_KO_LIVE_TERMS) ?? []) {
      terms.set(source, target)
    }
  }
  for (const { source, target } of plamoTraditionalCaptionTerms(text, from, to)) terms.set(source, target)
  for (const { source, target } of selectApplicableGlossary(text, glossary) ?? []) {
    if (target?.trim()) terms.set(source, target)
  }

  const parts: LlamaTextInputValue[] = [tokens(`${tag}dataset${msg}translation`)]
  if (terms.size) {
    parts.push(tokens(`${tag}glossary`))
    for (const [source, target] of terms) {
      parts.push(tokens('<|plamo:index|>'), source, tokens('<|plamo:item|>'), target)
    }
  }
  const sourceAttribute = /^[a-z]{2,3}(?:-[a-z]{2,8})?$/u.test(sourceLanguage) ? `${lang}${sourceLanguage}` : ''
  parts.push(
    tokens(`${tag}input${sourceAttribute}${msg}`),
    text,
    tokens(`${tag}output${lang}`),
    targetLanguage,
    tokens(msg)
  )
  return new LlamaText(parts)
}
