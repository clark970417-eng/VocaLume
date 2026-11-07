export class TranslationValidationError extends Error {}
export function polishChinese(source: string, translated: string): string;
export function validateTranslation(value: string, direction: string, source?: string,
  glossary?: Array<{source:string;target:string}>): string;
export function phraseTranslation(text: string, direction: string): string | undefined;
export function splitTranslationText(value: string, maxLength?: number): string[];
export function translateFormatted(value: string, to: string, translatePart: (value: string) => Promise<string>, parallel?: number): Promise<string>;
