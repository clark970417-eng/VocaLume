import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import WebSocket from 'ws'

const REQUEST_TIMEOUT_MS = 2000
const RETRY_DELAY_MS = 1500

type ObsReply = {
  op: number
  d: {
    authentication?: { salt: string; challenge: string }
    requestId?: string
    requestStatus?: { result: boolean }
    responseData?: { inputKind?: string; inputSettings?: { read_from_file?: boolean } }
  }
}

const digest = (value: string): string => createHash('sha256').update(value).digest('base64')

/** OBS WebSocket v5, restricted to the authenticated local OBS instance. */
export class ObsCaptionPush {
  private socket?: WebSocket
  private requestId = 0
  private retryAfter = 0
  private displayedText?: string

  constructor(private readonly configPath: string, readonly source: string) {}

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return
    if (Date.now() < this.retryAfter) throw new Error('OBS WebSocket is disconnected.')
    let settings: { server_enabled?: boolean; server_port?: number; auth_required?: boolean; server_password?: string }
    try {
      settings = JSON.parse(await readFile(this.configPath, 'utf8'))
    } catch {
      throw new Error('Could not read the local OBS WebSocket settings.')
    }
    if (!settings?.server_enabled || !settings.auth_required || typeof settings.server_password !== 'string' ||
        !settings.server_password || !Number.isInteger(settings.server_port) ||
        settings.server_port! < 1 || settings.server_port! > 65535) {
      throw new Error('Enable OBS WebSocket with password authentication.')
    }
    const socket = this.socket = new WebSocket(`ws://127.0.0.1:${settings.server_port}`, {
      handshakeTimeout: REQUEST_TIMEOUT_MS,
      maxPayload: 256 * 1024,
      perMessageDeflate: false
    })
    this.displayedText = undefined
    socket.on('error', () => {})
    try {
      await this.waitFor(socket, reply => {
        if (reply.op === 0) {
          const auth = reply.d.authentication
          if (!auth || typeof auth.salt !== 'string' || typeof auth.challenge !== 'string') {
            throw new Error('Enable OBS WebSocket with password authentication.')
          }
          socket.send(JSON.stringify({
            op: 1, d: { rpcVersion: 1, eventSubscriptions: 0,
              authentication: digest(digest(settings.server_password! + auth.salt) + auth.challenge) }
          }))
        }
        return reply.op === 2
      })
      const input = await this.request('GetInputSettings', { inputName: this.source })
      if (!/^text_gdiplus(?:_v\d+)?$/.test(input?.inputKind ?? '') || input?.inputSettings?.read_from_file) {
        throw new Error('Use an OBS Text (GDI+) source with Read from file turned off.')
      }
    } catch (error) {
      this.close()
      this.retryAfter = Date.now() + RETRY_DELAY_MS
      throw error
    }
  }

  async write(text: string): Promise<boolean> {
    await this.connect()
    if (this.displayedText === text) return false
    try {
      await this.request('SetInputSettings', {
        inputName: this.source, inputSettings: { text }, overlay: true
      })
      this.displayedText = text
      return true
    } catch (error) {
      this.close()
      this.retryAfter = Date.now() + RETRY_DELAY_MS
      throw error
    }
  }

  close(): void {
    const socket = this.socket
    this.socket = undefined
    this.displayedText = undefined
    socket?.terminate()
  }

  private async request(requestType: string, requestData: Record<string, unknown>) {
    const socket = this.socket!
    const requestId = String(++this.requestId)
    const reply = await this.waitFor(socket, message => message.op === 7 && message.d.requestId === requestId,
      () => socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } })))
    if (!reply.d.requestStatus?.result) throw new Error('OBS caption source could not be updated. Check its name.')
    return reply.d.responseData
  }

  private waitFor(socket: WebSocket, accept: (message: ObsReply) => boolean, send?: () => void): Promise<ObsReply> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(new Error('OBS WebSocket did not respond.')), REQUEST_TIMEOUT_MS)
      const cleanup = (): void => {
        clearTimeout(timer)
        socket.off('message', receive)
        socket.off('close', disconnected)
        socket.off('error', disconnected)
      }
      const fail = (error: unknown): void => { cleanup(); reject(error) }
      const disconnected = (): void => fail(new Error('Could not connect to local OBS WebSocket.'))
      const receive = (data: WebSocket.RawData): void => {
        try {
          const reply = JSON.parse(data.toString()) as ObsReply
          if (accept(reply)) { cleanup(); resolve(reply) }
        } catch (error) { fail(error) }
      }
      socket.on('message', receive)
      socket.once('close', disconnected)
      socket.once('error', disconnected)
      try { send?.() } catch (error) { fail(error) }
    })
  }
}
