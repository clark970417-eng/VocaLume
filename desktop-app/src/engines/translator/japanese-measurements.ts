const digits: Record<string, string> = {
  '〇': '0', '零': '0', '一': '1', '二': '2', '三': '3', '四': '4',
  '五': '5', '六': '6', '七': '7', '八': '8', '九': '9'
}
const units: Record<string, number> = { '十': 10, '百': 100, '千': 1000 }

function integerValue(value: string): string | undefined {
  const normalized = value.normalize('NFKC')
  if (/^\d+$/.test(normalized)) return normalized
  let total = 0
  let current = 0
  let previousUnit = Infinity
  for (const character of normalized) {
    const digit = digits[character]
    if (digit !== undefined || /\d/.test(character)) {
      current = current * 10 + Number(digit ?? character)
    } else {
      const unit = units[character]
      if (!unit || unit >= previousUnit) return undefined
      total += (current || 1) * unit
      current = 0
      previousUnit = unit
    }
  }
  return String(total + current)
}

/** Preserve spoken decimal measurements before a translation service parses them. */
export function normalizeJapaneseMeasurements(text: string): string {
  return text.replace(
    /(?<![\d０-９〇零一二三四五六七八九十百千万億兆])([\d０-９〇零一二三四五六七八九十百千]+)点([\d０-９〇零一二三四五六七八九]+)(?=パーセント|ポイント|[%％])/gu,
    (match, whole: string, fraction: string) => {
      const integer = integerValue(whole)
      if (integer === undefined) return match
      const decimal = Array.from(fraction.normalize('NFKC'), character => digits[character] ?? character).join('')
      return `${integer}.${decimal}`
    }
  )
}
