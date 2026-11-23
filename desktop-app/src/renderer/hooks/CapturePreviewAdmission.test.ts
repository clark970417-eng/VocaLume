import { expect, it, vi } from 'vitest'
import { CapturePreviewAdmission } from './CapturePreviewAdmission'

it('packs the first eligible preview immediately and waits for the previous reply', async () => {
  const gate = new CapturePreviewAdmission()
  const pack = vi.fn(() => 'pcm')
  const check = vi.fn(async () => 0)
  let finish!: (delay: number) => void
  const send = vi.fn(() => new Promise<number>(resolve => { finish = resolve }))
  const preview = gate.submit(pack, send, check)
  expect(pack).toHaveBeenCalledOnce()
  expect(send).toHaveBeenCalledExactlyOnceWith('pcm')
  expect(check).not.toHaveBeenCalled()
  await gate.submit(pack, send, check)
  expect(pack).toHaveBeenCalledOnce()
  finish(0)
  await preview
})

it('checks a blocked renderer using only timing metadata before packing again', async () => {
  let now = 0
  const gate = new CapturePreviewAdmission(() => now)
  const pack = vi.fn(() => 'pcm')
  const send = vi.fn(async () => 800).mockResolvedValueOnce(800).mockResolvedValueOnce(0)
  const check = vi.fn(async () => 250).mockResolvedValueOnce(250).mockResolvedValueOnce(0)
  await gate.submit(pack, send, check)
  now = 799
  await gate.submit(pack, send, check)
  expect(pack).toHaveBeenCalledOnce()
  expect(check).not.toHaveBeenCalled()
  now = 800
  await gate.submit(pack, send, check)
  expect(pack).toHaveBeenCalledOnce()
  expect(gate.remainingMs()).toBe(250)
  now = 1050
  await gate.submit(pack, send, check)
  expect(pack).toHaveBeenCalledTimes(2)
  expect(check).toHaveBeenCalledTimes(2)
})

it('ignores stale admission or cooldown results after a new utterance and capture', async () => {
  let now = 0
  const gate = new CapturePreviewAdmission(() => now)
  const pack = vi.fn(() => 'pcm')
  const send = vi.fn(async () => 250)
  let accept!: (delay: number) => void
  const check = () => new Promise<number>(resolve => { accept = resolve })
  await gate.submit(pack, send, check)
  now = 300
  const staleCheck = gate.submit(pack, send, check)
  gate.beginUtterance()
  accept(0)
  await staleCheck
  expect(pack).toHaveBeenCalledOnce()

  let complete!: (delay: number) => void
  const stalePreview = gate.submit(pack, () => new Promise(resolve => { complete = resolve }), check)
  gate.resetSession()
  await gate.submit(pack, async () => 0, check)
  complete(2000)
  await stalePreview
  expect(pack).toHaveBeenCalledTimes(3)
  expect(gate.remainingMs()).toBe(0)
})
