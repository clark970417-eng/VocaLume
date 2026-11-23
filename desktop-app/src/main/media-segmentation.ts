export const OPENING_SEGMENT_SECONDS = 12

/** Take an early first cut only when there is a sustained quiet break. */
export function findOpeningSegmentEnd(samples: Float32Array, sampleRate = 16_000): number | null {
  const end = sampleRate * OPENING_SEGMENT_SECONDS
  if (samples.length < end) return null

  const windowSamples = Math.max(1, Math.floor(sampleRate * 0.02))
  const quietWindowsRequired = 10
  const earlyQuietWindowsRequired = 15
  const quietThreshold = 0.005
  const earlySearchStart = sampleRate * 6
  const searchStart = sampleRate * 8
  let audibleWindows = 0
  let earlyQuietWindows = 0
  let quietWindows = 0
  let boundary: number | null = null
  for (let i = 0; i + windowSamples <= end; i += windowSamples) {
    let energy = 0
    for (let j = i; j < i + windowSamples; j++) energy += Math.abs(samples[j]!)
    const quiet = energy < quietThreshold * windowSamples
    if (!quiet) audibleWindows++
    if (i >= earlySearchStart && i < searchStart) {
      earlyQuietWindows = quiet ? earlyQuietWindows + 1 : 0
      if (earlyQuietWindows >= earlyQuietWindowsRequired && audibleWindows >= earlyQuietWindowsRequired) {
        // Give the recognizer an earlier, shorter opening only when a longer
        // pause makes this cut at least as clear as the normal opening cut.
        return i + windowSamples - 5 * windowSamples
      }
    }
    if (i < searchStart) continue
    quietWindows = quiet ? quietWindows + 1 : 0
    if (audibleWindows >= quietWindowsRequired && quietWindows >= quietWindowsRequired) {
      // Leave at least 100 ms of this quiet break on each side of the cut.
      boundary = i + windowSamples - Math.floor(quietWindowsRequired / 2) * windowSamples
    }
  }
  return boundary
}

/** Reduce long digital padding while leaving half a second at each pause.
 * Only exact zeros qualify; quiet speech and background audio stay intact.
 */
export function compactDigitalSilence(samples: Float32Array, sampleRate = 16_000): Float32Array {
  const keep = Math.ceil(sampleRate / 2)
  const gaps: { start: number; end: number }[] = []
  let removed = 0
  let silenceStart = -1
  for (let i = 0; i <= samples.length; i++) {
    if (i < samples.length && samples[i] === 0) {
      if (silenceStart < 0) silenceStart = i
      continue
    }
    if (silenceStart >= 0 && i - silenceStart >= sampleRate) {
      const start = silenceStart + keep
      gaps.push({ start, end: i })
      removed += i - start
    }
    silenceStart = -1
  }
  if (!removed) return samples
  if (gaps.length === 1 && gaps[0]!.end === samples.length && gaps[0]!.start === keep) {
    return samples.subarray(0, 0)
  }
  const output = new Float32Array(samples.length - removed)
  let read = 0
  let written = 0
  for (const { start, end } of gaps) {
    output.set(samples.subarray(read, start), written)
    written += start - read
    read = end
  }
  output.set(samples.subarray(read), written)
  return output
}

/** Find the lowest-energy 20ms window near the end of a recognition segment. */
export function findQuietSegmentEnd(
  samples: Float32Array,
  sampleRate = 16_000,
  maxSeconds = 24,
  searchSeconds = 4
): number {
  const maximum = Math.min(samples.length, sampleRate * maxSeconds)
  if (maximum < sampleRate * maxSeconds) return maximum
  const windowSamples = Math.max(1, Math.floor(sampleRate * 0.02))
  const searchStart = Math.max(0, maximum - sampleRate * searchSeconds)
  let bestEnd = maximum
  let bestEnergy = Number.POSITIVE_INFINITY
  for (let i = searchStart; i + windowSamples <= maximum; i += windowSamples) {
    let energy = 0
    for (let j = i; j < i + windowSamples; j++) energy += Math.abs(samples[j]!)
    if (energy < bestEnergy) {
      bestEnergy = energy
      bestEnd = i + windowSamples
    }
  }
  return bestEnd
}

