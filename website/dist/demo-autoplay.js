// Manage demo video playback cleanly without destroying localized click-to-play posters
// or downloading large media when the visitor prefers reduced motion or data saving.
(() => {
  const videos = [...document.querySelectorAll('.demo-gallery video')];
  if (!videos.length) return;

  const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const saveData = Boolean(navigator.connection?.saveData);
  const canAutoplay = !reducedMotion && !saveData;
  const visible = new Set();
  const started = new WeakSet();
  const pausedByUser = new WeakSet();
  const autoPausing = new WeakSet();

  const hasPosterOverlay = video =>
    video.inert === true || Boolean(video.parentElement?.querySelector('.demo-poster'));

  const playIfEligible = video => {
    if (document.hidden || pausedByUser.has(video) || hasPosterOverlay(video)) return;
    if (!canAutoplay && !started.has(video)) return;
    video.play().catch(() => {});
  };

  const pauseAutomatically = video => {
    if (video.paused) return;
    autoPausing.add(video);
    video.pause();
  };

  for (const video of videos) {
    video.muted = true;
    video.defaultMuted = true;
    video.addEventListener('pause', () => {
      if (autoPausing.has(video)) {
        autoPausing.delete(video);
        return;
      }
      if (!video.ended) pausedByUser.add(video);
    });
    video.addEventListener('play', () => {
      started.add(video);
      pausedByUser.delete(video);
      if (!video.muted) {
        for (const other of videos) {
          if (other !== video) other.muted = true;
        }
      }
    });
    video.addEventListener('volumechange', () => {
      if (!video.muted) {
        for (const other of videos) {
          if (other !== video) other.muted = true;
        }
      }
    });
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          visible.add(entry.target);
          playIfEligible(entry.target);
        } else {
          visible.delete(entry.target);
          pauseAutomatically(entry.target);
        }
      }
    }, { threshold: [0, 0.35] });
    videos.forEach(video => observer.observe(video));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos.forEach(pauseAutomatically);
    else visible.forEach(playIfEligible);
  });
})();
