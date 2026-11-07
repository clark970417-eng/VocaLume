import { describe, expect, it, vi } from 'vitest'
import { acquireSystemAudio, isWindowsLoopbackInput, microphoneConstraints } from './captureAcquisition'

function streamWithTracks(audioState: MediaStreamTrackState = 'live', video = false) {
  const audio = { stop: vi.fn(), readyState: audioState }
  const videoTrack = { stop: vi.fn() }
  const stream = {
    getAudioTracks: () => [audio],
    getVideoTracks: () => video ? [videoTrack] : [],
    getTracks: () => [audio],
    removeTrack: vi.fn()
  }
  return { stream: stream as unknown as MediaStream, audio, videoTrack, removeTrack: stream.removeTrack }
}

function displayControl() {
  return { enableLoopbackAudio: vi.fn().mockResolvedValue(undefined), disableLoopbackAudio: vi.fn().mockResolvedValue(undefined) }
}

describe('Windows system audio acquisition', () => {
  it('recognizes dedicated playback inputs without suggesting ordinary microphones or default aliases', () => {
    const endpoint = (label: string, deviceId = 'id', kind: MediaDeviceKind = 'audioinput') => ({ label, deviceId, kind })
    expect(isWindowsLoopbackInput(endpoint('Stereo Mix (Realtek Audio)'))).toBe(true)
    expect(isWindowsLoopbackInput(endpoint('立體聲混音 (Realtek Audio)'))).toBe(true)
    expect(isWindowsLoopbackInput(endpoint('CABLE Output (VB-Audio Virtual Cable)'))).toBe(true)
    expect(isWindowsLoopbackInput(endpoint('VoiceMeeter AUX Output (Virtual Audio)'))).toBe(true)
    expect(isWindowsLoopbackInput(endpoint('Microphone (Virtual Camera)'))).toBe(false)
    expect(isWindowsLoopbackInput(endpoint('Stereo Mix', 'default'))).toBe(false)
    expect(isWindowsLoopbackInput(endpoint('Stereo Mix', 'id', 'audiooutput'))).toBe(false)
  })

  it('uses the selected audio-only input without entering the display path or microphone processing', async () => {
    const { stream } = streamWithTracks()
    const media = { getUserMedia: vi.fn().mockResolvedValue(stream), getDisplayMedia: vi.fn() }
    const display = displayControl()
    expect(await acquireSystemAudio(media, display, 'stereo-mix')).toEqual({ stream, route: 'audio-input' })
    expect(media.getUserMedia).toHaveBeenCalledWith({
      video: false,
      audio: {
        deviceId: { exact: 'stereo-mix' }, channelCount: { ideal: 1 }, sampleRate: { ideal: 16000 },
        echoCancellation: false, noiseSuppression: false, autoGainControl: false
      }
    })
    expect(media.getDisplayMedia).not.toHaveBeenCalled()
    expect(display.enableLoopbackAudio).not.toHaveBeenCalled()
    expect(microphoneConstraints('mic', true).audio).toMatchObject({
      sampleRate: { ideal: 48_000 }, echoCancellation: true, noiseSuppression: false
    })
  })

  it('uses display audio when the selected input is unavailable and stops the display video track', async () => {
    const direct = streamWithTracks('ended')
    const fallback = streamWithTracks('live', true)
    const media = {
      getUserMedia: vi.fn().mockResolvedValue(direct.stream),
      getDisplayMedia: vi.fn().mockResolvedValue(fallback.stream)
    }
    const display = displayControl()
    expect(await acquireSystemAudio(media, display, 'unavailable')).toEqual({ stream: fallback.stream, route: 'display' })
    expect(direct.audio.stop).toHaveBeenCalledOnce()
    expect(media.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true })
    expect(fallback.videoTrack.stop).toHaveBeenCalledOnce()
    expect(fallback.removeTrack).toHaveBeenCalledWith(fallback.videoTrack)
    expect(fallback.audio.stop).not.toHaveBeenCalled()
    expect(display.disableLoopbackAudio).toHaveBeenCalledOnce()
  })

  it('keeps the default display path and cleans up its acquired stream if removing the handler fails', async () => {
    const fallback = streamWithTracks('live', true)
    const media = { getUserMedia: vi.fn(), getDisplayMedia: vi.fn().mockResolvedValue(fallback.stream) }
    const display = displayControl()
    display.disableLoopbackAudio.mockRejectedValue(new Error('Handler cleanup failed'))
    await expect(acquireSystemAudio(media, display, '')).rejects.toThrow('Handler cleanup failed')
    expect(media.getUserMedia).not.toHaveBeenCalled()
    expect(fallback.audio.stop).toHaveBeenCalledOnce()
    expect(fallback.videoTrack.stop).toHaveBeenCalledOnce()
  })
})
