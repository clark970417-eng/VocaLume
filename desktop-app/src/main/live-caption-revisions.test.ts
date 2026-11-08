import { describe, expect, it } from 'vitest'
import { LiveCaptionRevisions } from './live-caption-revisions'
import type { TranslationResult } from '../engines/types'

const cue = (timestamp: number, sourceText = '桜を見ました'): TranslationResult => ({
  timestamp, sourceText, translatedText: '看到了櫻花', sourceLanguage: 'ja', targetLanguage: 'zh',
  speakerLabel: 'Speaker 1', speakerIndex: 0
})
const revision = (timestamp: number) => ({
  ...cue(timestamp, '桜を見ました。'), translatedText: '看到櫻花了。', captionRevision: 1
})

describe('caption revision delivery', () => {
  it('allows one visible update for the same cue and preserves its identity', () => {
    const delivery = new LiveCaptionRevisions()
    delivery.record(cue(11))
    expect(delivery.correct(revision(11))).toMatchObject({
      visible: true, result: { timestamp: 11, captionRevision: 1, translatedText: '看到櫻花了。', speakerIndex: 0 }
    })
    expect(delivery.correct(revision(11))).toBeUndefined()
  })

  it('keeps old revisions in history without replacing a newer final or a provisional caption', () => {
    const delivery = new LiveCaptionRevisions()
    delivery.record(cue(11))
    delivery.record(cue(12))
    expect(delivery.correct(revision(11))?.visible).toBe(false)
    delivery.provisional(cue(13, '次の話です'))
    expect(delivery.correct(revision(12))?.visible).toBe(false)
    delivery.clear()
    expect(delivery.correct(revision(12))).toBeUndefined()
  })
})
