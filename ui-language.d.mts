export const UI_LANGUAGE_KEY: string;
export function uiLanguagePreference(value: unknown): 'auto' | 'zh-TW' | 'zh-CN' | 'en';
export function resolveUiLanguage(preference: unknown, languages?: readonly string[]): 'zh-TW' | 'zh-CN' | 'en';
export function translateUiText(text: string, locale: string, values?: readonly unknown[]): string;
