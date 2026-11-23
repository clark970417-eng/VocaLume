import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { ALL_LANGUAGES, type Language } from '../engines/types'
import { mobileCompanionPage, mobileCompanionScript, mobileCompanionStyle } from './mobile-companion-page'

const host = '127.0.0.1'
const port = 17649
const url = `http://${host}:${port}/`
const localHosts = new Set([`${host}:${port}`, `localhost:${port}`])
const supportedLanguages = new Set<string>(ALL_LANGUAGES)
const minute = 60_000
const sessionDuration = 8 * 60 * minute
const maximumBodyBytes = 24_000
const maximumTextLength = 3000

export interface MobileCompanionStatus {
  url: string
  pairingCode: string
}

interface MobileCaption {
  sourceText: string
  translatedText: string
}

type Translate = (text: string, from: Language, to: Language) => Promise<string>

interface RequestContext {
  origin: string
  identity: string
}

interface Session {
  context: RequestContext
  expiresAt: number
  attempts: number[]
  stream?: ServerResponse
}

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function requestContext(request: IncomingMessage): RequestContext | null {
  if (request.socket.remoteAddress !== host) return null
  const directHost = request.headers.host
  const forwardedHost = request.headers['x-forwarded-host']
  const forwardedProto = request.headers['x-forwarded-proto']
  const login = request.headers['tailscale-user-login']
  if (directHost && localHosts.has(directHost) && !forwardedHost && !forwardedProto && !login) {
    return { origin: `http://${directHost}`, identity: 'local' }
  }
  // Serve replaces these headers at the local reverse proxy. Funnel does not
  // supply a signed-in tailnet identity, so that route is rejected.
  if (forwardedProto === 'https' && typeof forwardedHost === 'string' &&
      /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.){2,}ts\.net(?::[1-9]\d{0,4})?$/i.test(forwardedHost) &&
      typeof login === 'string' && login.length > 0 && login.length <= 512 &&
      directHost && (directHost === forwardedHost || localHosts.has(directHost))) {
    const endpoint = URL.parse(`https://${forwardedHost}`)
    if (endpoint) return { origin: endpoint.origin, identity: login }
  }
  return null
}

function sendJson(response: ServerResponse, status: number, data: object): void {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(data))
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = request.headers['content-type'] ?? ''
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new RequestError(415, 'Send the request as JSON.')
  }
  if (Number(request.headers['content-length']) > maximumBodyBytes) {
    throw new RequestError(413, 'Request is too large.')
  }
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length
    if (bytes > maximumBodyBytes) {
      throw new RequestError(413, 'Request is too large.')
    }
    chunks.push(chunk)
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'Invalid JSON request.')
  }
  return body as Record<string, unknown>
}

function takeAttempt(attempts: number[], max: number, now: number): boolean {
  while (attempts.length && attempts[0] <= now - minute) attempts.shift()
  if (attempts.length >= max) return false
  attempts.push(now)
  return true
}

function writeEvent(response: ServerResponse, data: string): void {
  if (response.writableLength > 32_000) response.destroy()
  else if (!response.writableEnded && !response.destroyed) response.write(data)
}

