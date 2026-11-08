import { ipcMain } from 'electron'
import { ALL_LANGUAGES, type Language } from '../../engines/types'
import { HunyuanMT15Translator } from '../../engines/translator/HunyuanMT15Translator'
import { mergeGlossaries } from '../../engines/translator/glossary-manager'
import { phraseTranslation, splitTranslationText } from '../../../../extension/translation-policy.mjs'
import { selectDraftTerminology } from '../draft-glossary'
import { translateWrittenDraft } from '../draft-fidelity'
import { store } from '../store'
import type { AppContext } from '../app-context'
import { LiveWorkPreempted, liveWork } from '../live-work'

// Bound each inference so long pastes fit the local model's context window.
const MAX_INPUT_LENGTH = 3000
const MAX_CHUNK_LENGTH = 400
const MAX_LIVE_PREEMPTION_RETRIES = 2

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && ALL_LANGUAGES.includes(value as Language)
}

export function registerTextTranslationIpc(ctx: AppContext): void {
  let translating = false
  ipcMain.handle('translate-text', async (_event, input: unknown, from: unknown, to: unknown) => {
    if (typeof input !== 'string' || !input.trim() || input.length > MAX_INPUT_LENGTH) throw new Error('Invalid text length')
    if (!isLanguage(from) || !isLanguage(to) || from === to) throw new Error('Invalid translation languages')
    if (translating) throw new Error('A text translation is already running')

    const source = input.trim()
    const direction = `${from}-${to}`
    const customTerms = mergeGlossaries(store.get('glossaryTerms'), store.get('orgGlossaryTerms'))
    if (!customTerms.some(term => term.source && source.includes(term.source))) {
      const phrase = phraseTranslation(source, direction)
      if (phrase !== undefined) return phrase
    }

    translating = true
    let ownedTranslator: HunyuanMT15Translator | undefined
    let ownedTranslatorReady = false
    let remainingRetries = MAX_LIVE_PREEMPTION_RETRIES
    try {
      const work = liveWork(ctx)
      const inferChunk = (chunk: string): Promise<string | null> => {
        return work.run('background', async signal => {
          const pipeline = ctx.pipeline
          const liveTranslator = pipeline?.active ? pipeline.getTranslatorForBackgroundText() : null
          if (pipeline?.active && !liveTranslator) {
            throw new Error('Stop live translation to use text translation with these settings.')
          }
          const translator = liveTranslator ?? ownedTranslator
          if (!translator) return null
          signal.throwIfAborted()
          if (!liveTranslator && !ownedTranslatorReady) {
            await translator.initialize()
            ownedTranslatorReady = true
          }
          signal.throwIfAborted()
          if (direction !== 'zh-ja') {
            return translator.translate(chunk, from, to, { previousSegments: [], glossary: customTerms, signal })
          }
          const glossary = mergeGlossaries(selectDraftTerminology(chunk), customTerms)
          const result = await translateWrittenDraft(chunk, (text, draftSignal) =>
            translator.translate(text, from, to, { previousSegments: [], glossary, writingStyle: 'general', signal: draftSignal ?? signal }), signal)
          return result.text
        })
      }

      const translateChunk = async (chunk: string): Promise<string> => {
        while (true) {
          try {
            const result = await inferChunk(chunk)
            if (result !== null) return result
          } catch (error) {
            if (!(error instanceof LiveWorkPreempted) || remainingRetries === 0) throw error
            remainingRetries--
            continue // Rejoin at background priority so the waiting caption runs first.
          }
          ownedTranslator = new HunyuanMT15Translator({
            kvCacheQuant: store.get('slmKvCacheQuant'),
            speculativeDecoding: store.get('slmSpeculativeDecoding')
          })
          // A first-time download must not keep live capture waiting in this queue.
          await ownedTranslator.downloadModel()
        }
      }
      if (source.length <= MAX_CHUNK_LENGTH) return await translateChunk(source)

      const lines = []
      for (const line of source.split(/\r\n|\r|\n/)) {
        const chunks = []
        for (const chunk of splitTranslationText(line, MAX_CHUNK_LENGTH)) chunks.push(await translateChunk(chunk))
        lines.push(chunks.join(to === 'ja' || to === 'zh' ? '' : ' '))
      }
      return lines.join('\n')
    } finally {
      try {
        await ownedTranslator?.dispose()
      } finally {
        translating = false
      }
    }
  })
}
