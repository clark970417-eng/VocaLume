import { app } from 'electron'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { store } from './store'
import { ObsCaptionPush } from './obs-caption-push'
import { SerialTaskQueue } from './serial-task-queue'

type Mode = 'off' | 'translation' | 'bilingual'
type Transport = 'file' | 'push'
type Caption = { sourceText: string; translatedText: string; timestamp?: number; captionRevision?: number; isInterim?: boolean }
let recordMode = (process.platform === 'win32' || process.platform === 'darwin') && store.get('subtitleSettings')?.captionMode === 'record'
let captions: Caption[] = []
const savedMode = store.get('obsCaptionMode')
let mode: Mode = savedMode === 'translation' || savedMode === 'bilingual' ? savedMode : 'off'
const pushAvailable = process.platform === 'win32'
let source = store.get('obsCaptionSource') || ''
let transport: Transport = pushAvailable && source && store.get('obsCaptionTransport') === 'push' ? 'push' : 'file'
type PendingCaption = { text: string; queuedAt?: number }
let fileDrain: Promise<void> | undefined
let latestFile: (PendingCaption & { path: string; force: boolean }) | undefined
let writtenFile: { path: string; text: string } | undefined
let error = ''
let client: ObsCaptionPush | undefined
let pushDrain: Promise<void> | undefined
let latestPush: PendingCaption | undefined
let pushedCaption = false
let changingTransport = false
const changes = new SerialTaskQueue()
const outputPath = () => join(app.getPath('userData'), 'vocalume-obs-caption.txt')
const newClient = (name: string) => new ObsCaptionPush(join(app.getPath('appData'), 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json'), name)

async function replaceCaption(path: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(path + '.tmp', path)
      return
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code
      if (process.platform !== 'win32' || attempt === 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')) throw cause
      await delay(20 * (attempt + 1))
    }
  }
}

function writeFileCaption(text: string, queuedAt?: number, force = false): Promise<void> {
  latestFile = { path: outputPath(), text, queuedAt, force }
  if (fileDrain) return fileDrain
  fileDrain = Promise.resolve().then(async () => {
    // The text file is a live display sink. The transcript independently keeps all finals.
    while (latestFile) {
      const next = latestFile
      latestFile = undefined
      if (!next.force && writtenFile?.path === next.path && writtenFile.text === next.text) continue
      try {
        await writeFile(next.path + '.tmp', next.text, { encoding: 'utf8', mode: 0o600 })
        await replaceCaption(next.path)
        writtenFile = { path: next.path, text: next.text }
        error = ''
        if (next.queuedAt !== undefined) {
          console.info(`[OBS] Caption file ready in ${Math.round(performance.now() - next.queuedAt)}ms`)
        }
      } catch {
        writtenFile = undefined
        error = 'Could not write OBS caption file.'
      }
    }
    fileDrain = undefined
  })
  return fileDrain
}

function pushCaption(text: string, queuedAt?: number): Promise<void> {
  latestPush = { text, queuedAt }
  if (pushDrain) return pushDrain
  const target = client ??= newClient(source)
  pushDrain = (async () => {
    while (latestPush) {
      const next = latestPush
      latestPush = undefined
      try {
        const changed = await target.write(next.text)
        pushedCaption = Boolean(next.text)
        error = ''
        if (changed && next.queuedAt !== undefined) console.info(`[OBS] Caption pushed in ${Math.round(performance.now() - next.queuedAt)}ms`)
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Could not configure OBS caption output.'
      }
    }
    pushDrain = undefined
  })()
  return pushDrain
}

function write(text: string, queuedAt?: number): Promise<void> {
  const caption = wrapObsText(text)
  return transport === 'push' ? pushCaption(caption, queuedAt) : writeFileCaption(caption, queuedAt)
}

export function obsCaptionStatus() {
  return { mode, transport, source, pushAvailable, path: outputPath(), error,
    hideDesktopOverlay: Boolean(store.get('obsHideDesktopOverlay')) }
}

export function clearObsCaption(): Promise<void> {
  captions = []
  if (mode === 'off') return fileDrain ?? Promise.resolve()
  if (transport === 'push' && !pushedCaption && !pushDrain) return Promise.resolve()
  return write('')
}

export async function shutdownObsCaptions(): Promise<void> {
  changingTransport = true
  try { await clearObsCaption() } finally { client?.close() }
}

export function configureObsCaptions(value: unknown) {
  if (value !== 'off' && value !== 'translation' && value !== 'bilingual') {
    throw new Error('Invalid OBS caption mode')
  }
  return changes.run(async () => {
    const wasEnabled = mode !== 'off'
    changingTransport = true
    try {
      mode = value
      captions = []
      if (transport === 'file' && (wasEnabled || mode !== 'off')) await writeFileCaption('', undefined, true)
      if (transport === 'push' && wasEnabled && (pushedCaption || pushDrain)) await write('')
      if (error && transport === 'file') mode = 'off'
      store.set('obsCaptionMode', mode)
      return obsCaptionStatus()
    } finally { changingTransport = false }
  })
}

export function configureObsCaptionTransport(value: unknown, name: unknown) {
  if (value !== 'file' && value !== 'push') throw new Error('Invalid OBS caption transport')
  if (value === 'push' && (!pushAvailable || typeof name !== 'string' || !name.trim() || name.length > 256)) {
    throw new Error('Enter the name of an OBS Text (GDI+) source.')
  }
  return changes.run(async () => {
    const nextSource = value === 'push' ? (name as string).trim() : source
    const nextClient = value === 'push' ? newClient(nextSource) : undefined
    try {
      await nextClient?.connect()
    } catch (cause) {
      nextClient?.close()
      return { ...obsCaptionStatus(), error: cause instanceof Error ? cause.message : 'Could not configure OBS caption output.' }
    }
    changingTransport = true
    try {
      await clearObsCaption()
      client?.close()
      client = nextClient
      pushedCaption = false
      error = ''
      transport = value
      source = nextSource
      if (mode !== 'off' && transport === 'file') await writeFileCaption('', undefined, true)
      store.set('obsCaptionTransport', transport)
      store.set('obsCaptionSource', source)
      return obsCaptionStatus()
    } finally { changingTransport = false }
  })
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

function writeCompletedCaptions(): void {
  if (mode === 'off' || changingTransport || !captions.length) return
  const selected = recordMode ? captions : captions.slice(-1)
  const text = selected.map(({ sourceText, translatedText }) =>
    mode === 'bilingual' ? [sourceText.trim(), translatedText.trim()].filter(Boolean).join('\n') : translatedText.trim()
  ).join('\n')
  void write(text, process.env.VOCALUME_CAPTION_TIMING === '1' ? performance.now() : undefined)
}

export function setObsCaptionRecordMode(value: boolean): void {
  if (recordMode === value) return
  recordMode = value
  writeCompletedCaptions()
}

export function publishObsCaption(result: Caption): void {
  if (mode === 'off' || changingTransport || result.isInterim || !result.translatedText?.trim()) return
  if (result.captionRevision) {
    captions = captions.map(caption => caption.timestamp === result.timestamp ? result : caption)
  } else {
    captions = [...captions.slice(-3), result]
  }
  writeCompletedCaptions()
}
