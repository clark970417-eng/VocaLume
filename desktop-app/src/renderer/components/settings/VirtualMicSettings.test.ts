import { describe, expect, it } from 'vitest'
import { getVirtualAudioOutputs, getVirtualRecordingLabel, isVirtualAudioDevice } from './VirtualMicSettings'

describe('isVirtualAudioDevice', () => {
  it('detects common virtual microphone output devices', () => {
    expect(isVirtualAudioDevice('BlackHole 2ch')).toBe(true)
    expect(isVirtualAudioDevice('VB-Audio Virtual Cable')).toBe(true)
    expect(isVirtualAudioDevice('Loopback Audio')).toBe(true)
  })

  it('does not route TTS to physical speakers automatically', () => {
    expect(isVirtualAudioDevice('MacBook Air Speakers')).toBe(false)
    expect(isVirtualAudioDevice('AirPods Pro')).toBe(false)
  })
})

const endpoint = (kind: MediaDeviceKind, label: string, deviceId: string, groupId = ''): MediaDeviceInfo =>
  ({ kind, label, deviceId, groupId, toJSON: () => ({}) })

it('selects only stable playback IDs and reports the paired Windows recording name', () => {
  const playback = endpoint('audiooutput', 'CABLE-A Input (VB-Audio Cable A)', 'playback')
  const recording = endpoint('audioinput', 'CABLE-A Output (VB-Audio Cable A)', 'recording')
  const devices = [
    endpoint('audiooutput', 'Default - CABLE-A Input (VB-Audio Cable A)', 'default'),
    endpoint('audiooutput', 'Communications - CABLE-A Input (VB-Audio Cable A)', 'communications'),
    endpoint('audiooutput', 'CABLE Output (VB-Audio Virtual Cable)', 'incorrect-kind'),
    endpoint('audiooutput', 'Speakers (Realtek)', 'speakers'),
    playback, recording
  ]
  expect(getVirtualAudioOutputs(devices, 'win32')).toEqual([playback])
  expect(getVirtualRecordingLabel(playback, devices, 'win32')).toBe(recording.label)
  expect(getVirtualRecordingLabel(playback, [playback], 'win32')).toBe('CABLE-A Output')
})

it('recognizes the 16-channel cable and the unchanged macOS BlackHole route', () => {
  const cable = endpoint('audiooutput', 'CABLE Input 16ch', 'wide')
  const blackHole = endpoint('audiooutput', 'BlackHole 2ch', 'blackhole')
  expect(getVirtualAudioOutputs([cable], 'win32')).toEqual([cable])
  expect(getVirtualRecordingLabel(cable, [], 'win32')).toBe('CABLE Output 16ch')
  expect(getVirtualRecordingLabel(blackHole, [], 'darwin')).toBe(blackHole.label)
})
