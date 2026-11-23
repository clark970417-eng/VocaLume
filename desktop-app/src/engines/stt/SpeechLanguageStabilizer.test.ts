import { expect, it } from 'vitest'
import { SpeechLanguageStabilizer } from './SpeechLanguageStabilizer'

it('keeps Japanese through a name or loanword and switches on clear new speech', () => {
  const detector = new SpeechLanguageStabilizer()
  expect(detector.detect('ja', '担当は佐藤さんです', 1000)).toBe('ja')
  expect(detector.detect('zh', '山田太郎', 2000)).toBe('ja')
  expect(detector.detect('en', 'OpenAI', 3000)).toBe('ja')
  expect(detector.detect('zh', '我不想去了', 4000)).toBe('zh')
  expect(detector.detect('en', 'Good morning everyone', 5000)).toBe('en')
})

it('does not apply a previous capture’s language to the next session or after a pause', () => {
  const detector = new SpeechLanguageStabilizer()
  detector.detect('ja', 'こんにちは', 1000, { segment: 'first:0', speechSeconds: 1, captureEndSample: 16000 })
  expect(detector.detect('en', 'Hello', 2000, { segment: 'next:0', speechSeconds: 0.3, captureStartSample: 0 })).toBe('en')
  detector.detect('ja', 'こんにちは', 3000)
  expect(detector.detect('en', 'Hello', 12000)).toBe('en')
})
