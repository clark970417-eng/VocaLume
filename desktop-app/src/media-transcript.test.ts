import { describe, expect, it } from 'vitest'
import { exportMediaTranscript, mergeMediaCue, pageMediaTranscript, type MediaFileCue } from './media-transcript'

const initial: MediaFileCue = {
  jobId: 'file-one', cueId: 2, revision: 0, startSeconds: 18.123, endSeconds: 24.125,
  sourceText: '原文です', translatedText: '', status: 'translation-failed'
}

describe('file transcript rows', () => {
  it('pages only displayed rows and keeps every timestamp and edit in the full export', () => {
    const rows = Array.from({ length: 93 }, (_, index) => ({
      ...initial,
      cueId: index + 1,
      startSeconds: index,
      endSeconds: index + 1,
      sourceText: `原文 ${index + 1}`,
      editedText: index === 85 ? '手動修正' : undefined
    }))
    expect(pageMediaTranscript(rows, '', 0).visible).toHaveLength(40)
    expect(pageMediaTranscript(rows, '', 2)).toMatchObject({ page: 2, pages: 3, start: 80, end: 93 })
    const search = pageMediaTranscript(rows, ' 手動 ', 2)
    expect(search.visible).toEqual([{ row: rows[85], index: 85 }])
    expect(search.page).toBe(0)
    const full = exportMediaTranscript(rows, () => '翻譯失敗')
    expect(full.match(/ --> /gu)).toHaveLength(93)
    expect(full).toContain('原文 86\n手動修正')
  })

  it('keeps a failed cue with its original time and source in the export', () => {
    const rows = mergeMediaCue([], 'file-one', initial)
    expect(exportMediaTranscript(rows, () => '翻譯失敗'))
      .toBe('[00:00:18.123 --> 00:00:24.125]\n翻譯失敗\n原文です')
  })

  it('isolates jobs and replaces older revisions without overwriting a manual edit', () => {
    const rows = [{ ...initial, editedText: '手動修改' }]
    const revision: MediaFileCue = { ...initial, revision: 1, endSeconds: 28, status: 'translated', translatedText: '原文' }
    expect(mergeMediaCue(rows, 'another-job', revision)).toBe(rows)
    const updated = mergeMediaCue(rows, 'file-one', revision)
    expect(updated).toEqual([{ ...revision, editedText: '手動修改' }])
    expect(mergeMediaCue(updated, 'file-one', initial)).toBe(updated)
    expect(exportMediaTranscript(updated, () => '翻譯失敗')).toContain('原文です\n手動修改')
  })
})
