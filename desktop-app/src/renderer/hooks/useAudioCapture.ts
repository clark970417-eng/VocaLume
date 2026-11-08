import { useCallback, useEffect, useRef, useState } from 'react'
import { MicVAD } from '@ricky0123/vad-web'
import { RealtimeChunker } from './realtimeChunker'
import { getAdaptiveStreamingDelay } from './adaptiveStreamingCadence'
import { CascadeCaptureBuffer, CAPTURE_CONTINUATION_THRESHOLD, CAPTURE_CUT_SAMPLES, CAPTURE_ONSET_THRESHOLD, PRE_SPEECH_PAD_MS } from './cascadeCaptureBuffer'
import { releaseAcceptedVadAudio } from './vadAcceptedAudio'
import { createInputLevel, type InputLevel } from './input-level'
import type { CaptureSpeechEvidence } from '../../preload/capture-speech-evidence'
type CaptureDelivery = (buffer: Float32Array, evidence?: CaptureSpeechEvidence) => void

export interface AudioDevice {
  deviceId: string
  label: string
}

/** Audio source mode: microphone only, system audio (loopback), or both mixed (#501) */
export type AudioSource = 'microphone' | 'system' | 'both'

export class AudioCaptureStartError extends Error {}

/**
 * Audio delivery mode (#721):
 * - 'cascade': VAD-gated 800ms rolling-buffer resend (STT → translator pipeline)
 * - 'realtime': continuous ~100ms PCM chunks for cloud e2e streaming; VAD is
 *   demoted to a turn-boundary hint and does not gate the stream.
 */
export type CaptureMode = 'cascade' | 'realtime'

/** Speech turn boundary hint emitted by VAD in realtime mode (#721) */
export type SpeechBoundary = 'start' | 'end'

export interface UseAudioCaptureReturn {
  devices: AudioDevice[]
  selectedDevice: string
  setSelectedDevice: (id: string) => void
  audioSource: AudioSource
  setAudioSource: (source: AudioSource) => void
  isCapturing: boolean
  inputLevel: InputLevel
  permissionError: string | null // #48: mic permission error
  hasVirtualAudioDevice: boolean // #125: BlackHole/Soundflower detected
  start: (options?: { captureMode?: CaptureMode }) => Promise<void>
  stop: () => void
  /** Callback for VAD-detected complete speech segments (legacy mode). Returns unsubscribe function. */
  /** Callback for periodic rolling buffer during speech (streaming mode). Returns unsubscribe function. */
  onStreamingChunk: (callback: CaptureDelivery, canSend: () => boolean) => () => void
  /** Callback when speech segment ends (streaming mode finalization). Returns unsubscribe function. */
  onSpeechSegmentEnd: (callback: CaptureDelivery) => () => void
  /** Callback for continuous ~100ms PCM chunks in realtime mode (#721). Returns unsubscribe function. */
  onRealtimeChunk: (callback: (chunk: Float32Array) => void) => () => void
  /** Callback for VAD turn-boundary hints in realtime mode (#721). Returns unsubscribe function. */
  onSpeechBoundary: (callback: (boundary: SpeechBoundary) => void) => () => void
}

/** Optional noise suppression preprocessor injected from the parent component */
export interface NoiseSuppressionProcessor {
  processStream: (stream: MediaStream) => Promise<MediaStream>
  destroy: () => Promise<void>
}

const DEFAULT_STREAMING_INTERVAL_MS = 800
const SAMPLE_RATE = 16000
/** Fixed PCM chunk size for realtime cloud streaming: 100ms at 16kHz (#721) */
const REALTIME_CHUNK_SAMPLES = Math.floor(SAMPLE_RATE * 0.1)
const AUDIO_START_TIMEOUT_MESSAGES: Record<AudioSource, string> = {
  microphone: 'Microphone input did not start. Check the selected device and microphone access, then retry.',
  system: 'System audio did not start. Check that system audio capture is available and allowed, then retry.',
  both: 'Mixed audio did not start. Check microphone access and system audio capture, then retry.'
}

