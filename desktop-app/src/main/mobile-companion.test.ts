import { get } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getMobileCompanionStatus, publishMobileCaption, startMobileCompanion, stopMobileCompanion
} from './mobile-companion'

function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(new URL(path, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
}

async function pair(base: string, code: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await post(base, 'pair', { code }, headers)
  expect(response.status).toBe(200)
  return (await response.json()).token
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

afterEach(() => {
  stopMobileCompanion()
  vi.restoreAllMocks()
})

describe('mobile companion', () => {
  it('starts on loopback, serves the phone page and requires pairing for translation', async () => {
    expect(getMobileCompanionStatus()).toBeNull()
    const translate = vi.fn(async () => '晚上好')
    const status = await startMobileCompanion(translate)
    expect(status.url).toBe('http://127.0.0.1:17649/')
    expect(status.pairingCode).toMatch(/^\d{8}$/)
    expect(getMobileCompanionStatus()).toEqual(status)
    expect(await startMobileCompanion(async () => '')).toEqual(status)
    expect((await fetch(status.url)).status).toBe(200)
    expect((await fetch(new URL('mobile.js', status.url))).headers.get('Content-Type')).toMatch(/^text\/javascript/)
    expect((await post(status.url, 'pair', { code: 'wrong' })).status).toBe(401)
    const token = await pair(status.url, status.pairingCode)
    expect((await post(status.url, 'translate', { text: 'こんばんは', from: 'ja', to: 'zh' })).status).toBe(401)
    const response = await post(status.url, 'translate', { text: ' こんばんは ', from: 'ja', to: 'zh' }, auth(token))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ text: '晚上好' })
    expect(translate).toHaveBeenCalledExactlyOnceWith('こんばんは', 'ja', 'zh')
  })

  it('rejects untrusted hosts and origins and confines private Serve sessions to their identity', async () => {
    const status = await startMobileCompanion(async () => '晚上好')
    const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      get(status.url, { headers: { Host: 'other.example.com' } }, response => {
        response.resume()
        resolve(response.statusCode)
      }).on('error', reject)
    })
    expect(invalidHostStatus).toBe(403)
    expect((await post(status.url, 'pair', { code: status.pairingCode }, { Origin: 'https://other.example.com' })).status).toBe(403)
    const remoteHost = 'my-mac.my-tailnet.ts.net'
    const forwarded = {
      Host: remoteHost,
      'X-Forwarded-Host': remoteHost,
      'X-Forwarded-Proto': 'https',
      Origin: `https://${remoteHost}`
    }
    expect((await post(status.url, 'pair', { code: status.pairingCode }, forwarded)).status).toBe(403)
    const privateServe = { ...forwarded, 'Tailscale-User-Login': 'test@example.com' }
    const token = await pair(status.url, status.pairingCode, privateServe)
    const body = { text: 'こんばんは', from: 'ja', to: 'ko' }
    expect((await post(status.url, 'translate', body, auth(token))).status).toBe(401)
    expect((await post(status.url, 'translate', body, {
      ...privateServe, ...auth(token), 'Tailscale-User-Login': 'another@example.com'
    })).status).toBe(401)
    expect((await post(status.url, 'translate', body, { ...privateServe, ...auth(token) })).status).toBe(200)
  })

  it('streams authenticated captions, hides extra pipeline fields, and clears after stop', async () => {
    const status = await startMobileCompanion(async () => 'unused')
    const token = await pair(status.url, status.pairingCode)
    const eventsUrl = new URL('events', status.url)
    expect((await fetch(eventsUrl)).status).toBe(401)
    expect((await fetch(new URL(`events?token=${token}`, status.url))).status).toBe(404)
    const controller = new AbortController()
    const response = await fetch(eventsUrl, { headers: auth(token), signal: controller.signal })
    expect(response.headers.get('Content-Type')).toMatch(/^text\/event-stream/)
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    async function next() {
      return decoder.decode((await reader.read()).value)
    }
    try {
      expect(await next()).toBe('data: null\n\n')
      const result = { sourceText: 'ありがとう', translatedText: '謝謝', timestamp: 123 }
      publishMobileCaption(result)
      expect(await next()).toBe('data: {"sourceText":"ありがとう","translatedText":"謝謝"}\n\n')
      publishMobileCaption(null)
      expect(await next()).toBe('data: null\n\n')
      stopMobileCompanion()
      expect(getMobileCompanionStatus()).toBeNull()
      const restarted = await startMobileCompanion(async () => 'unused')
      expect((await fetch(new URL('events', restarted.url), { headers: auth(token) })).status).toBe(401)
    } finally {
      controller.abort()
    }
  })

  it('bounds pairing attempts, input and simultaneous translations', async () => {
    let resolveTranslation!: (text: string) => void
    const translate = vi.fn(() => new Promise<string>(resolve => { resolveTranslation = resolve }))
    const status = await startMobileCompanion(translate)
    const token = await pair(status.url, status.pairingCode)
    const request = { text: 'こんにちは', from: 'ja', to: 'zh' }
    expect((await post(status.url, 'translate', { ...request, to: 'ja' }, auth(token))).status).toBe(400)
    expect((await post(status.url, 'translate', { ...request, text: '字'.repeat(3001) }, auth(token))).status).toBe(400)
    expect((await post(status.url, 'translate', { ...request, text: '字'.repeat(24_001) }, auth(token))).status).toBe(413)
    const pending = post(status.url, 'translate', request, auth(token))
    await vi.waitFor(() => expect(translate).toHaveBeenCalledOnce())
    expect((await post(status.url, 'translate', request, auth(token))).status).toBe(429)
    resolveTranslation('你好')
    expect((await pending).status).toBe(200)
    for (let i = 0; i < 11; i++) {
      expect((await post(status.url, 'pair', { code: 'wrong' })).status).toBe(401)
    }
    expect((await post(status.url, 'pair', { code: status.pairingCode })).status).toBe(429)
  })
})
