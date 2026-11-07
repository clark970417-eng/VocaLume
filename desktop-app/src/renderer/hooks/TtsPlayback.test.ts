import { expect, it, vi } from 'vitest'
import { TtsPlayback, verifyTtsOutputDevice } from './TtsPlayback'

function setup() {
  const sources: Array<{
    start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: null | (() => void)
  }> = []
  const context = {
    state: 'running', destination: {},
    createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() })),
    createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
    createBufferSource: vi.fn(() => {
      const source = { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null }
      sources.push(source)
      return source
    }),
    setSinkId: vi.fn(async () => {}),
    close: vi.fn(async () => { context.state = 'closed' })
  }
  const make = vi.fn(() => context as unknown as AudioContext)
  return { playback: new TtsPlayback(make, 1000), make, context, sources }
}

const sample = { audio: new Float32Array([.2]), sampleRate: 24000, volume: .8, outputDevice: 'device' }

it('uses one playback graph for nearby cues, replaces the audible source, and closes after idle', async () => {
  vi.useFakeTimers()
  try {
    const { playback, context, sources, make } = setup()
    await playback.play(sample)
    await playback.play(sample)
    expect(make).toHaveBeenCalledOnce()
    expect(context.createGain).toHaveBeenCalledOnce()
    expect(context.setSinkId).toHaveBeenCalledExactlyOnceWith('device')
    expect(sources[0].stop).toHaveBeenCalledOnce()
    expect(sources[1].start).toHaveBeenCalledOnce()
    sources[1].onended?.()
    await vi.advanceTimersByTimeAsync(1000)
    expect(context.close).toHaveBeenCalledOnce()
  } finally {
    vi.useRealTimers()
  }
})

it('does not start audio that was stopped while waiting for the output route', async () => {
  const { playback, context, sources } = setup()
  let routed!: () => void
  context.setSinkId.mockImplementationOnce(() => new Promise(resolve => { routed = resolve }))
  const pending = playback.play(sample)
  await Promise.resolve()
  await playback.stop()
  routed()
  await pending
  expect(context.close).toHaveBeenCalledOnce()
  expect(sources).toHaveLength(0)
})

it('suppresses a cue if an explicit output fails after another device had been used', async () => {
  const { playback, context, sources } = setup()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await playback.play(sample)
    context.setSinkId.mockRejectedValueOnce(new DOMException('Unavailable', 'NotFoundError'))
    await playback.play({ ...sample, outputDevice: 'missing-cable' })
    expect(context.setSinkId.mock.calls).toEqual([['device'], ['missing-cable']])
    expect(sources).toHaveLength(1)
    expect(sources[0].stop).toHaveBeenCalledOnce()
  } finally {
    await playback.stop()
    warn.mockRestore()
  }
})

it('verifies a specific route and closes the probe without rendering audio', async () => {
  const { context, make } = setup()
  await verifyTtsOutputDevice('cable', make)
  expect(context.setSinkId).toHaveBeenCalledExactlyOnceWith('cable')
  expect(context.close).toHaveBeenCalledOnce()
  expect(context.createBufferSource).not.toHaveBeenCalled()
})
