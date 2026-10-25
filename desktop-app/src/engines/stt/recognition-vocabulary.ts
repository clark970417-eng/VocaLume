import { entries as gameEntries } from '../../../../game-vocabulary.mjs'
import { entries as streamerEntries } from '../../../../streamer-vocabulary.mjs'

/** Vocabulary only, never a previous sentence or a translated instruction. */
export function boundedRecognitionVocabulary(values: readonly string[]): string[] {
  const result: string[] = [], seen = new Set<string>()
  let length = 0
  for (const value of values) {
    if (typeof value !== 'string') continue
    const term = value.normalize('NFKC').trim()
    if (term.length < 2 || term.length > 24 || !/^[\p{L}\p{N}ー・ '-]+$/u.test(term)) continue
    const key = term.toLocaleLowerCase('en')
    if (seen.has(key) || length + term.length + 1 > 128) continue
    result.push(term); seen.add(key); length += term.length + 1
    if (result.length === 8) break
  }
  return result
}

const reading = (value: string): string => value.normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/gu, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/ゔぁ/gu, 'ば').replace(/ゔぃ/gu, 'び').replace(/ゔぇ/gu, 'べ').replace(/ゔぉ/gu, 'ぼ').replace(/ゔ/gu, 'ぶ')

/** Personal vocabulary can apply from the first decode. Built-in names are
 * selected only from this cue's latest Japanese hypothesis, capped at 120 chars.
 * No Chinese translation or cross-session transcript is used as recognition input. */
export function recognitionVocabulary(personal: readonly string[], currentSource = ''): string[] {
  const context = reading(currentSource.slice(-120))
  const relevant: string[] = []
  if (context) {
    for (const entry of streamerEntries) {
      const aliases = entry.aliases.filter((alias: string) => /[ぁ-んァ-ヶ]/u.test(alias) && context.includes(reading(alias)))
      const suffix = entry.creator.match(/[ぁ-んァ-ヶー]{3,}$/u)?.[0]
      if (aliases.length || context.includes(reading(entry.creator)) || suffix && context.includes(reading(suffix))) {
        relevant.push(...aliases, entry.creator)
      }
    }
    for (const entry of gameEntries) {
      if (entry.domain !== 'phrase' && entry.ja.length >= 4 && context.includes(reading(entry.ja))) relevant.push(entry.ja)
    }
  }
  const matched = personal.filter(term => typeof term === 'string' && term.length <= 24 && context.includes(reading(term)))
  return boundedRecognitionVocabulary([
    ...matched, ...relevant, ...personal
  ])
}
