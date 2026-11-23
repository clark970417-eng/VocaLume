export const youtubeGlossaryPrefix = 'youtubeGlossary:';
export const isYoutubeChannelId = value => typeof value === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(value);
export const youtubeGlossaryKey = (channelId, direction='ja-zh') =>
  youtubeGlossaryPrefix + (isYoutubeChannelId(channelId) ? channelId : 'global') + ':' + direction;

export function cleanYoutubeGlossary(entries) {
  const terms = new Map();
  if (!Array.isArray(entries)) return [];
  for (const {source, target} of entries.slice(0, 200).filter(entry => entry && typeof entry === 'object')) {
    if (typeof source !== 'string' || typeof target !== 'string') continue;
    const original = source.trim(), translated = target.trim();
    if (!original || !translated || original.length > 80 || translated.length > 80 ||
      /[\r\n\u0000-\u001f<>]/u.test(original + translated)) continue;
    terms.set(original, translated);
  }
  return Array.from(terms, ([source, target]) => ({source, target}));
}

export function parseYoutubeGlossary(input) {
  const lines = input.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  if (lines.length > 200) throw new Error('limit');
  const terms = lines.map(line => {
    const parts = line.split(/(?:→|\t)/u);
    if (parts.length !== 2) throw new Error('format');
    const [source, target] = parts.map(part => part.trim());
    if (!cleanYoutubeGlossary([{source, target}]).length) throw new Error('format');
    return {source, target};
  });
  return cleanYoutubeGlossary(terms);
}

export function mergeYoutubeGlossary(globalEntries, channelEntries) {
  const terms = new Map();
  for (const {source, target} of [...cleanYoutubeGlossary(globalEntries), ...cleanYoutubeGlossary(channelEntries)]) {
    terms.set(source, target);
  }
  return Array.from(terms, ([source, target]) => ({source, target}));
}

export function matchingYoutubeGlossary(text, terms) {
  return terms.filter(term => text.includes(term.source))
    .sort((left, right) => right.source.length - left.source.length).slice(0, 12);
}
