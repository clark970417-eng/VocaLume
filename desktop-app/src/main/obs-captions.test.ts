import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { configureObsCaptions, publishObsCaption } from './obs-captions'

const profile = vi.hoisted(() => ({ path: '' }))
vi.mock('electron', () => ({ app: { getPath: () => profile.path } }))

it('exports only final translations, supports bilingual output, and clears on disable', async () => {
  profile.path = await mkdtemp(join(tmpdir(), 'vocalume-obs-test-'))
  try {
    const { path } = await configureObsCaptions('translation')
    publishObsCaption({ sourceText: 'こんにちは', translatedText: '你好' })
    publishObsCaption({ sourceText: '暫定', translatedText: '草稿', isInterim: true })
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('你好'))
    await configureObsCaptions('bilingual')
    publishObsCaption({ sourceText: 'またね', translatedText: '再見' })
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('またね\n再見'))
    await configureObsCaptions('off')
    publishObsCaption({ sourceText: 'こんにちは', translatedText: '你好' })
    expect(await readFile(path, 'utf8')).toBe('')
  } finally {
    await configureObsCaptions('off')
    await rm(profile.path, { recursive: true, force: true })
  }
})
