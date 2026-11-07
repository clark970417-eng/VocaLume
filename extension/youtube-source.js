// Runs alongside the player so a DOM caption cannot be mistaken for a
// different language, a translated subtitle track, or an automatic track.
(() => {
  let previousDomCue = null;
  const textOf = cue => String(cue.text || '').replace(/<[^>]*>/gu, '').trim();
  const languageCode = value => typeof value === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu.test(value);

  function selectedCue() {
    const player = document.querySelector('#movie_player');
    const video = player?.querySelector('video');
    if (!video || video.paused || video.seeking || !Number.isFinite(video.currentTime) || video.playbackRate <= 0) return null;
    const now = Date.now(), mediaTime = video.currentTime;
    const reportedVideo = player.getVideoData?.()?.video_id;
    const selected = player.getOption?.('captions', 'track');
    if (selected?.translationLanguage || selected?.isTranslated || selected?.kind === 'asr' ||
        /^a\./u.test(selected?.vssId || '') ||
        player.classList.contains('ad-showing')) return null;
    const showing = [...(video.textTracks || [])].filter(track =>
      track.mode === 'showing' && ['captions', 'subtitles'].includes(track.kind) && languageCode(track.language));
    const track = showing.length === 1 ? showing[0] : null;
    if (track?.activeCues?.length) {
      const active = [...track.activeCues].filter(cue => Number.isFinite(cue.startTime) &&
        cue.startTime <= mediaTime && cue.endTime > mediaTime && textOf(cue));
      if (active.length !== 1) return null;
      const cue = active[0], text = textOf(cue);
      previousDomCue = null;
      return {
        key: JSON.stringify([reportedVideo, track.id || track.label, track.language, cue.id, cue.startTime, cue.endTime]),
        language: track.language, text, startAt: now - (mediaTime - cue.startTime) * 1000 / video.playbackRate, observedAt: now
      };
    }
    // YouTube commonly paints captions itself. Use its selected manual track
    // when it exposes trustworthy identity, and claim coverage only from the
    // first observed frame. Never infer the language from the caption text.
    if (!reportedVideo || !languageCode(selected?.languageCode) ||
        !(selected.id || selected.vssId || selected.trackName || selected.displayName || selected.name)) return null;
    const button = player.querySelector('.ytp-subtitles-button');
    if (button?.getAttribute('aria-pressed') !== 'true') return null;
    const text = [...player.querySelectorAll('.ytp-caption-window-container .ytp-caption-segment')]
      .map(node => node.textContent).join(' ').replace(/\s+/gu, ' ').trim();
    if (!text) return null;
    const trackKey = JSON.stringify([reportedVideo, selected.languageCode, selected.id || selected.vssId ||
      selected.trackName || selected.displayName || selected.name]);
    const continuous = previousDomCue?.trackKey === trackKey && now - previousDomCue.observedAt <= 650 &&
      mediaTime > previousDomCue.mediaTime && mediaTime - previousDomCue.mediaTime < 2;
    if (previousDomCue?.trackKey === trackKey && mediaTime === previousDomCue.mediaTime) return null;
    const sameCue = continuous && previousDomCue.text === text;
    previousDomCue = {trackKey, mediaTime, text, observedAt: now,
      startAt: sameCue ? previousDomCue.startAt : now};
    return {...previousDomCue, key: trackKey + ':' + previousDomCue.startAt, language: selected.languageCode};
  }

  document.addEventListener('vocalume-read-source-cue', () => {
    let cue = null;
    try { cue = selectedCue(); } catch { /* Unavailable player metadata leaves audio active. */ }
    if (!cue) previousDomCue = null;
    document.dispatchEvent(new CustomEvent('vocalume-source-cue', {detail: JSON.stringify(cue)}));
  });
  document.addEventListener('vocalume-reset-source-cue', () => { previousDomCue = null; });
})();
