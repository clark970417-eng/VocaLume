import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { clearObsCaption, configureObsCaptions, configureObsCaptionTransport, obsCaptionStatus, publishObsCaption } from './obs-captions'

const profile = vi.hoisted(() => ({ path: '', mode: 'bilingual' }))
vi.mock('electron', () => ({ app: { getPath: () => profile.path } }))
vi.mock('./store', () => ({ store: { get: (key: string) => key === 'obsCaptionMode' ? profile.mode : undefined,
  set: (key: string, value: string) => { if (key === 'obsCaptionMode') profile.mode = value } } }))

it('restores the selected OBS output mode on application startup', () => {
  expect(obsCaptionStatus().mode).toBe('bilingual')
})

it.skipIf(process.platform !== 'win32')('pushes authenticated final captions to the chosen OBS source and keeps file mode selectable', async () => {
  profile.path = await mkdtemp(join(tmpdir(), 'vocalume-obs-push-'))
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  if (typeof address === 'string' || !address) throw new Error('Missing OBS fixture port')
  const folder = join(profile.path, 'obs-studio', 'plugin_config', 'obs-websocket')
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'config.json'), JSON.stringify({
    server_enabled: true, auth_required: true, server_port: address.port, server_password: 'test-password'
  }))
  const hash = (input: string) => createHash('sha256').update(input).digest('base64')
  const captions: string[] = []
  const updates: unknown[] = []
  let connectionCount = 0
  let holdNextUpdate = false
  let acknowledge: (() => void) | undefined
  server.on('connection', socket => {
    connectionCount++
    socket.send(JSON.stringify({ op: 0, d: { authentication: { salt: 'salt', challenge: 'challenge' } } }))
    socket.on('message', data => {
      const { op, d } = JSON.parse(data.toString())
      if (op === 1) {
        if (d.authentication === hash(hash('test-passwordsalt') + 'challenge') && d.eventSubscriptions === 0) {
          socket.send(JSON.stringify({ op: 2, d: {} }))
        } else socket.close()
        return
      }
      const isLookup = d.requestType === 'GetInputSettings'
      if (!isLookup) {
        updates.push(d.requestData)
        captions.push(d.requestData.inputSettings.text)
      }
      const reply = () => socket.send(JSON.stringify({ op: 7, d: { requestId: d.requestId, requestStatus: { result: true },
        responseData: isLookup ? { inputKind: 'text_gdiplus', inputSettings: { read_from_file: d.requestData.inputName === 'File source' } } : undefined } }))
      if (!isLookup && holdNextUpdate) {
        holdNextUpdate = false
        acknowledge = reply
      } else reply()
    })
  })
  try {
    const file = await configureObsCaptions('bilingual')
    const invalid = await configureObsCaptionTransport('push', 'File source')
    expect(invalid.transport).toBe('file')
    expect(invalid.error).toMatch(/Read from file/)
    const selected = await configureObsCaptionTransport('push', 'Live source')
    expect(selected).toMatchObject({ transport: 'push', mode: 'bilingual', error: '' })
    publishObsCaption({ sourceText: '暫定', translatedText: '草稿', isInterim: true })
    publishObsCaption({ sourceText: 'こんにちは', translatedText: '你好' })
    await vi.waitFor(() => expect(captions).toEqual(['こんにちは\n你好']))
    expect(updates[0]).toEqual({ inputName: 'Live source', inputSettings: { text: 'こんにちは\n你好' }, overlay: true })
    expect(await readFile(file.path, 'utf8')).toBe('')
    publishObsCaption({ sourceText: 'こんにちは', translatedText: '你好' })
    publishObsCaption({ sourceText: 'またね', translatedText: '再見' })
    await vi.waitFor(() => expect(captions).toEqual(['こんにちは\n你好', 'またね\n再見']))
    for (const socket of server.clients) socket.terminate()
    await vi.waitFor(() => expect(server.clients.size).toBe(0))
    publishObsCaption({ sourceText: 'またね', translatedText: '再見' })
    await vi.waitFor(() => expect(captions).toEqual(['こんにちは\n你好', 'またね\n再見', 'またね\n再見']))
    expect(connectionCount).toBe(3)
    holdNextUpdate = true
    publishObsCaption({ sourceText: '一', translatedText: '第一筆' })
    await vi.waitFor(() => expect(acknowledge).toBeDefined())
    publishObsCaption({ sourceText: '二', translatedText: '中間字幕' })
    publishObsCaption({ sourceText: '三', translatedText: '最新字幕' })
    acknowledge!()
    await vi.waitFor(() => expect(captions.at(-1)).toBe('三\n最新字幕'))
    expect(captions).not.toContain('二\n中間字幕')
    await configureObsCaptionTransport('file', '')
    expect(captions.at(-1)).toBe('')
    publishObsCaption({ sourceText: 'さようなら', translatedText: '再會' })
    await vi.waitFor(async () => expect(await readFile(file.path, 'utf8')).toBe('さようなら\n再會'))
  } finally {
    await configureObsCaptionTransport('file', '')
    await configureObsCaptions('off')
    for (const socket of server.clients) socket.terminate()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(profile.path, { recursive: true, force: true })
  }
})

it('exports only final translations, supports bilingual output, and clears on disable', async () => {
  profile.path = await mkdtemp(join(tmpdir(), 'vocalume-obs-test-'))
  try {
    const { path } = await configureObsCaptions('translation')
    publishObsCaption({ sourceText: 'こんにちは', translatedText: '你好' })
    publishObsCaption({ sourceText: '暫定', translatedText: '草稿', isInterim: true })
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('你好'))
    const previous = new Date('2024-01-01T00:00:00Z')
    await utimes(path, previous, previous)
    publishObsCaption({ sourceText: '別の原文', translatedText: '你好' })
    await new Promise(resolve => setImmediate(resolve))
    expect((await stat(path)).mtimeMs).toBe(previous.getTime())
    const longCaption = '中文'.repeat(30)
    publishObsCaption({ sourceText: '', translatedText: longCaption })
    await vi.waitFor(async () => {
      const lines = (await readFile(path, 'utf8')).split('\n')
      expect(lines.join('')).toBe(longCaption)
      expect(lines.every(line => line.length <= 21)).toBe(true)
    })
    await configureObsCaptions('bilingual')
    expect(profile.mode).toBe('bilingual')
    publishObsCaption({ sourceText: 'またね', translatedText: '再見' })
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('またね\n再見'))
    publishObsCaption({ sourceText: 'さようなら', translatedText: '再會' })
    await clearObsCaption()
    expect(await readFile(path, 'utf8')).toBe('')
    expect(obsCaptionStatus().mode).toBe('bilingual')
    publishObsCaption({ sourceText: 'こんにちは', translatedText: '你好' })
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('こんにちは\n你好'))
    await configureObsCaptions('off')
    expect(profile.mode).toBe('off')
    publishObsCaption({ sourceText: 'こんにちは', translatedText: '你好' })
    expect(await readFile(path, 'utf8')).toBe('')
  } finally {
    await configureObsCaptions('off')
    await rm(profile.path, { recursive: true, force: true })
  }
})
