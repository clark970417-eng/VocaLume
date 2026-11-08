/** A browser client that disappears mid-session and reconnects to a live companion. */
import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { connect, type Socket } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { companionEndpoint, startExtensionCompanion } from './extension-companion'
import { updateUiLanguageChoice } from './interface-language'
import type { AppContext } from './app-context'

vi.mock('./store', () => ({ store: { get: vi.fn() } }))
vi.mock('./interface-language', () => {
  let choice = { preference: 'auto', changedAt: 0 }
  const listeners = new Set<(next: typeof choice) => void>()
  return {
    getUiLanguageChoice: () => choice,
    updateUiLanguageChoice: (next: typeof choice) => {
      if (next.preference !== 'ja' && next.preference !== 'ko') throw new Error('Invalid interface language choice')
      choice = next
      for (const notify of listeners) notify(next)
      return choice
    },
    onUiLanguageChoiceChanged: (notify: (next: typeof choice) => void) => {
      listeners.add(notify)
      return () => { listeners.delete(notify) }
    }
  }
})
vi.mock('./ipc/pipeline-ipc', () => ({ startPipeline: vi.fn(async (ctx: { pipeline: { active: boolean } }) => {
  ctx.pipeline.active = true
  return { success: true }
}) }))
vi.mock('../engines/translator/HunyuanMT15Translator', () => ({ HunyuanMT15Translator: class {
  async initialize() {} async dispose() {} async translate() { return '' }
} }))
vi.mock('../engines/translator/HunyuanMT2Translator', () => ({ HunyuanMT2Translator: class {
  async initialize() {} async dispose() {} async translate() { return '' }
} }))

interface Client { socket: Socket, messages: Array<Record<string, unknown>>, closed: boolean, request: (message: Record<string, unknown>) => number }

function client(directory: string, languageOnly = false): Promise<Client> {
  return new Promise(resolve => {
    const socket = connect(companionEndpoint(directory, process.platform, languageOnly))
    const state: Client = { socket, messages: [], closed: false, request: () => 0 }
    let buffer = '', id = 0
    socket.setEncoding('utf8')
    socket.on('data', data => {
      buffer += data
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) { state.messages.push(JSON.parse(buffer.slice(0, newline))); buffer = buffer.slice(newline + 1) }
    })
    socket.on('close', () => { state.closed = true })
    socket.on('error', () => {})
    state.request = message => { const current = ++id; socket.write(JSON.stringify({ id: current, ...message }) + '\n'); return current }
    socket.once('connect', () => resolve(state))
  })
}

function companion() {
  const directory = mkdtempSync(join(tmpdir(), 'jtl-reconnect-'))
  let releaseSlowDecode: (() => void) | null = null
  const pipeline = Object.assign(new EventEmitter(), {
    active: false, running: true,
    stop: vi.fn(async () => { pipeline.active = false }),
    canOverlapFinalTranslation: false, prepareFinalStreaming: vi.fn(),
    slow: false,
    processStreaming: vi.fn(async () => {
      if (pipeline.slow) {
        // Recognition still running when the browser side disappears.
        await new Promise<void>(resolve => { releaseSlowDecode = resolve })
        pipeline.emit('interim-result', { sourceText: '切断前', translatedText: '斷線前', isInterim: true, timestamp: 1 })
        return { sourceText: '切断前', translatedText: '斷線前' }
      }
      pipeline.emit('interim-result', { sourceText: '再接続', translatedText: '重新連線', isInterim: true, timestamp: 2 })
      return { sourceText: '再接続', translatedText: '重新連線' }
    }),
    finalizeStreaming: vi.fn(async () => null)
  })
  return { directory, pipeline, release: () => releaseSlowDecode?.() }
}
const audio = Buffer.from(new Float32Array([.1, .2]).buffer).toString('base64')

