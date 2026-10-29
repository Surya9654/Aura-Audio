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
    activePresetId: 'flat_reference',
    stereoMode: 'true-stereo',
    stereoWidth: 1.0,
    stereoBalance: 0,
    channelSwap: false,
    trackPath: ''
  };

  let isUserDraggingStereo = false;
  let stereoThrottle = null;

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
  const segWide = document.getElementById('seg-wide');
  const segCrossfeed = document.getElementById('seg-crossfeed');
  const segMono = document.getElementById('seg-mono');
  const stereoLivePill = document.getElementById('stereo-live-pill');
  const stereoModeDesc = document.getElementById('stereo-mode-desc');
  const remoteStereoWidth = document.getElementById('remote-stereo-width');
  const remoteStereoWidthVal = document.getElementById('remote-stereo-width-val');
  const remoteStereoBalance = document.getElementById('remote-stereo-balance');
  const remoteStereoBalanceVal = document.getElementById('remote-stereo-balance-val');
  const remoteChannelSwap = document.getElementById('remote-channel-swap');
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

  let failedReconnects = 0;
  let activeSsid = '';
  let activeOrigin = location.origin;
  let isScanningNetwork = false;

  function resolveApiUrl(pathOrUrl) {
    if (!pathOrUrl) return `${activeOrigin}/api/artwork`;
    if (/^(https?:|data:|blob:)/i.test(pathOrUrl)) return pathOrUrl;
    const prefix = pathOrUrl.startsWith('/') ? '' : '/';
    return `${activeOrigin}${prefix}${pathOrUrl}`;
  }

  function getWsUrlForOrigin(origin) {
    try {
      const u = new URL(origin);
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${u.host}/ws`;
    } catch (e) {
      const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${location.host}/ws`;
    }
  }

  function getRemotePort() {
    try {
      return new URL(activeOrigin).port || location.port || '4040';
    } catch (e) {
      return location.port || '4040';
    }
  }

  function switchActiveHost(nextOrigin, info) {
    if (!nextOrigin) return;
    const prevOrigin = activeOrigin;
    activeOrigin = nextOrigin.replace(/\/+$/, '');
    try {
      localStorage.setItem('aura.lastActiveOrigin', activeOrigin);
    } catch (e) {}

    if (info) {
      applyNetworkInfo(info, true);
    }

    if (prevOrigin !== activeOrigin || !isConnected) {
      connect();
    }
  }

  function applyNetworkInfo(info, skipSwitchCheck = false) {
    if (!info) return;
    if (info.ssid !== undefined) {
      activeSsid = info.ssid || '';
    }
    if (isConnected) {
      const hostTag = info.ip && info.ip !== '127.0.0.1' ? ` • ${info.ip}` : '';
      statusText.textContent = activeSsid
        ? `WI-FI: ${activeSsid.toUpperCase()}`
        : `WI-FI LINK ACTIVE${hostTag}`;
    }
    try {
      if (info.url && info.ip && info.ip !== '127.0.0.1') {
        localStorage.setItem('aura.lastActiveOrigin', new URL(info.url).origin);
      }
      if (info.hostnameUrl) localStorage.setItem('aura.remoteHostnameUrl', info.hostnameUrl);
      if (info.auraLocalUrl) localStorage.setItem('aura.auraLocalUrl', info.auraLocalUrl);
      if (Array.isArray(info.adapters)) {
        localStorage.setItem('aura.remoteAdapters', JSON.stringify(info.adapters.map(a => a.url).filter(Boolean)));
      }
    } catch (e) {}

    // If desktop switched to a new Wi-Fi IP while connected, seamlessly follow the new origin
    if (!skipSwitchCheck && info.url && info.ip && info.ip !== '127.0.0.1') {
      try {
        const targetOrigin = new URL(info.url).origin;
        const currentHost = new URL(activeOrigin).hostname;
        const isUsingLocalDomain = currentHost.endsWith('.local') || currentHost === 'localhost' || currentHost === '127.0.0.1';
        if (!isUsingLocalDomain && targetOrigin !== activeOrigin) {
          probeOrigin(targetOrigin, 1200).then((verified) => {
            if (verified) switchActiveHost(targetOrigin, verified);
          });
        }
      } catch (e) {}
    }
  }

  async function probeOrigin(origin, timeoutMs = 900) {
    if (!origin) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${origin}/api/info`, {
        mode: 'cors',
        signal: ctrl.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.app === 'aura-remote' || data.port !== undefined)) {
          return data;
        }
      }
    } catch (e) {}
    return null;
  }

  function extractIpv4Prefix(hostname) {
    if (!hostname) return null;
    const m = String(hostname).match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
    return m ? m[1] : null;
  }

  // Detect phone's local subnet prefix via WebRTC ICE candidate when browser permits
  function detectWebRtcSubnetPrefix() {
    return new Promise((resolve) => {
      const RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection;
      if (!RTCPeer) return resolve(null);
      let settled = false;
      const done = (val) => {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      };
      try {
        const pc = new RTCPeer({ iceServers: [] });
        pc.createDataChannel('');
        pc.onicecandidate = (e) => {
          if (!e || !e.candidate || !e.candidate.candidate) return;
          const m = e.candidate.candidate.match(/((?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3})\.\d{1,3}/);
          if (m && m[1]) {
            try { pc.close(); } catch (err) {}
            done(m[1]);
          }
        };
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => done(null));
        setTimeout(() => {
          try { pc.close(); } catch (err) {}
          done(null);
        }, 500);
      } catch (e) {
        done(null);
      }
    });
  }

  // Multi-strategy automatic Wi-Fi discovery:
  // 1) Probes mDNS (.local), aura.local, and last known adapter URLs
  // 2) Sweeps active /24 subnet & common Wi-Fi/hotspot DHCP ranges in fast parallel batches
  async function discoverDesktopOnNewWifi() {
    if (isConnected || isScanningNetwork) return;
    isScanningNetwork = true;

    try {
      const port = getRemotePort();
      const fastCandidates = new Set([
        `http://aura.local:${port}`
      ]);

      try {
        const lastActive = localStorage.getItem('aura.lastActiveOrigin');
        if (lastActive) fastCandidates.add(new URL(lastActive).origin);
        const savedHostUrl = localStorage.getItem('aura.remoteHostnameUrl');
        if (savedHostUrl) fastCandidates.add(new URL(savedHostUrl).origin);
        const savedAuraLocal = localStorage.getItem('aura.auraLocalUrl');
        if (savedAuraLocal) fastCandidates.add(new URL(savedAuraLocal).origin);
        const savedAdapters = JSON.parse(localStorage.getItem('aura.remoteAdapters') || '[]');
        savedAdapters.forEach(u => {
          try { fastCandidates.add(new URL(u).origin); } catch (e) {}
        });
      } catch (e) {}

      // Phase 1: Parallel probe of mDNS & cached origins
      const phase1Results = await Promise.all(
        Array.from(fastCandidates).map(async (origin) => {
          const info = await probeOrigin(origin, 1100);
          return info ? { origin, info } : null;
        })
      );
      const fastHit = phase1Results.find(Boolean);
      if (fastHit && !isConnected) {
        const bestOrigin = (fastHit.info.url && fastHit.info.ip && fastHit.info.ip !== '127.0.0.1')
          ? new URL(fastHit.info.url).origin
          : fastHit.origin;
        toastText.textContent = `Connected to ${fastHit.info.ssid || 'Wi-Fi'} (${fastHit.info.ip || bestOrigin})`;
        switchActiveHost(bestOrigin, fastHit.info);
        return;
      }

      if (isConnected) return;

      // Phase 2: Fast parallel subnet sweep across current & detected /24 Wi-Fi subnets
      toastText.textContent = 'Adapting to current Wi-Fi network...';
      const subnets = [];
      const addSubnet = (prefix) => {
        if (prefix && !subnets.includes(prefix)) subnets.push(prefix);
      };

      try { addSubnet(extractIpv4Prefix(new URL(activeOrigin).hostname)); } catch (e) {}
      addSubnet(extractIpv4Prefix(location.hostname));
      const rtcPrefix = await detectWebRtcSubnetPrefix();
      addSubnet(rtcPrefix);

      // Common home Wi-Fi & phone hotspot subnets
      ['192.168.1', '192.168.0', '192.168.29', '192.168.43', '172.20.10', '10.0.0'].forEach(addSubnet);

      // Scan full 1..254 on the primary subnet, and common DHCP client numbers (2..65, 100..145) on secondary subnets
      const ipQueue = [];
      subnets.forEach((prefix, idx) => {
        if (idx === 0) {
          // Prioritize common low DHCP addresses first (2..80), then 81..254
          for (let i = 2; i <= 80; i++) ipQueue.push(`http://${prefix}.${i}:${port}`);
          for (let i = 81; i <= 254; i++) ipQueue.push(`http://${prefix}.${i}:${port}`);
        } else {
          for (let i = 2; i <= 55; i++) ipQueue.push(`http://${prefix}.${i}:${port}`);
          for (let i = 100; i <= 140; i++) ipQueue.push(`http://${prefix}.${i}:${port}`);
        }
      });

      const BATCH_SIZE = 36;
      for (let i = 0; i < ipQueue.length; i += BATCH_SIZE) {
        if (isConnected) return;
        const batch = ipQueue.slice(i, i + BATCH_SIZE);
        const found = await new Promise((resolve) => {
          let pending = batch.length;
          let resolved = false;
          batch.forEach((candidateOrigin) => {
            probeOrigin(candidateOrigin, 650).then((info) => {
              if (!resolved && info) {
                resolved = true;
                resolve({ origin: candidateOrigin, info });
                return;
              }
              pending--;
              if (pending === 0 && !resolved) {
                resolve(null);
              }
            });
          });
        });

        if (found && !isConnected) {
          const bestOrigin = (found.info.url && found.info.ip && found.info.ip !== '127.0.0.1')
            ? new URL(found.info.url).origin
            : found.origin;
          toastText.textContent = `Adapted to ${found.info.ssid || 'Wi-Fi'} (${found.info.ip})`;
          switchActiveHost(bestOrigin, found.info);
          return;
        }
      }
    } finally {
      isScanningNetwork = false;
    }
  }

  // Connect to the WebSocket on the active desktop host with automatic Wi-Fi adaptation & retry
  function connect() {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);

    const wsUrl = getWsUrlForOrigin(activeOrigin);

    try {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.onclose = null;
        ws.close();
      }
    } catch (e) {}

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected = true;
      failedReconnects = 0;
      try {
        localStorage.setItem('aura.lastActiveOrigin', activeOrigin);
      } catch (e) {}
      statusDot.className = 'status-indicator live';
      statusText.textContent = activeSsid ? `WI-FI: ${activeSsid.toUpperCase()}` : 'WI-FI LINK ACTIVE';
      toast.classList.remove('visible');
      // Refresh artwork & library against active host
      if (state.coverUrl) {
        const resolved = resolveApiUrl(state.coverUrl);
        if (albumCover) albumCover.src = resolved;
        if (miniArtImg) miniArtImg.src = resolved;
      }
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
        } else if (msg.type === 'network-info' && msg.data) {
          applyNetworkInfo(msg.data);
        }
      } catch (err) {
        console.error('WS Parse Error:', err);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      failedReconnects++;
      statusDot.className = 'status-indicator offline';
      statusText.textContent = 'ADAPTING WI-FI...';
      toastText.textContent = failedReconnects >= 1
        ? 'Finding Aura Desktop on current Wi-Fi...'
        : 'Reconnecting to Aura Desktop...';
      toast.classList.add('visible');

      // Immediately trigger multi-strategy Wi-Fi discovery on disconnect
      discoverDesktopOnNewWifi();
      reconnectTimeout = setTimeout(connect, 1800);
    };

    ws.onerror = () => {
      try { ws.close(); } catch (e) {}
    };
  }

  // Reconnect immediately when phone switches Wi-Fi networks or wakes from sleep
  window.addEventListener('online', () => {
    if (!isConnected) {
      discoverDesktopOnNewWifi();
      connect();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !isConnected) {
      discoverDesktopOnNewWifi();
      connect();
    }
  });

  // Register App-Shell Service Worker so saved bookmarks / PWAs boot offline even when IP changes
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
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
      const res = await fetch(resolveApiUrl('/api/library'), { mode: 'cors', cache: 'no-store' });
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

      const artUrl = resolveApiUrl(`/api/track-art?path=${encodeURIComponent(t.path)}`);
      const fallbackArtUrl = resolveApiUrl('/api/artwork');

      item.innerHTML = `
        <div class="remote-track-thumb-box">
          <img class="remote-track-thumb" src="${artUrl}" loading="lazy" alt="" onerror="this.onerror=null;this.src='${fallbackArtUrl}';">
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
        const resolved = resolveApiUrl(state.coverUrl);
        if (albumCover.src !== resolved) {
          albumCover.src = resolved;
        }
        if (miniArtImg && miniArtImg.src !== resolved) {
          miniArtImg.src = resolved;
        }
      } catch (e) {
        albumCover.src = resolveApiUrl(state.coverUrl);
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

    // Stereo Mode & Soundstage UI
    updateStereoUI();

    // Acoustic Target Presets
    if (state.activePresetId || state.activePreset) {
      const targetId = (state.activePresetId || '').toLowerCase();
      const targetName = (state.activePreset || '').toLowerCase().replace(/[-_]/g, ' ');
      const match = Array.from(presetSelector.options).find(o =>
        (targetId && o.value.toLowerCase() === targetId) ||
        o.value.toLowerCase().replace(/[-_]/g, ' ') === targetName ||
        o.text.toLowerCase().replace(/[-_]/g, ' ').includes(targetName) ||
        targetName.includes(o.text.toLowerCase().split(' (')[0].replace(/[-_]/g, ' '))
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

  // 5. Stereo & Soundstage Architecture Controls
  const STEREO_MODE_META = {
    'true-stereo': {
      pill: 'DIRECT 2.0',
      desc: 'Unaltered discrete Left & Right channels with 100% studio separation.'
    },
    'wide': {
      pill: 'WIDE 3D STAGE',
      desc: 'Mid/Side spatial expansion (145% width) for an open, out-of-head concert stage.'
    },
    'crossfeed': {
      pill: 'SPEAKER STAGE',
      desc: 'Binaural speaker simulation (bs2b) — blends natural room cues across ears to reduce headphone fatigue.'
    },
    'mono': {
      pill: 'MONO CENTER',
      desc: 'Phase-aligned L+R center folddown for single-earphone or mono reference listening.'
    }
  };

  function updateStereoUI() {
    const mode = state.stereoMode || 'true-stereo';
    [segTrueStereo, segWide, segCrossfeed, segMono].forEach(b => {
      if (b) b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });

    const meta = STEREO_MODE_META[mode] || STEREO_MODE_META['true-stereo'];
    if (stereoLivePill) {
      const swapSuffix = state.channelSwap ? ' • L↔R' : '';
      stereoLivePill.textContent = `${meta.pill}${swapSuffix}`;
    }
    if (stereoModeDesc) {
      stereoModeDesc.textContent = meta.desc;
    }

    if (!isUserDraggingStereo) {
      if (remoteStereoWidth && state.stereoWidth !== undefined) {
        const wPct = Math.round(state.stereoWidth * 100);
        remoteStereoWidth.value = wPct;
        if (remoteStereoWidthVal) {
          remoteStereoWidthVal.textContent = wPct === 100 ? '100%' : (wPct === 0 ? 'Mono' : `${wPct}%`);
        }
      }
      if (remoteStereoBalance && state.stereoBalance !== undefined) {
        const bPct = Math.round(state.stereoBalance * 100);
        remoteStereoBalance.value = bPct;
        if (remoteStereoBalanceVal) {
          remoteStereoBalanceVal.textContent = bPct === 0 ? 'Center' : (bPct < 0 ? `L ${Math.abs(bPct)}%` : `R ${bPct}%`);
        }
      }
    }

    if (remoteChannelSwap) {
      remoteChannelSwap.classList.toggle('active', !!state.channelSwap);
    }
  }

  [segTrueStereo, segWide, segCrossfeed, segMono].forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      haptic(14);
      state.stereoMode = mode;
      if (mode === 'true-stereo') state.stereoWidth = 1.0;
      else if (mode === 'wide') state.stereoWidth = 1.45;
      else if (mode === 'mono') state.stereoWidth = 0.0;
      else if (mode === 'crossfeed') state.stereoWidth = 1.0;
      updateStereoUI();
      sendCommand('set-stereo-mode', { mode });
    });
  });

  if (remoteStereoWidth) {
    ['pointerdown', 'touchstart'].forEach(ev => {
      remoteStereoWidth.addEventListener(ev, () => { isUserDraggingStereo = true; });
    });
    ['pointerup', 'touchend', 'change'].forEach(ev => {
      remoteStereoWidth.addEventListener(ev, () => {
        isUserDraggingStereo = false;
        const w = parseInt(remoteStereoWidth.value, 10) / 100;
        sendCommand('set-stereo-width', { width: w });
      });
    });
    remoteStereoWidth.addEventListener('input', (e) => {
      isUserDraggingStereo = true;
      const wPct = parseInt(e.target.value, 10);
      const w = wPct / 100;
      state.stereoWidth = w;
      if (state.stereoMode !== 'crossfeed') {
        state.stereoMode = w <= 0.02 ? 'mono' : (w > 1.05 ? 'wide' : 'true-stereo');
      }
      if (remoteStereoWidthVal) {
        remoteStereoWidthVal.textContent = wPct === 100 ? '100%' : (wPct === 0 ? 'Mono' : `${wPct}%`);
      }
      updateStereoUI();
      if (stereoThrottle) clearTimeout(stereoThrottle);
      stereoThrottle = setTimeout(() => {
        sendCommand('set-stereo-width', { width: w });
      }, 25);
    });
  }

  if (remoteStereoBalance) {
    ['pointerdown', 'touchstart'].forEach(ev => {
      remoteStereoBalance.addEventListener(ev, () => { isUserDraggingStereo = true; });
    });
    ['pointerup', 'touchend', 'change'].forEach(ev => {
      remoteStereoBalance.addEventListener(ev, () => {
        isUserDraggingStereo = false;
        const b = parseInt(remoteStereoBalance.value, 10) / 100;
        sendCommand('set-stereo-balance', { balance: b });
      });
    });
    remoteStereoBalance.addEventListener('input', (e) => {
      isUserDraggingStereo = true;
      let bPct = parseInt(e.target.value, 10);
      if (Math.abs(bPct) <= 4) {
        bPct = 0;
        remoteStereoBalance.value = 0;
      }
      const b = bPct / 100;
      state.stereoBalance = b;
      if (remoteStereoBalanceVal) {
        remoteStereoBalanceVal.textContent = bPct === 0 ? 'Center' : (bPct < 0 ? `L ${Math.abs(bPct)}%` : `R ${bPct}%`);
      }
      if (stereoThrottle) clearTimeout(stereoThrottle);
      stereoThrottle = setTimeout(() => {
        sendCommand('set-stereo-balance', { balance: b });
      }, 25);
    });
  }

  if (remoteChannelSwap) {
    remoteChannelSwap.addEventListener('click', () => {
      haptic(14);
      state.channelSwap = !state.channelSwap;
      updateStereoUI();
      sendCommand('set-channel-swap', { swap: state.channelSwap });
    });
  }

  // 6. Acoustic Target Preset Switching
  presetSelector.addEventListener('change', (e) => {
    haptic(14);
    state.activePresetId = e.target.value;
    sendCommand('set-preset', { preset: e.target.value });
  });

  // Initialize
  updateStereoUI();
  connect();
  startProgressLoop();
})();
