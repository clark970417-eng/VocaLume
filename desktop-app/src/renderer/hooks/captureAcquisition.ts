export class AudioCaptureStartError extends Error {}

type MediaAcquisition = Pick<MediaDevices, 'getDisplayMedia' | 'getUserMedia'>
type DisplayLoopback = {
  enableLoopbackAudio: () => Promise<void>
  disableLoopbackAudio: () => Promise<void>
}

/** Only suggest named Windows loopback inputs. Do not discover them by opening a microphone. */
export function isWindowsLoopbackInput(device: Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>): boolean {
  return device.kind === 'audioinput' && !!device.deviceId && device.deviceId !== 'default' &&
    device.deviceId !== 'communications' &&
    /stereo mix|what (?:u|you) hear|wave out mix|立[體体]聲混音|立体声混音|ステレオ\s*ミキサー|스테레오\s*믹스|cable(?:-[a-z])? output|voicemeeter(?: [\w-]+)* out(?:put)?(?:\b|$)/iu.test(device.label)
}

export function microphoneConstraints(deviceId: string, useExternalSuppression: boolean): MediaStreamConstraints {
  return {
    audio: {
      ...(deviceId && { deviceId: { exact: deviceId } }),
      channelCount: 1,
      sampleRate: { ideal: useExternalSuppression ? 48_000 : 16_000 },
      echoCancellation: true,
      noiseSuppression: !useExternalSuppression
    }
  }
}

function keepLiveAudio(stream: MediaStream): boolean {
  for (const track of stream.getVideoTracks()) {
    track.stop()
    stream.removeTrack(track)
  }
  return stream.getAudioTracks().some(track => track.readyState === 'live')
}

function stopTracks(stream: MediaStream | undefined): void {
  stream?.getTracks().forEach(track => track.stop())
}

/** The direct input already carries playback audio, so microphone processing is inappropriate. */
export async function acquireSystemAudio(
  media: MediaAcquisition,
  display: DisplayLoopback,
  windowsLoopbackInput: string
): Promise<{ stream: MediaStream; route: 'audio-input' | 'display' }> {
  if (windowsLoopbackInput) {
    let input: MediaStream | undefined
    try {
      input = await media.getUserMedia({
        video: false,
        audio: {
          deviceId: { exact: windowsLoopbackInput },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16_000 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })
      if (keepLiveAudio(input)) return { stream: input, route: 'audio-input' }
    } catch {
      // Missing device or denied access can still use the existing display audio path.
    }
    stopTracks(input)
  }

  let stream: MediaStream | undefined
  await display.enableLoopbackAudio()
  try {
    try {
      // Chromium requires video for getDisplayMedia. Release it as soon as audio is acquired.
      stream = await media.getDisplayMedia({ video: true, audio: true })
      if (!keepLiveAudio(stream)) {
        throw new AudioCaptureStartError('No system audio was captured. Check that your system allows sharing audio, then retry.')
      }
      return { stream, route: 'display' }
    } finally {
      await display.disableLoopbackAudio()
    }
  } catch (error) {
    // The caller never receives ownership when acquisition or cleanup fails.
    stopTracks(stream)
    throw error
  }
}