it('syncs interface language across connected browsers without taking or stopping the caption session', async () => {
  const c = companion()
  const server = await startExtensionCompanion({ pipeline: c.pipeline } as unknown as AppContext, c.directory)
  const sockets: Socket[] = []
  async function openClient(languageOnly = false): Promise<Client> {
    const connected = await client(c.directory, languageOnly)
    sockets.push(connected.socket)
    return connected
  }
  try {
    const first = await openClient(true)
    const second = await openClient(true)
    const watching = first.request({ op: 'watch-ui-language' })
    const alsoWatching = second.request({ op: 'watch-ui-language' })
    await vi.waitFor(() => {
      expect(first.messages).toContainEqual({ id: watching, ok: true, result: { preference: 'auto', changedAt: 0 } })
      expect(second.messages).toContainEqual({ id: alsoWatching, ok: true, result: { preference: 'auto', changedAt: 0 } })
    })

    const inference = await openClient()
    const init = inference.request({ op: 'init' })
    await vi.waitFor(() => expect(inference.messages.some(m => m.id === init && m.ok)).toBe(true))
    const japanese = { preference: 'ja', changedAt: 1 } as const
    const korean = { preference: 'ko', changedAt: 2 } as const
    const select = first.request({ op: 'set-ui-language', choice: japanese })
    await vi.waitFor(() => {
      expect(first.messages).toContainEqual({ id: select, ok: true, result: japanese })
      expect(second.messages).toContainEqual({ event: 'ui-language', result: japanese })
    })
    const wrongOp = second.request({ op: 'init' })
    const invalidChoice = second.request({ op: 'set-ui-language', choice: { preference: 'fr', changedAt: 3 } })
    await vi.waitFor(() => {
      expect(second.messages.find(m => m.id === wrongOp)?.ok).toBe(false)
      expect(second.messages.find(m => m.id === invalidChoice)?.ok).toBe(false)
    })
    updateUiLanguageChoice(korean)
    await vi.waitFor(() => expect(first.messages).toContainEqual({ event: 'ui-language', result: korean }))
    first.socket.destroy()

    const decode = inference.request({ op: 'decode', audio, segment: 'still-capturing', final: false })
    await vi.waitFor(() => expect(inference.messages.some(m => m.id === decode && m.ok)).toBe(true))
    expect(c.pipeline.stop).not.toHaveBeenCalled()
    inference.socket.destroy()
    await new Promise<void>(r => server.close(() => r()))
    await vi.waitFor(() => expect(second.closed).toBe(true))
  } finally {
    for (const socket of sockets) socket.destroy()
    if (server.listening) await new Promise<void>(r => server.close(() => r()))
    rmSync(c.directory, { recursive: true, force: true })
  }
})

it('still refuses a second client while the first is connected', async () => {
  const c = companion()
  const server = await startExtensionCompanion({ pipeline: c.pipeline } as unknown as AppContext, c.directory)
  try {
    const first = await client(c.directory)
    const second = await client(c.directory)
    // Refused once the owner has kept the connection past the grace period.
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(second.closed).toBe(false)
    await vi.waitFor(() => expect(second.closed).toBe(true), { timeout: 3000 })
    expect(first.closed).toBe(false)
    first.socket.destroy()
  } finally { await new Promise<void>(r => server.close(() => r())); rmSync(c.directory, { recursive: true, force: true }) }
})

it('accepts a reconnecting client while the previous connection is still draining', async () => {
  const c = companion()
  const server = await startExtensionCompanion({ pipeline: c.pipeline } as unknown as AppContext, c.directory)
  try {
    const before = await client(c.directory)
    const init = before.request({ op: 'init' })
    await vi.waitFor(() => expect(before.messages.some(m => m.id === init && m.ok)).toBe(true))
    c.pipeline.slow = true
    before.request({ op: 'decode', audio, segment: 's:1', final: false })
    await vi.waitFor(() => expect(c.pipeline.processStreaming).toHaveBeenCalled())
    before.socket.destroy() // the browser side dies with recognition in flight

    const after = await client(c.directory)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(after.closed).toBe(false)

    c.pipeline.slow = false
    const reinit = after.request({ op: 'init' })
    // The previous session's recognition finishes only now.
    c.release()
    await vi.waitFor(() => expect(after.messages.some(m => m.id === reinit)).toBe(true))
    expect(after.messages.find(m => m.id === reinit)!.ok).toBe(true)
    after.socket.destroy()
  } finally { c.release(); await new Promise<void>(r => server.close(() => r())); rmSync(c.directory, { recursive: true, force: true }) }
})

it('keeps the previous connection results away from the new client, then captions and stop work', async () => {
  const c = companion()
  const server = await startExtensionCompanion({ pipeline: c.pipeline } as unknown as AppContext, c.directory)
  try {
    const before = await client(c.directory)
    const init = before.request({ op: 'init' })
    await vi.waitFor(() => expect(before.messages.some(m => m.id === init && m.ok)).toBe(true))
    c.pipeline.slow = true
    before.request({ op: 'decode', audio, segment: 'old:1', final: false })
    await vi.waitFor(() => expect(c.pipeline.processStreaming).toHaveBeenCalled())
    before.socket.destroy()

    const after = await client(c.directory)
    c.pipeline.slow = false
    const reinit = after.request({ op: 'init' })
    c.release()
    await vi.waitFor(() => expect(after.messages.some(m => m.id === reinit && m.ok)).toBe(true))

    const decode = after.request({ op: 'decode', audio, segment: 'new:1', final: false })
    await vi.waitFor(() => expect(after.messages.some(m => m.id === decode && m.ok)).toBe(true))
    const captions = after.messages.filter(m => m.event === 'caption')
    expect(captions.map(m => m.segment)).toEqual(['new:1'])
    expect(JSON.stringify(after.messages)).not.toContain('切断前')

    const stop = after.request({ op: 'stop' })
    await vi.waitFor(() => expect(after.messages.some(m => m.id === stop && m.ok)).toBe(true))
    const settled = after.messages.length
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(after.messages.length).toBe(settled)
    after.socket.destroy()
  } finally { c.release(); await new Promise<void>(r => server.close(() => r())); rmSync(c.directory, { recursive: true, force: true }) }
})
