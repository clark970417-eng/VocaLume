import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { clearObsCaption, configureObsCaptions, obsCaptionStatus, publishObsCaption } from './obs-captions'

const profile = vi.hoisted(() => ({ path: '' }))
vi.mock('electron', () => ({ app: { getPath: () => profile.path } }))

it('exports only final translations, supports bilingual output, and clears on disable', async () => {
  profile.path = await mkdtemp(join(tmpdir(), 'vocalume-obs-test-'))
  try {
    const { path } = await configureObsCaptions('translation')
    publishObsCaption({ sourceText: 'こんにちは', translatedText: '你好' })
    publishObsCaption({ sourceText: '暫定', translatedText: '草稿', isInterim: true })
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('你好'))
    const longCaption = '中文'.repeat(30)
    publishObsCaption({ sourceText: '', translatedText: longCaption })
    await vi.waitFor(async () => {
      const lines = (await readFile(path, 'utf8')).split('\n')
      expect(lines.join('')).toBe(longCaption)
      expect(lines.every(line => line.length <= 21)).toBe(true)
    })
    await configureObsCaptions('bilingual')
    publishObsCaption({ sourceText: 'またね', translatedText: '再見' })
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('またね\n再見'))
    publishObsCaption({ sourceText: 'さようなら', translatedText: '再會' })
    await clearObsCaption()
    expect(await readFile(path, 'utf8')).toBe('')
    expect(obsCaptionStatus().mode).toBe('bilingual')
    publishObsCaption({ sourceText: 'こんにちは', translatedText: '你好' })
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('こんにちは\n你好'))
    await configureObsCaptions('off')
    publishObsCaption({ sourceText: 'こんにちは', translatedText: '你好' })
    expect(await readFile(path, 'utf8')).toBe('')
  } finally {
    await configureObsCaptions('off')
    await rm(profile.path, { recursive: true, force: true })
  }
})
