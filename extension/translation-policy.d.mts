export class TranslationValidationError extends Error {}
export function validateTranslation(value: string, direction: string, source?: string,
  glossary?: Array<{source:string;target:string}>): string;
export function phraseTranslation(text: string, direction: string): string | undefined;
export function splitTranslationText(value: string, maxLength?: number): string[];
