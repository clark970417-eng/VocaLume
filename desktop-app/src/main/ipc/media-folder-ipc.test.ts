import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { registerMediaFileIpc } from './media-file-ipc'
import type { AppContext } from '../app-context'
import { liveWork } from '../live-work'

const mock = vi.hoisted(() => ({ handle: vi.fn(), choose: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: mock.handle }, dialog: { showOpenDialog: mock.choose } }))
vi.mock('../interface-language', () => ({ getUiLanguageState: () => ({ locale: 'en' }) }))

it('notifies the owning window of real folder changes and rejects a revision changed after the scan', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'vocalume-folder-watch-'))
  const owner = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
  const other = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
  const ctx = { pipeline: null } as AppContext
  mock.choose.mockResolvedValue({ canceled: false, filePaths: [folder] })
  registerMediaFileIpc(ctx)
  const handler = (channel: string) => mock.handle.mock.calls.find(([name]) => name === channel)?.[1]
  const scan = handler('scan-media-folder')
  try {
    expect(await handler('choose-media-folder')({ sender: owner })).toBe(folder)
    const path = join(folder, 'voice.wav')
    await writeFile(path, 'synthetic file')
    await vi.waitFor(() => expect(owner.send).toHaveBeenCalledWith('media-folder-changed'))
    expect(await scan({ sender: other })).toBeNull()
    const { files } = await scan({ sender: owner })
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ path, name: 'voice.wav' })
    await writeFile(path, 'longer synthetic file')
    ctx.pipeline = { running: true } as AppContext['pipeline']
    liveWork(ctx).beginMediaSession()
    await expect(handler('process-media-file')({ sender: owner }, path, 'test', files[0].revision))
      .rejects.toThrow('watched file changed')
    owner.emit('destroyed')
    expect(await scan({ sender: owner })).toBeNull()
  } finally {
    handler('stop-media-folder-watch')({ sender: owner })
    await rm(folder, { force: true, recursive: true })
  }
})
