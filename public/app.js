/**
 * YouTube Music Pro - 320kbps Pure Studio Audio Player
 * Zero Video Restrictions + 0ms Pre-buffering + MP3 Download + MediaSession Engine + LRCLIB Lyrics
 */

(function () {
  'use strict';

  // --- STATE ---
  const state = {
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    isShuffle: false,
    repeatMode: 'off',
    autoplayEnabled: true,
    playbackSpeed: 1.0,
    volume: 80,
    currentTime: 0,
    duration: 0,
    likedTracks: JSON.parse(localStorage.getItem('yt_liked') || '[]'),
    playlists: JSON.parse(localStorage.getItem('yt_playlists') || '[]'),
    history: JSON.parse(localStorage.getItem('yt_history') || '[]'),
    stats: JSON.parse(localStorage.getItem('yt_stats') || '{"plays": 0, "seconds": 0}'),
    syncedLyrics: [],
    currentLyricIndex: -1,
    activeCategory: 'trending',
    activeView: 'home',
    sleepTimerTimeout: null,
    sleepTimerEndTrack: false,
    nodes: []
  };

  // --- NATIVE AUDIO ENGINE ---
  const audioElement = new Audio();
  audioElement.preload = 'auto';
  audioElement.crossOrigin = 'anonymous';

  // --- PRE-BUFFERING ENGINE (0ms Delay) ---
  function prebufferNextTrack() {
    if (state.queue.length > state.queueIndex + 1) {
      const nextTrack = state.queue[state.queueIndex + 1];
      if (nextTrack && nextTrack.id) {
        // Silently request stream to warm the server disk cache ahead of time
        fetch(`/api/stream?id=${nextTrack.id}`, { headers: { Range: 'bytes=0-1024' } }).catch(() => {});
      }
    }
  }

  // --- AUDIO LISTENERS ---
  audioElement.addEventListener('play', () => {
    state.isPlaying = true;
    updatePlayBtnUI();
    updateMediaSession();
    prebufferNextTrack();
  });

  audioElement.addEventListener('pause', () => {
    state.isPlaying = false;
    updatePlayBtnUI();
  });

  audioElement.addEventListener('timeupdate', () => {
    const cur = audioElement.currentTime || 0;
    const dur = audioElement.duration || state.duration || 0;
    state.currentTime = cur;
    if (dur && !isNaN(dur) && dur > 0) state.duration = dur;
    state.stats.seconds += 0.25;

    const curFormatted = formatTime(cur);
    const durFormatted = formatTime(state.duration);

    document.getElementById('player-current-time').textContent = curFormatted;
    document.getElementById('np-current-time').textContent = curFormatted;

    if (state.duration > 0) {
      document.getElementById('player-total-time').textContent = durFormatted;
      document.getElementById('np-total-time').textContent = durFormatted;
      const pct = (cur / state.duration) * 100;
      document.getElementById('player-seek-slider').value = pct;
      document.getElementById('np-seek-slider').value = pct;
      document.getElementById('mini-player-progress-fill').style.width = pct + '%';
    }

    syncLyricsWithTime(cur);
  });

  audioElement.addEventListener('ended', handleTrackEnd);

  audioElement.addEventListener('error', (e) => {
    console.warn('Audio stream error, advancing track:', e);
    showNotification('Advancing to next track...');
    setTimeout(playNextTrack, 1200);
  });

  // --- DEDUPLICATION UTILITY ---
  function normalizeTitle(str) {
    if (!str) return '';
    return str.toLowerCase()
      .replace(/\[official.*?\]/gi, '')
      .replace(/\(official.*?\)/gi, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function isDuplicate(track, queueList) {
    if (!track || !track.id) return true;
    const targetNorm = normalizeTitle(track.title);
    return queueList.some(item => item.id === track.id || normalizeTitle(item.title) === targetNorm);
  }

  // --- AUTOMATIC QUEUE (ENDLESS RADIO) ---
  async function fetchRelatedAndAutoQueue(track) {
    if (!state.autoplayEnabled || !track) return;
    try {
      const res = await fetch(`/api/related?id=${track.id}&title=${encodeURIComponent(track.title)}&author=${encodeURIComponent(track.author)}`);
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        const uniqueTracks = data.tracks.filter(t => !isDuplicate(t, state.queue) && !isDuplicate(t, state.history.slice(0, 15)));
        if (uniqueTracks.length > 0) {
          state.queue.push(...uniqueTracks.slice(0, 8));
          renderQueue();
          prebufferNextTrack();
        }
      }
    } catch (e) {}
  }

  // --- MP3 DOWNLOAD FUNCTION ---
  function downloadTrack(track) {
    if (!track || !track.id) return;
    showNotification(`⬇️ Downloading "${track.title}" in 320kbps MP3...`);
    const link = document.createElement('a');
    link.href = `/api/download?id=${track.id}&title=${encodeURIComponent(track.title)}`;
    link.download = `${track.title}.mp3`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // --- QUEUE ACTIONS ---
  function playSongDirect(track) {
    if (!track || !track.id) return;
    state.queue = [track];
    state.queueIndex = 0;
    playTrack(track, true);
    if (state.autoplayEnabled) {
      fetchRelatedAndAutoQueue(track);
    }
  }

  function addToQueueNext(track) {
    if (!track) return;
    if (isDuplicate(track, state.queue)) {
      showNotification(`"${track.title}" is already in queue`);
      return;
    }
    const insertIdx = state.queueIndex + 1;
    state.queue.splice(insertIdx, 0, track);
    renderQueue();
    prebufferNextTrack();
    showNotification(`Will play next: "${track.title}" ⏭️`);
  }

  function addToQueueEnd(track) {
    if (!track) return;
    if (isDuplicate(track, state.queue)) {
      showNotification(`"${track.title}" is already in queue`);
      return;
    }
    state.queue.push(track);
    renderQueue();
    showNotification(`Added to queue: "${track.title}" ➕`);
  }

  function shuffleUpcomingQueue() {
    if (state.queue.length <= state.queueIndex + 1) return;
    const played = state.queue.slice(0, state.queueIndex + 1);
    const upcoming = state.queue.slice(state.queueIndex + 1);
    
    for (let i = upcoming.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
    }

    state.queue = [...played, ...upcoming];
    renderQueue();
    prebufferNextTrack();
    showNotification('Shuffled upcoming songs 🔀');
  }

  function clearUpcomingQueue() {
    if (state.currentTrack) {
      state.queue = [state.currentTrack];
      state.queueIndex = 0;
    } else {
      state.queue = [];
      state.queueIndex = -1;
    }
    renderQueue();
    showNotification('Upcoming queue cleared 🗑️');
  }

  // --- CORE PLAYBACK CONTROLLER ---
  function playTrack(track, fromQueue = false) {
    if (!track || !track.id) return;

    state.currentTrack = track;
    state.duration = track.duration ? track.duration / 1000 : 0;
    state.currentTime = 0;

    if (!fromQueue) {
      const existingIdx = state.queue.findIndex(t => t.id === track.id);
      if (existingIdx === -1) {
        state.queue.push(track);
        state.queueIndex = state.queue.length - 1;
      } else {
        state.queueIndex = existingIdx;
      }
    }

    if (state.autoplayEnabled && (state.queue.length - state.queueIndex <= 2)) {
      fetchRelatedAndAutoQueue(track);
    }

    saveToHistory(track);
    state.stats.plays += 1;
    localStorage.setItem('yt_stats', JSON.stringify(state.stats));

    const artwork = track.artworkHigh || track.artwork || `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`;
    
    // UI Updates
    document.getElementById('player-cover-img').src = artwork;
    document.getElementById('player-title').textContent = track.title;
    document.getElementById('player-artist').textContent = track.author;
    document.getElementById('player-total-time').textContent = track.durationFormatted || formatTime(state.duration);
    document.getElementById('player-current-time').textContent = '0:00';
    document.getElementById('player-seek-slider').value = 0;

    document.getElementById('np-cover-img').src = artwork;
    document.getElementById('np-title').textContent = track.title;
    document.getElementById('np-artist').textContent = track.author;
    document.getElementById('np-total-time').textContent = track.durationFormatted || formatTime(state.duration);
    document.getElementById('np-current-time').textContent = '0:00';
    document.getElementById('np-seek-slider').value = 0;
    document.getElementById('np-backdrop-blur').style.backgroundImage = `url('${artwork}')`;

    updateLikeBtnState();
    renderQueue();
    fetchLyrics(track.title, track.author);

    // Play 320kbps Pure Studio Audio Stream
    audioElement.src = `/api/stream?id=${track.id}`;
    audioElement.playbackRate = state.playbackSpeed;
    audioElement.volume = state.volume / 100;
    audioElement.play().catch(() => {});

    document.title = `▶ ${track.title} - ${track.author}`;
    updateMediaSession();
  }

  function togglePlay() {
    if (!state.currentTrack) {
      if (state.queue.length > 0) playTrack(state.queue[0], true);
      return;
    }
    if (audioElement.paused) {
      audioElement.play().catch(() => {});
    } else {
      audioElement.pause();
    }
  }

  function playNextTrack() {
    if (state.queue.length === 0) return;

    if (state.repeatMode === 'one' && state.currentTrack) {
      playTrack(state.currentTrack, true);
      return;
    }

    let nextIdx = state.queueIndex + 1;
    if (state.isShuffle) {
      nextIdx = Math.floor(Math.random() * state.queue.length);
    } else if (nextIdx >= state.queue.length) {
      if (state.autoplayEnabled && state.currentTrack) {
        fetchRelatedAndAutoQueue(state.currentTrack).then(() => {
          if (state.queue.length > nextIdx) {
            state.queueIndex = nextIdx;
            playTrack(state.queue[nextIdx], true);
          }
        });
        return;
      } else if (state.repeatMode === 'all') {
        nextIdx = 0;
      } else {
        return;
      }
    }

    state.queueIndex = nextIdx;
    playTrack(state.queue[nextIdx], true);
  }

  function playPrevTrack() {
    if (state.queue.length === 0) return;
    if (audioElement.currentTime > 4) {
      seekTo(0);
      return;
    }
    let prevIdx = state.queueIndex - 1;
    if (prevIdx < 0) prevIdx = state.queue.length - 1;
    state.queueIndex = prevIdx;
    playTrack(state.queue[prevIdx], true);
  }

  function handleTrackEnd() {
    if (state.sleepTimerEndTrack) {
      state.sleepTimerEndTrack = false;
      showNotification('Sleep Timer: Track finished 🌙');
      audioElement.pause();
      return;
    }
    playNextTrack();
  }

  function seekTo(seconds) {
    if (audioElement) {
      audioElement.currentTime = seconds;
      state.currentTime = seconds;
      const formatted = formatTime(seconds);
      document.getElementById('player-current-time').textContent = formatted;
      document.getElementById('np-current-time').textContent = formatted;
      if (state.duration > 0) {
        const pct = (seconds / state.duration) * 100;
        document.getElementById('player-seek-slider').value = pct;
        document.getElementById('np-seek-slider').value = pct;
      }
    }
  }

  function setVolume(val) {
    state.volume = parseInt(val, 10);
    audioElement.volume = state.volume / 100;
  }

  function updateMediaSession() {
    if ('mediaSession' in navigator && state.currentTrack) {
      const t = state.currentTrack;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: t.author,
        album: 'YouTube Music Pro',
        artwork: [
          { src: t.artworkHigh || t.artwork || `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`, sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';

      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seekTo(details.seekTime);
      });
    }
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // --- SYNCED LYRICS ---
  async function fetchLyrics(title, artist) {
    const container = document.getElementById('lyrics-content');
    container.innerHTML = '<p style="color: var(--text-muted);">Searching lyrics for ' + escapeHtml(title) + '...</p>';
    state.syncedLyrics = [];

    try {
      const res = await fetch(`/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist || '')}`);
      const data = await res.json();

      if (data.found && data.synced) {
        parseSyncedLyrics(data.synced);
        renderSyncedLyrics();
      } else if (data.found && data.plain) {
        container.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8; color: var(--text-secondary);">${escapeHtml(data.plain)}</div>`;
      } else {
        container.innerHTML = '<p style="color: var(--text-muted);">No synchronized lyrics available for this song.</p>';
      }
    } catch (e) {
      container.innerHTML = '<p style="color: var(--text-muted);">Failed to load lyrics.</p>';
    }
  }

  function parseSyncedLyrics(lrcText) {
    state.syncedLyrics = [];
    const lines = lrcText.split('\n');
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

    lines.forEach(line => {
      const match = regex.exec(line);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const ms = parseInt(match[3], 10) * (match[3].length === 2 ? 10 : 1);
        const time = min * 60 + sec + ms / 1000;
        const text = match[4].trim();
        if (text) state.syncedLyrics.push({ time, text });
      }
    });
  }

  function renderSyncedLyrics() {
    const container = document.getElementById('lyrics-content');
    if (state.syncedLyrics.length === 0) return;

    container.innerHTML = state.syncedLyrics.map((item, idx) => `
      <div class="lyric-line" id="lyric-line-${idx}" data-time="${item.time}">
        ${escapeHtml(item.text)}
      </div>
    `).join('');

    container.querySelectorAll('.lyric-line').forEach(el => {
      el.addEventListener('click', () => {
        const time = parseFloat(el.getAttribute('data-time'));
        seekTo(time);
      });
    });
  }

  function syncLyricsWithTime(curTime) {
    if (!state.syncedLyrics || state.syncedLyrics.length === 0) return;

    let activeIdx = -1;
    for (let i = 0; i < state.syncedLyrics.length; i++) {
      if (curTime >= state.syncedLyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    if (activeIdx !== state.currentLyricIndex && activeIdx !== -1) {
      state.currentLyricIndex = activeIdx;
      document.querySelectorAll('.lyric-line').forEach((el, i) => {
        if (i === activeIdx) {
          el.classList.add('active');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          el.classList.remove('active');
        }
      });
    }
  }

  // --- SEARCH & CATEGORY LOADING ---
  async function searchMusic(query) {
    const viewContainer = document.getElementById('view-container');
    viewContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; gap: 16px;">
        <div style="width: 36px; height: 36px; border: 3px solid rgba(255,0,51,0.2); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <p style="color: var(--text-secondary);">Searching across Lavalink cluster for "${escapeHtml(query)}"...</p>
      </div>
      <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
    `;

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        renderSearchResults(query, data);
      } else {
        viewContainer.innerHTML = `<div style="text-align: center; padding: 40px;"><h3>No results for "${escapeHtml(query)}"</h3></div>`;
      }
    } catch (err) {
      viewContainer.innerHTML = `<div style="text-align: center; color: var(--accent-primary); padding: 40px;">Search failed: ${err.message}</div>`;
    }
  }

  async function loadCategory(catKey) {
    state.activeCategory = catKey;
    const viewContainer = document.getElementById('view-container');
    viewContainer.innerHTML = `
      <div style="display: flex; justify-content: center; padding: 40px;">
        <div style="width: 34px; height: 34px; border: 3px solid rgba(255,0,51,0.2); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
      </div>
    `;

    try {
      const res = await fetch(`/api/category/${catKey}`);
      const data = await res.json();
      if (data.tracks) {
        renderHomeFeed(data.tracks, catKey);
      }
    } catch (e) {
      viewContainer.innerHTML = `<p style="color: var(--text-muted);">Failed to load category.</p>`;
    }
  }

  // --- RENDERING VIEWS ---
  function renderHomeFeed(tracks, catKey) {
    const featured = tracks[0] || {};
    const quickPicks = tracks.slice(1, 9);
    const trendingList = tracks.slice(9, 20);

    const html = `
      <div class="hero-banner">
        <div class="hero-content">
          <div class="hero-tag">🌟 Featured Hit</div>
          <h1 class="hero-title">${escapeHtml(featured.title || 'Trending Song')}</h1>
          <p class="hero-subtitle">${escapeHtml(featured.author || 'Artist')} • 320kbps Pure Studio Audio</p>
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button id="hero-play-btn" class="hero-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              Play Now
            </button>
            <button id="hero-download-btn" class="header-btn" style="padding: 8px 14px; display: flex; align-items: center; gap: 6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download MP3
            </button>
          </div>
        </div>
        <img src="${featured.artworkHigh || featured.artwork}" style="width: 130px; height: 130px; border-radius: var(--radius-md); object-fit: cover; box-shadow: 0 10px 30px rgba(0,0,0,0.6);" alt="Cover">
      </div>

      <div>
        <div class="section-header">
          <h2 class="section-title">Quick Picks</h2>
          <button class="section-more-btn" id="play-all-quick">Play All</button>
        </div>
        <div class="quick-picks-carousel">
          ${quickPicks.map(t => `
            <div class="card-item" data-track-id="${t.id}">
              <div class="card-cover-wrapper">
                <img class="card-cover-img" src="${t.artwork}" alt="${escapeHtml(t.title)}" loading="lazy">
                <div class="card-play-overlay">
                  <svg viewBox="0 0 24 24"><polygon points="6 4 18 12 6 20 6 4"></polygon></svg>
                </div>
              </div>
              <div class="card-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
              <div class="card-subtitle">${escapeHtml(t.author)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div>
        <div class="section-header">
          <h2 class="section-title">Trending Tracks</h2>
        </div>
        <div class="track-list">
          ${trendingList.map((t, idx) => `
            <div class="track-row" data-track-id="${t.id}">
              <span class="track-number">${idx + 1}</span>
              <img class="track-thumbnail" src="${t.artwork}" alt="Art">
              <div class="track-info">
                <div class="track-name">${escapeHtml(t.title)}</div>
                <div class="track-artist">${escapeHtml(t.author)}</div>
              </div>
              <span class="track-duration">${t.durationFormatted}</span>
              <div class="track-actions">
                <button class="track-action-btn track-download-btn" title="Download 320kbps MP3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
                <button class="track-action-btn play-next-btn" title="Play Next">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                </button>
                <button class="track-action-btn queue-add-btn" title="Add to End of Queue">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button class="track-action-btn like-toggle-btn ${isLiked(t.id) ? 'liked' : ''}" title="Like">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked(t.id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('view-container').innerHTML = html;

    document.getElementById('hero-play-btn')?.addEventListener('click', () => {
      playSongDirect(featured);
    });

    document.getElementById('hero-download-btn')?.addEventListener('click', () => {
      downloadTrack(featured);
    });

    document.getElementById('play-all-quick')?.addEventListener('click', () => {
      state.queue = [...quickPicks];
      state.queueIndex = 0;
      playTrack(quickPicks[0], true);
    });

    attachTrackClickListeners(tracks);
  }

  function renderSearchResults(query, data) {
    const tracks = data.tracks;
    const topResult = tracks[0];

    const html = `
      <div class="search-header-actions">
        <div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 2px;">Search Results (${data.sourceNode || 'Lavalink'})</div>
          <h2 style="font-size: 1.35rem; font-weight: 800;">"${escapeHtml(query)}"</h2>
        </div>
        <button id="search-play-all-btn" class="search-play-all-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Play All Search Results
        </button>
      </div>

      <div style="display: flex; gap: 14px; margin-bottom: 20px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 250px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; display: flex; gap: 12px; align-items: center;">
          <img src="${topResult.artwork}" style="width: 76px; height: 76px; border-radius: var(--radius-sm); object-fit: cover;" alt="Art">
          <div style="flex: 1; min-width: 0;">
            <span style="font-size: 0.7rem; color: #ff3355; font-weight: 800; text-transform: uppercase;">Top Result</span>
            <h3 style="font-size: 0.95rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(topResult.title)}</h3>
            <p style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(topResult.author)} • ${topResult.durationFormatted}</p>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <button id="top-result-play" class="hero-btn" style="padding: 5px 14px; font-size: 0.8rem;">Play Now</button>
              <button id="top-result-download" class="header-btn" style="padding: 5px 10px; font-size: 0.8rem;">Download MP3</button>
            </div>
          </div>
        </div>
      </div>

      <div class="track-list">
        ${tracks.map((t, idx) => `
          <div class="track-row" data-track-id="${t.id}">
            <span class="track-number">${idx + 1}</span>
            <img class="track-thumbnail" src="${t.artwork}" alt="Art">
            <div class="track-info">
              <div class="track-name">${escapeHtml(t.title)}</div>
              <div class="track-artist">${escapeHtml(t.author)}</div>
            </div>
            <span class="track-duration">${t.durationFormatted}</span>
            <div class="track-actions">
              <button class="track-action-btn track-download-btn" title="Download 320kbps MP3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </button>
              <button class="track-action-btn play-next-btn" title="Play Next">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
              </button>
              <button class="track-action-btn queue-add-btn" title="Add to End of Queue">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <button class="track-action-btn like-toggle-btn ${isLiked(t.id) ? 'liked' : ''}" title="Like">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked(t.id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('view-container').innerHTML = html;

    document.getElementById('top-result-play')?.addEventListener('click', () => {
      playSongDirect(topResult);
    });

    document.getElementById('top-result-download')?.addEventListener('click', () => {
      downloadTrack(topResult);
    });

    document.getElementById('search-play-all-btn')?.addEventListener('click', () => {
      state.queue = [...tracks];
      state.queueIndex = 0;
      playTrack(tracks[0], true);
      showNotification('Playing all search results 🎶');
    });

    attachTrackClickListeners(tracks, true);
  }

  function attachTrackClickListeners(tracks, isSearch = false) {
    document.querySelectorAll('.card-item').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-track-id');
        const track = tracks.find(t => t.id === id);
        if (track) {
          playSongDirect(track);
        }
      });
    });

    document.querySelectorAll('.track-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.track-action-btn')) return;
        const id = row.getAttribute('data-track-id');
        const track = tracks.find(t => t.id === id);
        if (track) {
          if (isSearch) {
            playSongDirect(track);
          } else {
            const existingIdx = state.queue.findIndex(t => t.id === id);
            if (existingIdx !== -1) {
              state.queueIndex = existingIdx;
              playTrack(state.queue[existingIdx], true);
            } else {
              playSongDirect(track);
            }
          }
        }
      });

      row.querySelector('.track-download-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = row.getAttribute('data-track-id');
        const track = tracks.find(t => t.id === id);
        if (track) downloadTrack(track);
      });

      row.querySelector('.play-next-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = row.getAttribute('data-track-id');
        const track = tracks.find(t => t.id === id);
        if (track) addToQueueNext(track);
      });

      row.querySelector('.queue-add-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = row.getAttribute('data-track-id');
        const track = tracks.find(t => t.id === id);
        if (track) addToQueueEnd(track);
      });

      row.querySelector('.like-toggle-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = row.getAttribute('data-track-id');
        const track = tracks.find(t => t.id === id);
        if (track) {
          toggleLike(track);
          row.querySelector('.like-toggle-btn').classList.toggle('liked', isLiked(track.id));
        }
      });
    });
  }

  function renderLibraryView() {
    const html = `
      <div style="margin-bottom: 18px;">
        <h2 style="font-size: 1.45rem; font-weight: 800;">Your Library</h2>
        <p style="color: var(--text-secondary); font-size: 0.85rem;">Liked songs, listening history, and offline downloads.</p>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 16px;">
        <button class="chip active" id="lib-liked-tab">Liked Songs (${state.likedTracks.length})</button>
        <button class="chip" id="lib-history-tab">Recently Played (${state.history.length})</button>
      </div>

      <div id="library-list-container" class="track-list"></div>
    `;

    document.getElementById('view-container').innerHTML = html;
    renderLikedList();

    document.getElementById('lib-liked-tab').addEventListener('click', () => {
      document.getElementById('lib-liked-tab').classList.add('active');
      document.getElementById('lib-history-tab').classList.remove('active');
      renderLikedList();
    });

    document.getElementById('lib-history-tab').addEventListener('click', () => {
      document.getElementById('lib-history-tab').classList.add('active');
      document.getElementById('lib-liked-tab').classList.remove('active');
      renderHistoryList();
    });
  }

  function renderLikedList() {
    const container = document.getElementById('library-list-container');
    if (state.likedTracks.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 40px;">No liked songs yet.</p>`;
      return;
    }

    container.innerHTML = state.likedTracks.map((t, idx) => `
      <div class="track-row" data-track-id="${t.id}">
        <span class="track-number">${idx + 1}</span>
        <img class="track-thumbnail" src="${t.artwork}" alt="Art">
        <div class="track-info">
          <div class="track-name">${escapeHtml(t.title)}</div>
          <div class="track-artist">${escapeHtml(t.author)}</div>
        </div>
        <span class="track-duration">${t.durationFormatted || '0:00'}</span>
        <div class="track-actions">
          <button class="track-action-btn track-download-btn" title="Download MP3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>
          <button class="track-action-btn like-toggle-btn liked" title="Remove">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </button>
        </div>
      </div>
    `).join('');

    attachLibraryClicks(state.likedTracks);
  }

  function renderHistoryList() {
    const container = document.getElementById('library-list-container');
    if (state.history.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 40px;">No recent history.</p>`;
      return;
    }

    container.innerHTML = state.history.map((t, idx) => `
      <div class="track-row" data-track-id="${t.id}">
        <span class="track-number">${idx + 1}</span>
        <img class="track-thumbnail" src="${t.artwork}" alt="Art">
        <div class="track-info">
          <div class="track-name">${escapeHtml(t.title)}</div>
          <div class="track-artist">${escapeHtml(t.author)}</div>
        </div>
        <span class="track-duration">${t.durationFormatted || '0:00'}</span>
      </div>
    `).join('');

    attachLibraryClicks(state.history);
  }

  function attachLibraryClicks(tracks) {
    document.querySelectorAll('#library-list-container .track-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.like-toggle-btn')) {
          const id = row.getAttribute('data-track-id');
          const track = tracks.find(t => t.id === id);
          if (track) {
            toggleLike(track);
            renderLikedList();
          }
          return;
        }
        if (e.target.closest('.track-download-btn')) {
          const id = row.getAttribute('data-track-id');
          const track = tracks.find(t => t.id === id);
          if (track) downloadTrack(track);
          return;
        }
        const id = row.getAttribute('data-track-id');
        const track = tracks.find(t => t.id === id);
        if (track) {
          playSongDirect(track);
        }
      });
    });
  }

  function renderStudioView() {
    const totalMinutes = Math.floor(state.stats.seconds / 60);
    const totalHours = (totalMinutes / 60).toFixed(1);

    const html = `
      <div style="margin-bottom: 18px;">
        <h2 style="font-size: 1.45rem; font-weight: 800;">Studio Analytics & Cluster Status</h2>
        <p style="color: var(--text-secondary); font-size: 0.85rem;">Live streaming telemetry, 320kbps audio engine & node health.</p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px;">
        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px;">
          <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Total Songs Played</span>
          <div style="font-size: 1.6rem; font-weight: 800; color: #ff3355; margin-top: 4px;">${state.stats.plays}</div>
        </div>
        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px;">
          <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Listening Time</span>
          <div style="font-size: 1.6rem; font-weight: 800; color: #00f2fe; margin-top: 4px;">${totalHours} <span style="font-size: 0.9rem; color: var(--text-secondary);">hrs</span></div>
        </div>
        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px;">
          <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Audio Bitrate</span>
          <div style="font-size: 1.6rem; font-weight: 800; color: #10b981; margin-top: 4px;">320 kbps</div>
        </div>
        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px;">
          <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Lavalink Cluster</span>
          <div style="font-size: 1.6rem; font-weight: 800; color: #7928ca; margin-top: 4px;">4 Active</div>
        </div>
      </div>

      <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px;">
        <h3 style="font-size: 1rem; font-weight: 800; margin-bottom: 12px;">Active Lavalink Cluster</h3>
        <div id="studio-node-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
      </div>
    `;

    document.getElementById('view-container').innerHTML = html;
    fetchNodeStatus(true);
  }

  // --- SMART QUEUE DRAWER RENDERING ---
  function renderQueue() {
    const list = document.getElementById('queue-list');
    document.getElementById('queue-count').textContent = `${state.queue.length} songs`;

    if (state.currentTrack) {
      document.getElementById('q-np-thumb').src = state.currentTrack.artwork || '';
      document.getElementById('q-np-title').textContent = state.currentTrack.title;
      document.getElementById('q-np-artist').textContent = state.currentTrack.author;
      document.getElementById('queue-now-playing-box').style.display = 'flex';
    } else {
      document.getElementById('queue-now-playing-box').style.display = 'none';
    }

    const upcoming = state.queue.slice(state.queueIndex + 1);
    document.getElementById('q-upcoming-count').textContent = upcoming.length;

    if (upcoming.length === 0) {
      list.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 24px; font-size: 0.82rem;">No upcoming songs in queue.<br><span style="color: var(--accent-green);">Continuous Radio is ready to auto-queue similar hits.</span></p>`;
      return;
    }

    list.innerHTML = upcoming.map((t, idx) => {
      const realIdx = state.queueIndex + 1 + idx;
      return `
        <div class="queue-item-row" data-real-idx="${realIdx}">
          <span class="track-number" style="font-size: 0.75rem;">${idx + 1}</span>
          <img class="track-thumbnail" src="${t.artwork}" style="width: 38px; height: 38px;" alt="Art">
          <div class="track-info">
            <div class="track-name" style="font-size: 0.84rem;">${escapeHtml(t.title)}</div>
            <div class="track-artist" style="font-size: 0.74rem;">${escapeHtml(t.author)}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${idx > 0 ? `
              <button class="queue-order-btn q-move-up" title="Move Up">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
              </button>
            ` : ''}
            ${idx < upcoming.length - 1 ? `
              <button class="queue-order-btn q-move-down" title="Move Down">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
            ` : ''}
            <button class="modal-close-btn q-remove-item" title="Remove" style="padding: 4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.queue-item-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.queue-order-btn') || e.target.closest('.q-remove-item')) return;
        const realIdx = parseInt(row.getAttribute('data-real-idx'), 10);
        state.queueIndex = realIdx;
        playTrack(state.queue[realIdx], true);
      });

      row.querySelector('.q-move-up')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const realIdx = parseInt(row.getAttribute('data-real-idx'), 10);
        if (realIdx > state.queueIndex + 1) {
          const temp = state.queue[realIdx];
          state.queue[realIdx] = state.queue[realIdx - 1];
          state.queue[realIdx - 1] = temp;
          renderQueue();
          prebufferNextTrack();
        }
      });

      row.querySelector('.q-move-down')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const realIdx = parseInt(row.getAttribute('data-real-idx'), 10);
        if (realIdx < state.queue.length - 1) {
          const temp = state.queue[realIdx];
          state.queue[realIdx] = state.queue[realIdx + 1];
          state.queue[realIdx + 1] = temp;
          renderQueue();
          prebufferNextTrack();
        }
      });

      row.querySelector('.q-remove-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const realIdx = parseInt(row.getAttribute('data-real-idx'), 10);
        state.queue.splice(realIdx, 1);
        renderQueue();
        prebufferNextTrack();
      });
    });
  }

  // --- NODE STATUS FETCHING ---
  async function fetchNodeStatus(renderInStudio = false) {
    try {
      const res = await fetch('/api/nodes/status');
      const data = await res.json();
      state.nodes = data.nodes || [];

      const renderTarget = renderInStudio ? document.getElementById('studio-node-list') : document.getElementById('node-list-container');
      if (!renderTarget) return;

      renderTarget.innerHTML = state.nodes.map(n => `
        <div style="display: flex; align-items: center; justify-content: space-between; background: #161622; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 10px 14px;">
          <div>
            <div style="font-weight: 700; font-size: 0.88rem; display: flex; align-items: center; gap: 8px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${n.status === 'online' ? '#10b981' : '#ef4444'};"></span>
              ${escapeHtml(n.name)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
              ${n.host}:${n.port} • SSL: ${n.isSSL ? 'Yes' : 'No'}
            </div>
          </div>
          <div style="font-size: 0.82rem; font-weight: 700; color: ${n.status === 'online' ? '#10b981' : '#ef4444'};">
            ${n.ping}
          </div>
        </div>
      `).join('');
    } catch (e) {}
  }

  // --- LIKES & STORAGE ---
  function isLiked(id) {
    return state.likedTracks.some(t => t.id === id);
  }

  function toggleLike(track) {
    const idx = state.likedTracks.findIndex(t => t.id === track.id);
    if (idx === -1) {
      state.likedTracks.unshift(track);
      showNotification(`Added to Liked Songs ❤️`);
    } else {
      state.likedTracks.splice(idx, 1);
      showNotification(`Removed from Liked Songs`);
    }
    localStorage.setItem('yt_liked', JSON.stringify(state.likedTracks));
    updateLikeBtnState();
  }

  function updateLikeBtnState() {
    if (!state.currentTrack) return;
    const liked = isLiked(state.currentTrack.id);
    
    const dBtn = document.getElementById('player-like-btn');
    dBtn.classList.toggle('liked', liked);
    dBtn.querySelector('svg').setAttribute('fill', liked ? 'currentColor' : 'none');

    const mBtn = document.getElementById('np-like-btn');
    mBtn.classList.toggle('liked', liked);
    mBtn.querySelector('svg').setAttribute('fill', liked ? 'currentColor' : 'none');
  }

  function saveToHistory(track) {
    state.history = state.history.filter(t => t.id !== track.id);
    state.history.unshift(track);
    if (state.history.length > 50) state.history.pop();
    localStorage.setItem('yt_history', JSON.stringify(state.history));
  }

  function renderSidebarPlaylists() {
    const container = document.getElementById('sidebar-playlist-container');
    if (!container) return;
    container.innerHTML = state.playlists.map(pl => `
      <div class="user-playlist-item" data-pl-id="${pl.id}">
        <span>📁 ${escapeHtml(pl.name)}</span>
        <span class="song-count">${pl.tracks?.length || 0}</span>
      </div>
    `).join('');
  }

  // --- SLEEP TIMER ---
  function setSleepTimer(minutes) {
    if (state.sleepTimerTimeout) {
      clearTimeout(state.sleepTimerTimeout);
      state.sleepTimerTimeout = null;
    }
    state.sleepTimerEndTrack = false;

    const statusEl = document.getElementById('timer-status-text');

    if (minutes === 'off') {
      statusEl.textContent = 'No timer active';
      showNotification('Sleep Timer turned off');
      return;
    }

    if (minutes === 'end') {
      state.sleepTimerEndTrack = true;
      statusEl.textContent = 'Active: Pauses at end of current song';
      showNotification('Sleep Timer: Ends after this song');
      document.getElementById('timer-modal').classList.remove('open');
      return;
    }

    const minNum = parseInt(minutes, 10);
    statusEl.textContent = `Active: Pauses in ${minNum} minutes`;
    showNotification(`Sleep Timer set for ${minNum} minutes 🌙`);
    document.getElementById('timer-modal').classList.remove('open');

    state.sleepTimerTimeout = setTimeout(() => {
      audioElement.pause();
      showNotification('Sleep Timer: Audio paused. Goodnight! 🌙');
      statusEl.textContent = 'No timer active';
    }, minNum * 60 * 1000);
  }

  // --- SPEED TOGGLE ---
  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  function cyclePlaybackSpeed() {
    const curIdx = speeds.indexOf(state.playbackSpeed);
    const nextIdx = (curIdx + 1) % speeds.length;
    state.playbackSpeed = speeds[nextIdx];
    audioElement.playbackRate = state.playbackSpeed;
    document.getElementById('np-speed-label').textContent = `${state.playbackSpeed}x`;
    showNotification(`Playback speed: ${state.playbackSpeed}x`);
  }

  function updatePlayBtnUI() {
    const dBtn = document.getElementById('player-play-btn');
    const miniBtn = document.getElementById('mobile-mini-play-btn');
    const npBtn = document.getElementById('np-play-btn');

    const iconPlay = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    const iconPause = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

    const chosen = state.isPlaying ? iconPause : iconPlay;

    dBtn.innerHTML = chosen;
    miniBtn.innerHTML = chosen;
    npBtn.innerHTML = chosen;
  }

  function showNotification(msg) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '120px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = '#1e1e2d';
    toast.style.color = '#fff';
    toast.style.padding = '10px 18px';
    toast.style.borderRadius = '30px';
    toast.style.fontSize = '0.82rem';
    toast.style.fontWeight = '600';
    toast.style.border = '1px solid rgba(255,255,255,0.15)';
    toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6)';
    toast.style.zIndex = '9999';
    toast.style.pointerEvents = 'none';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- INITIALIZE ALL EVENT LISTENERS ---
  function initEventListeners() {
    document.getElementById('nav-brand-home').addEventListener('click', () => {
      switchView('home');
      loadCategory('trending');
    });

    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        switchView(view);
      });
    });

    document.querySelectorAll('.chip[data-category]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip[data-category]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const cat = chip.getAttribute('data-category');
        loadCategory(cat);
      });
    });

    const searchInput = document.getElementById('global-search-input');
    const clearBtn = document.getElementById('search-clear-btn');
    const suggestionsDropdown = document.getElementById('suggestions-dropdown');
    let suggestDebounce = null;

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      clearBtn.style.display = q ? 'block' : 'none';
      clearTimeout(suggestDebounce);
      if (!q) {
        suggestionsDropdown.style.display = 'none';
        return;
      }

      suggestDebounce = setTimeout(async () => {
        try {
          const res = await fetch(`/api/suggestions?q=${encodeURIComponent(q)}`);
          const items = await res.json();
          if (items && items.length > 0) {
            suggestionsDropdown.innerHTML = items.map(s => `
              <div class="suggestion-item" data-val="${escapeHtml(s)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                ${escapeHtml(s)}
              </div>
            `).join('');
            suggestionsDropdown.style.display = 'block';

            suggestionsDropdown.querySelectorAll('.suggestion-item').forEach(item => {
              item.addEventListener('click', () => {
                const val = item.getAttribute('data-val');
                searchInput.value = val;
                suggestionsDropdown.style.display = 'none';
                searchMusic(val);
              });
            });
          } else {
            suggestionsDropdown.style.display = 'none';
          }
        } catch (e) {}
      }, 180);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (q) {
          suggestionsDropdown.style.display = 'none';
          searchMusic(q);
        }
      }
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      suggestionsDropdown.style.display = 'none';
      searchInput.focus();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        suggestionsDropdown.style.display = 'none';
      }
    });

    const autoHeaderBtn = document.getElementById('autoplay-toggle-header');
    const autoSidebarCheckbox = document.getElementById('sidebar-autoplay-checkbox');

    function setAutoplay(val) {
      state.autoplayEnabled = val;
      autoHeaderBtn.classList.toggle('active', val);
      autoHeaderBtn.querySelector('.btn-text').textContent = val ? 'Autoplay: ON' : 'Autoplay: OFF';
      if (autoSidebarCheckbox) autoSidebarCheckbox.checked = val;
      showNotification(val ? 'Continuous Radio ON ⚡' : 'Autoplay OFF');
    }

    autoHeaderBtn.addEventListener('click', () => setAutoplay(!state.autoplayEnabled));
    if (autoSidebarCheckbox) {
      autoSidebarCheckbox.addEventListener('change', (e) => setAutoplay(e.target.checked));
    }

    // Download handlers in Player Bar & Now Playing sheet
    document.getElementById('player-download-btn')?.addEventListener('click', () => {
      if (state.currentTrack) downloadTrack(state.currentTrack);
    });
    document.getElementById('np-download-btn-top')?.addEventListener('click', () => {
      if (state.currentTrack) downloadTrack(state.currentTrack);
    });
    document.getElementById('np-download-action-btn')?.addEventListener('click', () => {
      if (state.currentTrack) downloadTrack(state.currentTrack);
    });

    // Playback Controls
    document.getElementById('player-play-btn').addEventListener('click', togglePlay);
    document.getElementById('mobile-mini-play-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlay();
    });
    document.getElementById('np-play-btn').addEventListener('click', togglePlay);

    document.getElementById('player-next-btn').addEventListener('click', playNextTrack);
    document.getElementById('mobile-mini-next-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      playNextTrack();
    });
    document.getElementById('np-next-btn').addEventListener('click', playNextTrack);

    document.getElementById('player-prev-btn').addEventListener('click', playPrevTrack);
    document.getElementById('np-prev-btn').addEventListener('click', playPrevTrack);

    document.getElementById('player-like-btn').addEventListener('click', () => {
      if (state.currentTrack) toggleLike(state.currentTrack);
    });
    document.getElementById('np-like-btn').addEventListener('click', () => {
      if (state.currentTrack) toggleLike(state.currentTrack);
    });

    // Shuffle & Repeat
    const shuffleBtns = [document.getElementById('player-shuffle-btn'), document.getElementById('np-shuffle-btn')];
    shuffleBtns.forEach(b => {
      b?.addEventListener('click', () => {
        state.isShuffle = !state.isShuffle;
        shuffleBtns.forEach(btn => btn?.classList.toggle('active', state.isShuffle));
        showNotification(state.isShuffle ? 'Shuffle ON' : 'Shuffle OFF');
      });
    });

    const repeatBtns = [document.getElementById('player-repeat-btn'), document.getElementById('np-repeat-btn')];
    repeatBtns.forEach(b => {
      b?.addEventListener('click', () => {
        if (state.repeatMode === 'off') {
          state.repeatMode = 'all';
          repeatBtns.forEach(btn => btn?.classList.add('active'));
          showNotification('Repeat ALL');
        } else if (state.repeatMode === 'all') {
          state.repeatMode = 'one';
          repeatBtns.forEach(btn => {
            if (btn) {
              btn.classList.add('active');
              btn.innerHTML = `<span style="font-size:0.75rem; font-weight:800;">1</span>`;
            }
          });
          showNotification('Repeat ONE');
        } else {
          state.repeatMode = 'off';
          repeatBtns.forEach(btn => {
            if (btn) {
              btn.classList.remove('active');
              btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`;
            }
          });
          showNotification('Repeat OFF');
        }
      });
    });

    // Seek Sliders
    const seekSliders = [document.getElementById('player-seek-slider'), document.getElementById('np-seek-slider')];
    seekSliders.forEach(slider => {
      slider?.addEventListener('input', (e) => {
        if (state.duration > 0) {
          const targetSec = (parseFloat(e.target.value) / 100) * state.duration;
          seekTo(targetSec);
        }
      });
    });

    // Volume Slider
    document.getElementById('volume-slider')?.addEventListener('input', (e) => {
      setVolume(e.target.value);
    });

    // Mobile Mini-Player -> Open Fullscreen Modal
    const nowPlayingModal = document.getElementById('now-playing-modal');
    document.getElementById('mini-player-clickable').addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        nowPlayingModal.classList.add('open');
      }
    });

    document.getElementById('now-playing-close-btn').addEventListener('click', () => {
      nowPlayingModal.classList.remove('open');
    });

    // Speed & Timer toggles in Fullscreen modal
    document.getElementById('np-speed-btn').addEventListener('click', cyclePlaybackSpeed);
    document.getElementById('np-timer-btn').addEventListener('click', () => {
      document.getElementById('timer-modal').classList.add('open');
    });
    document.getElementById('timer-toggle-btn')?.addEventListener('click', () => {
      document.getElementById('timer-modal').classList.add('open');
    });
    document.getElementById('timer-modal-close').addEventListener('click', () => {
      document.getElementById('timer-modal').classList.remove('open');
    });

    document.querySelectorAll('.timer-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const min = btn.getAttribute('data-minutes');
        setSleepTimer(min);
      });
    });

    // Queue Drawer & Modals
    const queueDrawer = document.getElementById('queue-drawer');
    const openQueue = () => {
      queueDrawer.classList.toggle('open');
      renderQueue();
    };

    document.getElementById('queue-toggle-btn')?.addEventListener('click', openQueue);
    document.getElementById('np-queue-btn')?.addEventListener('click', openQueue);
    document.getElementById('queue-close-btn').addEventListener('click', () => queueDrawer.classList.remove('open'));
    
    document.getElementById('queue-shuffle-btn')?.addEventListener('click', shuffleUpcomingQueue);
    document.getElementById('queue-clear-btn')?.addEventListener('click', clearUpcomingQueue);

    // Lyrics Modal
    const lyricsModal = document.getElementById('lyrics-modal');
    const openLyrics = () => lyricsModal.classList.add('open');
    document.getElementById('lyrics-toggle-btn')?.addEventListener('click', openLyrics);
    document.getElementById('np-lyrics-btn')?.addEventListener('click', openLyrics);
    document.getElementById('lyrics-close-btn').addEventListener('click', () => lyricsModal.classList.remove('open'));

    // Node Modal
    const nodeModal = document.getElementById('node-modal');
    document.getElementById('node-status-btn').addEventListener('click', () => {
      nodeModal.classList.add('open');
      fetchNodeStatus(false);
    });
    document.getElementById('node-close-btn').addEventListener('click', () => nodeModal.classList.remove('open'));

    // Playlist Modal
    const playlistModal = document.getElementById('playlist-modal');
    document.getElementById('sidebar-new-playlist-btn')?.addEventListener('click', () => playlistModal.classList.add('open'));
    document.getElementById('playlist-modal-close').addEventListener('click', () => playlistModal.classList.remove('open'));
    document.getElementById('playlist-save-btn').addEventListener('click', () => {
      const name = document.getElementById('playlist-name-input').value.trim();
      if (name) {
        state.playlists.push({ id: 'pl_' + Date.now(), name, tracks: [] });
        localStorage.setItem('yt_playlists', JSON.stringify(state.playlists));
        renderSidebarPlaylists();
        document.getElementById('playlist-name-input').value = '';
        playlistModal.classList.remove('open');
        showNotification(`Created playlist "${name}"`);
      }
    });

    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        e.target.classList.remove('open');
      }
    });

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        seekTo(Math.min(state.currentTime + 5, state.duration));
      } else if (e.code === 'ArrowLeft') {
        seekTo(Math.max(state.currentTime - 5, 0));
      } else if (e.key === 'n' || e.key === 'N') {
        playNextTrack();
      } else if (e.key === 'p' || e.key === 'P') {
        playPrevTrack();
      } else if (e.key === 'l' || e.key === 'L') {
        if (state.currentTrack) toggleLike(state.currentTrack);
      }
    });
  }

  function switchView(view) {
    state.activeView = view;
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-view') === view);
    });

    if (view === 'home') {
      loadCategory(state.activeCategory || 'trending');
    } else if (view === 'explore') {
      loadCategory('charts');
    } else if (view === 'library') {
      renderLibraryView();
    } else if (view === 'studio') {
      renderStudioView();
    }
  }

  function init() {
    initEventListeners();
    renderSidebarPlaylists();
    loadCategory('trending');
    fetchNodeStatus();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
