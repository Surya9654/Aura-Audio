// Aura 3.0 Mobile Wi-Fi Remote Client
(function () {
  let ws = null;
  let isConnected = false;
  let reconnectTimeout = null;
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
    stereoMode: 'true-stereo'
  };

  let isUserScrubbing = false;
  let localProgressTimer = null;
  let lastStateReceivedTime = Date.now();

  // Elements
  const toast = document.getElementById('connection-toast');
  const toastText = document.getElementById('toast-text');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

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

  // Connect to the WebSocket on the host
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
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state' && msg.data) {
          applyState(msg.data);
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
      reconnectTimeout = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  function sendCommand(action, data = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action, ...data }));
    }
  }

  function applyState(newState) {
    state = { ...state, ...newState };
    lastStateReceivedTime = Date.now();

    // Track Meta
    trackTitle.textContent = state.title || 'Unknown Title';
    trackArtist.textContent = state.artist || 'Aura Lossless Studio';
    trackAlbum.textContent = state.album || '';

    // Artwork
    if (state.coverUrl) {
      albumCover.src = state.coverUrl;
    }

    // Badges
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

    // Play/Pause Icon
    if (state.isPlaying) {
      playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
    } else {
      playIcon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"></polygon>';
    }

    // Volume
    if (state.volume !== undefined && document.activeElement !== volumeSlider) {
      volumeSlider.value = Math.round(state.volume * 100);
      volumeVal.textContent = `${volumeSlider.value}%`;
    }

    // Stereo Mode Segments
    [segTrueStereo, segCrossfeed, segMono].forEach(b => {
      if (b) b.classList.toggle('active', b.getAttribute('data-mode') === state.stereoMode);
    });

    // Preset
    if (state.activePreset) {
      const match = Array.from(presetSelector.options).find(o => 
        o.text.toLowerCase().includes(state.activePreset.toLowerCase()) || 
        o.value.toLowerCase() === state.activePreset.toLowerCase()
      );
      if (match) presetSelector.value = match.value;
    }

    updateProgressUI();
  }

  function updateProgressUI() {
    if (isUserScrubbing) return;

    let current = state.currentTime || 0;
    if (state.isPlaying) {
      const elapsedSinceUpdate = (Date.now() - lastStateReceivedTime) / 1000;
      current = Math.min(state.duration, current + elapsedSinceUpdate);
    }

    const duration = state.duration || 0;
    const progress = duration > 0 ? (current / duration) * 100 : 0;

    scrubberFill.style.width = `${progress}%`;
    scrubberInput.value = progress;

    currentTimeEl.textContent = formatDuration(current);
    const rem = duration - current;
    remainingTimeEl.textContent = `-${formatDuration(rem >= 0 ? rem : 0)}`;
  }

  // Smooth local timer for 60 FPS scrubber movement
  function startProgressLoop() {
    updateProgressUI();
    requestAnimationFrame(startProgressLoop);
  }

  // Event Listeners
  btnPlayPause.addEventListener('click', () => {
    haptic(18);
    sendCommand('toggle-play');
  });

  btnPrev.addEventListener('click', () => {
    haptic(14);
    sendCommand('prev');
  });

  btnNext.addEventListener('click', () => {
    haptic(14);
    sendCommand('next');
  });

  // Scrubber scrubbing
  scrubberInput.addEventListener('input', (e) => {
    isUserScrubbing = true;
    const pct = parseFloat(e.target.value);
    scrubberFill.style.width = `${pct}%`;
    const seekTime = (pct / 100) * (state.duration || 0);
    currentTimeEl.textContent = formatDuration(seekTime);
  });

  scrubberInput.addEventListener('change', (e) => {
    isUserScrubbing = false;
    const pct = parseFloat(e.target.value);
    const seekTime = (pct / 100) * (state.duration || 0);
    haptic(15);
    sendCommand('seek', { time: seekTime });
  });

  // Volume slider
  volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    volumeVal.textContent = `${val}%`;
    sendCommand('volume', { volume: val / 100 });
  });

  btnMute.addEventListener('click', () => {
    haptic(10);
    if (parseInt(volumeSlider.value, 10) > 0) {
      volumeSlider.dataset.prev = volumeSlider.value;
      volumeSlider.value = 0;
      volumeVal.textContent = '0%';
      sendCommand('volume', { volume: 0 });
    } else {
      const restore = volumeSlider.dataset.prev || 85;
      volumeSlider.value = restore;
      volumeVal.textContent = `${restore}%`;
      sendCommand('volume', { volume: parseInt(restore, 10) / 100 });
    }
  });

  // Stereo mode switching from phone
  [segTrueStereo, segCrossfeed, segMono].forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      haptic(14);
      [segTrueStereo, segCrossfeed, segMono].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sendCommand('set-stereo-mode', { mode });
    });
  });

  // Acoustic preset switching from phone
  presetSelector.addEventListener('change', (e) => {
    haptic(14);
    sendCommand('set-preset', { preset: e.target.value });
  });

  // Init
  connect();
  startProgressLoop();
})();
