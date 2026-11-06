import { expect, it, vi } from 'vitest'
const state = vi.hoisted(() => new Map<string, unknown>([['onboardingModelStatus', 'downloading']]))
const downloads = vi.hoisted(() => ({ model: vi.fn(async () => ''), gguf: vi.fn(async () => '') }))
vi.mock('./store', () => ({ store: { get: (key: string) => state.get(key), set: (key: string, value: unknown) => state.set(key, value) } }))
vi.mock('../engines/model-downloader', () => ({
  isGGUFDownloaded: () => false, isModelDownloaded: () => false,
  downloadModel: downloads.model, downloadGGUF: downloads.gguf,
  getHunyuanMT15Variants: () => ({}), getLFM2Variants: () => ({ Q4_K_M: { filename: 'lfm.gguf', url: 'https://example.test/model', sizeMB: 1 } }),
  WHISPER_VARIANTS: { base: { sizeMB: 1 }, 'kotoba-v2.0': { sizeMB: 2 } }
}))
it('resumes after a restart even when the stored status says downloading, and coalesces live requests', async () => {
  const { startOnboardingDownload } = await import('./onboarding-downloader')
  const first = startOnboardingDownload(null)
  expect(startOnboardingDownload(null)).toBe(first)
  await first
  expect(downloads.model).toHaveBeenCalled()
})
