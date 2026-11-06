import { app } from 'electron'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type Mode = 'off' | 'translation' | 'bilingual'
let mode: Mode = 'off'
let pending: Promise<void> = Promise.resolve()
let error = ''
const outputPath = () => join(app.getPath('userData'), 'vocalume-obs-caption.txt')

function write(text: string): Promise<void> {
  const path = outputPath()
  pending = pending.then(async () => {
    await writeFile(path + '.tmp', text, { encoding: 'utf8', mode: 0o600 })
    await rename(path + '.tmp', path)
    error = ''
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

export function publishObsCaption(result: { sourceText: string; translatedText: string; isInterim?: boolean }): void {
  const translation = result.translatedText?.trim()
  if (mode === 'off' || result.isInterim || !translation) return
  const text = mode === 'bilingual'
    ? [result.sourceText.trim(), translation].filter(Boolean).join('\n')
    : translation
  void write(text)
}
