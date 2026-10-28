export const UI_LANGUAGE_KEY: string;
export function uiLanguagePreference(value: unknown): 'auto' | 'zh-TW' | 'en';
export function resolveUiLanguage(preference: unknown, languages?: readonly string[]): 'zh-TW' | 'en';
export function translateUiText(text: string, locale: string, values?: readonly unknown[]): string;
