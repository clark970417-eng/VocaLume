import { expect, it } from 'vitest'
import { corroboratedJapaneseMonth, StreamingRecognition } from './StreamingRecognition'
import type { STTEngine } from '../engines/types'

const finalText = 'アメリカの1月の雇用統計が六日に発表され'
const early = 'アメリカの十が'
const later = 'も十月の雇用統計が六日に発表'

it('requires exact evidence on both sides of the reported month', () => {
  expect(corroboratedJapaneseMonth(finalText, early, later)).toBe('アメリカの十月の雇用統計が六日に発表され')
  expect(corroboratedJapaneseMonth(finalText, early, '十0月の雇用統計が六日に発表')).toBe('アメリカの十月の雇用統計が六日に発表され')
  expect(corroboratedJapaneseMonth(finalText, 'アメリカの一', later)).toBe(finalText)
  expect(corroboratedJapaneseMonth(finalText, early, 'も十月の物価指数が発表')).toBe(finalText)
  expect(corroboratedJapaneseMonth('1月の雇用統計と2月の物価', early, later)).toBe('1月の雇用統計と2月の物価')
})

it('uses only contained observations from the same audio segment', async () => {
  const pipeline = new StreamingRecognition(() => 'ja')
  let source = early
  const engine = { processAudio: async () => ({ text: source, language: 'ja' }) } as unknown as STTEngine
  const run = (segment: string, start: number, end: number, final = false) =>
    pipeline.process(engine, new Float32Array(end - start), 16000, {
      segment, speechSeconds: 1, captureStartSample: start, captureEndSample: end
    }, final)
  await run('one', 1000, 20200)
  source = later
  await run('one', 20000, 68000)
  source = finalText
  expect((await run('unrelated', 1000, 71400, true))?.text).toBe(finalText)
  expect((await run('one', 1000, 71400, true))?.text).toContain('十月')
  expect((await run('one', 4000, 71400, true))?.text).toBe(finalText)
})
