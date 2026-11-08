const SAMPLE_RATE = 16000
/** RMS threshold below which a frame is considered silence for trimming */
const SILENCE_RMS_THRESHOLD = 0.01

/**
 * Trim leading and trailing silence from audio buffer (#361).
 * Uses frame-level RMS analysis to find speech boundaries.
 * Keeps a small padding (160 samples = 10ms at 16kHz) around speech.
 */
export function trimSilence(buffer: Float32Array): Float32Array | null {
  const frameSize = 160 // 10ms at 16kHz
  const padding = 160 // 10ms padding
  let firstSpeechSample = -1
  let lastSpeechSample = -1

  for (let i = 0; i < buffer.length; i += frameSize) {
    const end = Math.min(i + frameSize, buffer.length)
    let sum = 0
    for (let j = i; j < end; j++) {
      sum += buffer[j] * buffer[j]
    }
    const rms = Math.sqrt(sum / (end - i))
    if (rms > SILENCE_RMS_THRESHOLD) {
      if (firstSpeechSample === -1) firstSpeechSample = i
      lastSpeechSample = end
    }
  }

  if (firstSpeechSample === -1) return null // All silence

  const start = Math.max(0, firstSpeechSample - padding)
  const end = Math.min(buffer.length, lastSpeechSample + padding)
  const trimmedLength = end - start

  // Only trim if we save at least 20% of the audio
  if (trimmedLength >= buffer.length * 0.8) return buffer

  if (trimmedLength < SAMPLE_RATE * 0.3) return null // Too short after trimming
  return buffer.subarray(start, end)
}