function createMobileCompanion(translate: Translate) {
  const pairingCode = randomInt(100_000_000).toString().padStart(8, '0')
  const sessionMap = new Map<string, Session>()
  const pairingAttempts: number[] = []
  let latest: string = 'null'
  let translating = false
  let listening = false
  let stopped = false
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let rejectStart: (reason: Error) => void

  function sessionFor(request: IncomingMessage, context: RequestContext): Session | undefined {
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '')?.[1]
    const session = token && sessionMap.get(token)
    if (!session || session.expiresAt <= Date.now()) return
    if (session.context.origin === context.origin && session.context.identity === context.identity) return session
  }

  function cleanSessions(now: number): void {
    for (const [token, session] of sessionMap) {
      if (session.expiresAt > now) continue
      session.stream?.end()
      sessionMap.delete(token)
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    const context = requestContext(request)
    const origin = request.headers.origin
    if (!context || (origin !== undefined && origin !== context.origin)) {
      throw new RequestError(403, 'Use the local or private VocaLume mobile link.')
    }

    if (request.method === 'GET') {
      const assets = {
        '/': ['text/html', mobileCompanionPage],
        '/mobile.css': ['text/css', mobileCompanionStyle],
        '/mobile.js': ['text/javascript', mobileCompanionScript]
      } as const
      if (request.url && Object.hasOwn(assets, request.url)) {
        const [type, content] = assets[request.url as keyof typeof assets]
        response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(content)
        return
      }
    }

    if (request.method === 'POST' && request.url === '/pair') {
      const now = Date.now()
      if (!takeAttempt(pairingAttempts, 12, now)) {
        throw new RequestError(429, 'Too many pairing attempts. Try again in a minute.')
      }
      const { code } = await readJson(request)
      if (typeof code !== 'string' || !/^\d{8}$/.test(code) ||
          !timingSafeEqual(Buffer.from(code), Buffer.from(pairingCode))) {
        throw new RequestError(401, 'Check the pairing code shown in VocaLume.')
      }
      if (stopped) return
      cleanSessions(now)
      if (sessionMap.size >= 8) {
        const inactive = [...sessionMap].find(([, session]) => !session.stream)
        if (!inactive) throw new RequestError(429, 'Too many devices are connected. Close an unused mobile page.')
        sessionMap.delete(inactive[0])
      }
      const token = randomBytes(32).toString('base64url')
      sessionMap.set(token, { context, expiresAt: now + sessionDuration, attempts: [] })
      sendJson(response, 200, { token })
      return
    }

    const subscribe = request.method === 'GET' && request.url === '/events'
    const requestTranslation = request.method === 'POST' && request.url === '/translate'
    if (!subscribe && !requestTranslation) throw new RequestError(404, 'Page not found.')
    const session = sessionFor(request, context)
    if (!session) throw new RequestError(401, 'Pair with VocaLume again.')

    if (subscribe) {
      session.stream?.end()
      session.stream = response
      response.once('close', () => { if (session.stream === response) session.stream = undefined })
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' })
      response.flushHeaders()
      writeEvent(response, `data: ${latest}\n\n`)
      return
    }

    const { text, from, to } = await readJson(request)
    if (stopped || session.expiresAt <= Date.now()) throw new RequestError(401, 'Pair with VocaLume again.')
    if (typeof text !== 'string' || !text.trim() || text.length > maximumTextLength ||
        typeof from !== 'string' || typeof to !== 'string' || from === to ||
        !supportedLanguages.has(from) || !supportedLanguages.has(to)) {
      throw new RequestError(400, 'Enter up to 3000 characters and choose two different supported languages.')
    }
    if (translating || !takeAttempt(session.attempts, 24, Date.now())) {
      throw new RequestError(429, 'VocaLume is busy. Try again in a moment.')
    }
    translating = true
    try {
      const translated = await translate(text.trim(), from as Language, to as Language)
      if (!translated.trim()) throw new Error('Empty translation')
      sendJson(response, 200, { text: translated })
    } catch {
      throw new RequestError(502, 'Translation failed. Check your model in the VocaLume Models tab and try again.')
    } finally {
      translating = false
    }
  }

  const server = createServer({ maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 8000, connectionsCheckingInterval: 1000 },
    (request, response) => {
      void handle(request, response).catch(error => {
        if (response.destroyed || response.writableEnded) return
        if (!request.complete) {
          response.setHeader('Connection', 'close')
          request.resume()
        }
        if (error instanceof RequestError) sendJson(response, error.status, { error: error.message })
        else if (error instanceof SyntaxError) sendJson(response, 400, { error: 'Invalid JSON request.' })
        else sendJson(response, 500, { error: 'VocaLume could not handle the request.' })
      })
    })
  server.maxConnections = 32
  const status = () => listening && !stopped ? { url, pairingCode } : null
  const ready = new Promise<MobileCompanionStatus>((resolve, reject) => {
    rejectStart = reject
    server.on('error', (error: NodeJS.ErrnoException) => {
      reject(new Error(error.code === 'EADDRINUSE'
        ? `Mobile access could not start because port ${port} is in use.`
        : 'Mobile access could not start.'))
      stop()
    })
    server.listen(port, host, () => {
      if (stopped) { server.close(); return }
      listening = true
      server.unref()
      heartbeat = setInterval(() => {
        cleanSessions(Date.now())
        for (const session of sessionMap.values()) {
          if (session.stream) writeEvent(session.stream, ': keep-alive\n\n')
        }
      }, 15_000)
      heartbeat.unref()
      resolve({ url, pairingCode })
    })
  })

  function stop(): void {
    if (stopped) return
    stopped = true
    rejectStart(new Error('Mobile access was stopped.'))
    clearInterval(heartbeat)
    server.close()
    server.closeAllConnections()
    sessionMap.clear()
    latest = 'null'
  }

  function publish(caption: MobileCaption | null): void {
    if (stopped) return
    const json = JSON.stringify(caption && {
      sourceText: caption.sourceText.slice(0, 8000),
      translatedText: caption.translatedText.slice(0, 8000)
    })
    if (json === latest) return
    latest = json
    cleanSessions(Date.now())
    for (const session of sessionMap.values()) {
      if (session.stream) writeEvent(session.stream, `data: ${latest}\n\n`)
    }
  }

  return { ready, status, stop, publish, isStopped: () => stopped }
}

let active: ReturnType<typeof createMobileCompanion> | undefined

export function startMobileCompanion(translate: Translate): Promise<MobileCompanionStatus> {
  if (active && !active.isStopped()) return active.ready
  const instance = createMobileCompanion(translate)
  active = instance
  void instance.ready.catch(() => { if (active === instance) active = undefined })
  return instance.ready
}

export function getMobileCompanionStatus(): MobileCompanionStatus | null {
  return active?.status() ?? null
}

export function stopMobileCompanion(): void {
  const current = active
  active = undefined
  current?.stop()
}

export function publishMobileCaption(caption: MobileCaption | null): void {
  active?.publish(caption)
}
