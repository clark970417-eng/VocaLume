import type { DiarizationResult } from '../types'

type AudioTag = { name: string; prob: number }
const LAUGHTER = /^(?:laughter|giggle|snicker|chuckle, chortle|belly laugh|baby laughter)$/i

/** CED scores are specific to that model. Accept a prominent laugh only. */
export function isAcousticLaughter(tags: readonly AudioTag[]): boolean {
  const strongest = tags[0]
  return !!strongest && LAUGHTER.test(strongest.name) &&
    Number.isFinite(strongest.prob) && strongest.prob >= 0.55
}

/** Maintain anonymous speaker identities within the current caption session. */
export class SpeakerClusters {
  private readonly speakers: Float32Array[] = []

  identify(embedding: Float32Array): DiarizationResult | null {
    const unit = this.normalize(embedding)
    if (!unit) return null

    let best = -Infinity, second = -Infinity, index = -1
    for (const [candidate, speaker] of this.speakers.entries()) {
      if (speaker.length !== unit.length) return null
      let similarity = 0
      for (let i = 0; i < unit.length; i++) similarity += unit[i] * speaker[i]
      if (similarity > best) {
        second = best
        best = similarity
        index = candidate
      } else if (similarity > second) {
        second = similarity
      }
    }
    if (best < 0.42) {
      if (this.speakers.length >= 8) return null
      index = this.speakers.push(unit) - 1
      best = 1
    } else {
      // Suppress ambiguous matches instead of applying another speaker's label.
      if (best < 0.58 || best - second < 0.08) return null
      const speaker = this.speakers[index]
      const updated = this.normalize(speaker.map((value, i) => 0.8 * value + 0.2 * unit[i]))
      if (updated) this.speakers[index] = updated
    }
    return { speakerLabel: `Speaker ${index + 1}`, speakerIndex: index, confidence: Math.min(1, best) }
  }

  private normalize(embedding: Float32Array): Float32Array | null {
    const length = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0))
    return Number.isFinite(length) && length > 1e-8 ? embedding.map(value => value / length) : null
  }
}
