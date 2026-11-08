import { useCallback, useEffect, useRef, useState } from 'react'
import { MicVAD } from '@ricky0123/vad-web'
import { RealtimeChunker } from './realtimeChunker'
import {
  acquireSystemAudio, AudioCaptureStartError, isWindowsLoopbackInput, microphoneConstraints
} from './captureAcquisition'
import { firstCloudFollowUpRetry, getAdaptiveStreamingDelay } from './adaptiveStreamingCadence'
import { CapturePreviewAdmission } from './CapturePreviewAdmission'
import { createAudioLevel, type AudioLevel } from './audioLevel'
import {
  CascadeCapture, CLOUD_PREVIEW_PAUSE_MS, CLOUD_SPEECH_END_MS,
  SPEECH_ONSET_PROBABILITY, SPEECH_END_PROBABILITY
} from './captureSegmentation'
import type { SpeechEvidence } from '../../engines/types'

export interface AudioDevice {
  deviceId: string
  label: string
}

/** Audio source mode: microphone only, system audio (loopback), or both mixed (#501) */
export type AudioSource = 'microphone' | 'system' | 'both'

export { AudioCaptureStartError } from './captureAcquisition'

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
  systemLoopbackInputs: AudioDevice[]
  systemLoopbackDeviceId: string
  setSystemLoopbackDeviceId: (id: string) => void
  audioSource: AudioSource
  setAudioSource: (source: AudioSource) => void
  isCapturing: boolean
  level: AudioLevel
  permissionError: string | null // #48: mic permission error
  hasVirtualAudioDevice: boolean // #125: BlackHole/Soundflower detected
  start: (options?: { captureMode?: CaptureMode; preferPauseBoundaries?: boolean }) => Promise<void>
  stop: () => void
  /** Callback for periodic rolling buffer during speech (streaming mode). Returns unsubscribe function. */
  onStreamingChunk: (callback: (buffer: Float32Array, evidence: SpeechEvidence) => Promise<number>) => () => void
  /** Callback when speech segment ends (streaming mode finalization). Returns unsubscribe function. */
  onSpeechSegmentEnd: (callback: (finalBuffer: Float32Array, evidence: SpeechEvidence) => void) => () => void
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
  const [systemLoopbackInputs, setSystemLoopbackInputs] = useState<AudioDevice[]>([])
  const [systemLoopbackDeviceId, setSystemLoopbackDeviceId] = useState('')
  const [audioSource, setAudioSource] = useState<AudioSource>('microphone')
  const [isCapturing, setIsCapturing] = useState(false)
  const [level] = useState(createAudioLevel)
  const [permissionError, setPermissionError] = useState<string | null>(null) // #48
  const [hasVirtualAudioDevice, setHasVirtualAudioDevice] = useState(false) // #125

  const vadRef = useRef<MicVAD | null>(null)
  const streamingCallbackRef = useRef<((buffer: Float32Array, evidence: SpeechEvidence) => Promise<number>) | null>(null)
  const speechEndCallbackRef = useRef<((finalBuffer: Float32Array, evidence: SpeechEvidence) => void) | null>(null)

  // #721: Realtime cloud streaming mode state
  const cloudCaptureRef = useRef(false)
  const realtimeChunkCallbackRef = useRef<((chunk: Float32Array) => void) | null>(null)
  const speechBoundaryCallbackRef = useRef<((boundary: SpeechBoundary) => void) | null>(null)
  const realtimeChunkerRef = useRef<RealtimeChunker | null>(null)

  // #501: Track loopback and mixer resources for cleanup
  const loopbackStreamRef = useRef<MediaStream | null>(null)
  const microphoneStreamRef = useRef<MediaStream | null>(null)
  const vadAudioContextRef = useRef<AudioContext | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const refreshDevicesRef = useRef<(() => Promise<void>) | null>(null)

  // Cascade previews share the captured window used for final speech.
  const isSpeakingRef = useRef(false)
  const cascadeCaptureRef = useRef<CascadeCapture | null>(null)
  const [previewAdmission] = useState(() => new CapturePreviewAdmission())
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
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 6)}` }))
        setDevices(audioInputs)
        if (navigator.userAgent.includes('Windows')) {
          setSystemLoopbackInputs(allDevices.filter(isWindowsLoopbackInput)
            .map(({ deviceId, label }) => ({ deviceId, label })))
        }
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
    const admission = previewAdmission
    admission.beginUtterance()
    const tick = (): void => {
      if (!isSpeakingRef.current) {
        streamingTimerRef.current = null
        return
      }
      const cascade = cascadeCaptureRef.current
      if (cloudCaptureRef.current && cascade && cascade.quietSamples >= SAMPLE_RATE * CLOUD_PREVIEW_PAUSE_MS / 1000) {
        // A final decode should own the recognizer when this pause ends the
        // utterance. Check again quickly in case the speaker resumes instead.
        streamingTimerRef.current = setTimeout(tick, CLOUD_PREVIEW_PAUSE_MS)
        return
      }
      const elapsed = performance.now() - speechStartedAtRef.current
      const followUp = firstCloudFollowUpRetry(elapsed, admission.remainingMs(),
        effectiveInterval <= 1200 && cloudCaptureRef.current && navigator.userAgent.includes('Windows'))
      if (followUp !== null) {
        streamingTimerRef.current = setTimeout(tick, followUp)
        return
      }
      const send = streamingCallbackRef.current
      if (cascade && send) {
        void admission.submit(
          () => {
            // A small async admission check may finish after a pause or stop.
            if (!isSpeakingRef.current || cascadeCaptureRef.current !== cascade ||
                cloudCaptureRef.current && cascade.quietSamples >= SAMPLE_RATE * CLOUD_PREVIEW_PAUSE_MS / 1000) return null
            return cascade.preview()
          },
          preview => send(preview.audio, preview.evidence),
          () => window.api.getAudioPreviewDelay()
        )
      }
      const delay = getAdaptiveStreamingDelay(effectiveInterval, elapsed, cloudCaptureRef.current)
      streamingTimerRef.current = setTimeout(tick, Math.max(delay, admission.remainingMs()))
    }
    streamingTimerRef.current = setTimeout(tick, getAdaptiveStreamingDelay(effectiveInterval, 0, cloudCaptureRef.current))
  }, [effectiveInterval, previewAdmission])

  const stopStreamingTimer = useCallback(() => {
    previewAdmission.beginUtterance()
    if (streamingTimerRef.current) {
      clearTimeout(streamingTimerRef.current)
      streamingTimerRef.current = null
    }
  }, [previewAdmission])

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
    cascadeCaptureRef.current = null
    previewAdmission.resetSession()
    // #721: drop any buffered realtime remainder
    realtimeChunkerRef.current?.reset()
    realtimeChunkerRef.current = null
  }, [previewAdmission])

  // A selected Windows playback input needs no screen capture.
  const getLoopbackStream = useCallback(async (): Promise<MediaStream> => {
    const distinctInput = audioSource !== 'both' || systemLoopbackDeviceId !== selectedDevice
    const input = navigator.userAgent.includes('Windows') && distinctInput ? systemLoopbackDeviceId : ''
    const { stream, route } = await acquireSystemAudio(navigator.mediaDevices, window.api, input)
    console.log(`[audio-capture] System audio route: ${route}`)
    return stream
  }, [audioSource, selectedDevice, systemLoopbackDeviceId])

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

  const start = useCallback(async (options?: { captureMode?: CaptureMode; preferPauseBoundaries?: boolean }) => {
    if (isCapturing) return

    try {
      const deviceId = selectedDevice
      const currentAudioSource = audioSource
      const captureMode = options?.captureMode ?? 'cascade'
      const preferPauses = options?.preferPauseBoundaries ?? false
      cloudCaptureRef.current = preferPauses
      // #721: build the 100ms chunker only for realtime mode
      realtimeChunkerRef.current = captureMode === 'realtime'
        ? new RealtimeChunker(REALTIME_CHUNK_SAMPLES, (chunk) => realtimeChunkCallbackRef.current?.(chunk))
        : null
      const vadContext = new AudioContext()
      vadAudioContextRef.current = vadContext
      let markFirstFrame: (() => void) | undefined
      const firstFrame = new Promise<void>(resolve => { markFirstFrame = resolve })
      const cascade = captureMode === 'cascade' ? new CascadeCapture(crypto.randomUUID(), preferPauses, SAMPLE_RATE) : null
      cascadeCaptureRef.current = cascade
      let nextMeterUpdate = 0
      const vad = await MicVAD.new({
        audioContext: vadContext,
        getStream: async () => {
          // #501: Get the appropriate stream based on audio source setting
          if (currentAudioSource === 'system') {
            // System audio only — no microphone
            const loopback = await getLoopbackStream()
            loopbackStreamRef.current = loopback
            console.log('[audio-capture] Using system audio loopback')
            return loopback
          }

          // Get microphone stream (used for 'microphone' and 'both' modes)
          // DeepFilterNet3 works at 48 kHz. VAD resamples either microphone format.
          const rawStream = await navigator.mediaDevices.getUserMedia(microphoneConstraints(deviceId, !!processNoiseSuppression))
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
        positiveSpeechThreshold: SPEECH_ONSET_PROBABILITY,
        negativeSpeechThreshold: SPEECH_END_PROBABILITY,
        redemptionMs: preferPauses ? CLOUD_SPEECH_END_MS : 1400,
        minSpeechMs: 250,
        // AudioWorklet runs audio processing off the main thread (replaces deprecated ScriptProcessor)
        processorType: 'AudioWorklet',
        // Serve ONNX model and WASM from public/vad/ (dev) or vad-asset:// protocol (packaged).
        // Dynamic import() cannot read from asar, so packaged app uses a custom protocol
        // that serves from app.asar.unpacked.
        baseAssetPath: window.location.protocol === 'file:' ? 'vad-asset://host/' : '/vad/',
        onnxWASMBasePath: window.location.protocol === 'file:' ? 'vad-asset://host/' : '/vad/',
        onFrameProcessed: (probabilities, frame) => {
          if (vadAudioContextRef.current !== vadContext) return
          markFirstFrame?.()
          markFirstFrame = undefined
          // Limit display updates without changing which audio frames enter the pipeline.
          const now = performance.now()
          if (now >= nextMeterUpdate && frame.length > 0 && level.hasListeners() && !document.hidden) {
            nextMeterUpdate = now + 100
            let sum = 0
            for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
            level.update(Math.round(Math.min(1, Math.sqrt(sum / frame.length) * 5) * 100))
          }

          // #721: In realtime mode, forward every frame as continuous 100ms PCM
          // chunks regardless of speech state — do not gate on VAD or accumulate
          // the cascade rolling buffer. Copy the frame: the VAD reuses the same
          // backing buffer across callbacks, so
          // frames the chunker holds until a full chunk would otherwise be
          // overwritten before they are consumed.
          if (captureMode === 'realtime') {
            realtimeChunkerRef.current?.push(new Float32Array(frame))
            return
          }

          const final = cascade?.push(frame, probabilities.isSpeech)
          if (final) speechEndCallbackRef.current?.(final.audio, final.evidence)
        },
        onSpeechEnd: (audio: Float32Array) => {
          if (vadAudioContextRef.current !== vadContext) return
          // audio is 16kHz Float32Array from VAD
          isSpeakingRef.current = false
          stopStreamingTimer()

          // #721: In realtime mode the stream is never gated by VAD; the segment
          // end is only a turn-boundary hint for the cloud e2e session.
          if (captureMode === 'realtime') {
            speechBoundaryCallbackRef.current?.('end')
            return
          }

          const final = cascade?.end(audio)
          if (final) speechEndCallbackRef.current?.(final.audio, final.evidence)

        },
        onSpeechStart: () => {
          if (vadAudioContextRef.current !== vadContext) return
          isSpeakingRef.current = true

          // #721: realtime mode — forward speech start as a turn-boundary hint only.
          if (captureMode === 'realtime') {
            speechBoundaryCallbackRef.current?.('start')
            return
          }

          cascade?.start()
          speechStartedAtRef.current = performance.now()
          startStreamingTimer()
        },
        onVADMisfire: () => {
          if (vadAudioContextRef.current !== vadContext) return
          isSpeakingRef.current = false
          stopStreamingTimer()
          const reply = cascade?.recoverShortReply()
          if (reply) speechEndCallbackRef.current?.(reply.audio, reply.evidence)
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
      setIsCapturing(false)
      throw err
    }
  }, [selectedDevice, audioSource, isCapturing, startStreamingTimer, stopStreamingTimer, getLoopbackStream, mixStreams, cleanupResources, processNoiseSuppression, level])

  const stop = useCallback(() => {
    stopStreamingTimer()
    if (vadRef.current) {
      void vadRef.current.destroy().catch(err => console.warn('[audio-capture] VAD cleanup error:', err))
      vadRef.current = null
    }
    // #501: Release loopback stream and audio mixer resources
    cleanupResources()
    // #313: Release DeepFilterNet3 resources
    noiseSuppression?.destroy().catch((err) => console.warn('[audio-capture] Noise suppression cleanup error:', err))
    setIsCapturing(false)
    level.update(0)
    console.log('[audio-capture] VAD stopped')
  }, [stopStreamingTimer, noiseSuppression, cleanupResources, level])

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

  const onStreamingChunk = useCallback((callback: (buffer: Float32Array, evidence: SpeechEvidence) => Promise<number>) => {
    streamingCallbackRef.current = callback
    return () => { streamingCallbackRef.current = null }
  }, [])

  const onSpeechSegmentEnd = useCallback((callback: (finalBuffer: Float32Array, evidence: SpeechEvidence) => void) => {
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
    systemLoopbackInputs,
    systemLoopbackDeviceId,
    setSystemLoopbackDeviceId,
    audioSource,
    setAudioSource,
    isCapturing,
    level,
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
