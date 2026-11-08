import { version } from '@ricky0123/vad-web/package.json'

type Frame = { frame: Float32Array; isSpeech: boolean }
const acceptedSpeechMarker: Frame = { frame: new Float32Array(0), isSpeech: true }

/** MicVAD 0.0.30 accumulates a whole utterance even after the app delivered
 * an eight-second cut. Release its accepted prefix while preserving the
 * speech-frame evidence it uses to distinguish a valid ending from a misfire.
 *
 * Call synchronously from onFrameProcessed for an accepted cut. In this
 * version the library appends the current frame immediately after that callback.
 * The renderer's tail sample count excludes that already delivered frame.
 */
export function releaseAcceptedVadAudio(vad: unknown, packageVersion = version): void {
  if (packageVersion !== '0.0.30') return
  const processor = (vad as { frameProcessor?: { audioBuffer?: Frame[]; minSpeechFrames?: number } } | null)?.frameProcessor
  const frames = processor?.audioBuffer
  const minimum = processor?.minSpeechFrames
  if (!Array.isArray(frames) || typeof minimum !== 'number' || !Number.isSafeInteger(minimum) || minimum < 0) return
  let count = 0
  for (const frame of frames) {
    if (!(frame?.frame instanceof Float32Array) || typeof frame.isSpeech !== 'boolean') return
    if (frame.isSpeech && count < minimum) count++
  }
  frames.length = 0
  while (count-- > 0) frames.push(acceptedSpeechMarker)
}
