(() => {
  const validChannelId = value => typeof value === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(value);
  const videoIdFor = url => url.pathname === '/watch' ? url.searchParams.get('v') :
    /^\/(?:live|shorts)\/([\w-]{11})\/?$/u.exec(url.pathname)?.[1];

  const channelIdFromPath = pathname => /^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/|$)/u.exec(pathname)?.[1];

  function youtubeOwner(doc, url) {
    const videoId = videoIdFor(url);
    if (!videoId || url.hostname !== 'www.youtube.com') return null;
    const watch = [...doc.querySelectorAll('ytd-watch-flexy[video-id]')]
      .find(renderer => renderer.getAttribute('video-id') === videoId);
    const shorts = [...doc.querySelectorAll('ytd-reel-video-renderer[video-id]')]
      .find(renderer => renderer.getAttribute('video-id') === videoId);
    const owner = watch?.querySelector('#owner ytd-video-owner-renderer, #owner') ||
      shorts?.querySelector('#channel-info, #owner');
    if (!owner) return null;
    const label = owner.querySelector('#channel-name')?.textContent?.trim() || '';
    const direct = owner.getAttribute('channel-id') || owner.querySelector('[channel-id]')?.getAttribute('channel-id');
    if (validChannelId(direct)) return {videoId, channelId: direct, label};
    for (const link of owner.querySelectorAll('a[href]')) {
      let profile;
      try { profile = new URL(link.getAttribute('href'), url); } catch { continue; }
      if (profile.origin !== url.origin) continue;
      const channelId = channelIdFromPath(profile.pathname);
      if (channelId) return {videoId, channelId, label};
      const handle = /^\/@([^/]+)\/?$/u.exec(profile.pathname)?.[1];
      if (handle) return {videoId, handle, label: label || profile.pathname};
    }
    return null;
  }

  function channelIdFromProfile(html) {
    // The owner link identifies this profile; avoid extracting random video
    // channel IDs from recommendations in the response.
    const metadata = /<meta\b[^>]*itemprop=["']channelId["'][^>]*>/iu.exec(html)?.[0];
    const fromMeta = /\bcontent=["'](UC[A-Za-z0-9_-]{22})["']/u.exec(metadata || '')?.[1];
    return fromMeta || /"channelMetadataRenderer"\s*:\s*\{[^{}]*"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/u.exec(html)?.[1] ||
      /<link\b[^>]*href=["']https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})["'][^>]*>/iu.exec(html)?.[1];
  }

  globalThis.VocaLumeYoutubeChannel = {youtubeOwner, channelIdFromProfile};
})();
