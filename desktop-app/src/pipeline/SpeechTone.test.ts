import { expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import { applySpeechTone, isSpeechToneMode } from './SpeechTone'
import { StreamingProcessor, type StreamingDeps } from './StreamingProcessor'
import { ContextBuffer } from './ContextBuffer'
import { LocalAgreement } from './LocalAgreement'
import * as pressure from '../main/performance-state'

it('keeps punctuation, including questions inside closing quotes, without inventing laughter', () => {
  expect(applySpeechTone('すごい！', '好厲害。', 'zh', 'natural')).toBe('好厲害！')
  expect(applySpeechTone('「本当！？」', '「真的嗎？」', 'zh', 'ww')).toBe('「真的嗎！？」')
  expect(applySpeechTone('真的嗎？', '本当です。', 'ja', 'natural')).toBe('本当です？')
  expect(applySpeechTone('すごい！', '好厲害。', 'zh', 'off', 1)).toBe('好厲害。')
})

it('uses only explicit markers or high-confidence audio, with no duplicate laughter', () => {
  expect(applySpeechTone('やった！', '成功了！', 'zh', 'ww', .99)).toBe('成功了！ ww')
  expect(applySpeechTone('面白い（笑）', '很好笑（笑）', 'zh', '草')).toBe('很好笑 草')
  expect(applySpeechTone('（笑）', '笑聲', 'ja', 'ww')).toBe('ww')
  expect(applySpeechTone('', '', 'zh', '笑', .99)).toBe('笑')
  for (const source of ['昨日笑った。', '草原で遊ぶ。', 'www.example.com', '面白い話です。']) {
    expect(applySpeechTone(source, '普通句子。', 'zh', '草', .8)).toBe('普通句子。')
  }
  expect(applySpeechTone('普通句子', '', 'ja', 'ww', .99)).toBe('')
  expect(isSpeechToneMode('<invalid>')).toBe(false)
})

function fixture(enabled = true, serial = false, nonverbal = false) {
  const mode = enabled ? 'ww' : 'off'
  const translate = vi.fn(async () => '真的嗎。')
  const detectLaughter = vi.fn(async () => .99)
  const source = '本当ですか！'
  const processor = new StreamingProcessor({
    emitter: new EventEmitter(), agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSpeechToneMode: () => mode, getSourceLanguage: () => 'ja', detectLaughter,
    getSTTEngine: () => ({ processAudio: async () => nonverbal ? null : ({ text: source, language: 'ja', timestamp: 1, isFinal: true }) }),
    getTranslator: () => ({ id: 'hunyuan-mt-15', translate, ...(serial && { translateSimulMt: translate }) }),
    getGlossary: () => [], getSimulMtConfig: () => ({ enabled: serial, waitK: 3 }),
    resolveTargetLanguage: () => 'zh', incrementProcessing() {}, decrementProcessing() {}
  } as unknown as StreamingDeps)
  return { processor, detectLaughter, translate }
}

for (const serial of [true, false]) it(`decorates completed captions in ${serial ? 'serial' : 'queued'} mode`, async () => {
  const f = fixture(true, serial)
  try {
    const result = await f.processor.finalizeStreaming(new Float32Array(16000), 16000)
    expect(result?.translatedText).toBe('真的嗎！ ww')
    expect(result?.spokenText).toBe('真的嗎。')
  }
  finally { f.processor.reset() }
})

for (const serial of [true, false]) it(`pure confirmed laughter needs no translation or TTS (${serial})`, async () => {
  const f = fixture(true, serial, true)
  try {
    const result = await f.processor.finalizeStreaming(new Float32Array(16000), 16000)
    expect(result?.translatedText).toBe('ww')
    expect(result?.spokenText).toBe('')
    expect(f.translate).not.toHaveBeenCalled()
  } finally { f.processor.reset() }
})

it('disabled/thermal modes skip acoustic work, while a late classifier cannot stall captions', async () => {
  const off = fixture(false)
  try {
    await off.processor.finalizeStreaming(new Float32Array(16000), 16000)
    expect(off.detectLaughter).not.toHaveBeenCalled()
  } finally { off.processor.reset() }
  const hot = fixture()
  const policy = vi.spyOn(pressure, 'performanceState').mockReturnValue({ thermalState:'fair', speedLimit:100, previewFloorMs:0, previewDutyCycle:.65, previewsPaused:false, coolingDown:false })
  try {
    expect((await hot.processor.finalizeStreaming(new Float32Array(16000), 16000))?.translatedText).toBe('真的嗎！')
    expect(hot.detectLaughter).not.toHaveBeenCalled()
  } finally { hot.processor.reset(); policy.mockRestore() }
  const late = fixture(); late.detectLaughter.mockImplementation(() => new Promise(() => {}))
  try { expect((await late.processor.finalizeStreaming(new Float32Array(16000), 16000))?.translatedText).toBe('真的嗎！') }
  finally { late.processor.reset() }
})
