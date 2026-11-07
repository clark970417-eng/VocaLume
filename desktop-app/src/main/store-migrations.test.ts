import { describe, it, expect, vi } from 'vitest'
import {
  migrateLegacyTranslationEngine,
  migrateLegacyAdaptiveRoutingQualityEngine,
  migrateUnsupportedStt,
  migrateUnsupportedTranslator,
  LEGACY_TRANSLATION_ENGINES,
  LEGACY_ADAPTIVE_QUALITY_ENGINES
} from './store-migrations'
import type { MigratableStore } from './store-migrations'
import { buildEngineConfig, resolveEngineMode } from '../engine-selection'

it('uses a compatible recognizer for a Windows profile previously using Mac Qwen3-ASR', () => {
  const entries = new Map([['sttEngine', 'qwen3-asr'], ['whisperVariant', 'kotoba-v2.0']])
  const store: MigratableStore = { get: key => entries.get(key), set: (key, value) => { entries.set(key, value) } }
  expect(migrateUnsupportedStt(store, 'darwin', 'arm64')).toBe(false)
  expect(migrateUnsupportedStt(store, 'win32', 'x64')).toBe(true)
  expect(entries.get('sttEngine')).toBe('whisper-local')
  expect(entries.get('whisperVariant')).toBe('base')
  expect(migrateUnsupportedStt(store, 'win32', 'x64')).toBe(false)
})

it('preserves offline translation when a Windows profile has the Apple translator', () => {
  const fixture = mockStore('offline-apple')
  expect(migrateUnsupportedTranslator(fixture.store, 'darwin')).toBe(false)
  expect(migrateUnsupportedTranslator(fixture.store, 'win32')).toBe(true)
  expect(fixture.getCurrent()).toBe('offline-hymt15')
  expect(migrateUnsupportedTranslator(fixture.store, 'win32')).toBe(false)
  const keys = { apiKey: 'configured', deeplApiKey: '', geminiApiKey: '', microsoftApiKey: '', microsoftRegion: '' }
  const selected = resolveEngineMode('offline-apple', keys, null, 'win32')
  expect(buildEngineConfig(selected, 'whisper-local', keys)).toEqual({
    mode: 'cascade', sttEngineId: 'whisper-local', translatorEngineId: 'hunyuan-mt-15'
  })
  expect(resolveEngineMode('offline-apple', keys, null, 'darwin')).toBe('offline-apple')
  expect(resolveEngineMode('auto', keys, null, 'win32')).toBe('rotation')
})

/** Build an in-memory mock store seeded with a translationEngine value */
function mockStore(initial: unknown): { store: MigratableStore; getCurrent: () => unknown; setCalls: number } {
  let value: unknown = initial
  let setCalls = 0
  return {
    store: {
      get: (_key) => value,
      set: (_key, next) => {
        value = next
        setCalls++
      }
    },
    getCurrent: () => value,
    get setCalls() { return setCalls }
  }
}

describe('migrateLegacyTranslationEngine (#702)', () => {
  it.each(LEGACY_TRANSLATION_ENGINES)(
    'rewrites legacy ID "%s" to "auto" and logs the migration',
    (legacy) => {
      const fixture = mockStore(legacy)
      const logger = { info: vi.fn() }

      const migrated = migrateLegacyTranslationEngine(fixture.store, logger)

      expect(migrated).toBe(true)
      expect(fixture.getCurrent()).toBe('auto')
      expect(logger.info).toHaveBeenCalledOnce()
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`from "${legacy}" to "auto"`)
      )
    }
  )

  it('leaves supported engine IDs untouched', () => {
    for (const supported of ['auto', 'offline-hymt15', 'offline-hunyuan-mt', 'offline-apple', 'rotation', 'online']) {
      const fixture = mockStore(supported)
      const migrated = migrateLegacyTranslationEngine(fixture.store)
      expect(migrated).toBe(false)
      expect(fixture.getCurrent()).toBe(supported)
    }
  })

  it('does nothing when the stored value is missing or not a string', () => {
    for (const empty of [undefined, null, 0, false, {}]) {
      const fixture = mockStore(empty)
      const migrated = migrateLegacyTranslationEngine(fixture.store)
      expect(migrated).toBe(false)
      expect(fixture.getCurrent()).toBe(empty)
    }
  })

  it('does not call store.set when no migration is needed', () => {
    const fixture = mockStore('offline-hymt15')
    migrateLegacyTranslationEngine(fixture.store)
    expect(fixture.setCalls).toBe(0)
  })

  it('works without a logger', () => {
    const fixture = mockStore('offline-opus')
    expect(() => migrateLegacyTranslationEngine(fixture.store)).not.toThrow()
    expect(fixture.getCurrent()).toBe('auto')
  })
})

describe('migrateLegacyAdaptiveRoutingQualityEngine (#705)', () => {
  it.each(Object.entries(LEGACY_ADAPTIVE_QUALITY_ENGINES))(
    'rewrites legacy ID "%s" to "%s" and logs the migration',
    (legacy, replacement) => {
      const fixture = mockStore(legacy)
      const logger = { info: vi.fn() }

      const migrated = migrateLegacyAdaptiveRoutingQualityEngine(fixture.store, logger)

      expect(migrated).toBe(true)
      expect(fixture.getCurrent()).toBe(replacement)
      expect(logger.info).toHaveBeenCalledOnce()
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`from "${legacy}" to "${replacement}"`)
      )
    }
  )

  it('leaves supported quality engine IDs untouched', () => {
    for (const supported of ['hunyuan-mt']) {
      const fixture = mockStore(supported)
      const migrated = migrateLegacyAdaptiveRoutingQualityEngine(fixture.store)
      expect(migrated).toBe(false)
      expect(fixture.getCurrent()).toBe(supported)
    }
  })

  it('does nothing when the stored value is missing or not a string', () => {
    for (const empty of [undefined, null, 0, false, {}]) {
      const fixture = mockStore(empty)
      const migrated = migrateLegacyAdaptiveRoutingQualityEngine(fixture.store)
      expect(migrated).toBe(false)
      expect(fixture.getCurrent()).toBe(empty)
    }
  })

  it('does not call store.set when no migration is needed', () => {
    const fixture = mockStore('hunyuan-mt')
    migrateLegacyAdaptiveRoutingQualityEngine(fixture.store)
    expect(fixture.setCalls).toBe(0)
  })

  it('works without a logger', () => {
    const fixture = mockStore('plamo')
    expect(() => migrateLegacyAdaptiveRoutingQualityEngine(fixture.store)).not.toThrow()
    expect(fixture.getCurrent()).toBe('hunyuan-mt')
  })
})