const QUIET_AMPLITUDE = 0.005

function meanAmplitude(samples: Float32Array, start: number, end: number): number {
  let energy = 0
  for (let i = start; i < end; i++) energy += Math.abs(samples[i]!)
  return energy / (end - start)
}

/** Prefer a pause with room for speech on both sides of the cut. */
export function chooseMediaCut(samples: Float32Array, sampleRate: number): { end: number; hard: boolean } {
  const max = Math.min(samples.length, sampleRate * 24)
  const frame = Math.max(1, Math.floor(sampleRate * .02))
  let quietFrames = 0
  let pause = 0
  for (let start = Math.max(0, max - sampleRate * 4); start + frame <= max; start += frame) {
    quietFrames = meanAmplitude(samples, start, start + frame) < QUIET_AMPLITUDE ? quietFrames + 1 : 0
    if (quietFrames >= 10) pause = start - frame * 4
  }
  if (pause) return { end: pause, hard: false }
  const end = findQuietSegmentEnd(samples, sampleRate)
  // A true hard cut can need overlap, but retain it only with audible audio
  // before the cut. A digital gap needs no additional recognition context.
  return { end, hard: hasMediaSignal(samples.subarray(Math.max(0, end - Math.round(sampleRate * .16)), end)) }
}

export function hasMediaSignal(samples: Float32Array): boolean {
  return samples.length > 0 && meanAmplitude(samples, 0, samples.length) >= QUIET_AMPLITUDE
}

export function hasAudibleMediaFrame(samples: Float32Array, sampleRate: number): boolean {
  const frame = Math.max(1, Math.floor(sampleRate * .04))
  for (let start = 0; start < samples.length; start += frame) {
    if (meanAmplitude(samples, start, Math.min(start + frame, samples.length)) >= QUIET_AMPLITUDE) return true
  }
  return false
}

export function mediaOverlapPrefix(tail: Float32Array | undefined, next: Float32Array, sampleRate: number): Float32Array | undefined {
  const opening = next.subarray(0, Math.round(sampleRate * .16))
  return tail?.length && opening.length && hasMediaSignal(opening) ? tail : undefined
}

function indexedLetters(text: string): { normalized: string; ends: number[] } {
  let normalized = ''
  const ends: number[] = []
  let end = 0
  for (const character of text) {
    end += character.length
    const part = character.normalize('NFKC').toLowerCase()
    if (!/^[\p{L}\p{N}]+$/u.test(part)) continue
    normalized += part
    for (let i = 0; i < part.length; i++) ends.push(end)
  }
  return { normalized, ends }
}

/** Match exact source speech at a known audio overlap. Preserve short repeats
 * and never fuzzy-match numbers, negation, or a partial Latin word. */
export function stitchMediaText(left: string, right: string): { appended: string; merged: string } | null {
  const a = indexedLetters(left)
  const b = indexedLetters(right)
  const max = Math.min(22, a.normalized.length, b.normalized.length - 1)
  for (let length = max; length >= 5; length--) {
    const prefix = b.normalized.slice(0, length)
    if (!a.normalized.endsWith(prefix) || !/\p{L}/u.test(prefix)) continue
    const rightEnd = b.ends[length - 1]!
    const rightAnchor = right.slice(0, rightEnd)
    if (/\p{N}$/u.test(rightAnchor) && /^\p{N}/u.test(right.slice(rightEnd))) continue
    const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(prefix)
    if (!cjk) {
      const leftBefore = a.ends[a.ends.length - length - 1]
      const leftStart = leftBefore === undefined ? 0 : leftBefore
      if (!/\s/u.test(rightAnchor.trim()) ||
          (leftStart > 0 && /^[\p{L}\p{N}]/u.test(left.slice(leftStart))) ||
          /^[\p{L}\p{N}]/u.test(right.slice(rightEnd))) continue
    }
    const suffix = right.slice(rightEnd).trimStart()
    const appended = suffix.replace(/^[,，、.。!?！？:：;；\s]+/u, '')
    if (!appended) continue
    const leftCore = left.trimEnd()
    const separator = cjk || /^[\p{P}]/u.test(suffix) ? '' : ' '
    return { appended, merged: leftCore + separator + suffix }
  }
  return null
}
