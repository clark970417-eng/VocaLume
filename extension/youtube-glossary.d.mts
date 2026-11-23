type Term = { source: string; target: string };
export const youtubeGlossaryPrefix: string;
export function isYoutubeChannelId(value: unknown): value is string;
export function youtubeGlossaryKey(channelId?: string, direction?: string): string;
export function cleanYoutubeGlossary(entries: unknown): Term[];
export function parseYoutubeGlossary(input: string): Term[];
export function mergeYoutubeGlossary(globalEntries: unknown, channelEntries: unknown): Term[];
export function matchingYoutubeGlossary(text: string, terms: Term[]): Term[];
