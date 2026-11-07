import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioCaptureStartError } from './useAudioCapture'
import { useSettingsState } from './useSettingsState'

const session = vi.hoisted(() => ({
  audio: { start: vi.fn(), stop: vi.fn() },
  crashedSession: { config: { mode: 'e2e' } },
  isStarting: false,
  setIsStarting: vi.fn(),
  setIsRunning: vi.fn(),
  setStatus: vi.fn(),
  setCrashedSession: vi.fn(),
  startSessionTimer: vi.fn(),
  stopSessionTimer: vi.fn()
}))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => [initial, vi.fn()]
}))
vi.mock('./useEngineSettings', () => ({ useEngineSettings: () => ({}) }))
vi.mock('./useDisplaySettings', () => ({ useDisplaySettings: () => ({}) }))
vi.mock('./useSubtitleSettings', () => ({ useSubtitleSettings: () => ({}) }))
vi.mock('./useLanguageSettings', () => ({ useLanguageSettings: () => ({}) }))
vi.mock('./useSessionSettings', () => ({ useSessionSettings: () => session }))

describe('resume desktop capture', () => {
  const pipelineStart = vi.fn()
  const pipelineStop = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    pipelineStart.mockResolvedValue({ success: true })
    pipelineStop.mockResolvedValue({})
    session.audio.start.mockResolvedValue(undefined)
    vi.stubGlobal('window', { api: { pipelineStart, pipelineStop } })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('stops the started pipeline when audio capture fails and keeps the session retryable', async () => {
    const error = new AudioCaptureStartError('No system audio was captured.')
    session.audio.start.mockRejectedValueOnce(error)
    await useSettingsState().handleResume()

    expect(session.audio.start).toHaveBeenCalledWith({ captureMode: 'realtime' })
    expect(session.audio.stop).toHaveBeenCalledOnce()
    expect(pipelineStop).toHaveBeenCalledOnce()
    expect(session.setStatus).toHaveBeenLastCalledWith(error.message)
    expect(session.setIsRunning).toHaveBeenLastCalledWith(false)
    expect(session.setIsStarting).toHaveBeenLastCalledWith(false)
    expect(session.setCrashedSession).not.toHaveBeenCalled()
  })

  it('leaves capture and pipeline alone if the pipeline rejects resume', async () => {
    pipelineStart.mockResolvedValueOnce({ error: 'Browser is using the pipeline.' })
    await useSettingsState().handleResume()

    expect(session.audio.start).not.toHaveBeenCalled()
    expect(pipelineStop).not.toHaveBeenCalled()
  })
})
