const ACTIVE_WINDOW_MS = 650;
const HISTORY_MS = 15_000;
const EDGE_MS = 120;

function primaryLanguage(language) {
  return typeof language === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu.test(language)
    ? language.split('-')[0].toLowerCase()
    : '';
}

/** The intervals are mapped onto the same wall clock as the audio worklet.
 * Only confirmed coverage is used, and history survives a natural track gap. */
export class NativeCueTimeline {
  constructor() { this.reset(); }
  reset() { this.current = null; this.intervals = []; }
  deactivate() { this.current = null; }

  observe(cue, expectedLanguage, now = Date.now()) {
    const text = typeof cue?.text === 'string' ? cue.text.replace(/\s+/gu, ' ').trim() : '';
    const {key, startAt, observedAt} = cue || {};
    if (!text || text.length > 500 || typeof key !== 'string' || !key || key.length > 600 ||
        primaryLanguage(cue.language) !== expectedLanguage ||
        !Number.isFinite(startAt) || !Number.isFinite(observedAt) ||
        startAt > observedAt || observedAt - startAt > HISTORY_MS ||
        Math.abs(now - observedAt) > ACTIVE_WINDOW_MS) {
      this.deactivate();
      return null;
    }
    this.intervals = this.intervals.filter(interval => now - interval.end <= HISTORY_MS);
    const sameCue = this.current?.key === key && observedAt >= this.current.observedAt &&
      observedAt - this.current.observedAt <= ACTIVE_WINDOW_MS;
    if (sameCue) {
      this.current.end = Math.max(this.current.end, observedAt);
      this.current.observedAt = observedAt;
      this.current.text = text;
    } else {
      // First observation can use a timed cue's true start. A previously seen
      // cue reappearing after a gap cannot cover the intervening audio.
      const seen = this.intervals.some(interval => interval.key === key);
      this.current = {key, text, start: seen ? observedAt : startAt, end: observedAt, observedAt};
      this.intervals.push(this.current);
      if (this.intervals.length > 30) this.intervals.shift();
    }
    return this.current;
  }

  covers(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start <= EDGE_MS) return false;
    const sorted = [...this.intervals].sort((a, b) => a.start - b.start);
    let cursor = start;
    let missing = 0;
    for (const interval of sorted) {
      if (interval.end <= cursor) continue;
      missing += Math.max(0, interval.start - cursor);
      if (missing > EDGE_MS) break;
      cursor = Math.max(cursor, interval.end);
      if (cursor >= end - (EDGE_MS - missing) && cursor - start > EDGE_MS) return true;
    }
    return false;
  }

  isActive(now = Date.now()) {
    return !!this.current && now - this.current.observedAt <= ACTIVE_WINDOW_MS;
  }
}
