import { expect, it } from 'vitest'
import { FILE_STABILITY_MS, MediaFolderQueue, WATCH_RECONCILE_MS } from './media-folder-watch'

const file = { path: '/video.wav', name: 'video.wav', revision: '1:80:40' }

it('requires two matching observations separated by the stability interval', () => {
  const queue = new MediaFolderQueue()
  expect(queue.scan([file], 0)).toEqual({ ready: undefined, nextCheck: FILE_STABILITY_MS })
  expect(queue.scan([file], 200)).toEqual({ ready: undefined, nextCheck: FILE_STABILITY_MS - 200 })
  const changed = { ...file, revision: '1:100:70' }
  expect(queue.scan([changed], FILE_STABILITY_MS)).toEqual({ ready: undefined, nextCheck: FILE_STABILITY_MS })
  expect(queue.scan([changed], 2 * FILE_STABILITY_MS).ready).toEqual(changed)
})

it('processes each stable revision once and reconciles missed events when idle', () => {
  const queue = new MediaFolderQueue()
  const other = { ...file, path: '/other.wav', name: 'other.wav' }
  queue.scan([file, other], 0)
  expect(queue.scan([file, other], FILE_STABILITY_MS).ready).toEqual(file)
  queue.markAttempted(file)
  expect(queue.scan([file, other], FILE_STABILITY_MS).ready).toEqual(other)
  queue.markAttempted(other)
  expect(queue.scan([file, other], FILE_STABILITY_MS)).toEqual({ ready: undefined, nextCheck: WATCH_RECONCILE_MS })
  queue.scan([other], FILE_STABILITY_MS)
  expect(queue.scan([file, other], WATCH_RECONCILE_MS).ready).toBeUndefined()
  expect(queue.scan([file, other], WATCH_RECONCILE_MS + FILE_STABILITY_MS).ready).toEqual(file)
})
