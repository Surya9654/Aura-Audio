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
    isTrackLoading: false,
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
    phaseInvert: false,
    activeThemeId: 'gold',
    isBitPerfect: false,
    subsonicFilterEnabled: true,
    noiseGateEnabled: true,
    playbackDestination: 'desktop',
    activeSinkDeviceId: 'default',
    activeSinkDeviceLabel: 'System Default Audio',
    availableOutputDevices: [],
    stateTimestamp: 0,
    desktopOutputLatency: 0,
    trackPath: ''
  };

  let isUserDraggingStereo = false;
  let stereoThrottle = null;

  // DOM Elements - Shell & Tabs
  const toast = document.getElementById('connection-toast');
  const toastText = document.getElementById('toast-text');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const remoteThemePill = document.getElementById('remote-theme-pill');
  const remoteThemeDot = document.getElementById('remote-theme-dot');
  const remoteThemeLabel = document.getElementById('remote-theme-label');
  const tabNowPlaying = document.getElementById('tab-now-playing');
  const tabLibrary = document.getElementById('tab-library');
  const viewPlayer = document.getElementById('view-player');
  const viewLibrary = document.getElementById('view-library');
  const remoteLibCount = document.getElementById('remote-lib-count');
  const playerBadges = document.getElementById('player-badges');

  // DOM Elements - Now Playing
  const badgeFormat = document.getElementById('badge-format');
  const badgeDr = document.getElementById('badge-dr');
  const remoteDrDot = document.getElementById('remote-dr-dot');
  const remoteDrText = document.getElementById('remote-dr-text');
  const albumCover = document.getElementById('album-cover');
  const artworkCard = document.getElementById('artwork-card');
  const remoteMeshCanvas = document.getElementById('remote-mesh-canvas');
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
  const remotePhaseInvert = document.getElementById('remote-phase-invert');
  const remotePureMode = document.getElementById('remote-pure-mode');
  const presetSelector = document.getElementById('preset-selector');
  const remoteOutputSelector = document.getElementById('remote-output-selector');

  const remoteThemeDesc = document.getElementById('remote-theme-desc');
  const remoteActiveThemeChip = document.getElementById('remote-active-theme-chip');
  const remoteThemeGrid = document.getElementById('remote-theme-grid');
  const telDcFilter = document.getElementById('tel-dc-filter');
  const telNoiseGate = document.getElementById('tel-noise-gate');
  const telPureMode = document.getElementById('tel-pure-mode');
  const telPureDot = document.getElementById('tel-pure-dot');
  const telPureText = document.getElementById('tel-pure-text');
  const remotePipelineTag = document.getElementById('remote-pipeline-tag');

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

  const miniBtnOutput = document.getElementById('mini-btn-output');

  // DOM Elements - Audio Destination, Output Device Picker & Mobile Playback Stream
  const btnDestToggle = document.getElementById('btn-dest-toggle');
  const destIcon = document.getElementById('dest-icon');
  const destLabel = document.getElementById('dest-label');
  const destSegmentedControl = document.getElementById('dest-segmented-control');
  const remoteOutputSublabel = document.getElementById('remote-output-sublabel');
  const remoteSyncBadge = document.getElementById('remote-sync-badge');
  const btnRemoteRescanOutputs = document.getElementById('btn-remote-rescan-outputs');
  const remotePhoneSinkRow = document.getElementById('remote-phone-sink-row');
  const remotePhoneSinkSelector = document.getElementById('remote-phone-sink-selector');
  const remoteOutputModal = document.getElementById('remote-output-modal');
  const btnCloseOutputModal = document.getElementById('btn-close-output-modal');
  const modalOutputSubtitle = document.getElementById('modal-output-subtitle');
  const modalSyncBadge = document.getElementById('modal-sync-badge');
  const modalDestSegmentedControl = document.getElementById('modal-dest-segmented-control');
  const btnModalRescanOutputs = document.getElementById('btn-modal-rescan-outputs');
  const modalPcOutputList = document.getElementById('modal-pc-output-list');
  const modalPhoneOutputSection = document.getElementById('modal-phone-output-section');
  const modalPhoneOutputList = document.getElementById('modal-phone-output-list');
  const remoteLocalAudio = document.getElementById('remote-local-audio');

  let playbackDestination = 'desktop'; // 'desktop' | 'phone' | 'both'
  try {
    const savedDest = localStorage.getItem('aura.playbackDestination');
    if (savedDest && ['desktop', 'phone', 'both'].includes(savedDest)) {
      playbackDestination = savedDest;
    }
  } catch (e) { }

  // NTP-over-WebSocket Clock Synchronization & PLL Audio Sync State
  let clockOffsetMs = 0; // estimated (serverNow - clientNow) in ms
  let hasClockSync = false;
  let clockSamples = [];
  let clockSyncInterval = null;
  let lastRttMs = 0;
  let lastServerRefTime = Date.now();
  let pendingInitialSync = false;
  let lastHardSeekAt = 0;
  let needsUserGestureUnlock = false;
  let toastHideTimer = null;
  let activePhoneSinkId = 'default';
  let availablePhoneOutputs = [];
  try {
    activePhoneSinkId = localStorage.getItem('aura.phoneSinkDeviceId') || 'default';
  } catch (e) { }

  function haptic(ms = 12) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) { }
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
    if (toastHideTimer) clearTimeout(toastHideTimer);
    toastText.textContent = text;
    toast.classList.add('visible');
    if (duration > 0) {
      toastHideTimer = setTimeout(() => {
        if (isConnected && !needsUserGestureUnlock) toast.classList.remove('visible');
      }, duration);
    }
  }

  // Master Edition Personalisation Themes (aligned with Desktop)
  const MASTER_THEMES = [
    { id: 'gold', name: 'Master Gold', badge: 'Gold', swatchColor: '#e5b95f', desc: 'Signature warm audiophile brass & 24K gold reference' },
    { id: 'blood-red', name: 'Blood Red', badge: 'Blood Red', swatchColor: '#e62b42', desc: 'High-octane crimson & deep velvet audiophile red' },
    { id: 'spotify-green', name: 'Spotify Green', badge: 'Spotify Green', swatchColor: '#1db954', desc: 'Vibrant studio electric emerald & punchy acoustic energy' },
    { id: 'platinum', name: 'Liquid Platinum', badge: 'Platinum', swatchColor: '#e2e8f0', desc: 'Chiseled aerospace titanium & ultra-pure brushed silver' }
  ];

  const MASTER_THEME_PALETTES = {
    'gold': [
      [36, 28, 18],
      [214, 164, 72],
      [124, 78, 38],
      [46, 74, 118]
    ],
    'blood-red': [
      [40, 10, 15],
      [230, 43, 66],
      [140, 20, 35],
      [70, 15, 25]
    ],
    'spotify-green': [
      [10, 36, 18],
      [29, 185, 84],
      [18, 115, 52],
      [20, 50, 80]
    ],
    'platinum': [
      [24, 28, 36],
      [226, 232, 240],
      [148, 163, 184],
      [51, 65, 85]
    ]
  };

  function applyRemoteTheme(themeId, notifyDesktop = true) {
    const theme = MASTER_THEMES.find(t => t.id === themeId) || MASTER_THEMES[0];
    state.activeThemeId = theme.id;
    document.documentElement.setAttribute('data-theme', theme.id);

    if (remoteThemeDot) remoteThemeDot.style.background = theme.swatchColor;
    if (remoteThemeLabel) remoteThemeLabel.textContent = theme.name;
    if (remoteActiveThemeChip) {
      remoteActiveThemeChip.textContent = theme.name;
      remoteActiveThemeChip.style.borderColor = theme.swatchColor;
      remoteActiveThemeChip.style.color = theme.swatchColor;
    }
    if (remoteThemeDesc) remoteThemeDesc.textContent = theme.desc;

    if (remoteThemeGrid) {
      const swatches = remoteThemeGrid.querySelectorAll('.remote-swatch-btn');
      swatches.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-theme') === theme.id);
      });
    }

    if (state.backdropMode === 'harmonized' || !state.hasCover) {
      const pal = MASTER_THEME_PALETTES[theme.id] || MASTER_THEME_PALETTES.gold;
      setRemoteMeshPalette(pal);
    }

    if (notifyDesktop) {
      sendCommand('set-theme', { themeId: theme.id });
    }
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
    } catch (e) { }

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
    } catch (e) { }

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
      } catch (e) { }
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
    } catch (e) { }
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
            try { pc.close(); } catch (err) { }
            done(m[1]);
          }
        };
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => done(null));
        setTimeout(() => {
          try { pc.close(); } catch (err) { }
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
          try { fastCandidates.add(new URL(u).origin); } catch (e) { }
        });
      } catch (e) { }

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

      try { addSubnet(extractIpv4Prefix(new URL(activeOrigin).hostname)); } catch (e) { }
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

  // NTP-over-WebSocket Clock Synchronizer (Sub-15ms Multi-Device Lock)
  function sendSyncPing() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ command: 'sync-ping', clientSendTime: Date.now() }));
      } catch (e) { }
    }
  }

  function startClockSync() {
    if (clockSyncInterval) clearInterval(clockSyncInterval);
    clockSamples = [];
    // Rapid 5-sample calibration burst on connect
    [0, 120, 260, 420, 620].forEach(delay => {
      setTimeout(() => {
        if (isConnected) sendSyncPing();
      }, delay);
    });
    // Continuous drift & Wi-Fi RTT tracking every 4s
    clockSyncInterval = setInterval(() => {
      if (isConnected && !document.hidden) {
        sendSyncPing();
      }
    }, 4000);
  }

  function handleSyncPong(msg) {
    const clientRecvTime = Date.now();
    const clientSendTime = Number(msg.clientSendTime);
    const serverTime = Number(msg.serverTime);
    if (!isFinite(clientSendTime) || !isFinite(serverTime)) return;

    const rtt = Math.max(0, clientRecvTime - clientSendTime);
    if (rtt > 1500 && clockSamples.length > 0) return; // Discard extreme Wi-Fi congestion spike
    lastRttMs = rtt;

    const sampleOffset = serverTime - (clientSendTime + rtt / 2);
    clockSamples.push({ rtt, offset: sampleOffset });
    if (clockSamples.length > 8) clockSamples.shift();

    // Select lowest-RTT half of samples and take median offset
    const sortedByRtt = [...clockSamples].sort((a, b) => a.rtt - b.rtt);
    const bestSlice = sortedByRtt.slice(0, Math.max(1, Math.ceil(sortedByRtt.length / 2)));
    bestSlice.sort((a, b) => a.offset - b.offset);
    const medianOffset = bestSlice[Math.floor(bestSlice.length / 2)].offset;

    if (!hasClockSync || clockSamples.length <= 2 || Math.abs(medianOffset - clockOffsetMs) > 80) {
      clockOffsetMs = medianOffset;
    } else {
      clockOffsetMs = clockOffsetMs * 0.65 + medianOffset * 0.35;
    }
    hasClockSync = true;
  }

  function getExpectedPlaybackTime() {
    let base = Number(state.currentTime) || 0;
    if (state.isPlaying && !state.isTrackLoading) {
      const serverNow = Date.now() + clockOffsetMs;
      const refTime = state.stateTimestamp > 0 ? state.stateTimestamp : lastServerRefTime;
      const elapsedSec = Math.max(0, (serverNow - refTime) / 1000);
      base += elapsedSec;
    }
    if (playbackDestination === 'both' && state.desktopOutputLatency > 0) {
      // Align Phone DAC output with Desktop WebAudio output pipeline latency
      const netAcousticDiff = Math.max(0, Number(state.desktopOutputLatency) - 0.022);
      base = Math.max(0, base - netAcousticDiff);
    }
    if (state.duration > 0) {
      return Math.min(state.duration, Math.max(0, base));
    }
    return Math.max(0, base);
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
    } catch (e) { }

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected = true;
      failedReconnects = 0;
      try {
        localStorage.setItem('aura.lastActiveOrigin', activeOrigin);
      } catch (e) { }
      statusDot.className = 'status-indicator live';
      statusText.textContent = activeSsid ? `WI-FI: ${activeSsid.toUpperCase()}` : 'WI-FI LINK ACTIVE';
      if (!needsUserGestureUnlock) toast.classList.remove('visible');
      startClockSync();
      // Refresh artwork & library against active host
      if (state.coverUrl) {
        const resolved = resolveApiUrl(state.coverUrl);
        if (albumCover) albumCover.src = resolved;
        if (miniArtImg) miniArtImg.src = resolved;
      }
      fetchLibrary();
      enumeratePhoneOutputs();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'sync-pong') {
          handleSyncPong(msg);
          return;
        }
        if (!hasClockSync && msg.serverTime) {
          clockOffsetMs = Number(msg.serverTime) - Date.now();
        }
        if (msg.type === 'state' && msg.data) {
          applyState(msg.data, msg.serverTime);
        } else if (msg.type === 'tick' && msg.data) {
          applyTick(msg.data, msg.serverTime);
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
      if (clockSyncInterval) {
        clearInterval(clockSyncInterval);
        clockSyncInterval = null;
      }
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
      try { ws.close(); } catch (e) { }
    };
  }

  // Reconnect immediately when phone switches Wi-Fi networks or wakes from sleep
  window.addEventListener('online', () => {
    if (!isConnected) {
      discoverDesktopOnNewWifi();
      connect();
    } else {
      sendSyncPing();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!isConnected) {
        discoverDesktopOnNewWifi();
        connect();
      } else {
        sendSyncPing();
      }
    }
  });

  // Register App-Shell Service Worker so saved bookmarks / PWAs boot offline even when IP changes
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { });
  }

  // Dispatch commands to desktop
  function sendCommand(cmd, data = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ command: cmd, action: cmd, ...data }));
    }
  }

  // -------------------------------------------------------------
  // Mobile Direct Playback Audio Engine (PLL Clock-Locked Sync)
  // -------------------------------------------------------------
  function configurePitchPreservation(audioEl) {
    if (!audioEl) return;
    try {
      if ('preservesPitch' in audioEl) audioEl.preservesPitch = true;
      else if ('webkitPreservesPitch' in audioEl) audioEl.webkitPreservesPitch = true;
      else if ('mozPreservesPitch' in audioEl) audioEl.mozPreservesPitch = true;
    } catch (e) { }
  }

  if (remoteLocalAudio) {
    configurePitchPreservation(remoteLocalAudio);
  }

  function updateSyncBadges(driftMs = null) {
    let label = 'PC DIRECT';
    if (playbackDestination === 'phone') {
      label = needsUserGestureUnlock ? 'TAP TO UNMUTE' : 'PHONE STREAM';
    } else if (playbackDestination === 'both') {
      if (needsUserGestureUnlock) {
        label = 'TAP TO SYNC';
      } else if (state.isPlaying && driftMs !== null && isFinite(driftMs)) {
        const ms = Math.round(Math.abs(driftMs));
        label = ms <= 25 ? `SYNC LOCKED • ${ms}ms` : `SYNCING • ${ms}ms`;
      } else {
        label = 'SYNC READY';
      }
    }
    if (remoteSyncBadge) remoteSyncBadge.textContent = label;
    if (modalSyncBadge) modalSyncBadge.textContent = label;
  }

  function updatePlaybackDestinationUI() {
    const devLabel = state.activeSinkDeviceLabel || 'System Default Audio';
    const shortDev = devLabel.length > 15 ? devLabel.substring(0, 14) + '…' : devLabel;

    if (destIcon && destLabel) {
      if (playbackDestination === 'phone') {
        destIcon.textContent = '📱';
        destLabel.textContent = 'This Phone';
        if (btnDestToggle) btnDestToggle.classList.add('active');
        if (miniBtnOutput) miniBtnOutput.classList.add('active');
      } else if (playbackDestination === 'both') {
        destIcon.textContent = '✨';
        destLabel.textContent = 'PC + Phone';
        if (btnDestToggle) btnDestToggle.classList.add('active');
        if (miniBtnOutput) miniBtnOutput.classList.add('active');
      } else {
        destIcon.textContent = '💻';
        destLabel.textContent = shortDev;
        if (btnDestToggle) btnDestToggle.classList.remove('active');
        if (miniBtnOutput) miniBtnOutput.classList.remove('active');
      }
    }

    const subText = playbackDestination === 'phone'
      ? 'Streaming bit-accurate audio to This Phone (PC muted)'
      : playbackDestination === 'both'
        ? `PLL Clock-Synced across ${devLabel} + This Phone`
        : `Playing on Desktop PC • ${devLabel}`;

    if (remoteOutputSublabel) remoteOutputSublabel.textContent = subText;
    if (modalOutputSubtitle) modalOutputSubtitle.textContent = subText;

    [destSegmentedControl, modalDestSegmentedControl].forEach(group => {
      if (!group) return;
      group.querySelectorAll('.dest-seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-dest') === playbackDestination);
      });
    });

    updateSyncBadges();
  }

  function attachGestureUnlock() {
    const unlock = () => {
      if (!needsUserGestureUnlock) return;
      needsUserGestureUnlock = false;
      ['pointerdown', 'touchend', 'click'].forEach(ev => document.removeEventListener(ev, unlock, true));
      if (playbackDestination !== 'desktop' && remoteLocalAudio && state.isPlaying) {
        const expected = getExpectedPlaybackTime();
        try {
          if (isFinite(expected) && expected >= 0) {
            remoteLocalAudio.currentTime = expected + 0.025;
            lastHardSeekAt = Date.now();
          }
        } catch (e) { }
        const p = remoteLocalAudio.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            toast.classList.remove('visible');
            updateSyncBadges(0);
          }).catch(() => { });
        }
      } else {
        toast.classList.remove('visible');
        updateSyncBadges();
      }
    };
    ['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, once: true }));
  }

  function safePlayLocalAudio() {
    if (!remoteLocalAudio || playbackDestination === 'desktop') return;
    configurePitchPreservation(remoteLocalAudio);
    const p = remoteLocalAudio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (needsUserGestureUnlock) {
          needsUserGestureUnlock = false;
          toast.classList.remove('visible');
        }
      }).catch(err => {
        if (err && (err.name === 'NotAllowedError' || /interact|gesture|permission/i.test(String(err.message || '')))) {
          if (!needsUserGestureUnlock) {
            needsUserGestureUnlock = true;
            showToast('📱 Tap anywhere on screen to enable Phone audio stream', 0);
            updateSyncBadges();
            attachGestureUnlock();
          }
        }
      });
    }
  }

  function syncLocalAudioPlayback(targetPlaying, forceHardSync = false) {
    if (!remoteLocalAudio) return;

    if (playbackDestination === 'desktop') {
      if (!remoteLocalAudio.paused) {
        remoteLocalAudio.pause();
      }
      if (remoteLocalAudio.playbackRate !== 1.0) {
        remoteLocalAudio.playbackRate = 1.0;
      }
      needsUserGestureUnlock = false;
      return;
    }

    remoteLocalAudio.preload = 'auto';

    // Load or switch audio stream if track changed
    if (state.trackPath) {
      const streamUrl = resolveApiUrl('/api/audio-stream?path=' + encodeURIComponent(state.trackPath));
      if (remoteLocalAudio.dataset.currentPath !== state.trackPath || !remoteLocalAudio.src) {
        remoteLocalAudio.dataset.currentPath = state.trackPath;
        remoteLocalAudio.playbackRate = 1.0;
        pendingInitialSync = true;
        remoteLocalAudio.src = streamUrl;
        remoteLocalAudio.load();
      }
    }

    if (state.volume !== undefined) {
      try {
        remoteLocalAudio.volume = Math.max(0, Math.min(1, state.volume));
      } catch (e) { }
    }

    if (targetPlaying && !state.isTrackLoading) {
      const expected = getExpectedPlaybackTime();
      if (remoteLocalAudio.readyState >= 1) {
        const drift = Math.abs((remoteLocalAudio.currentTime || 0) - expected);
        const threshold = playbackDestination === 'both' ? 0.20 : 0.35;
        if (forceHardSync || pendingInitialSync || (remoteLocalAudio.paused && drift > 0.08) || drift > threshold) {
          try {
            remoteLocalAudio.playbackRate = 1.0;
            remoteLocalAudio.currentTime = Math.max(0, expected + 0.03);
            lastHardSeekAt = Date.now();
            pendingInitialSync = false;
          } catch (e) { }
        }
      }
      if (remoteLocalAudio.paused) {
        safePlayLocalAudio();
      }
    } else if (!targetPlaying && !state.isTrackLoading) {
      if (!remoteLocalAudio.paused) {
        remoteLocalAudio.pause();
      }
      if (remoteLocalAudio.playbackRate !== 1.0) {
        remoteLocalAudio.playbackRate = 1.0;
      }
      if (forceHardSync && remoteLocalAudio.readyState >= 1) {
        try {
          remoteLocalAudio.currentTime = Math.max(0, Number(state.currentTime) || 0);
        } catch (e) { }
      }
    }
  }

  // Continuous PLL Micro-Rate Synchronizer (runs every 180ms when active)
  function runAudioPllTick() {
    if (!remoteLocalAudio || playbackDestination === 'desktop') {
      return;
    }
    if (!state.isPlaying || state.isTrackLoading || isUserScrubbing) {
      if (remoteLocalAudio.playbackRate !== 1.0) {
        remoteLocalAudio.playbackRate = 1.0;
      }
      updateSyncBadges();
      return;
    }
    if (remoteLocalAudio.paused) {
      if (!needsUserGestureUnlock && remoteLocalAudio.readyState >= 2) {
        safePlayLocalAudio();
      }
      updateSyncBadges();
      return;
    }
    if (remoteLocalAudio.seeking || remoteLocalAudio.readyState < 2) {
      return;
    }

    const expected = getExpectedPlaybackTime();
    const actual = remoteLocalAudio.currentTime || 0;
    const drift = expected - actual; // + means phone is behind desktop, - means phone is ahead
    const absDrift = Math.abs(drift);

    const hardThreshold = playbackDestination === 'both' ? 0.20 : 0.35;
    const deadband = playbackDestination === 'both' ? 0.008 : 0.035;
    const maxRateDelta = playbackDestination === 'both' ? 0.045 : 0.025;
    const gainK = playbackDestination === 'both' ? 0.45 : 0.25;

    if (absDrift > hardThreshold && (Date.now() - lastHardSeekAt > 950)) {
      try {
        remoteLocalAudio.playbackRate = 1.0;
        remoteLocalAudio.currentTime = Math.max(0, expected + 0.03);
        lastHardSeekAt = Date.now();
      } catch (e) { }
    } else if (absDrift > deadband) {
      const rateAdj = Math.max(-maxRateDelta, Math.min(maxRateDelta, drift * gainK));
      const targetRate = Number((1.0 + rateAdj).toFixed(4));
      if (Math.abs(remoteLocalAudio.playbackRate - targetRate) >= 0.0015) {
        try {
          configurePitchPreservation(remoteLocalAudio);
          remoteLocalAudio.playbackRate = targetRate;
        } catch (e) { }
      }
    } else if (remoteLocalAudio.playbackRate !== 1.0) {
      try { remoteLocalAudio.playbackRate = 1.0; } catch (e) { }
    }

    updateSyncBadges(drift * 1000);
  }

  setInterval(runAudioPllTick, 180);

  function setPlaybackDestination(dest, notifyDesktop = true) {
    if (!['desktop', 'phone', 'both'].includes(dest)) return;
    const changed = playbackDestination !== dest;
    playbackDestination = dest;
    state.playbackDestination = dest;
    try {
      localStorage.setItem('aura.playbackDestination', dest);
    } catch (e) { }

    updatePlaybackDestinationUI();

    if (notifyDesktop && changed) {
      if (dest === 'phone') {
        showToast('📱 Output: Streaming Lossless to This Phone');
      } else if (dest === 'both') {
        showToast('✨ Output: PLL-Synced PC + Phone');
      } else {
        showToast(`💻 Output: ${state.activeSinkDeviceLabel || 'Desktop PC'}`);
      }
    }

    syncLocalAudioPlayback(state.isPlaying, true);

    if (notifyDesktop) {
      sendCommand('set-playback-destination', { destination: dest });
    }
  }

  if (remoteLocalAudio) {
    const onStreamReady = () => {
      if (playbackDestination === 'desktop') return;
      if (pendingInitialSync) {
        pendingInitialSync = false;
        const expected = getExpectedPlaybackTime();
        try {
          remoteLocalAudio.playbackRate = 1.0;
          remoteLocalAudio.currentTime = Math.max(0, expected + (state.isPlaying ? 0.03 : 0));
          lastHardSeekAt = Date.now();
        } catch (e) { }
        if (state.isPlaying && !state.isTrackLoading && remoteLocalAudio.paused) {
          safePlayLocalAudio();
        }
      }
    };
    remoteLocalAudio.addEventListener('loadedmetadata', onStreamReady);
    remoteLocalAudio.addEventListener('canplay', onStreamReady);
    remoteLocalAudio.addEventListener('ended', () => {
      // Desktop audioElement is the single master sequencer; reset rate cleanly here without double-skipping
      try { remoteLocalAudio.playbackRate = 1.0; } catch (e) { }
    });
    remoteLocalAudio.addEventListener('error', (e) => {
      console.warn('Remote local audio stream error:', e);
    });
  }

  // Render PC & Phone Hardware Output Devices across Sheet Dropdown + Quick Output Modal
  function selectDesktopOutputFromRemote(deviceId, name) {
    if (!deviceId) return;
    state.activeSinkDeviceId = deviceId;
    if (name) state.activeSinkDeviceLabel = name;
    renderOutputDevicesUI();
    updatePlaybackDestinationUI();
    showToast(`🔊 PC Output: ${name || 'Selected Device'}`);
    sendCommand('set-output-device', { deviceId, name: name || '' });
  }

  async function selectPhoneOutputSink(deviceId, label) {
    if (!remoteLocalAudio || typeof remoteLocalAudio.setSinkId !== 'function') return;
    try {
      const normalized = (!deviceId || deviceId === 'default') ? '' : deviceId;
      try {
        await remoteLocalAudio.setSinkId(normalized);
      } catch (innerErr) {
        if (normalized === '') await remoteLocalAudio.setSinkId('default');
        else throw innerErr;
      }
      activePhoneSinkId = deviceId || 'default';
      try { localStorage.setItem('aura.phoneSinkDeviceId', activePhoneSinkId); } catch (e) { }
      renderPhoneOutputDevicesUI();
      showToast(`📱 Phone Output: ${label || 'Default Output'}`);
    } catch (err) {
      console.warn('Phone setSinkId failed:', err);
    }
  }

  async function enumeratePhoneOutputs() {
    if (!remoteLocalAudio || typeof remoteLocalAudio.setSinkId !== 'function' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      if (remotePhoneSinkRow) remotePhoneSinkRow.style.display = 'none';
      if (modalPhoneOutputSection) modalPhoneOutputSection.style.display = 'none';
      return;
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const outputs = all.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'communications');
      availablePhoneOutputs = outputs.map((d, idx) => ({
        deviceId: d.deviceId || 'default',
        name: d.label || (d.deviceId === 'default' ? 'Phone Default Output' : `Audio Output ${idx + 1}`)
      }));
      if (availablePhoneOutputs.length > 0) {
        renderPhoneOutputDevicesUI();
      }
    } catch (e) { }
  }

  function renderPhoneOutputDevicesUI() {
    const hasPhoneOutputs = availablePhoneOutputs.length > 1 || (availablePhoneOutputs.length === 1 && availablePhoneOutputs[0].deviceId !== 'default');
    if (remotePhoneSinkRow) remotePhoneSinkRow.style.display = hasPhoneOutputs ? 'flex' : 'none';
    if (modalPhoneOutputSection) modalPhoneOutputSection.style.display = hasPhoneOutputs ? 'block' : 'none';
    if (!hasPhoneOutputs) return;

    if (remotePhoneSinkSelector) {
      remotePhoneSinkSelector.innerHTML = '';
      availablePhoneOutputs.forEach(dev => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = dev.name;
        if (dev.deviceId === activePhoneSinkId) opt.selected = true;
        remotePhoneSinkSelector.appendChild(opt);
      });
    }

    if (modalPhoneOutputList) {
      modalPhoneOutputList.innerHTML = '';
      availablePhoneOutputs.forEach(dev => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isAct = dev.deviceId === activePhoneSinkId;
        btn.className = `modal-device-item ${isAct ? 'active' : ''}`;
        btn.innerHTML = `
          <div class="modal-device-meta">
            <span class="modal-device-name">${escapeHtml(dev.name)}</span>
            <span class="modal-device-type">Mobile / Local Browser Endpoint</span>
          </div>
          <span class="modal-device-check" style="${isAct ? '' : 'display:none;'}">✓</span>
        `;
        btn.addEventListener('click', () => {
          haptic(12);
          selectPhoneOutputSink(dev.deviceId, dev.name);
        });
        modalPhoneOutputList.appendChild(btn);
      });
    }
  }

  function renderOutputDevicesUI() {
    const devices = Array.isArray(state.availableOutputDevices) && state.availableOutputDevices.length > 0
      ? state.availableOutputDevices
      : [{ deviceId: 'default', name: state.activeSinkDeviceLabel || 'System Default Audio', type: 'WASAPI Shared' }];
    const currentVal = state.activeSinkDeviceId || 'default';

    if (remoteOutputSelector) {
      remoteOutputSelector.innerHTML = '';
      devices.forEach(dev => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.dataset.name = dev.name;
        opt.textContent = dev.type ? `${dev.name} (${dev.type})` : dev.name;
        if (dev.deviceId === currentVal) opt.selected = true;
        remoteOutputSelector.appendChild(opt);
      });
    }

    if (modalPcOutputList) {
      modalPcOutputList.innerHTML = '';
      devices.forEach(dev => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isAct = dev.deviceId === currentVal;
        btn.className = `modal-device-item ${isAct ? 'active' : ''}`;
        btn.innerHTML = `
          <div class="modal-device-meta">
            <span class="modal-device-name">${escapeHtml(dev.name)}</span>
            <span class="modal-device-type">${escapeHtml(dev.type || 'Desktop Audio Endpoint')}</span>
          </div>
          <span class="modal-device-check" style="${isAct ? '' : 'display:none;'}">✓</span>
        `;
        btn.addEventListener('click', () => {
          haptic(14);
          selectDesktopOutputFromRemote(dev.deviceId, dev.name);
        });
        modalPcOutputList.appendChild(btn);
      });
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

    function highlightMatch(text, query) {
      if (!text) return '';
      const escaped = escapeHtml(text);
      if (!query || !query.trim()) return escaped;
      const qEsc = escapeHtml(query.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return escaped.replace(new RegExp(`(${qEsc})`, 'gi'), '<mark class="search-highlight">$1</mark>');
    }

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
          <div class="remote-track-title">${highlightMatch(t.title, searchQuery)}</div>
          <div class="remote-track-sub">${highlightMatch(t.artist, searchQuery)}${t.album ? ' \u2022 ' + highlightMatch(t.album, searchQuery) : ''}</div>
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
        state.currentTime = 0;
        state.stateTimestamp = Date.now() + clockOffsetMs;
        lastServerRefTime = state.stateTimestamp;
        state.isPlaying = true;
        state.isTrackLoading = true;
        updatePlayPauseIcons();

        // Direct mobile playback unlock within user click gesture if phone/both is selected
        if (playbackDestination !== 'desktop' && remoteLocalAudio) {
          const streamUrl = resolveApiUrl('/api/audio-stream?path=' + encodeURIComponent(t.path));
          remoteLocalAudio.dataset.currentPath = t.path;
          remoteLocalAudio.playbackRate = 1.0;
          pendingInitialSync = true;
          remoteLocalAudio.src = streamUrl;
          remoteLocalAudio.currentTime = 0;
          safePlayLocalAudio();
        }

        applyState(state, state.stateTimestamp);
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
      state.stateTimestamp = Date.now() + clockOffsetMs;
      lastServerRefTime = state.stateTimestamp;
      updatePlayPauseIcons();
      if (playbackDestination !== 'desktop') {
        syncLocalAudioPlayback(state.isPlaying, true);
      }
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

  // Periodic lightweight progress tick (anchored to server clock)
  function applyTick(data, serverTime) {
    const refTs = Number(data.stateTimestamp) || Number(serverTime) || (Date.now() + clockOffsetMs);
    lastServerRefTime = refTs;
    lastStateReceivedTime = Date.now();

    if (data.desktopOutputLatency !== undefined) {
      state.desktopOutputLatency = Number(data.desktopOutputLatency) || 0;
    }
    if (data.isTrackLoading !== undefined) {
      state.isTrackLoading = !!data.isTrackLoading;
    }
    if (data.currentTime !== undefined && !isUserScrubbing) {
      state.currentTime = Number(data.currentTime) || 0;
      state.stateTimestamp = refTs;
    }
    if (data.duration !== undefined && data.duration > 0) {
      state.duration = data.duration;
    }
    if (data.playbackDestination && ['desktop', 'phone', 'both'].includes(data.playbackDestination) && data.playbackDestination !== playbackDestination) {
      playbackDestination = data.playbackDestination;
      state.playbackDestination = data.playbackDestination;
      try { localStorage.setItem('aura.playbackDestination', playbackDestination); } catch (e) { }
      updatePlaybackDestinationUI();
      syncLocalAudioPlayback(state.isPlaying, true);
    }
    if (data.isPlaying !== undefined && state.isPlaying !== data.isPlaying) {
      state.isPlaying = data.isPlaying;
      updatePlayPauseIcons();
      syncLocalAudioPlayback(state.isPlaying, true);
    }
    if (data.volume !== undefined && !isUserDraggingVolume && document.activeElement !== volumeSlider) {
      state.volume = data.volume;
      const v = Math.round(data.volume * 100);
      volumeSlider.value = v;
      volumeVal.textContent = `${v}%`;
      if (playbackDestination !== 'desktop' && remoteLocalAudio) {
        try { remoteLocalAudio.volume = Math.max(0, Math.min(1, state.volume)); } catch (e) { }
      }
    }
    if (data.subBass !== undefined) {
      meshTargetSubBass = state.isPlaying ? Math.max(0, Math.min(1, data.subBass)) : 0;
    }
    if (Array.isArray(data.meshPalette) && data.meshPalette.length === 4) {
      setRemoteMeshPalette(data.meshPalette);
    }
    updateProgressUI();
  }

  // Full playback state update
  function applyState(newState, serverTime) {
    const prevTrackPath = state.trackPath;
    const prevThemeId = state.activeThemeId;
    state = { ...state, ...newState };
    const refTs = Number(newState.stateTimestamp) || Number(serverTime) || (Date.now() + clockOffsetMs);
    state.stateTimestamp = refTs;
    lastServerRefTime = refTs;
    lastStateReceivedTime = Date.now();

    // Bi-directionally adopt Playback Destination from Desktop
    if (newState.playbackDestination && ['desktop', 'phone', 'both'].includes(newState.playbackDestination)) {
      const destChanged = playbackDestination !== newState.playbackDestination;
      playbackDestination = newState.playbackDestination;
      try { localStorage.setItem('aura.playbackDestination', playbackDestination); } catch (e) { }
      if (destChanged) {
        updatePlaybackDestinationUI();
      }
    }

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

    // Album Artwork & Living Mesh Palette Sync
    if (Array.isArray(newState.meshPalette) && newState.meshPalette.length === 4) {
      setRemoteMeshPalette(newState.meshPalette);
    }
    if (newState.subBass !== undefined) {
      meshTargetSubBass = state.isPlaying ? Math.max(0, Math.min(1, newState.subBass)) : 0;
    } else if (!state.isPlaying) {
      meshTargetSubBass = 0;
    }
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
    if (remoteDrText) {
      remoteDrText.textContent = `DR ${drVal} dB`;
    } else {
      badgeDr.textContent = `DR ${drVal} dB`;
    }

    if (remoteDrDot) {
      remoteDrDot.className = 'dr-meter-dot';
      if (state.dynamicRating === 'DYNAMIC' || state.crestFactorDb >= 13) {
        remoteDrDot.classList.add('dynamic');
      } else if (state.dynamicRating === 'COMPRESSED' || state.crestFactorDb < 8) {
        remoteDrDot.classList.add('compressed');
      } else {
        remoteDrDot.classList.add('balanced');
      }
    }

    // Master Edition Theme Synchronization
    if (newState.activeThemeId && newState.activeThemeId !== prevThemeId) {
      applyRemoteTheme(newState.activeThemeId, false);
    }

    // Pure Mode & Phase Invert Controls
    if (remotePhaseInvert) {
      remotePhaseInvert.classList.toggle('active', !!state.phaseInvert);
    }

    if (remotePureMode) {
      remotePureMode.textContent = `Pure Mode: ${state.isBitPerfect ? 'ON' : 'OFF'}`;
      remotePureMode.classList.toggle('active', !!state.isBitPerfect);
    }

    // 32-Bit Signal Path Telemetry
    if (telPureMode && telPureDot && telPureText) {
      telPureDot.classList.toggle('active', !!state.isBitPerfect);
      telPureText.textContent = `Pure Mode: ${state.isBitPerfect ? 'ON' : 'OFF'}`;
    }
    if (telDcFilter) {
      const dot = telDcFilter.querySelector('.telemetry-dot');
      if (dot) dot.classList.toggle('active', state.subsonicFilterEnabled !== false);
    }
    if (telNoiseGate) {
      const dot = telNoiseGate.querySelector('.telemetry-dot');
      if (dot) dot.classList.toggle('active', state.noiseGateEnabled !== false);
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

    // Render Playback Output Devices across Sheet Dropdown + Quick Output Drawer
    renderOutputDevicesUI();

    updateProgressUI();
    const trackChanged = !!(state.trackPath && state.trackPath !== prevTrackPath);
    syncLocalAudioPlayback(state.isPlaying, trackChanged);
    updatePlaybackDestinationUI();

    // Re-render library highlight for currently playing track
    if (currentActiveTab === 'library') {
      renderLibrary();
    }
  }

  function updateProgressUI() {
    if (isUserScrubbing) return;

    const current = getExpectedPlaybackTime();
    const duration = state.duration || 0;
    const progress = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;

    scrubberFill.style.width = `${progress}%`;
    scrubberInput.value = progress;

    currentTimeEl.textContent = formatDuration(current);
    const rem = duration - current;
    remainingTimeEl.textContent = `-${formatDuration(rem >= 0 ? rem : 0)}`;
  }

  // Apple Music-Style Living Mesh Backdrop (4-Color Offscreen Palette + Sub-Bass Fluid Blobs)
  const REMOTE_DEFAULT_PALETTE = [
    [36, 28, 18],
    [214, 164, 72],
    [124, 78, 38],
    [46, 74, 118]
  ];
  let meshCurrentColors = REMOTE_DEFAULT_PALETTE.map(c => [...c]);
  let meshTargetColors = REMOTE_DEFAULT_PALETTE.map(c => [...c]);
  let meshTargetSubBass = 0;
  let meshSmoothSubBass = 0;
  let meshPhase = Math.random() * 100;
  let meshLastFrameTime = performance.now();
  let meshCtx = null;
  let lastExtractedCoverSrc = '';
  const meshSamplerCanvas = document.createElement('canvas');
  meshSamplerCanvas.width = 48;
  meshSamplerCanvas.height = 48;

  if (remoteMeshCanvas) {
    remoteMeshCanvas.width = 180;
    remoteMeshCanvas.height = 180;
    meshCtx = remoteMeshCanvas.getContext('2d');
  }

  function rgbToHslRemote(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hslToRgbRemote(h, s, l) {
    h = ((h % 1) + 1) % 1;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
    ];
  }

  function setRemoteMeshPalette(palette) {
    if (!Array.isArray(palette) || palette.length < 4) return;
    meshTargetColors = palette.slice(0, 4).map(c => [
      Number(c[0]) || 0,
      Number(c[1]) || 0,
      Number(c[2]) || 0
    ]);
  }

  function extractCoverPaletteRemote(img) {
    if (state.backdropMode === 'harmonized') {
      const pal = MASTER_THEME_PALETTES[state.activeThemeId] || MASTER_THEME_PALETTES.gold;
      setRemoteMeshPalette(pal);
      return;
    }
    if (!img || !img.naturalWidth || img.naturalWidth <= 2) return;
    try {
      const sCtx = meshSamplerCanvas.getContext('2d', { willReadFrequently: true });
      sCtx.clearRect(0, 0, 48, 48);
      sCtx.drawImage(img, 0, 0, 48, 48);
      const data = sCtx.getImageData(0, 0, 48, 48).data;
      const buckets = new Map();
      let maxSat = 0;

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 140) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        let bk = buckets.get(key);
        if (!bk) {
          bk = { count: 0, rSum: 0, gSum: 0, bSum: 0 };
          buckets.set(key, bk);
        }
        bk.count++;
        bk.rSum += r; bk.gSum += g; bk.bSum += b;
      }
      if (buckets.size === 0) return;

      const cands = [];
      for (const bk of buckets.values()) {
        const r = bk.rSum / bk.count, g = bk.gSum / bk.count, b = bk.bSum / bk.count;
        const [h, s, l] = rgbToHslRemote(r, g, b);
        if (s > maxSat) maxSat = s;
        const lumPen = (l < 0.07 || l > 0.94) ? 0.12 : (1 - Math.abs(l - 0.48) * 0.55);
        const score = Math.pow(bk.count, 0.72) * (0.32 + s * 2.1) * Math.max(0.1, lumPen);
        cands.push({ rgb: [r, g, b], hsl: [h, s, l], score });
      }
      cands.sort((a, b) => b.score - a.score);

      const isMono = maxSat < 0.13;
      const chosen = [];
      for (let slot = 0; slot < 4; slot++) {
        let best = null, bestScore = -1;
        for (let i = 0; i < Math.min(cands.length, 80); i++) {
          const cand = cands[i];
          if (chosen.includes(cand)) continue;
          let div = 1.0;
          for (const p of chosen) {
            const dr = cand.rgb[0] - p.rgb[0], dg = cand.rgb[1] - p.rgb[1], db = cand.rgb[2] - p.rgb[2];
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            const hDiff = Math.min(Math.abs(cand.hsl[0] - p.hsl[0]), 1 - Math.abs(cand.hsl[0] - p.hsl[0]));
            if (dist < 42) div *= 0.08;
            else if (dist < 85) div *= 0.45;
            if (!isMono && hDiff < 0.07) div *= 0.45;
          }
          if (cand.score * div > bestScore) {
            bestScore = cand.score * div;
            best = cand;
          }
        }
        if (best) chosen.push(best);
      }

      while (chosen.length < 4) {
        const ref = chosen[chosen.length - 1] || { hsl: [0.11, 0.55, 0.42] };
        const nh = (ref.hsl[0] + 0.15 * chosen.length) % 1;
        const nl = Math.max(0.2, Math.min(0.55, ref.hsl[2] + 0.1));
        chosen.push({ hsl: [nh, ref.hsl[1], nl] });
      }

      const calibrated = chosen.map((item, idx) => {
        let [h, s, l] = item.hsl;
        if (isMono) {
          const tl = [0.16, 0.38, 0.27, 0.22];
          return hslToRgbRemote(h, Math.min(0.12, s), l * 0.45 + tl[idx] * 0.55);
        }
        if (idx === 0) return hslToRgbRemote(h, Math.min(0.86, s * 1.15 + 0.08), Math.max(0.16, Math.min(0.36, l * 0.78)));
        if (idx === 1) return hslToRgbRemote(h, Math.min(0.95, s * 1.28 + 0.12), Math.max(0.34, Math.min(0.58, l * 1.05 + 0.04)));
        if (idx === 2) return hslToRgbRemote(h, Math.min(0.92, s * 1.22 + 0.08), Math.max(0.28, Math.min(0.54, l)));
        return hslToRgbRemote(h, Math.min(0.88, s * 1.18 + 0.06), Math.max(0.24, Math.min(0.50, l)));
      });
      setRemoteMeshPalette(calibrated);
    } catch (e) { }
  }

  if (albumCover) {
    albumCover.addEventListener('load', () => {
      if (albumCover.src && albumCover.src !== lastExtractedCoverSrc) {
        lastExtractedCoverSrc = albumCover.src;
        extractCoverPaletteRemote(albumCover);
      }
    });
  }

  // Pre-allocated blob descriptors to eliminate per-frame heap allocations at 60 FPS
  const meshBlobs = [
    { c: null, x: 0, y: 0, r: 0, a: 0 },
    { c: null, x: 0, y: 0, r: 0, a: 0 },
    { c: null, x: 0, y: 0, r: 0, a: 0 },
    { c: null, x: 0, y: 0, r: 0, a: 0 },
    { c: null, x: 0, y: 0, r: 0, a: 0 }
  ];
  let meshLastRenderAt = 0;

  function stepLivingMesh(now) {
    if (!meshCtx || document.hidden) {
      meshLastFrameTime = now;
      return;
    }

    // Adaptive Frame Pacing: 60 FPS when playing or crossfading palette; 12 FPS (~83ms) when idle
    let maxColorDelta = 0;
    for (let i = 0; i < 4; i++) {
      const d =
        Math.abs(meshTargetColors[i][0] - meshCurrentColors[i][0]) +
        Math.abs(meshTargetColors[i][1] - meshCurrentColors[i][1]) +
        Math.abs(meshTargetColors[i][2] - meshCurrentColors[i][2]);
      if (d > maxColorDelta) maxColorDelta = d;
    }
    const isIdle = !state.isPlaying && meshSmoothSubBass < 0.004 && maxColorDelta < 0.6;
    if (isIdle && now - meshLastRenderAt < 83) {
      return;
    }
    meshLastRenderAt = now;

    const dt = Math.min(0.10, Math.max(0.004, (now - meshLastFrameTime) / 1000));
    meshLastFrameTime = now;

    const effectiveTarget = state.isPlaying ? meshTargetSubBass : 0;
    const bassRate = effectiveTarget > meshSmoothSubBass ? 18.0 : 4.2;
    meshSmoothSubBass += (effectiveTarget - meshSmoothSubBass) * (1 - Math.exp(-dt * bassRate));
    const energy = Math.max(0, Math.min(1, meshSmoothSubBass));

    meshPhase += dt * (isIdle ? 0.28 : 0.65 + energy * 1.95);

    const lerp = 1 - Math.exp(-dt * 3.2);
    for (let i = 0; i < 4; i++) {
      meshCurrentColors[i][0] += (meshTargetColors[i][0] - meshCurrentColors[i][0]) * lerp;
      meshCurrentColors[i][1] += (meshTargetColors[i][1] - meshCurrentColors[i][1]) * lerp;
      meshCurrentColors[i][2] += (meshTargetColors[i][2] - meshCurrentColors[i][2]) * lerp;
    }

    const w = remoteMeshCanvas.width;
    const h = remoteMeshCanvas.height;
    const c0 = meshCurrentColors[0];
    const c1 = meshCurrentColors[1];
    const c2 = meshCurrentColors[2];
    const c3 = meshCurrentColors[3];
    const t = meshPhase;

    meshCtx.globalCompositeOperation = 'source-over';
    meshCtx.fillStyle = `rgb(${Math.round(6 + c0[0] * 0.30)}, ${Math.round(8 + c0[1] * 0.30)}, ${Math.round(13 + c0[2] * 0.34)})`;
    meshCtx.fillRect(0, 0, w, h);

    meshBlobs[0].c = c1;
    meshBlobs[0].x = 0.50 + Math.sin(t * 0.37) * 0.28;
    meshBlobs[0].y = 0.30 + Math.cos(t * 0.29) * 0.22;
    meshBlobs[0].r = (0.68 + energy * 0.22) * w;
    meshBlobs[0].a = 0.72 + energy * 0.20;

    meshBlobs[1].c = c2;
    meshBlobs[1].x = 0.22 + Math.cos(t * 0.31 + 1.4) * 0.25;
    meshBlobs[1].y = 0.65 + Math.sin(t * 0.23 + 0.8) * 0.24;
    meshBlobs[1].r = (0.64 + energy * 0.18) * w;
    meshBlobs[1].a = 0.62 + energy * 0.16;

    meshBlobs[2].c = c3;
    meshBlobs[2].x = 0.78 + Math.sin(t * 0.27 + 2.6) * 0.24;
    meshBlobs[2].y = 0.60 + Math.cos(t * 0.33 + 1.9) * 0.25;
    meshBlobs[2].r = (0.60 + energy * 0.19) * w;
    meshBlobs[2].a = 0.58 + energy * 0.16;

    meshBlobs[3].c = c0;
    meshBlobs[3].x = 0.24 + Math.sin(t * 0.21 + 4.1) * 0.22;
    meshBlobs[3].y = 0.22 + Math.cos(t * 0.25 + 3.2) * 0.20;
    meshBlobs[3].r = (0.72 + energy * 0.14) * w;
    meshBlobs[3].a = 0.64 + energy * 0.12;

    meshBlobs[4].c = c1;
    meshBlobs[4].x = 0.50 + Math.cos(t * 0.43) * 0.10;
    meshBlobs[4].y = 0.36 + Math.sin(t * 0.39) * 0.10;
    meshBlobs[4].r = (0.38 + energy * 0.30) * w;
    meshBlobs[4].a = 0.20 + energy * 0.38;

    meshCtx.globalCompositeOperation = 'screen';
    for (let i = 0; i < meshBlobs.length; i++) {
      const b = meshBlobs[i];
      const cx = b.x * w, cy = b.y * h;
      const r = Math.round(b.c[0]), g = Math.round(b.c[1]), bl = Math.round(b.c[2]);
      const grad = meshCtx.createRadialGradient(cx, cy, 0, cx, cy, b.r);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${Math.min(0.95, b.a).toFixed(3)})`);
      grad.addColorStop(0.35, `rgba(${r}, ${g}, ${bl}, ${(b.a * 0.62).toFixed(3)})`);
      grad.addColorStop(0.70, `rgba(${r}, ${g}, ${bl}, ${(b.a * 0.22).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);
      meshCtx.fillStyle = grad;
      meshCtx.fillRect(0, 0, w, h);
    }
    meshCtx.globalCompositeOperation = 'source-over';

    if (artworkCard && currentActiveTab === 'player') {
      const spread = Math.round(38 + energy * 30);
      const glowA = (0.24 + energy * 0.34).toFixed(3);
      artworkCard.style.boxShadow =
        `0 16px 40px rgba(0, 0, 0, 0.65), 0 0 ${spread}px rgba(${Math.round(c1[0])}, ${Math.round(c1[1])}, ${Math.round(c1[2])}, ${glowA})`;
    }
  }

  // 60 FPS Scrubber & Adaptive Living Mesh animation loop
  function startProgressLoop(now) {
    requestAnimationFrame(startProgressLoop);
    if (document.hidden) return;
    if (state.isPlaying || isUserScrubbing) {
      updateProgressUI();
    }
    stepLivingMesh(now || performance.now());
  }

  // 1. Play / Pause
  btnPlayPause.addEventListener('click', () => {
    haptic(18);
    state.isPlaying = !state.isPlaying;
    state.stateTimestamp = Date.now() + clockOffsetMs;
    lastServerRefTime = state.stateTimestamp;
    updatePlayPauseIcons();
    if (playbackDestination !== 'desktop') {
      syncLocalAudioPlayback(state.isPlaying, true);
    }
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
    state.stateTimestamp = Date.now() + clockOffsetMs;
    lastServerRefTime = state.stateTimestamp;
    lastStateReceivedTime = Date.now();
    updateProgressUI();
    if (playbackDestination !== 'desktop' && remoteLocalAudio) {
      try {
        remoteLocalAudio.playbackRate = 1.0;
        remoteLocalAudio.currentTime = seekTime;
        lastHardSeekAt = Date.now();
      } catch (e) { }
    }
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
      const invertSuffix = state.phaseInvert ? ' • 180°' : '';
      stereoLivePill.textContent = `${meta.pill}${swapSuffix}${invertSuffix}`;
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
    if (remotePhaseInvert) {
      remotePhaseInvert.classList.toggle('active', !!state.phaseInvert);
    }
    if (remotePureMode) {
      remotePureMode.textContent = `Pure Mode: ${state.isBitPerfect ? 'ON' : 'OFF'}`;
      remotePureMode.classList.toggle('active', !!state.isBitPerfect);
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

  if (remotePhaseInvert) {
    remotePhaseInvert.addEventListener('click', () => {
      haptic(14);
      state.phaseInvert = !state.phaseInvert;
      updateStereoUI();
      sendCommand('set-phase-invert', { invert: state.phaseInvert });
    });
  }

  if (remotePureMode) {
    remotePureMode.addEventListener('click', () => {
      haptic(14);
      state.isBitPerfect = !state.isBitPerfect;
      updateStereoUI();
      sendCommand('set-pure-mode', { enabled: state.isBitPerfect });
    });
  }

  // Master Edition Theme Controls
  if (remoteThemePill) {
    remoteThemePill.addEventListener('click', () => {
      haptic(14);
      const currentIndex = MASTER_THEMES.findIndex(t => t.id === state.activeThemeId);
      const nextIndex = (currentIndex + 1) % MASTER_THEMES.length;
      applyRemoteTheme(MASTER_THEMES[nextIndex].id, true);
    });
  }

  if (remoteThemeGrid) {
    const swatches = remoteThemeGrid.querySelectorAll('.remote-swatch-btn');
    swatches.forEach(btn => {
      btn.addEventListener('click', () => {
        haptic(14);
        const tid = btn.getAttribute('data-theme');
        if (tid) applyRemoteTheme(tid, true);
      });
    });
  }

  // 6. Acoustic Target Preset Switching
  presetSelector.addEventListener('change', (e) => {
    haptic(14);
    state.activePresetId = e.target.value;
    sendCommand('set-preset', { preset: e.target.value });
  });

  // 7. Playback Output Device Switching (Sheet Dropdowns + Quick Output Drawer)
  if (remoteOutputSelector) {
    remoteOutputSelector.addEventListener('change', (e) => {
      haptic(14);
      const selectedOpt = remoteOutputSelector.options[remoteOutputSelector.selectedIndex];
      const name = selectedOpt ? (selectedOpt.dataset.name || selectedOpt.text.split(' (')[0]) : '';
      selectDesktopOutputFromRemote(e.target.value, name);
    });
  }

  if (remotePhoneSinkSelector) {
    remotePhoneSinkSelector.addEventListener('change', (e) => {
      haptic(12);
      const selectedOpt = remotePhoneSinkSelector.options[remotePhoneSinkSelector.selectedIndex];
      const label = selectedOpt ? selectedOpt.text : '';
      selectPhoneOutputSink(e.target.value, label);
    });
  }

  const triggerOutputRescan = () => {
    haptic(14);
    showToast('Rescanning audio output endpoints...');
    sendCommand('rescan-output-devices');
    enumeratePhoneOutputs();
  };

  if (btnRemoteRescanOutputs) btnRemoteRescanOutputs.addEventListener('click', triggerOutputRescan);
  if (btnModalRescanOutputs) btnModalRescanOutputs.addEventListener('click', triggerOutputRescan);

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      enumeratePhoneOutputs();
    });
  }

  // 8. Playback Audio Destination & Global Quick Output Drawer Controls
  const openOutputModal = () => {
    if (!remoteOutputModal) return;
    haptic(12);
    renderOutputDevicesUI();
    enumeratePhoneOutputs();
    updatePlaybackDestinationUI();
    remoteOutputModal.style.display = 'flex';
    remoteOutputModal.setAttribute('aria-hidden', 'false');
  };

  const closeOutputModal = () => {
    if (!remoteOutputModal) return;
    remoteOutputModal.style.display = 'none';
    remoteOutputModal.setAttribute('aria-hidden', 'true');
  };

  if (btnDestToggle) {
    btnDestToggle.addEventListener('click', openOutputModal);
  }
  if (miniBtnOutput) {
    miniBtnOutput.addEventListener('click', (e) => {
      e.stopPropagation();
      openOutputModal();
    });
  }
  if (btnCloseOutputModal) {
    btnCloseOutputModal.addEventListener('click', closeOutputModal);
  }
  if (remoteOutputModal) {
    remoteOutputModal.addEventListener('click', (e) => {
      if (e.target === remoteOutputModal) closeOutputModal();
    });
  }

  [destSegmentedControl, modalDestSegmentedControl].forEach(group => {
    if (!group) return;
    group.querySelectorAll('.dest-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        haptic(14);
        const dest = btn.getAttribute('data-dest');
        if (dest) setPlaybackDestination(dest, true);
      });
    });
  });

  // Initialize
  applyRemoteTheme(state.activeThemeId, false);
  updateStereoUI();
  renderOutputDevicesUI();
  updatePlaybackDestinationUI();
  connect();
  startProgressLoop();
})();
