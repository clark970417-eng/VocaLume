export interface GameTerm { readonly ja: string; readonly zh: string; readonly domain: string; readonly standalone: boolean }
export const entries: readonly GameTerm[]
export function gameTermTranslation(text: string, from: string, to: string): string | undefined
export function selectGameTerminology(text: string, from: string, to: string, existing?: readonly {source:string;target:string}[]): Array<{source:string;target:string}>
