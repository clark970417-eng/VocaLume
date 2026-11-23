export interface MediaFileCue {
  jobId: string
  cueId: number
  revision: number
  startSeconds: number
  endSeconds: number
  sourceText: string
  translatedText: string
  status: 'translated' | 'translation-failed' | 'unrecognized'
}

export type MediaTranscriptRow = MediaFileCue & { editedText?: string }

const FILE_TRANSCRIPT_PAGE_SIZE = 40

export function pageMediaTranscript(rows: readonly MediaTranscriptRow[], query: string, requestedPage: number) {
  const search = query.trim().toLocaleLowerCase()
  const matching = search ? rows.flatMap((row, index) =>
    [row.sourceText, row.editedText ?? row.translatedText].some(text => text.toLocaleLowerCase().includes(search))
      ? [{ row, index }] : []) : null
  const total = matching?.length ?? rows.length
  const pages = Math.max(1, Math.ceil(total / FILE_TRANSCRIPT_PAGE_SIZE))
  const page = Math.min(pages - 1, Math.max(0, requestedPage))
  const start = page * FILE_TRANSCRIPT_PAGE_SIZE
  const end = Math.min(total, start + FILE_TRANSCRIPT_PAGE_SIZE)
  const visible = matching?.slice(start, end) ?? rows.slice(start, end).map((row, index) => ({ row, index: start + index }))
  return { page, pages, total, start, end, visible }
}

export function mergeMediaCue(
  rows: MediaTranscriptRow[], activeJob: string | null, cue: MediaFileCue
): MediaTranscriptRow[] {
  if (activeJob !== cue.jobId) return rows
  const index = rows.findIndex(row => row.jobId === cue.jobId && row.cueId === cue.cueId)
  if (index < 0) return [...rows, cue].sort((a, b) => a.cueId - b.cueId)
  const prior = rows[index]!
  if (prior.revision >= cue.revision) return rows
  return rows.map((row, i) => i === index ? { ...cue, editedText: prior.editedText } : row)
}

export function formatCueTime(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000)
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor(ms / 60_000) % 60
  const wholeSeconds = Math.floor(ms / 1000) % 60
  return [hours, minutes, wholeSeconds].map(part => String(part).padStart(2, '0')).join(':') +
    '.' + String(ms % 1000).padStart(3, '0')
}

export function exportMediaTranscript(
  rows: readonly MediaTranscriptRow[], statusLabel: (status: MediaFileCue['status']) => string
): string {
  return rows.map(row => [
    `[${formatCueTime(row.startSeconds)} --> ${formatCueTime(row.endSeconds)}]`,
    row.status === 'translated' ? '' : statusLabel(row.status),
    row.sourceText,
    row.editedText ?? row.translatedText
  ].filter(Boolean).join('\n')).join('\n\n')
}
