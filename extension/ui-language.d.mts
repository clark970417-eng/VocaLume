export const UI_LANGUAGE_KEY: string;
export const UI_LANGUAGE_CHANGED_AT_KEY: string;
export const UI_REGION_LOCALE_KEY: string;
export type UiLocale = 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko';
export type UiLanguagePreference = UiLocale | 'auto';
export function uiLanguagePreference(value: unknown): UiLanguagePreference;
export function resolveUiLanguage(preference: unknown, languages?: readonly string[]): UiLocale;
export function lookupRegionalUiLanguage(options?: {fetch?: typeof fetch}): Promise<UiLocale | null>;
export function translateUiText(text: string, locale: string, values?: readonly unknown[]): string;
