// Aura 3.0 Mobile Wi-Fi Remote Client — Real-Time Engine & Lossless Music Library
(function () {
  let ws = null;
  let isConnected = false;
  let reconnectTimeout = null;
  let isUserScrubbing = false;
  let isUserDraggingVolume = false;
  let volumeThrottle = null;
  let lastStateReceivedTime = Date.now();
  let currentActiveTab = 'player';
  let libraryTracks = [];
  let currentFilter = 'ALL';
  let searchQuery = '';

  let state = {
    title: 'Aura Lossless Studio',
    artist: 'Ready for Playback',
    album: 'Studio Reference',
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    volume: 0.85,
    sampleRate: 44100,
    bitsPerSample: 16,
    format: 'FLAC',
    hasCover: false,
    coverUrl: '/api/artwork',
    dynamicRating: 'BALANCED',
    crestFactorDb: 10.5,
    activePreset: 'Reference',
    stereoMode: 'true-stereo',
    trackPath: ''
  };

  // DOM Elements - Shell & Tabs
  const toast = document.getElementById('connection-toast');
  const toastText = document.getElementById('toast-text');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const tabNowPlaying = document.getElementById('tab-now-playing');
  const tabLibrary = document.getElementById('tab-library');
  const viewPlayer = document.getElementById('view-player');
  const viewLibrary = document.getElementById('view-library');
  const remoteLibCount = document.getElementById('remote-lib-count');
  const playerBadges = document.getElementById('player-badges');

  // DOM Elements - Now Playing
  const badgeFormat = document.getElementById('badge-format');
  const badgeDr = document.getElementById('badge-dr');
  const albumCover = document.getElementById('album-cover');
  const trackTitle = document.getElementById('track-title');
  const trackArtist = document.getElementById('track-artist');
  const trackAlbum = document.getElementById('track-album');

  const scrubberFill = document.getElementById('scrubber-fill');
  const scrubberInput = document.getElementById('scrubber-input');
  const currentTimeEl = document.getElementById('current-time');
  const remainingTimeEl = document.getElementById('remaining-time');

  const btnPlayPause = document.getElementById('btn-play-pause');
  const playIcon = document.getElementById('play-icon');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  const volumeSlider = document.getElementById('volume-slider');
  const volumeVal = document.getElementById('volume-val');
  const btnMute = document.getElementById('btn-mute');

  const segTrueStereo = document.getElementById('seg-true-stereo');
  const segCrossfeed = document.getElementById('seg-crossfeed');
  const segMono = document.getElementById('seg-mono');
  const presetSelector = document.getElementById('preset-selector');

  // DOM Elements - Library
  const libSearchInput = document.getElementById('lib-search-input');
  const libSearchClear = document.getElementById('lib-search-clear');
  const remoteLibraryList = document.getElementById('remote-library-list');
  const btnRescanDesktopLib = document.getElementById('btn-rescan-desktop-lib');

  // DOM Elements - Floating Mini Player
  const floatingMiniPlayer = document.getElementById('floating-mini-player');
  const miniPlayerClickable = document.getElementById('mini-player-clickable');
  const miniArtImg = document.getElementById('mini-art-img');
  const miniTitle = document.getElementById('mini-title');
  const miniArtist = document.getElementById('mini-artist');
  const miniBtnPlay = document.getElementById('mini-btn-play');
  const miniPlayIcon = document.getElementById('mini-play-icon');

  function haptic(ms = 12) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  }

  function formatDuration(sec) {
    if (!sec || isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(text, duration = 2400) {
    toastText.textContent = text;
    toast.classList.add('visible');
    setTimeout(() => {
      if (isConnected) toast.classList.remove('visible');
    }, duration);
  }

  function updatePlayPauseIcons() {
    const pauseSvg = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
    const playSvg = '<polygon points="6 4 20 12 6 20 6 4"></polygon>';
    if (playIcon) playIcon.innerHTML = state.isPlaying ? pauseSvg : playSvg;
    if (miniPlayIcon) miniPlayIcon.innerHTML = state.isPlaying ? pauseSvg : playSvg;
  }

  // Connect to the WebSocket on the desktop host with automatic retry
  function connect() {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected = true;
      statusDot.className = 'status-indicator live';
      statusText.textContent = 'WI-FI LINK ACTIVE';
      toast.classList.remove('visible');
      // Fetch initial library
      fetchLibrary();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state' && msg.data) {
          applyState(msg.data);
        } else if (msg.type === 'tick' && msg.data) {
          applyTick(msg.data);
        } else if (msg.type === 'library' && msg.data) {
          applyLibrary(msg.data);
        }
      } catch (err) {
        console.error('WS Parse Error:', err);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      statusDot.className = 'status-indicator offline';
      statusText.textContent = 'CONNECTING...';
      toastText.textContent = 'Reconnecting to Aura Desktop...';
      toast.classList.add('visible');
      reconnectTimeout = setTimeout(connect, 1500);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  // Dispatch commands to desktop
  function sendCommand(cmd, data = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ command: cmd, action: cmd, ...data }));
    }
  }

  // REST Fallback for Library Fetching
  async function fetchLibrary() {
    try {
      const res = await fetch('/api/library');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.tracks)) {
          applyLibrary(data.tracks);
        }
      }
    } catch (e) {
      console.warn('Library fetch error:', e);
    }
  }

  // Library Updates
  function applyLibrary(tracks) {
    if (!Array.isArray(tracks)) return;
    libraryTracks = tracks;
    if (remoteLibCount) {
      remoteLibCount.textContent = tracks.length;
    }
    renderLibrary();
  }

  // Render Music Library with Search & Filter
  function renderLibrary() {
    if (!remoteLibraryList) return;

    let filtered = libraryTracks;

    // Filter by type
    if (currentFilter === 'FLAC') {
      filtered = filtered.filter(t => (t.format && t.format.toUpperCase() === 'FLAC') || (t.path && t.path.toLowerCase().endsWith('.flac')));
    } else if (currentFilter === 'HIRES') {
      filtered = filtered.filter(t => (t.bitsPerSample && t.bitsPerSample > 16) || (t.sampleRate && t.sampleRate > 48000));
    }

    // Filter by query
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.artist && t.artist.toLowerCase().includes(q)) ||
        (t.album && t.album.toLowerCase().includes(q)) ||
        (t.format && t.format.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      if (libraryTracks.length === 0) {
        remoteLibraryList.innerHTML = `
          <div class="library-empty">
            <div class="spinner-dot"></div>
            <div>Scanning desktop for lossless music...</div>
          </div>
        `;
      } else {
        remoteLibraryList.innerHTML = `
          <div class="library-empty">
            <div style="font-weight: 700; color: #fff; font-size: 15px;">No Songs Found</div>
            <div>No tracks matching &ldquo;<span style="color: var(--accent-gold);">${escapeHtml(searchQuery)}</span>&rdquo;</div>
          </div>
        `;
      }
      return;
    }

    remoteLibraryList.innerHTML = '';

    filtered.forEach((t) => {
      const isCurrentPlaying = (state.trackPath && t.path && state.trackPath.toLowerCase() === t.path.toLowerCase()) ||
        (state.title && t.title && state.title.toLowerCase() === t.title.toLowerCase() && state.artist && t.artist && state.artist.toLowerCase() === t.artist.toLowerCase());

      const item = document.createElement('div');
      item.className = `remote-track-item ${isCurrentPlaying ? 'playing' : ''}`;

      const rateKhz = t.sampleRate ? `${(t.sampleRate / 1000).toFixed(1)}kHz` : '44.1kHz';
      const bits = t.bitsPerSample ? `${t.bitsPerSample}-bit` : '16-bit';
      const isHires = (t.bitsPerSample > 16) || (t.sampleRate > 48000);
      const isFlac = (t.format && t.format.toUpperCase() === 'FLAC') || (t.path && t.path.toLowerCase().endsWith('.flac'));

      const artUrl = `/api/track-art?path=${encodeURIComponent(t.path)}`;

      item.innerHTML = `
        <div class="remote-track-thumb-box">
          <img class="remote-track-thumb" src="${artUrl}" loading="lazy" alt="" onerror="this.src='/api/artwork';">
        </div>
        <div class="remote-track-meta">
          <div class="remote-track-title">${escapeHtml(t.title)}</div>
          <div class="remote-track-sub">${escapeHtml(t.artist)}${t.album ? ' \u2022 ' + escapeHtml(t.album) : ''}</div>
          <div class="remote-track-badges">
            <span class="tag-mini ${isFlac ? 'flac' : ''}">${t.format || 'FLAC'}</span>
            <span class="tag-mini ${isHires ? 'hires' : ''}">${bits} \u2022 ${rateKhz}</span>
          </div>
        </div>
        <div class="remote-track-right">
          ${isCurrentPlaying && state.isPlaying ? `
            <div class="eq-bars">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
          ` : ''}
          <span class="remote-track-duration">${formatDuration(t.duration)}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        haptic(16);
        // Play song on desktop
        sendCommand('play-track', { path: t.path, index: t.index });
        // Optimistically update Now Playing metadata
        state.title = t.title;
        state.artist = t.artist;
        state.album = t.album;
        state.duration = t.duration;
        state.format = t.format;
        state.sampleRate = t.sampleRate;
        state.bitsPerSample = t.bitsPerSample;
        state.trackPath = t.path;
        state.isPlaying = true;
        updatePlayPauseIcons();
        applyState(state);
        // Switch to Now Playing tab
        switchTab('player');
      });

      remoteLibraryList.appendChild(item);
    });
  }

  // Switch Tabs: Now Playing vs Library
  function switchTab(target) {
    currentActiveTab = target;
    haptic(10);

    if (target === 'player') {
      tabNowPlaying.classList.add('active');
      tabLibrary.classList.remove('active');
      viewPlayer.classList.add('active');
      viewLibrary.classList.remove('active');
      if (playerBadges) playerBadges.style.display = 'flex';
      if (floatingMiniPlayer) floatingMiniPlayer.style.display = 'none';
    } else {
      tabLibrary.classList.add('active');
      tabNowPlaying.classList.remove('active');
      viewLibrary.classList.add('active');
      viewPlayer.classList.remove('active');
      if (playerBadges) playerBadges.style.display = 'none';
      if (floatingMiniPlayer) floatingMiniPlayer.style.display = 'flex';
      renderLibrary();
    }
  }

  tabNowPlaying.addEventListener('click', () => switchTab('player'));
  tabLibrary.addEventListener('click', () => switchTab('library'));

  // Mini Player Tap opens Now Playing view
  if (miniPlayerClickable) {
    miniPlayerClickable.addEventListener('click', () => switchTab('player'));
  }

  if (miniBtnPlay) {
    miniBtnPlay.addEventListener('click', (e) => {
      e.stopPropagation();
      haptic(18);
      state.isPlaying = !state.isPlaying;
      updatePlayPauseIcons();
      sendCommand('toggle-play');
    });
  }

  // Search input listeners
  if (libSearchInput) {
    libSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (libSearchClear) libSearchClear.style.display = searchQuery ? 'block' : 'none';
      renderLibrary();
    });
  }

  if (libSearchClear) {
    libSearchClear.addEventListener('click', () => {
      if (libSearchInput) {
        libSearchInput.value = '';
        libSearchInput.focus();
      }
      searchQuery = '';
      libSearchClear.style.display = 'none';
      renderLibrary();
    });
  }

  // Filter chips
  document.querySelectorAll('.lib-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      haptic(10);
      document.querySelectorAll('.lib-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.getAttribute('data-filter') || 'ALL';
      renderLibrary();
    });
  });

  // Rescan desktop library button
  if (btnRescanDesktopLib) {
    btnRescanDesktopLib.addEventListener('click', () => {
      haptic(14);
      showToast('Rescanning lossless audio folders...');
      sendCommand('rescan-library');
      setTimeout(fetchLibrary, 1200);
    });
  }

  // Periodic lightweight progress tick
  function applyTick(data) {
    if (data.currentTime !== undefined && !isUserScrubbing) {
      state.currentTime = data.currentTime;
      lastStateReceivedTime = Date.now();
    }
    if (data.duration !== undefined && data.duration > 0) {
      state.duration = data.duration;
    }
    if (data.isPlaying !== undefined && state.isPlaying !== data.isPlaying) {
      state.isPlaying = data.isPlaying;
      updatePlayPauseIcons();
    }
    if (data.volume !== undefined && !isUserDraggingVolume && document.activeElement !== volumeSlider) {
      state.volume = data.volume;
      const v = Math.round(data.volume * 100);
      volumeSlider.value = v;
      volumeVal.textContent = `${v}%`;
    }
    updateProgressUI();
  }

  // Full playback state update
  function applyState(newState) {
    state = { ...state, ...newState };
    lastStateReceivedTime = Date.now();

    // Track Metadata
    if (newState.title !== undefined) {
      trackTitle.textContent = state.title || 'Unknown Title';
      if (miniTitle) miniTitle.textContent = state.title || 'Unknown Title';
    }
    if (newState.artist !== undefined) {
      trackArtist.textContent = state.artist || 'Aura Lossless Studio';
      if (miniArtist) miniArtist.textContent = state.artist || 'Aura Lossless Studio';
    }
    if (newState.album !== undefined) {
      trackAlbum.textContent = state.album || '';
    }

    // Album Artwork
    if (state.coverUrl) {
      try {
        const resolved = new URL(state.coverUrl, location.href).href;
        if (albumCover.src !== resolved) {
          albumCover.src = state.coverUrl;
        }
        if (miniArtImg && miniArtImg.src !== resolved) {
          miniArtImg.src = state.coverUrl;
        }
      } catch (e) {
        albumCover.src = state.coverUrl;
      }
    }

    // Audio Specification Badges
    const bits = state.bitsPerSample || 16;
    const rateKhz = state.sampleRate ? (state.sampleRate / 1000).toFixed(1) : '44.1';
    badgeFormat.textContent = `${state.format || 'FLAC'} ${bits}-BIT / ${rateKhz}kHz`;

    const drVal = state.crestFactorDb !== undefined ? state.crestFactorDb.toFixed(1) : '14.0';
    badgeDr.textContent = `DR ${drVal} dB`;
    if (state.dynamicRating === 'DYNAMIC') {
      badgeDr.className = 'badge badge-gold';
    } else if (state.dynamicRating === 'COMPRESSED') {
      badgeDr.className = 'badge';
      badgeDr.style.color = '#ef4444';
    } else {
      badgeDr.className = 'badge';
      badgeDr.style.color = '#f5d485';
    }

    // Play / Pause Icon
    updatePlayPauseIcons();

    // Volume Slider (only update when user is NOT touching the slider)
    if (state.volume !== undefined && !isUserDraggingVolume && document.activeElement !== volumeSlider) {
      const v = Math.round(state.volume * 100);
      volumeSlider.value = v;
      volumeVal.textContent = `${v}%`;
    }

    // Stereo Mode Segments
    [segTrueStereo, segCrossfeed, segMono].forEach(b => {
      if (b) b.classList.toggle('active', b.getAttribute('data-mode') === state.stereoMode);
    });

    // Acoustic Target Presets
    if (state.activePreset) {
      const match = Array.from(presetSelector.options).find(o => 
        o.text.toLowerCase().includes(state.activePreset.toLowerCase()) || 
        o.value.toLowerCase() === state.activePreset.toLowerCase()
      );
      if (match) presetSelector.value = match.value;
    }

    updateProgressUI();

    // Re-render library highlight for currently playing track
    if (currentActiveTab === 'library') {
      renderLibrary();
    }
  }

  function updateProgressUI() {
    if (isUserScrubbing) return;

    let current = state.currentTime || 0;
    if (state.isPlaying) {
      const elapsedSinceUpdate = (Date.now() - lastStateReceivedTime) / 1000;
      current = Math.min(state.duration || 0, current + elapsedSinceUpdate);
    }

    const duration = state.duration || 0;
    const progress = duration > 0 ? (current / duration) * 100 : 0;

    scrubberFill.style.width = `${progress}%`;
    scrubberInput.value = progress;

    currentTimeEl.textContent = formatDuration(current);
    const rem = duration - current;
    remainingTimeEl.textContent = `-${formatDuration(rem >= 0 ? rem : 0)}`;
  }

  // 60 FPS Scrubber timer loop
  function startProgressLoop() {
    updateProgressUI();
    requestAnimationFrame(startProgressLoop);
  }

  // 1. Play / Pause
  btnPlayPause.addEventListener('click', () => {
    haptic(18);
    state.isPlaying = !state.isPlaying;
    updatePlayPauseIcons();
    sendCommand('toggle-play');
  });

  // 2. Track Navigation
  btnPrev.addEventListener('click', () => {
    haptic(14);
    sendCommand('prev');
  });

  btnNext.addEventListener('click', () => {
    haptic(14);
    sendCommand('next');
  });

  // 3. Real-Time Scrubber Seeking
  scrubberInput.addEventListener('input', (e) => {
    isUserScrubbing = true;
    const pct = parseFloat(e.target.value);
    scrubberFill.style.width = `${pct}%`;
    const seekTime = (pct / 100) * (state.duration || 0);
    currentTimeEl.textContent = formatDuration(seekTime);
    const rem = (state.duration || 0) - seekTime;
    remainingTimeEl.textContent = `-${formatDuration(rem >= 0 ? rem : 0)}`;
  });

  const commitSeek = () => {
    if (!isUserScrubbing) return;
    isUserScrubbing = false;
    const pct = parseFloat(scrubberInput.value);
    const seekTime = (pct / 100) * (state.duration || 0);
    state.currentTime = seekTime;
    lastStateReceivedTime = Date.now();
    updateProgressUI();
    haptic(15);
    sendCommand('seek', { time: seekTime });
  };

  scrubberInput.addEventListener('change', commitSeek);
  scrubberInput.addEventListener('pointerup', commitSeek);
  scrubberInput.addEventListener('touchend', commitSeek);

  // 4. Real-Time Volume Control
  ['pointerdown', 'touchstart'].forEach(ev => {
    volumeSlider.addEventListener(ev, () => {
      isUserDraggingVolume = true;
    });
  });

  ['pointerup', 'touchend', 'change'].forEach(ev => {
    window.addEventListener(ev, () => {
      if (isUserDraggingVolume) {
        isUserDraggingVolume = false;
        const val = parseInt(volumeSlider.value, 10);
        sendCommand('volume', { volume: val / 100 });
      }
    });
  });

  volumeSlider.addEventListener('input', (e) => {
    isUserDraggingVolume = true;
    const val = parseInt(e.target.value, 10);
    volumeVal.textContent = `${val}%`;
    state.volume = val / 100;

    if (volumeThrottle) clearTimeout(volumeThrottle);
    volumeThrottle = setTimeout(() => {
      sendCommand('volume', { volume: val / 100 });
    }, 25);
  });

  btnMute.addEventListener('click', () => {
    haptic(10);
    if (parseInt(volumeSlider.value, 10) > 0) {
      volumeSlider.dataset.prev = volumeSlider.value;
      volumeSlider.value = 0;
      volumeVal.textContent = '0%';
      state.volume = 0;
      sendCommand('volume', { volume: 0 });
    } else {
      const restore = volumeSlider.dataset.prev || 85;
      volumeSlider.value = restore;
      volumeVal.textContent = `${restore}%`;
      state.volume = parseInt(restore, 10) / 100;
      sendCommand('volume', { volume: state.volume });
    }
  });

  // 5. Instant Stereo Mode Switching
  [segTrueStereo, segCrossfeed, segMono].forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      haptic(14);
      state.stereoMode = mode;
      [segTrueStereo, segCrossfeed, segMono].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sendCommand('set-stereo-mode', { mode });
    });
  });

  // 6. Acoustic Target Preset Switching
  presetSelector.addEventListener('change', (e) => {
    haptic(14);
    state.activePreset = e.target.value;
    sendCommand('set-preset', { preset: e.target.value });
  });

  // Initialize
  connect();
  startProgressLoop();
})();
