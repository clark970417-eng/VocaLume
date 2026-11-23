import { expect, it, vi } from 'vitest'
import { OnnxWebTranslator } from './OnnxWebTranslator'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/vocalume-test' } }))
const create = vi.hoisted(() => vi.fn())
vi.mock('@huggingface/transformers', () => ({ pipeline: create, env: {} }))

it('uses WASM when WebGPU is unavailable', async () => {
  const pipe = Object.assign(vi.fn(async () => [{ translation_text: 'こんにちは' }]), { dispose: vi.fn() })
  create.mockRejectedValueOnce(new Error('WebGPU unavailable')).mockResolvedValueOnce(pipe)
  const engine = new OnnxWebTranslator()
  await engine.initialize()
  expect(create.mock.calls.map(call => call[2].device)).toEqual(['webgpu', 'wasm'])
  await engine.dispose()
})

it('uses the Traditional Chinese model target and normalizes provider spelling', async () => {
  const pipe = Object.assign(vi.fn()
    .mockResolvedValueOnce([{ translation_text: 'こんにちは' }])
    .mockResolvedValueOnce([{ translation_text: '视频软件' }]), { dispose: vi.fn() })
  create.mockResolvedValueOnce(pipe)
  const engine = new OnnxWebTranslator()
  await engine.initialize()
  expect(await engine.translate('動画ソフト', 'ja', 'zh')).toBe('影片軟體')
  expect(pipe.mock.calls[1]?.[1]).toEqual({ src_lang: 'jpn_Jpan', tgt_lang: 'zho_Hant' })
  await engine.dispose()
})
