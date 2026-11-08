import { expect, it, vi } from 'vitest'
import type { STTEngine } from '../engines/types'
import { EngineManager } from './EngineManager'

it('lazily starts the optional engine and retires it only after an active use finishes', async () => {
  const manager = new EngineManager()
  const makeDraft = vi.fn((): STTEngine => ({
    id: 'draft', name: 'draft', isOffline: true, initialize: vi.fn(async () => {}),
    processAudio: vi.fn(async () => null), dispose: vi.fn(async () => {})
  }))
  manager.registerSTT('draft', makeDraft)
  expect(makeDraft).not.toHaveBeenCalled()
  expect(manager.getDraftStt('draft')).toBeNull()
  expect(manager.getDraftStt('draft')).toBeNull()
  await vi.waitFor(() => expect(manager.getDraftStt('draft')).not.toBeNull())
  const draft = manager.getDraftStt('draft')!
  expect(makeDraft).toHaveBeenCalledOnce()

  let finishUse!: () => void
  const inUse = new Promise<void>(resolve => { finishUse = resolve })
  const retiring = manager.releaseOptionalEngines(inUse)
  expect(manager.getDraftStt('draft')).toBeNull()
  expect(draft.dispose).not.toHaveBeenCalled()
  finishUse()
  await retiring
  expect(draft.dispose).toHaveBeenCalledOnce()

  expect(manager.getDraftStt('draft')).toBeNull()
  await vi.waitFor(() => expect(manager.getDraftStt('draft')).not.toBeNull())
  expect(manager.getDraftStt('draft')).not.toBe(draft)
  expect(makeDraft).toHaveBeenCalledTimes(2)
  await manager.disposeEngines()
})

it('does not publish an optional engine that finishes loading after retirement', async () => {
  const manager = new EngineManager()
  let finishInitialization!: () => void
  const initialize = vi.fn(() => new Promise<void>(resolve => { finishInitialization = resolve }))
  const dispose = vi.fn(async () => { finishInitialization() })
  manager.registerSTT('draft', () => ({
    id: 'draft', name: 'draft', isOffline: true, initialize,
    processAudio: vi.fn(async () => null), dispose
  }))
  expect(manager.getDraftStt('draft')).toBeNull()
  await vi.waitFor(() => expect(initialize).toHaveBeenCalledOnce())
  await manager.releaseOptionalEngines()
  expect(dispose).toHaveBeenCalledOnce()
  expect(manager.getDraftStt('draft')).toBeNull()
  await vi.waitFor(() => expect(initialize).toHaveBeenCalledTimes(2))
  await manager.disposeEngines()
})
