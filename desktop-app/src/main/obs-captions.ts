import { app } from 'electron'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type Mode = 'off' | 'translation' | 'bilingual'
let mode: Mode = 'off'
let pending: Promise<void> = Promise.resolve()
let error = ''
const outputPath = () => join(app.getPath('userData'), 'vocalume-obs-caption.txt')

function write(text: string, captionQueuedAt?: number): Promise<void> {
  const path = outputPath()
  pending = pending.then(async () => {
    await writeFile(path + '.tmp', text, { encoding: 'utf8', mode: 0o600 })
    await rename(path + '.tmp', path)
    error = ''
    if (captionQueuedAt !== undefined) {
      console.info(`[OBS] Caption file ready in ${Math.round(performance.now() - captionQueuedAt)}ms`)
    }
  }).catch(() => { error = 'Could not write OBS caption file.' })
  return pending
}

export function obsCaptionStatus() {
  return { mode, path: outputPath(), error }
}

export async function configureObsCaptions(value: unknown) {
  if (value !== 'off' && value !== 'translation' && value !== 'bilingual') {
    throw new Error('Invalid OBS caption mode')
  }
  const wasEnabled = mode !== 'off'
  mode = value
  if (wasEnabled || mode !== 'off') await write('')
  if (error) mode = 'off'
  return obsCaptionStatus()
}

const OBS_LINE_WIDTH = 42
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const words = new Intl.Segmenter(undefined, { granularity: 'word' })

function wrapObsText(text: string): string {
  return text.split(/\r?\n/).map(paragraph => {
    const lines: string[] = []
    let line = ''
    let width = 0
    const pushLine = (): void => {
      if (line.trim()) lines.push(line.trimEnd())
      line = ''
      width = 0
    }
    for (const { segment } of words.segment(paragraph)) {
      const characters = Array.from(graphemes.segment(segment), ({ segment: char }) => ({
        char,
        width: Array.from(char).every(codePoint => codePoint.codePointAt(0)! <= 0xff) ? 1 : 2
      }))
      const wordWidth = characters.reduce((total, character) => total + character.width, 0)
      if (segment.trim() && width + wordWidth > OBS_LINE_WIDTH) pushLine()
      for (const character of characters) {
        if (width + character.width > OBS_LINE_WIDTH) pushLine()
        if (!line && !character.char.trim()) continue
        line += character.char
        width += character.width
      }
    }
    pushLine()
    return lines.join('\n')
  }).join('\n')
}

export function publishObsCaption(result: { sourceText: string; translatedText: string; isInterim?: boolean }): void {
  const translation = result.translatedText?.trim()
  if (mode === 'off' || result.isInterim || !translation) return
  const text = mode === 'bilingual'
    ? [result.sourceText.trim(), translation].filter(Boolean).join('\n')
    : translation
  void write(wrapObsText(text), process.env.VOCALUME_CAPTION_TIMING === '1' ? performance.now() : undefined)
}
