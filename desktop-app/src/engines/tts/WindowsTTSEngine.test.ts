import { expect, it } from 'vitest'
import type { TtsVoiceOption } from '../types'
import { selectWindowsTtsVoice, WindowsTTSEngine } from './WindowsTTSEngine'

const voices: TtsVoiceOption[] = [
  { id: 'sapi:Haruka', label: 'Haruka', language: 'ja' },
  { id: 'sapi:Hanhan', label: 'Hanhan', language: 'zh' },
  { id: 'sapi:Second Japanese voice', label: 'Second Japanese voice', language: 'ja' },
  { id: 'sapi:David', label: 'David', language: 'en' }
]

it('selects a Windows voice only from the translation language', () => {
  expect(selectWindowsTtsVoice(voices, 'ja', 'auto')?.label).toBe('Haruka')
  expect(selectWindowsTtsVoice(voices, 'ja', 'sapi:Second Japanese voice')?.label).toBe('Second Japanese voice')
  expect(selectWindowsTtsVoice(voices, 'zh', 'sapi:Haruka')?.label).toBe('Hanhan')
  expect(selectWindowsTtsVoice(voices, 'zh', 'zf_xiaobei')?.label).toBe('Hanhan')
  expect(selectWindowsTtsVoice(voices, 'ko', 'sapi:David')).toBeUndefined()
})

it('respects cancellation before launching synthesis', async () => {
  const engine = new WindowsTTSEngine()
  const controller = new AbortController()
  controller.abort()
  await expect(engine.synthesize('取消測試', 'zh', controller.signal)).rejects.toHaveProperty('name', 'AbortError')
})