export function useAudioCapture(noiseSuppression?: NoiseSuppressionProcessor, streamingIntervalMs?: number): UseAudioCaptureReturn {
  const effectiveInterval = streamingIntervalMs != null
    ? Math.max(500, Math.min(3000, streamingIntervalMs))
    : DEFAULT_STREAMING_INTERVAL_MS
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [audioSource, setAudioSource] = useState<AudioSource>('microphone')
  const [isCapturing, setIsCapturing] = useState(false)
  const [inputLevel] = useState(createInputLevel)
  const [permissionError, setPermissionError] = useState<string | null>(null) // #48
  const [hasVirtualAudioDevice, setHasVirtualAudioDevice] = useState(false) // #125

  const vadRef = useRef<MicVAD | null>(null)
  const streamingCallbackRef = useRef<{ send: CaptureDelivery; canSend: () => boolean } | null>(null)
  const speechEndCallbackRef = useRef<CaptureDelivery | null>(null)

  // #721: Realtime cloud streaming mode state
  const captureModeRef = useRef<CaptureMode>('cascade')
  const realtimeChunkCallbackRef = useRef<((chunk: Float32Array) => void) | null>(null)
  const speechBoundaryCallbackRef = useRef<((boundary: SpeechBoundary) => void) | null>(null)
  const realtimeChunkerRef = useRef<RealtimeChunker | null>(null)

  // #501: Track loopback and mixer resources for cleanup
  const loopbackStreamRef = useRef<MediaStream | null>(null)
  const microphoneStreamRef = useRef<MediaStream | null>(null)
  const vadAudioContextRef = useRef<AudioContext | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const refreshDevicesRef = useRef<(() => Promise<void>) | null>(null)

  const isSpeakingRef = useRef(false)
  const cascadeBufferRef = useRef<CascadeCaptureBuffer | null>(null)
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechStartedAtRef = useRef(0)

  // Enumerate audio input devices
  useEffect(() => {
    let disposed = false
    const enumerate = async (): Promise<void> => {
      try {
        // Discovery must not open a microphone on mount. The actual Start
        // action requests access; browser-only captions need no desktop mic.
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        if (disposed) return
        const audioInputs = allDevices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label }))
        setDevices(audioInputs)
        // #125/#243: Detect virtual audio devices (macOS: BlackHole/Soundflower, Windows: Stereo Mix/VB-Audio)
        const virtualKeywords = ['blackhole', 'soundflower', 'loopback', 'virtual', 'stereo mix', 'vb-audio', 'voicemeeter']
        const hasVirtual = audioInputs.some((d) =>
          virtualKeywords.some((kw) => d.label.toLowerCase().includes(kw))
        )
        setHasVirtualAudioDevice(hasVirtual)
        if (audioInputs.length > 0) setSelectedDevice(current => current || audioInputs[0].deviceId)
      } catch (err) {
        if (disposed) return
        console.error('Failed to enumerate audio devices:', err)
        // #48: surface permission errors to UI with specific messages
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('NotAllowedError') || message.includes('Permission')) {
          // Platform-specific permission guidance
          const permissionHint = navigator.userAgent.includes('Windows')
            ? 'Please grant permission in Windows Settings > Privacy > Microphone.'
            : 'Please grant permission in System Settings > Privacy & Security > Microphone.'
          setPermissionError(`Microphone access denied. ${permissionHint}`)
        } else if (message.includes('NotFoundError') || message.includes('DevicesNotFoundError')) {
          setPermissionError('No microphone detected. Please connect a microphone and restart.')
        } else if (message.includes('NotReadableError') || message.includes('TrackStartError')) {
          setPermissionError('Microphone is in use by another application. Please close the other app and try again.')
        } else {
          setPermissionError(`Microphone error: ${message}`)
        }
      }
    }
    refreshDevicesRef.current = enumerate
    void enumerate()
    navigator.mediaDevices.addEventListener('devicechange', enumerate)
    return () => {
      disposed = true
      refreshDevicesRef.current = null
      navigator.mediaDevices.removeEventListener('devicechange', enumerate)
    }
  }, [])

  const startStreamingTimer = useCallback(() => {
    if (streamingTimerRef.current) return
    const tick = (): void => {
      if (!isSpeakingRef.current) {
        streamingTimerRef.current = null
        return
      }
      const callback = streamingCallbackRef.current
      if (callback?.canSend()) {
        const chunk = cascadeBufferRef.current?.preview()
        if (chunk) callback.send(chunk.audio, chunk.evidence)
      }
      const elapsed = performance.now() - speechStartedAtRef.current
      streamingTimerRef.current = setTimeout(tick, getAdaptiveStreamingDelay(effectiveInterval, elapsed))
    }
    streamingTimerRef.current = setTimeout(tick, getAdaptiveStreamingDelay(effectiveInterval, 0))
  }, [effectiveInterval])

  const stopStreamingTimer = useCallback(() => {
    if (streamingTimerRef.current) {
      clearTimeout(streamingTimerRef.current)
      streamingTimerRef.current = null
    }
  }, [])

  // Consolidated cleanup for loopback stream, AudioContext, and rolling buffer refs
  const cleanupResources = useCallback(() => {
    // Keep ownership of the original mic even if noise suppression or VAD
    // setup fails before MicVAD can own/destroy its returned stream.
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((t) => t.stop())
      microphoneStreamRef.current = null
    }
    if (loopbackStreamRef.current) {
      loopbackStreamRef.current.getTracks().forEach((t) => t.stop())
      loopbackStreamRef.current = null
    }
    const vadContext = vadAudioContextRef.current
    vadAudioContextRef.current = null
    if (vadContext && vadContext.state !== 'closed') {
      void vadContext.close().catch(err => console.warn('[audio-capture] VAD AudioContext close error:', err))
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch((err) => console.warn('[audio-capture] AudioContext close error:', err))
      audioContextRef.current = null
    }
    isSpeakingRef.current = false
    cascadeBufferRef.current = null
    // #721: drop any buffered realtime remainder
    realtimeChunkerRef.current?.reset()
    realtimeChunkerRef.current = null
  }, [])

  // #501: Acquire system audio loopback stream via electron-audio-loopback
  const getLoopbackStream = useCallback(async (): Promise<MediaStream> => {
    // Enable loopback audio in the main process (registers desktopCapturer handler)
    await window.api.enableLoopbackAudio()
    try {
      // getDisplayMedia captures system audio; video track is required by the API
      // but we discard it immediately to avoid wasting resources
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })
      // Remove video tracks — only audio is needed
      for (const track of stream.getVideoTracks()) {
        track.stop()
        stream.removeTrack(track)
      }
      if (!stream.getAudioTracks().some(track => track.readyState === 'live')) {
        stream.getTracks().forEach(track => track.stop())
        throw new AudioCaptureStartError('No system audio was captured. Check that your system allows sharing audio, then retry.')
      }
      return stream
    } finally {
      // Disable loopback capture handler after stream is acquired
      await window.api.disableLoopbackAudio()
    }
  }, [])

  // #501: Mix two MediaStreams into one using Web Audio API
  const mixStreams = useCallback((micStream: MediaStream, loopbackStream: MediaStream): MediaStream => {
    const ctx = new AudioContext({ sampleRate: 16000 })
    audioContextRef.current = ctx
    const dest = ctx.createMediaStreamDestination()

    const micSource = ctx.createMediaStreamSource(micStream)
    const loopbackSource = ctx.createMediaStreamSource(loopbackStream)

    micSource.connect(dest)
    loopbackSource.connect(dest)

    return dest.stream
  }, [])

  const processNoiseSuppression = noiseSuppression?.processStream
  const destroyNoiseSuppression = noiseSuppression?.destroy

  const start = useCallback(async (options?: { captureMode?: CaptureMode }) => {
    if (isCapturing) return

    try {
      const deviceId = selectedDevice
      const currentAudioSource = audioSource
      const captureMode = options?.captureMode ?? 'cascade'
      captureModeRef.current = captureMode
      const cascadeBuffer = captureMode === 'cascade' ? new CascadeCaptureBuffer() : null
      cascadeBufferRef.current = cascadeBuffer
      // #721: build the 100ms chunker only for realtime mode
      realtimeChunkerRef.current = captureMode === 'realtime'
        ? new RealtimeChunker(REALTIME_CHUNK_SAMPLES, (chunk) => realtimeChunkCallbackRef.current?.(chunk))
        : null
      const vadContext = new AudioContext()
      vadAudioContextRef.current = vadContext
      let markFirstFrame: (() => void) | undefined
      const firstFrame = new Promise<void>(resolve => { markFirstFrame = resolve })
      let realtimeAcceptedSamples = 0
      let nextMeterUpdate = 0
      const vad = await MicVAD.new({
        model: 'legacy',
        audioContext: vadContext,
        getStream: async () => {
          // #313: Request 48 kHz when DeepFilterNet3 is active (it requires 48 kHz);
          // VAD resamples internally to 16 kHz regardless.
          const idealSampleRate = processNoiseSuppression ? 48000 : 16000

          // #501: Get the appropriate stream based on audio source setting
          if (currentAudioSource === 'system') {
            // System audio only — no microphone
            const loopback = await getLoopbackStream()
            loopbackStreamRef.current = loopback
            console.log('[audio-capture] Using system audio loopback')
            return loopback
          }

          // Get microphone stream (used for 'microphone' and 'both' modes)
          const rawStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: deviceId ? { exact: deviceId } : undefined,
              channelCount: 1,
              sampleRate: { ideal: idealSampleRate },
              echoCancellation: true,
              noiseSuppression: !processNoiseSuppression // disable browser NS when DeepFilterNet3 is active
            }
          })
          microphoneStreamRef.current = rawStream
          void refreshDevicesRef.current?.()

          // #313: Apply DeepFilterNet3 noise suppression before VAD
          const micStream = processNoiseSuppression
            ? await processNoiseSuppression(rawStream)
            : rawStream

          if (currentAudioSource === 'both') {
            // #501: Mix microphone + system audio loopback
            const loopback = await getLoopbackStream()
            loopbackStreamRef.current = loopback
            console.log('[audio-capture] Using mixed microphone + system audio')
            return mixStreams(micStream, loopback)
          }

          // Microphone only (default)
          return micStream
        },
        // Override with more sensitive thresholds for real-time translation
        positiveSpeechThreshold: CAPTURE_ONSET_THRESHOLD,
        negativeSpeechThreshold: CAPTURE_CONTINUATION_THRESHOLD,
        preSpeechPadMs: PRE_SPEECH_PAD_MS,
        redemptionMs: 1400,
        minSpeechMs: 250,
        // AudioWorklet runs audio processing off the main thread (replaces deprecated ScriptProcessor)
        processorType: 'AudioWorklet',
        // Serve ONNX model and WASM from public/vad/ (dev) or vad-asset:// protocol (packaged).
        // Dynamic import() cannot read from asar, so packaged app uses a custom protocol
        // that serves from app.asar.unpacked.
        baseAssetPath: window.location.protocol === 'file:' ? 'vad-asset://host/' : '/vad/',
        onnxWASMBasePath: window.location.protocol === 'file:' ? 'vad-asset://host/' : '/vad/',
        onFrameProcessed: (probs, frame) => {
          markFirstFrame?.()
          markFirstFrame = undefined
          // Limit display updates without changing which audio frames enter the pipeline.
          const now = performance.now()
          if (inputLevel.needsSample && now >= nextMeterUpdate && frame.length > 0) {
            nextMeterUpdate = now + 100
            inputLevel.measure(frame)
          }

          // #721: In realtime mode, forward every frame as continuous 100ms PCM
          // chunks regardless of speech state — the chunker copies each sample
          // into its own storage and the VAD only provides boundary hints.
          if (captureModeRef.current === 'realtime') {
            realtimeChunkerRef.current?.push(frame)
            if (isSpeakingRef.current) {
              realtimeAcceptedSamples += frame.length
              if (realtimeAcceptedSamples >= CAPTURE_CUT_SAMPLES) {
                releaseAcceptedVadAudio(vadRef.current)
                realtimeAcceptedSamples = 0
              }
            }
            return
          }

          if (cascadeBuffer?.push(frame, isSpeakingRef.current, probs.isSpeech)) {
            const send = speechEndCallbackRef.current
            const segment = cascadeBuffer.takeCut()
            if (send) {
              send(segment.audio, segment.evidence)
              releaseAcceptedVadAudio(vadRef.current)
            }
          }
        },
        onSpeechEnd: (audio: Float32Array) => {
          // audio is 16kHz Float32Array from VAD
          isSpeakingRef.current = false
          stopStreamingTimer()

          // #721: In realtime mode the stream is never gated by VAD; the segment
          // end is only a turn-boundary hint for the cloud e2e session.
          if (captureModeRef.current === 'realtime') {
            speechBoundaryCallbackRef.current?.('end')
            return
          }

          const finalAudio = cascadeBuffer?.finish(audio)
          if (finalAudio) speechEndCallbackRef.current?.(finalAudio.audio, finalAudio.evidence)
        },
        onSpeechStart: () => {
          isSpeakingRef.current = true

          // #721: realtime mode — forward speech start as a turn-boundary hint only.
          if (captureModeRef.current === 'realtime') {
            realtimeAcceptedSamples = 0
            speechBoundaryCallbackRef.current?.('start')
            return
          }

          cascadeBuffer?.startSpeech()
          speechStartedAtRef.current = performance.now()
          startStreamingTimer()
        },
        onVADMisfire: () => {
          isSpeakingRef.current = false
          stopStreamingTimer()
          cascadeBuffer?.clear()
        }
      })

      vadRef.current = vad
      await vad.start()
      let frameTimeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.all([vadContext.resume(), firstFrame]),
          new Promise<never>((_, reject) => {
            frameTimeout = setTimeout(() => {
              reject(new AudioCaptureStartError(AUDIO_START_TIMEOUT_MESSAGES[currentAudioSource]))
            }, 5000)
          })
        ])
      } finally {
        clearTimeout(frameTimeout)
      }
      setIsCapturing(true)
      console.log(`[audio-capture] VAD started (${captureMode} mode)`)
    } catch (err) {
      // #381: Clean up streaming timer and VAD if start fails partway through
      console.error('[audio-capture] Failed to start:', err)
      stopStreamingTimer()
      if (vadRef.current) {
        void vadRef.current.destroy().catch(err => console.warn('[audio-capture] VAD cleanup error:', err))
        vadRef.current = null
      }
      // #501: Clean up loopback resources on failed start
      cleanupResources()
      await destroyNoiseSuppression?.().catch(error => console.warn('[audio-capture] Noise suppression cleanup error:', error))
      setIsCapturing(false)
      throw err
    }
  }, [selectedDevice, audioSource, isCapturing, startStreamingTimer, stopStreamingTimer, getLoopbackStream, mixStreams, cleanupResources, processNoiseSuppression, destroyNoiseSuppression, inputLevel])

  const stop = useCallback(() => {
    stopStreamingTimer()
    if (vadRef.current) {
      void vadRef.current.destroy().catch(err => console.warn('[audio-capture] VAD cleanup error:', err))
      vadRef.current = null
    }
    // #501: Release loopback stream and audio mixer resources
    cleanupResources()
    // #313: Release DeepFilterNet3 resources
    void destroyNoiseSuppression?.().catch(error => console.warn('[audio-capture] Noise suppression cleanup error:', error))
    setIsCapturing(false)
    inputLevel.reset()
    console.log('[audio-capture] VAD stopped')
  }, [stopStreamingTimer, destroyNoiseSuppression, cleanupResources, inputLevel])

  // #443: Safety net — clear streaming timer, VAD, and loopback on unmount if stop() was not called
  useEffect(() => {
    return () => {
      if (streamingTimerRef.current) {
        clearTimeout(streamingTimerRef.current)
        streamingTimerRef.current = null
      }
      if (vadRef.current) {
        void vadRef.current.destroy().catch(err => console.warn('[audio-capture] VAD cleanup error:', err))
        vadRef.current = null
      }
      // #501: Release loopback resources on unmount
      cleanupResources()
    }
  }, [cleanupResources])

  const onStreamingChunk = useCallback((callback: CaptureDelivery, canSend: () => boolean) => {
    streamingCallbackRef.current = { send: callback, canSend }
    return () => { streamingCallbackRef.current = null }
  }, [])

  const onSpeechSegmentEnd = useCallback((callback: CaptureDelivery) => {
    speechEndCallbackRef.current = callback
    return () => { speechEndCallbackRef.current = null }
  }, [])

  const onRealtimeChunk = useCallback((callback: (chunk: Float32Array) => void) => {
    realtimeChunkCallbackRef.current = callback
    return () => { realtimeChunkCallbackRef.current = null }
  }, [])

  const onSpeechBoundary = useCallback((callback: (boundary: SpeechBoundary) => void) => {
    speechBoundaryCallbackRef.current = callback
    return () => { speechBoundaryCallbackRef.current = null }
  }, [])

  return {
    devices,
    selectedDevice,
    setSelectedDevice,
    audioSource,
    setAudioSource,
    isCapturing,
    inputLevel,
    permissionError,
    hasVirtualAudioDevice,
    start,
    stop,
    onStreamingChunk,
    onSpeechSegmentEnd,
    onRealtimeChunk,
    onSpeechBoundary
  }
}
