import { expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const folder = vi.hoisted(() => ({ path: '' }))
vi.mock('electron', () => ({ app: { getPath: () => folder.path } }))
it('downloads all chunks without flooding progress callbacks for each packet', async () => {
  folder.path = mkdtempSync(join(tmpdir(), 'vocalume-progress-'))
  const progress = vi.fn()
  let count = 0
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200,
    headers: new Headers({ 'content-length': '10000' }),
    body: { getReader: () => ({ read: async () => ++count <= 10000
      ? { done: false, value: new Uint8Array([1]) } : { done: true } }) }
  })))
  try {
    const { downloadModel } = await import('./model-downloader')
    const path = await downloadModel(progress, 'base')
    expect(readFileSync(path).length).toBe(10000)
    expect(progress.mock.calls.length).toBeLessThan(105)
  } finally {
    vi.unstubAllGlobals()
    rmSync(folder.path, { recursive: true, force: true })
  }
})
