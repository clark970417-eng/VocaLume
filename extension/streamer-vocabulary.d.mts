export interface StreamerGreeting {
  readonly creator: string
  readonly aliases: readonly string[]
  readonly standard: string
  readonly chinese: string
  readonly kind: 'hello' | 'thanks' | 'morning' | 'goodnight'
}
export const entries: readonly StreamerGreeting[]
export const creatorNames: readonly string[]
export function greetingTranslation(text: string): string | undefined
export function normalizeGreetingSource(text: string): string
export function isStandaloneGreeting(text: string): boolean
