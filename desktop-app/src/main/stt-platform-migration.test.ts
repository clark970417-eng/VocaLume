import { expect, it } from 'vitest'
import { migrateUnsupportedStt, type MigratableKey } from './store-migrations'

it.each(['mlx-whisper', 'kotoba-whisper', 'apple-speech-transcriber'])('replaces unsupported %s on Windows, including previously saved defaults', engine => {
  const values = new Map<MigratableKey, string>([['sttEngine', engine], ['whisperVariant', 'kotoba-v2.0']])
  const store = { get: (key: MigratableKey) => values.get(key), set: (key: MigratableKey, value: string) => { values.set(key, value) } }
  expect(migrateUnsupportedStt(store, 'win32', 'x64')).toBe(true)
  expect(values.get('sttEngine')).toBe('whisper-local')
  expect(values.get('whisperVariant')).toBe('base')
  expect(migrateUnsupportedStt(store, 'win32', 'x64')).toBe(false)
})
it('preserves MLX on Apple Silicon', () => {
  const store = { get: () => 'mlx-whisper', set: () => { throw Error('must preserve') } }
  expect(migrateUnsupportedStt(store, 'darwin', 'arm64')).toBe(false)
})
