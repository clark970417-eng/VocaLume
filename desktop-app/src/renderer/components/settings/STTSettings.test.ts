import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { STTSettings } from './STTSettings'

vi.mock('../../ui-language', () => ({ t: (message: string) => message }))

type Settings = Parameters<typeof STTSettings>[0]

const availableMacEngines = {
  appleSilicon: true,
  haasJa: false,
  qwenAsr: false,
  appleSpeech: true,
  appleTranslate: false,
  speakerIdentification: true
}

function renderSettings(overrides: Partial<Settings>): string {
  return renderToStaticMarkup(createElement(STTSettings, {
    sttEngine: 'whisper-local',
    onSttEngineChange: vi.fn(),
    whisperVariant: 'base',
    onWhisperVariantChange: vi.fn(),
    platform: '',
    macEngines: null,
    disabled: false,
    sourceLanguage: 'auto',
    draftSttEnabled: false,
    onDraftSttEnabledChange: vi.fn(),
    ...overrides
  }))
}

it.each(['', 'win32'])('hides Apple-only options and stale engine instructions on %j', (platform) => {
  for (const sttEngine of ['apple-speech-transcriber', 'mlx-whisper', 'kotoba-whisper', 'qwen3-asr'] as const) {
    const html = renderSettings({ platform, sttEngine })
    expect(html).not.toMatch(/Apple Speech|mlx-whisper|Kotoba-Whisper|Qwen3-ASR|speech-swift|apple-stt/)
    expect(html).toContain('Whisper (whisper.cpp)')
    expect(html).toContain('Fast interim results (Moonshine Tiny JA)')
  }
})

it('retains macOS speech settings and the Windows Japanese recognition options', () => {
  const mac = renderSettings({ platform: 'darwin', sttEngine: 'apple-speech-transcriber', macEngines: availableMacEngines })
  expect(mac).toContain('Apple Speech (Zero Setup, macOS 26+)')
  expect(mac).toContain('Apple SpeechTranscriber: zero model management')
  const windows = renderSettings({ platform: 'win32', sourceLanguage: 'ja' })
  expect(windows).toContain('Haas-ja Q8_0')
  expect(windows).toContain('SenseVoice Small (Offline)')
})
