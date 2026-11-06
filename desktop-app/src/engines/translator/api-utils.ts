import { protectNames } from '../../../../extension/translation-guards.mjs'
import type { TranslateContext } from '../types'

/**
 * Shared utilities for API-based translators.
 * Deduplicates HTTP request, timeout, error handling, and JSON parsing logic.
 */

/** Default request timeout in milliseconds */
export const DEFAULT_TIMEOUT_MS = 15_000

/** A short-lived transport or provider failure. Auth and quota errors stay permanent. */
export class TemporaryTranslationServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TemporaryTranslationServiceError'
  }
}

/** Keep names as local tokens even when the selected service translates the surrounding text. */
export async function translateProtectedCloudText(
  text: string,
  glossary: TranslateContext['glossary'],
  request: (source: string, hasNames: boolean) => Promise<string | undefined>
): Promise<string> {
  const names = protectNames(text, glossary)
  const hasNames = names.entries.length > 0
  if (hasNames && !/[\p{L}\p{N}]/u.test(names.body)) return names.restore(names.text)
  const translated = await request(names.text, hasNames)
  if (typeof translated !== 'string' || !translated.trim()) {
    throw new TemporaryTranslationServiceError('Translation service returned no text')
  }
  return hasNames ? names.restore(translated) : translated
}

/** HTTP error mapping entry: status code(s) to human-readable message */
export interface HttpErrorMapping {
  statuses: number[]
  message: string
}

/**
 * Body-aware error classifier. Called for non-OK HTTP statuses with the raw
 * response body. Return a string message to throw, or null to fall through to
 * the standard errorMappings / generic message.
 */
export type ErrorBodyClassifier = (status: number, body: string) => string | null

/** Options for fetchWithTimeout */
export interface ApiFetchOptions {
  url: string
  init: RequestInit
  timeoutMs: number
  /** Service name for error messages (e.g. "Google Translation API") */
  serviceName: string
  /** Custom status-to-message mappings, checked before the generic fallback */
  errorMappings?: HttpErrorMapping[]
  /**
   * Optional body-aware classifier evaluated before errorMappings. Useful when
   * a single status code (e.g. 429) needs to be split into multiple semantic
   * errors based on the response body (e.g. monthly quota vs short rate-limit).
   */
  classifyErrorBody?: ErrorBodyClassifier
}

/**
 * Perform a fetch with AbortController timeout, HTTP error mapping, and JSON parsing.
 * Returns the parsed JSON response body.
 */
export async function apiFetch<T>(options: ApiFetchOptions): Promise<T> {
  const { url, init, timeoutMs, serviceName, errorMappings, classifyErrorBody } = options

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let response: Response
    try {
      response = await fetch(url, { ...init, signal: controller.signal })
    } catch (error) {
      if (!(error instanceof TypeError) || controller.signal.aborted) throw error
      throw new TemporaryTranslationServiceError(`${serviceName}: Network request failed`, { cause: error })
    }

    if (!response.ok) {
      let body = ''
      if (classifyErrorBody) {
        try {
          body = await response.text()
        } catch (error) {
          if (controller.signal.aborted) throw error
          // ignore — fall through to status-only handling
        }
        const classified = classifyErrorBody(response.status, body)
        if (classified) {
          throwHttpError(response.status, `${serviceName}: ${classified}`)
        }
      }
      const mapped = errorMappings?.find(mapping => mapping.statuses.includes(response.status))
      throwHttpError(response.status, mapped ? `${serviceName}: ${mapped.message}` : `${serviceName} error: ${response.status}`)
    }

    let data: T
    try {
      data = (await response.json()) as T
    } catch (error) {
      if (controller.signal.aborted) throw error
      throw new TemporaryTranslationServiceError(`${serviceName}: Invalid JSON response`, { cause: error })
    }

    return data
  } finally {
    clearTimeout(timeout)
  }
}

function throwHttpError(status: number, message: string): never {
  if (status >= 500 && status < 600) throw new TemporaryTranslationServiceError(message)
  throw new Error(message)
}

/**
 * Standard initialization guard for API translators.
 * Validates the API key is present, runs a test translation, and marks as initialized.
 * Returns true if already initialized (caller should return early).
 */
export async function apiInitialize(opts: {
  initialized: boolean
  apiKey: string
  keyName: string
  serviceName: string
  testTranslate: () => Promise<string>
}): Promise<boolean> {
  if (opts.initialized) return true
  if (!opts.apiKey) {
    throw new Error(`${opts.keyName} is required`)
  }
  try {
    await opts.testTranslate()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid ${opts.serviceName} key: ${msg}`)
  }
  return false
}
