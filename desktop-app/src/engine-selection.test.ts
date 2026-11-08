import { describe, expect, it } from 'vitest'
import { normalizeMacSttEngine, resolveMacSpeechEngine, type MacEngineAvailability } from './engine-selection'

const cleanAppleSilicon: MacEngineAvailability = {
  appleSilicon: true,
  haasJa: false,
  qwenAsr: false,
  appleSpeech: false,
  appleTranslate: false,
  speakerIdentification: true
}

describe('Mac speech engine availability', () => {
  it.each(['haas-ja-fast', 'haas-ja-recommended', 'qwen3-asr', 'apple-speech-transcriber'] as const)(
    'normalizes a missing %s helper without removing the existing Japanese fallback', engine => {
      expect(normalizeMacSttEngine(engine, cleanAppleSilicon)).toBe('mlx-whisper')
      expect(resolveMacSpeechEngine('ja', engine, cleanAppleSilicon)).toBe('kotoba-whisper')
    }
  )

  it('retains Haas phrase settings on a provisioned Mac', () => {
    const provisioned = { ...cleanAppleSilicon, haasJa: true }
    expect(resolveMacSpeechEngine('ja', 'haas-ja-recommended', provisioned)).toBe('haas-ja-recommended')
    expect(resolveMacSpeechEngine('ja', 'haas-ja-fast', provisioned)).toBe('haas-ja-fast')
    expect(resolveMacSpeechEngine('ja', 'mlx-whisper', provisioned)).toBe('haas-ja-fast')
    expect(resolveMacSpeechEngine('en', 'haas-ja-fast', provisioned)).toBe('sensevoice-sherpa')
  })

  it('keeps compatible download-on-demand recognition engines', () => {
    expect(resolveMacSpeechEngine('auto', 'kotoba-whisper', cleanAppleSilicon)).toBe('kotoba-whisper')
    expect(resolveMacSpeechEngine('fr', 'whisper-local', cleanAppleSilicon)).toBe('whisper-local')
  })

  it('avoids Apple Silicon engines on Intel and retains supported languages', () => {
    const intel = { ...cleanAppleSilicon, appleSilicon: false, speakerIdentification: false }
    expect(resolveMacSpeechEngine('ja', 'haas-ja-fast', intel)).toBe('whisper-local')
    expect(resolveMacSpeechEngine('auto', 'mlx-whisper', intel)).toBe('whisper-local')
    expect(resolveMacSpeechEngine('ko', 'mlx-whisper', intel)).toBe('sensevoice-sherpa')
  })
})
