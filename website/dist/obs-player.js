(() => {
  const section = document.querySelector('#obs-demo');
  if (!section) return;

  const video = section.querySelector('video');
  const button = section.querySelector('.obs-play');
  const error = section.querySelector('.obs-play-error');

  button.hidden = false;
  button.addEventListener('click', () => {
    error.hidden = true;
    video.muted = false;
    video.play().catch(() => {
      error.hidden = false;
    });
  });

  video.addEventListener('playing', () => {
    button.hidden = true;
    error.hidden = true;
  });

  video.addEventListener('ended', () => {
    button.hidden = false;
  });
})();
