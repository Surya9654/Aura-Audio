import { HighResAudioEngine, CROSSFEED_PROFILES } from './audio-engine.js';
import { HEADPHONE_PRESETS, EQ_FREQUENCIES } from './presets.js';

// Default Application Master Cover
export const DEFAULT_APP_COVER = '../../DefaultCover/Gemini_Generated_Image_3vnl5n3vnl5n3vnl.png';

export function getTrackCover(track) {
  if (track && track.hasCover && track.coverData) return track.coverData;
  return DEFAULT_APP_COVER;
}

// Master Edition Color Personalisation Themes
export const MASTER_THEMES = [
  {
    id: 'gold',
    name: 'Master Gold',
    badge: 'Gold',
    description: 'Signature warm audiophile brass & 24K gold reference',
    swatchColor: '#e5b95f',
    spectrum: ['rgba(229, 185, 95, 0.2)', 'rgba(229, 185, 95, 0.85)', 'rgba(250, 232, 180, 1)']
  },
  {
    id: 'blood-red',
    name: 'Blood Red',
    badge: 'Blood Red',
    description: 'High-octane crimson & deep velvet audiophile red',
    swatchColor: '#e62b42',
    spectrum: ['rgba(230, 43, 66, 0.2)', 'rgba(230, 43, 66, 0.85)', 'rgba(255, 175, 185, 1)']
  },
  {
    id: 'spotify-green',
    name: 'Spotify Green',
    badge: 'Spotify Green',
    description: 'Vibrant studio electric emerald & punchy acoustic energy',
    swatchColor: '#1db954',
    spectrum: ['rgba(29, 185, 84, 0.2)', 'rgba(29, 185, 84, 0.85)', 'rgba(190, 255, 210, 1)']
  },
  {
    id: 'platinum',
    name: 'Liquid Platinum',
    badge: 'Platinum',
    description: 'Chiseled aerospace titanium & ultra-pure brushed silver',
    swatchColor: '#e2e8f0',
    spectrum: ['rgba(226, 232, 240, 0.2)', 'rgba(226, 232, 240, 0.85)', 'rgba(255, 255, 255, 1)']
  }
];

// Application State
const state = {
  tracks: [],
  filteredTracks: [],
  currentTrackIndex: -1,
  activePreset: HEADPHONE_PRESETS[0],
  activeThemeId: localStorage.getItem('aura.masterTheme') || 'gold',
  isBitPerfect: false,
  dacGuardEnabled: true,
  detectedDACs: [],
  activeHardwareDevice: null,
  currentFilter: 'ALL'
};

const audioEngine = new HighResAudioEngine();

// DOM Elements
const views = document.querySelectorAll('.view-panel');
const navItems = document.querySelectorAll('.nav-item[data-view]');
const trackTableBody = document.getElementById('track-table-body');
const libraryCountText = document.getElementById('library-count-text');

// DAC Status Elements
const dacStatusPill = document.getElementById('dac-status-pill');
const dacIndicatorDot = document.getElementById('dac-indicator-dot');
const dacPillText = document.getElementById('dac-pill-text');
const dacSidebarStatus = document.getElementById('dac-sidebar-status');
const dacSidebarName = document.getElementById('dac-sidebar-name');
const dacSidebarDesc = document.getElementById('dac-sidebar-desc');
const bannerDacTag = document.getElementById('banner-dac-tag');
const hardwareDevicesList = document.getElementById('hardware-devices-list');

// Player Controls
const btnMasterPlay = document.getElementById('btn-master-play');
const playPauseIcon = document.getElementById('play-pause-icon');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const scrubber = document.getElementById('scrubber');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const volumeSlider = document.getElementById('volume-slider');
const volumeIcon = document.getElementById('volume-icon');
const playerArtBox = document.getElementById('player-art-box');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerTelemetry = document.getElementById('player-telemetry');
const quickPresetName = document.getElementById('quick-preset-name');

// Studio & EQ Elements
const presetsListContainer = document.getElementById('presets-list-container');
const eqSlidersStrip = document.getElementById('eq-sliders-strip');
const activePresetBadge = document.getElementById('active-preset-badge');
const btnResetEq = document.getElementById('btn-reset-eq');
const btnToggleBitperfect = document.getElementById('btn-toggle-bitperfect');
const toggleBitPerfectSwitch = document.getElementById('toggle-bit-perfect-switch');
const toggleDacGuard = document.getElementById('toggle-dac-guard');
const preampSlider = document.getElementById('preamp-slider');
const preampVal = document.getElementById('preamp-val');
const visualizerCanvas = document.getElementById('visualizer-canvas');

// 1. Navigation Controller
const navFormatsSection = document.getElementById('nav-section-formats');

function updateFormatFilterVisibility(activeView) {
  if (!navFormatsSection) return;
  if (activeView === 'library') {
    navFormatsSection.style.display = 'block';
    navFormatsSection.style.opacity = '1';
    navFormatsSection.style.pointerEvents = 'auto';
  } else {
    // Hidden / disabled on configuration views (EQ presets, DAC output, settings)
    navFormatsSection.style.display = 'none';
  }
}

navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    navItems.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.getAttribute('data-view');
    views.forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(`view-${target}`);
    if (targetView) targetView.classList.add('active');
    updateFormatFilterVisibility(target);
  });
});

dacStatusPill.addEventListener('click', () => {
  navItems.forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-view') === 'dac');
  });
  views.forEach(v => v.classList.remove('active'));
  document.getElementById('view-dac').classList.add('active');
  updateFormatFilterVisibility('dac');
});

// Format Filter Buttons
document.getElementById('filter-flac').addEventListener('click', () => {
  state.currentFilter = 'FLAC';
  applyTrackFilter();
});

document.getElementById('filter-all').addEventListener('click', () => {
  state.currentFilter = 'ALL';
  applyTrackFilter();
});

function applyTrackFilter() {
  const btnFlac = document.getElementById('filter-flac');
  const btnAll = document.getElementById('filter-all');
  if (btnFlac && btnAll) {
    btnFlac.classList.toggle('active', state.currentFilter === 'FLAC');
    btnAll.classList.toggle('active', state.currentFilter === 'ALL');
  }

  if (state.currentFilter === 'FLAC') {
    state.filteredTracks = state.tracks.filter(t => (t.format && t.format.toUpperCase() === 'FLAC') || (t.path && t.path.toLowerCase().endsWith('.flac')));
  } else {
    state.filteredTracks = [...state.tracks];
  }
  renderTrackList();
}

// 2. Hardware DAC Interrogation Engine
async function scanHardwareDACs() {
  dacPillText.textContent = 'Interrogating DAC Hardware...';
  dacIndicatorDot.className = 'dac-dot warning';

  try {
    const devices = await window.electronAPI.detectHardwareDACs();
    state.detectedDACs = devices;
    renderHardwareList(devices);

    const hasDedicatedDAC = devices.some(d => d.isDAC);
    audioEngine.dacDetected = hasDedicatedDAC;

    if (hasDedicatedDAC) {
      const dac = devices.find(d => d.isDAC);
      state.activeHardwareDevice = dac;
      dacIndicatorDot.className = 'dac-dot active';
      dacPillText.textContent = `External DAC: ${dac.name.slice(0, 22)}`;
      
      dacSidebarStatus.textContent = 'Hi-Res DAC Connected';
      dacSidebarStatus.className = 'dac-card-badge dac-connected';
      dacSidebarName.textContent = dac.name;
      dacSidebarDesc.textContent = 'True Bit-Perfect Master Stream Enabled. Up to 384kHz / 32-bit passthrough.';
      bannerDacTag.textContent = 'DAC VERIFIED: BIT-PERFECT';
      bannerDacTag.classList.add('gold');
    } else {
      dacIndicatorDot.className = 'dac-dot';
      const mainAudio = devices[0] ? devices[0].name : 'System Audio Engine';
      dacPillText.textContent = 'No DAC Detected (Safe Mode)';
      
      dacSidebarStatus.textContent = 'Safe DAC Guard: Active';
      dacSidebarStatus.className = 'dac-card-badge dac-disconnected';
      dacSidebarName.textContent = mainAudio;
      dacSidebarDesc.textContent = 'DAC Guard active: Prevents high-bit & high-kHz distortion over standard 16-bit soundcards.';
      bannerDacTag.textContent = 'DAC GUARD: ARMED';
      bannerDacTag.classList.remove('gold');
    }
  } catch (err) {
    console.error('DAC detection error:', err);
    dacPillText.textContent = 'Standard Audio Driver';
  }
}

function renderHardwareList(devices) {
  hardwareDevicesList.innerHTML = '';
  if (!devices || devices.length === 0) {
    hardwareDevicesList.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No audio devices found.</div>';
    return;
  }

  devices.forEach(dev => {
    const item = document.createElement('div');
    item.className = 'setting-row';
    item.style.padding = '10px 14px';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span class="dac-dot ${dev.isDAC ? 'active' : ''}"></span>
        <div>
          <div style="font-size: 13.5px; font-weight: 600; color: #fff;">${escapeHtml(dev.name)}</div>
          <div style="font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${escapeHtml(dev.type || 'Standard Sound Endpoint')}</div>
        </div>
      </div>
      <span class="spec-chip ${dev.isDAC ? 'gold' : ''}">
        ${dev.isDAC ? 'HI-RES DAC DETECTED' : 'INTERNAL 16/48K'}
      </span>
    `;
    hardwareDevicesList.appendChild(item);
  });
}

// 3. Audio File Scanner & Importer
document.getElementById('btn-select-custom-folder').addEventListener('click', async () => {
  const folder = await window.electronAPI.selectMusicFolder();
  if (folder) {
    await scanFolder(folder);
  }
});

document.getElementById('btn-scan-system-music').addEventListener('click', async () => {
  const sysInfo = await window.electronAPI.getSystemInfo();
  await scanFolder(sysInfo.musicDir);
});

function getSavedFolders() {
  try { return JSON.parse(localStorage.getItem('aura.folders') || '[]'); } catch (e) { return []; }
}

function saveFolder(folderPath) {
  const folders = getSavedFolders();
  if (!folders.includes(folderPath)) {
    folders.push(folderPath);
    localStorage.setItem('aura.folders', JSON.stringify(folders));
  }
}

// Merge new tracks into the library (deduplicated by file path, sorted by title)
function addTracks(newTracks) {
  const byPath = new Map(state.tracks.filter(t => !t.isSample).map(t => [t.path.toLowerCase(), t]));
  newTracks.forEach(t => byPath.set(t.path.toLowerCase(), t));
  state.tracks = Array.from(byPath.values()).sort((a, b) => a.title.localeCompare(b.title));
  applyTrackFilter();
}

async function scanFolder(folderPath) {
  libraryCountText.textContent = `Scanning ${folderPath} for FLAC & lossless audio...`;
  const tracks = await window.electronAPI.scanDirectory(folderPath);

  if (tracks.length === 0) {
    libraryCountText.textContent = `No audio files found in ${folderPath}.`;
    if (state.tracks.length === 0) loadSampleAudiophileShowcase();
    return;
  }

  saveFolder(folderPath);
  addTracks(tracks);
  libraryCountText.textContent = `Library: ${state.tracks.length} tracks (added ${tracks.length} from ${folderPath})`;
}

function loadSampleAudiophileShowcase() {
  const sampleTracks = [
    {
      title: 'Hotel California (Acoustic Master)',
      artist: 'Eagles',
      album: 'Hell Freezes Over [Live]',
      duration: 432,
      sampleRate: 192000,
      bitsPerSample: 24,
      bitrate: 5644,
      format: 'FLAC',
      path: 'C:\\Users\\surya\\Music\\Hotel_California_Live_Master.flac',
      hasCover: true,
      coverData: DEFAULT_APP_COVER
    },
    {
      title: 'Time (2023 50th Anniversary Remaster)',
      artist: 'Pink Floyd',
      album: 'The Dark Side of the Moon',
      duration: 425,
      sampleRate: 96000,
      bitsPerSample: 24,
      bitrate: 2950,
      format: 'FLAC',
      path: 'C:\\Users\\surya\\Music\\Pink_Floyd_Time.flac',
      hasCover: true,
      coverData: DEFAULT_APP_COVER
    },
    {
      title: 'Keith Don\'t Go (Acoustic Guitar Direct)',
      artist: 'Nils Lofgren',
      album: 'Acoustic Live (Audiophile Reference)',
      duration: 410,
      sampleRate: 176400,
      bitsPerSample: 24,
      bitrate: 4890,
      format: 'FLAC',
      path: 'C:\\Users\\surya\\Music\\Nils_Lofgren_Keith_Dont_Go.flac',
      hasCover: true,
      coverData: DEFAULT_APP_COVER
    },
    {
      title: 'Clair de Lune, L. 75',
      artist: 'Claude Debussy (Martin Jones)',
      album: 'Debussy: Complete Piano Works',
      duration: 312,
      sampleRate: 88200,
      bitsPerSample: 24,
      bitrate: 2410,
      format: 'FLAC',
      path: 'C:\\Users\\surya\\Music\\Debussy_Clair_De_Lune.flac',
      hasCover: true,
      coverData: DEFAULT_APP_COVER
    },
    {
      title: 'Symphony No. 5 in C Minor, Op. 67: I. Allegro con brio',
      artist: 'Ludwig van Beethoven (Wiener Philharmoniker)',
      album: 'Beethoven Symphonies [DSD Master]',
      duration: 442,
      sampleRate: 96000,
      bitsPerSample: 24,
      bitrate: 3100,
      format: 'WAV',
      path: 'C:\\Users\\surya\\Music\\Beethoven_Sym5_Allegro.wav',
      hasCover: true,
      coverData: DEFAULT_APP_COVER
    }
  ];

  state.tracks = sampleTracks.map(t => ({ ...t, isSample: true }));
  applyTrackFilter();
}

function renderTrackList() {
  trackTableBody.innerHTML = '';
  
  if (state.filteredTracks.length === 0) {
    trackTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 48px 0; color: var(--text-muted);">
          <div style="font-size: 15px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">Your Library is Empty</div>
          <div>Click "Import Audio Directory" to scan your storage drive for lossless music.</div>
        </td>
      </tr>
    `;
    return;
  }

  state.filteredTracks.forEach((track, index) => {
    const row = document.createElement('tr');
    row.className = `track-row enter ${state.currentTrackIndex === index ? 'playing' : ''}`;
    row.style.setProperty('--i', Math.min(index, 24));
    
    const formatClass = track.format === 'FLAC' ? 'format-flac' : (track.format === 'WAV' ? 'format-wav' : 'format-other');
    const khz = (track.sampleRate / 1000).toFixed(1);
    const durationFmt = formatDuration(track.duration);

    row.innerHTML = `
      <td style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted);">${index + 1}</td>
      <td>
        <div class="td-track-main">
          <img class="track-thumb" src="${getTrackCover(track)}" alt="" onerror="this.src='${DEFAULT_APP_COVER}'" />
          <div class="track-info-cell">
            <span class="track-info-title">${escapeHtml(track.title)}</span>
            <span class="track-info-artist">${escapeHtml(track.artist)}</span>
          </div>
        </div>
      </td>
      <td>${escapeHtml(track.album || 'Unknown Album')}</td>
      <td>
        <span class="format-pill ${formatClass}">${track.format}</span>
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; margin-left: 6px; color: var(--text-gold);">${track.bitsPerSample || 16}-bit</span>
      </td>
      <td style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--accent-cyan);">${khz} kHz</td>
      <td style="font-family: 'JetBrains Mono', monospace; font-size: 12px;">${durationFmt}</td>
      <td>
        <button class="btn-ctrl" title="Open in File Explorer" data-path="${escapeHtml(track.path)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </button>
      </td>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) {
        window.electronAPI.openFileLocation(track.path);
        return;
      }
      // Clicking the song that is currently playing opens the fullscreen player
      if (index === state.currentTrackIndex && audioEngine.audioElement && audioEngine.audioElement.src) {
        openNowPlaying();
        return;
      }
      playTrackIndex(index);
    });

    trackTableBody.appendChild(row);
  });
}

// Live explanation of how the current song reaches the output
function updateSignalPath() {
  const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
  const track = state.filteredTracks[state.currentTrackIndex];
  const preamp = audioEngine.preampDb || 0;
  const bypass = state.isBitPerfect;
  const presetName = state.activePreset ? state.activePreset.name : 'Reference';

  if (track) {
    set('sp-source', `${track.format} • ${track.bitsPerSample || 16}-bit`);
    set('sp-source-sub', `${(track.sampleRate / 1000).toFixed(1)} kHz${track.bitrate ? ' • ' + track.bitrate + ' kbps' : ''}`);
  } else {
    set('sp-source', 'No track playing');
    set('sp-source-sub', '—');
  }

  const cfLabel = audioEngine.crossfeedEnabled ? ` • Crossfeed: ${CROSSFEED_PROFILES[audioEngine.crossfeedProfile].name.split(' (')[0]}` : '';
  const dcLabel = audioEngine.subsonicFilterEnabled ? ' • DC/20Hz' : '';
  const gateLabel = audioEngine.noiseGateEnabled ? ` • Gate (${audioEngine.noiseGateThreshold}dB)` : '';
  set('sp-dsp', bypass ? 'Pure Mode (bypassed)' : presetName);
  set('sp-dsp-sub', bypass ? `Bypassed EQ/Preamp${gateLabel}` : `32-bit float • 10-band EQ • Preamp ${preamp > 0 ? '+' : ''}${preamp.toFixed(1)} dB${cfLabel}${dcLabel}${gateLabel}`);

  const devName = state.activeHardwareDevice ? state.activeHardwareDevice.name : (state.detectedDACs[0] ? state.detectedDACs[0].name : 'System audio');
  const outRate = audioEngine.outputSampleRate;
  set('sp-output', devName);
  set('sp-output-sub', `32-Bit Float Engine${outRate ? ' • ' + (outRate / 1000).toFixed(1) + ' kHz' : ''}${state.deviceVolume ? ' • device volume' : ''}`);

  let note = 'Play a track to see exactly how it reaches your ears.';
  if (track) {
    if (outRate && Math.abs(outRate - track.sampleRate) > 1) {
      note = `The output stream runs at ${(outRate / 1000).toFixed(1)} kHz, so this ${(track.sampleRate / 1000).toFixed(1)} kHz file is streamed cleanly through the 32-bit float pipeline.`;
    } else {
      note = 'The file rate matches the output rate — 1:1 bit-perfect sample rate passthrough.';
    }
    if (bypass) {
      note += ' Pure Mode is on: EQ and preamp are skipped.';
    } else if (audioEngine.subsonicFilterEnabled || audioEngine.noiseGateEnabled) {
      note += ' Audiophile isolation active: DC electrical rumble and idle amp hiss are eliminated.';
    }
  }
  set('sp-note', note);
}

// 4. Playback Logic
async function playTrackIndex(index) {
  if (index < 0 || index >= state.filteredTracks.length) return;
  state.currentTrackIndex = index;
  const track = state.filteredTracks[index];

  // (DAC safeguard messaging is shown in the Signal Path panel)
  if (!audioEngine.dacDetected && state.dacGuardEnabled && (track.sampleRate > 48000 || track.bitsPerSample > 16)) {
    bannerDacTag.textContent = 'HI-RES: SYSTEM RESAMPLED';
  } else if (audioEngine.dacDetected) {
    bannerDacTag.textContent = 'DAC VERIFIED';
  }

  // Update Now Playing UI
  playerTitle.textContent = track.title;
  playerArtist.textContent = track.artist;
  playerTelemetry.textContent = `${track.format} • ${track.bitsPerSample || 24}-BIT • ${(track.sampleRate / 1000).toFixed(1)} kHz • ${track.bitrate ? track.bitrate + ' kbps' : 'Lossless'}`;
  playerTelemetry.classList.toggle('flac-neon', track.format === 'FLAC');

  const ambientGlow = document.getElementById('ambient-glow');
  const coverUrl = getTrackCover(track);
  playerArtBox.innerHTML = `<img src="${coverUrl}" alt="" style="width:100%;height:100%;border-radius:10px;object-fit:cover;" onerror="this.src='${DEFAULT_APP_COVER}'" />`;
  if (ambientGlow) {
    ambientGlow.style.backgroundImage = `linear-gradient(rgba(7, 9, 14, 0.55), rgba(7, 9, 14, 0.55)), url('${coverUrl}')`;
    ambientGlow.style.backgroundSize = 'cover';
    ambientGlow.style.backgroundPosition = 'center';
    ambientGlow.style.opacity = '0.30';
    ambientGlow.style.filter = 'blur(90px) saturate(0.8)';
  }

  // Update the highlighted row in place (no full re-render, no flicker)
  trackTableBody.querySelectorAll('.track-row').forEach((r, i) => r.classList.toggle('playing', i === index));
  updateSignalPath();
  const isFsOpen = fsPlayer && fsPlayer.classList.contains('open');
  refreshFullscreen(isFsOpen);
  updateLockscreenWidgets(track);

  // Load and play
  try {
    await audioEngine.loadTrack(track);
    await audioEngine.play();
    updatePlayPauseState(true);
  } catch (e) {
    console.error('Audio load error:', e);
  }
}

function updatePlayPauseState(isPlaying) {
  const fsIcon = document.getElementById('fs-play-icon');
  const lsIcon = document.getElementById('ls-play-icon');
  const flsIcon = document.getElementById('fls-play-icon');
  const pauseSvg = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
  const playSvg = '<polygon points="6 4 20 12 6 20 6 4"></polygon>';
  playPauseIcon.innerHTML = isPlaying ? pauseSvg : playSvg;
  if (fsIcon) fsIcon.innerHTML = isPlaying ? pauseSvg : playSvg;
  if (lsIcon) lsIcon.innerHTML = isPlaying ? pauseSvg : playSvg;
  if (flsIcon) flsIcon.innerHTML = isPlaying ? pauseSvg : playSvg;
}

btnMasterPlay.addEventListener('click', () => {
  if (state.currentTrackIndex === -1 && state.filteredTracks.length > 0) {
    playTrackIndex(0);
    return;
  }
  if (audioEngine.isPlaying) {
    audioEngine.pause();
    updatePlayPauseState(false);
  } else {
    audioEngine.play();
    updatePlayPauseState(true);
  }
});

btnNext.addEventListener('click', () => {
  if (state.currentTrackIndex + 1 < state.filteredTracks.length) {
    playTrackIndex(state.currentTrackIndex + 1);
  } else {
    playTrackIndex(0);
  }
});

btnPrev.addEventListener('click', () => {
  const el = audioEngine.audioElement;
  if (el && el.currentTime > 3) {
    audioEngine.seek(0);
    scrubber.value = 0;
    scrubber.style.setProperty('--p', '0%');
    currentTimeEl.textContent = '0:00';
    syncLockscreenScrubber(0, el.duration);
    const fsScrub = document.getElementById('fs-scrubber');
    const fsCur = document.getElementById('fs-current');
    if (fsScrub) {
      fsScrub.value = 0;
      fsScrub.style.setProperty('--p', '0%');
    }
    if (fsCur) fsCur.textContent = '0:00';

    if (!audioEngine.isPlaying) {
      audioEngine.play();
      updatePlayPauseState(true);
    }
    return;
  }
  if (state.currentTrackIndex > 0) {
    playTrackIndex(state.currentTrackIndex - 1);
  } else {
    playTrackIndex(state.filteredTracks.length - 1);
  }
});

audioEngine.onTrackEnded = () => {
  if (state.currentTrackIndex + 1 < state.filteredTracks.length) {
    playTrackIndex(state.currentTrackIndex + 1);
  } else {
    updatePlayPauseState(false);
  }
};

let scrubbing = false;
scrubber.addEventListener('pointerdown', () => { scrubbing = true; });
window.addEventListener('pointerup', () => { scrubbing = false; });

scrubber.addEventListener('input', (e) => {
  const el = audioEngine.audioElement;
  if (el && el.duration) {
    scrubber.style.setProperty('--p', `${e.target.value}%`);
    currentTimeEl.textContent = formatDuration((e.target.value / 100) * el.duration);
    audioEngine.seek((e.target.value / 100) * el.duration);
  }
});

function setVolumeFill() {
  volumeSlider.style.setProperty('--p', `${volumeSlider.value * 100}%`);
}

volumeSlider.addEventListener('input', (e) => {
  const vol = parseFloat(e.target.value);
  audioEngine.setVolume(vol);
  setVolumeFill();
  if (vol === 0) {
    volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>';
  } else {
    volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
  }
});
setVolumeFill();

// Silky progress: drive the scrubber from requestAnimationFrame instead of ~4Hz timeupdate events
(function progressLoop() {
  const el = audioEngine.audioElement;
  if (!scrubbing && el && el.duration > 0) {
    const pct = (el.currentTime / el.duration) * 100;
    scrubber.value = pct;
    scrubber.style.setProperty('--p', `${pct}%`);
    currentTimeEl.textContent = formatDuration(el.currentTime);
    totalTimeEl.textContent = formatDuration(el.duration);
    syncLockscreenScrubber(el.currentTime, el.duration);
  }
  requestAnimationFrame(progressLoop);
})();

// 5. Presets & Acoustic Studio Engine
function initPresetsUI() {
  presetsListContainer.innerHTML = '';
  
  // Group presets by category
  const categories = {};
  HEADPHONE_PRESETS.forEach(p => {
    if (!categories[p.category]) categories[p.category] = [];
    categories[p.category].push(p);
  });

  for (const [catName, presetList] of Object.entries(categories)) {
    const catTitle = document.createElement('div');
    catTitle.className = 'preset-category-title';
    catTitle.textContent = catName;
    presetsListContainer.appendChild(catTitle);

    presetList.forEach(p => {
      const card = document.createElement('div');
      card.className = `preset-item ${state.activePreset.id === p.id ? 'active' : ''}`;
      card.dataset.id = p.id;
      card.innerHTML = `
        <div class="preset-name">
          <span>${escapeHtml(p.name)}</span>
          <span style="font-family: 'JetBrains Mono'; font-size: 10px; color: var(--accent-cyan);">${escapeHtml(p.impedance)}</span>
        </div>
        <div class="preset-desc">${escapeHtml(p.description)}</div>
      `;

      card.addEventListener('click', () => {
        applyPreset(p);
      });
      presetsListContainer.appendChild(card);
    });
  }
}

function setPreampUI(db) {
  preampSlider.value = db;
  preampVal.textContent = `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

function applyPreset(preset) {
  state.activePreset = preset;
  activePresetBadge.textContent = state.isBitPerfect ? `${preset.name} (bypassed)` : preset.name;
  quickPresetName.textContent = preset.name.split(' ')[0];

  audioEngine.applyEQPreset(preset.gains);

  // Automatic headroom: cut the preamp by the largest boost so boosted bands can never clip
  const headroom = -Math.max(0, ...preset.gains);
  audioEngine.setPreamp(headroom);
  setPreampUI(headroom);

  // Update slider positions
  preset.gains.forEach((gain, index) => {
    const slider = document.getElementById(`eq-slider-${index}`);
    const label = document.getElementById(`eq-val-${index}`);
    if (slider) slider.value = gain;
    if (label) label.textContent = `${gain > 0 ? '+' : ''}${gain.toFixed(1)}`;
  });

  // Highlight in place (no list rebuild → no flicker)
  document.querySelectorAll('.preset-item').forEach(c => c.classList.toggle('active', c.dataset.id === preset.id));
  updateSignalPath();
}

function initEQSliders() {
  eqSlidersStrip.innerHTML = '';
  EQ_FREQUENCIES.forEach((freq, index) => {
    const sliderWrapper = document.createElement('div');
    sliderWrapper.className = 'eq-band-slider';

    const freqLabel = freq >= 1000 ? `${freq / 1000}k` : `${freq}Hz`;
    
    sliderWrapper.innerHTML = `
      <span class="eq-band-gain-val" id="eq-val-${index}">0.0</span>
      <input type="range" id="eq-slider-${index}" min="-12" max="12" step="0.5" value="0" orient="vertical">
      <span class="eq-band-freq-label">${freqLabel}</span>
    `;

    const input = sliderWrapper.querySelector('input');
    input.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById(`eq-val-${index}`).textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}`;
      audioEngine.setBandGain(index, val);
      state.activePreset = { ...state.activePreset, name: 'Custom DSP Tuning' };
      activePresetBadge.textContent = 'Custom DSP Tuning';
    });

    eqSlidersStrip.appendChild(sliderWrapper);
  });
}

// Pure Mode (DSP bypass) toggle — EQ values are kept, only the audio path changes
function setBitPerfect(enabled) {
  state.isBitPerfect = enabled;
  toggleBitPerfectSwitch.checked = enabled;
  btnToggleBitperfect.textContent = `Pure Mode: ${enabled ? 'ON' : 'OFF'}`;
  btnToggleBitperfect.classList.toggle('btn-apple-primary', enabled);
  audioEngine.setBitPerfect(enabled);
  activePresetBadge.textContent = enabled ? `${state.activePreset.name} (bypassed)` : state.activePreset.name;
  eqSlidersStrip.style.opacity = enabled ? '0.4' : '1';
  eqSlidersStrip.style.filter = enabled ? 'grayscale(0.6)' : 'none';
  updateSignalPath();
}

btnToggleBitperfect.addEventListener('click', () => setBitPerfect(!state.isBitPerfect));
toggleBitPerfectSwitch.addEventListener('change', (e) => setBitPerfect(e.target.checked));

btnResetEq.addEventListener('click', () => {
  applyPreset(HEADPHONE_PRESETS[0]);
});

// DAC guard toggle
toggleDacGuard.addEventListener('change', (e) => {
  state.dacGuardEnabled = e.target.checked;
  audioEngine.dacMismatchGuard = e.target.checked;
  updateSignalPath();
});

// Preamp slider
preampSlider.addEventListener('input', (e) => {
  const db = parseFloat(e.target.value);
  setPreampUI(db);
  audioEngine.setPreamp(db);
  updateSignalPath();
});

// Hardware re-scan button
document.getElementById('btn-rescan-hardware').addEventListener('click', async () => {
  await scanHardwareDACs();
  updateSignalPath();
});

// 6. Visualizer Canvas (Audio Spectrum)
function startVisualizer() {
  const canvas = visualizerCanvas;
  const ctx = canvas.getContext('2d');
  const bufferLength = 128;
  const dataArray = new Uint8Array(bufferLength);

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(canvas.parentElement.clientWidth * dpr);
    const h = Math.floor(canvas.parentElement.clientHeight * dpr);
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
  resize();

  function render() {
    requestAnimationFrame(render);
    // The Studio view is hidden most of the time (0×0); size lazily once it becomes visible
    resize();
    if (canvas.width === 0 || canvas.height === 0) return;
    audioEngine.getFrequencyData(dataArray);

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const barWidth = (width / bufferLength) * 1.5;
    let x = 0;

    // Gradient with active Master Edition theme audiophile aura (built once per frame)
    const activeThemeObj = MASTER_THEMES.find(t => t.id === state.activeThemeId) || MASTER_THEMES[0];
    const grad = ctx.createLinearGradient(0, height, 0, 0);
    grad.addColorStop(0, activeThemeObj.spectrum[0]);
    grad.addColorStop(0.5, activeThemeObj.spectrum[1]);
    grad.addColorStop(1, activeThemeObj.spectrum[2]);
    ctx.fillStyle = grad;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * height;
      ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
      x += barWidth;
      if (x > width) break;
    }
  }
  render();
}

// Utilities
function formatDuration(sec) {
  if (isNaN(sec) || sec <= 0) return '0:00';
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

// Application Boot
async function initApp() {
  initEQSliders();
  initPresetsUI();
  startVisualizer();
  await scanHardwareDACs();
  updateSignalPath();

  // Auto-scan prioritized music folders (FLAC_files, Music, etc.) and user profile plus saved folders
  try {
    const sys = await window.electronAPI.getSystemInfo();
    const prioritizedRoots = [
      sys.userHome + '\\FLAC_files',
      sys.musicDir,
      sys.userHome,
      ...getSavedFolders()
    ];
    // Remove duplicates while keeping order
    const roots = Array.from(new Set(prioritizedRoots));

    for (const root of roots) {
      libraryCountText.textContent = `Scanning ${root} for FLAC & lossless audio...`;
      const found = await window.electronAPI.scanDirectory(root);
      if (found.length > 0) {
        addTracks(found);
        const flacCount = state.tracks.filter(t => (t.format && t.format.toUpperCase() === 'FLAC') || (t.path && t.path.toLowerCase().endsWith('.flac'))).length;
        libraryCountText.textContent = `Library: ${state.tracks.length} tracks (${flacCount} FLAC lossless) indexed`;
      }
    }
    if (state.tracks.length > 0) {
      const flacCount = state.tracks.filter(t => (t.format && t.format.toUpperCase() === 'FLAC') || (t.path && t.path.toLowerCase().endsWith('.flac'))).length;
      libraryCountText.textContent = `Library: ${state.tracks.length} tracks (${flacCount} FLAC lossless) indexed from your device.`;
    } else {
      loadSampleAudiophileShowcase();
    }
  } catch (e) {
    console.error('Boot scan error:', e);
    loadSampleAudiophileShowcase();
  }
}

// 7. Device Volume setting (persisted)
const toggleDeviceVolume = document.getElementById('toggle-device-volume');
const toggleMediaWidget = document.getElementById('toggle-media-widget');

function applyDeviceVolumeSetting(enabled) {
  state.deviceVolume = enabled;
  updateSignalPath();
  audioEngine.setUseDeviceVolume(enabled);
  volumeSlider.disabled = enabled;
  volumeSlider.style.opacity = enabled ? '0.35' : '1';
  volumeSlider.title = enabled ? 'Using device volume (in-app volume locked at 100%)' : '';
}

toggleDeviceVolume.checked = localStorage.getItem('aura.deviceVolume') === '1';
applyDeviceVolumeSetting(toggleDeviceVolume.checked);
toggleDeviceVolume.addEventListener('change', (e) => {
  localStorage.setItem('aura.deviceVolume', e.target.checked ? '1' : '0');
  applyDeviceVolumeSetting(e.target.checked);
});

// 8. Lock screen & Compact Media Widget (Mirrors Fullscreen Song in Mini Form Factor)
let mediaWidgetEnabled = localStorage.getItem('aura.mediaWidget') !== '0';
toggleMediaWidget.checked = mediaWidgetEnabled;

// Offscreen canvas for generating lockscreen composite artwork
const lsCanvas = document.createElement('canvas');
lsCanvas.width = 512;
lsCanvas.height = 512;

function generateLockscreenCard(track, img) {
  const ctx = lsCanvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);

  // Background radial dark glow
  const grad = ctx.createRadialGradient(256, 180, 40, 256, 256, 360);
  grad.addColorStop(0, '#1c2436');
  grad.addColorStop(0.7, '#0a0d14');
  grad.addColorStop(1, '#05070a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Draw blurred ambient background if image available
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.drawImage(img, -40, -40, 592, 592);
    ctx.restore();
  }

  // Draw rounded album art card in center
  const artSize = 270;
  const artX = (512 - artSize) / 2;
  const artY = 65;
  const r = 24;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;

  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(artX, artY, artSize, artSize, r);
  else ctx.rect(artX, artY, artSize, artSize);
  ctx.fillStyle = '#161a24';
  ctx.fill();
  ctx.restore();

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(artX, artY, artSize, artSize, r);
    else ctx.rect(artX, artY, artSize, artSize);
    ctx.clip();
    ctx.drawImage(img, artX, artY, artSize, artSize);
    ctx.restore();
  }

  // Card outline
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(artX, artY, artSize, artSize, r);
  else ctx.rect(artX, artY, artSize, artSize);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Hi-Res Badge
  const isFlac = track && track.format === 'FLAC';
  const tagText = `${track.format || 'FLAC'} • ${track.bitsPerSample || 16}-BIT • ${((track.sampleRate || 44100) / 1000).toFixed(1)} kHz`;
  ctx.font = 'bold 14px "JetBrains Mono", monospace';
  const tagMetrics = ctx.measureText(tagText);
  const tagWidth = tagMetrics.width + 24;
  const tagHeight = 26;
  const tagX = (512 - tagWidth) / 2;
  const tagY = artY + artSize + 22;

  ctx.save();
  ctx.fillStyle = isFlac ? 'rgba(46, 230, 119, 0.16)' : 'rgba(229, 185, 95, 0.16)';
  ctx.strokeStyle = isFlac ? '#2ee677' : '#e5b95f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(tagX, tagY, tagWidth, tagHeight, 8);
  else ctx.rect(tagX, tagY, tagWidth, tagHeight);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isFlac ? '#2ee677' : '#e5b95f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tagText, 256, tagY + (tagHeight / 2));
  ctx.restore();

  // Track Title
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const title = (track.title || 'Unknown').length > 30 ? (track.title || 'Unknown').substring(0, 28) + '...' : (track.title || 'Unknown');
  ctx.fillText(title, 256, tagY + tagHeight + 14);

  // Artist
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px "Plus Jakarta Sans", sans-serif';
  const artist = (track.artist || 'Unknown Artist').length > 36 ? (track.artist || 'Unknown Artist').substring(0, 34) + '...' : (track.artist || 'Unknown Artist');
  ctx.fillText(artist, 256, tagY + tagHeight + 42);
  ctx.restore();

  try {
    return lsCanvas.toDataURL('image/png');
  } catch (e) {
    return null;
  }
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  if (!mediaWidgetEnabled || !track) {
    navigator.mediaSession.metadata = null;
    return;
  }
  const coverUrl = getTrackCover(track);
  const artwork = [{ src: coverUrl, sizes: '512x512', type: 'image/png' }];

  // Dynamically synthesize a mini full-screen lockscreen composite card
  try {
    const tempImg = new Image();
    tempImg.crossOrigin = 'anonymous';
    tempImg.onload = () => {
      const cardDataUrl = generateLockscreenCard(track, tempImg);
      if (cardDataUrl) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album || '',
          artwork: [
            { src: cardDataUrl, sizes: '512x512', type: 'image/png' },
            { src: coverUrl, sizes: '256x256', type: 'image/png' }
          ]
        });
      }
    };
    tempImg.src = coverUrl;
  } catch (e) {}

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album || '',
    artwork
  });
}

function setupMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => { audioEngine.play(); updatePlayPauseState(true); ms.playbackState = 'playing'; });
  ms.setActionHandler('pause', () => { audioEngine.pause(); updatePlayPauseState(false); ms.playbackState = 'paused'; });
  ms.setActionHandler('previoustrack', () => btnPrev.click());
  ms.setActionHandler('nexttrack', () => btnNext.click());
  // Support interactive seeking on the lockscreen widget
  try {
    ms.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && audioEngine.audioElement) {
        audioEngine.seek(details.seekTime);
      }
    });
  } catch (e) {}
  try {
    ms.setActionHandler('seekbackward', (details) => {
      const el = audioEngine.audioElement;
      if (el) audioEngine.seek(Math.max(0, el.currentTime - (details.seekOffset || 10)));
    });
  } catch (e) {}
  try {
    ms.setActionHandler('seekforward', (details) => {
      const el = audioEngine.audioElement;
      if (el) audioEngine.seek(Math.min(el.duration, el.currentTime + (details.seekOffset || 10)));
    });
  } catch (e) {}
}
setupMediaSessionHandlers();

// In-App Lockscreen Widget UI Controller
let lsScrubbing = false;

function updateLockscreenWidgets(track) {
  if (!track) return;
  const title = track.title || 'Unknown Title';
  const artist = track.artist || 'Unknown Artist';
  const tagText = `${track.format || 'FLAC'} \u2022 ${track.bitsPerSample || 16}-BIT \u2022 ${((track.sampleRate || 44100) / 1000).toFixed(1)} kHz`;
  const isFlac = track.format === 'FLAC';
  const coverUrl = getTrackCover(track);

  // Settings Card Widget
  const lsTitle = document.getElementById('ls-title');
  const lsArtist = document.getElementById('ls-artist');
  const lsTag = document.getElementById('ls-tag');
  const lsArtImg = document.getElementById('ls-art-img');
  const lsBackdrop = document.getElementById('ls-backdrop');

  if (lsTitle) lsTitle.textContent = title;
  if (lsArtist) lsArtist.textContent = artist;
  if (lsTag) {
    lsTag.textContent = tagText;
    lsTag.classList.toggle('flac-neon', isFlac);
  }
  if (lsArtImg) lsArtImg.src = coverUrl;
  if (lsBackdrop) lsBackdrop.style.backgroundImage = `url('${coverUrl}')`;

  // Floating Overlay Widget
  const flsTitle = document.getElementById('fls-title');
  const flsArtist = document.getElementById('fls-artist');
  const flsTag = document.getElementById('fls-tag');
  const flsArtImg = document.getElementById('fls-art-img');
  const flsBackdrop = document.getElementById('fls-backdrop');

  if (flsTitle) flsTitle.textContent = title;
  if (flsArtist) flsArtist.textContent = artist;
  if (flsTag) {
    flsTag.textContent = tagText;
    flsTag.classList.toggle('flac-neon', isFlac);
  }
  if (flsArtImg) flsArtImg.src = coverUrl;
  if (flsBackdrop) flsBackdrop.style.backgroundImage = `url('${coverUrl}')`;
}

function syncLockscreenScrubber(currentTime, duration) {
  if (lsScrubbing || !duration || duration <= 0) return;
  const pct = (currentTime / duration) * 100;
  const curStr = formatDuration(currentTime);
  const totStr = formatDuration(duration);

  const lsScrubber = document.getElementById('ls-scrubber');
  const lsCurrent = document.getElementById('ls-current');
  const lsTotal = document.getElementById('ls-total');
  if (lsScrubber) {
    lsScrubber.value = pct;
    lsScrubber.style.setProperty('--p', `${pct}%`);
  }
  if (lsCurrent) lsCurrent.textContent = curStr;
  if (lsTotal) lsTotal.textContent = totStr;

  const flsScrubber = document.getElementById('fls-scrubber');
  const flsCurrent = document.getElementById('fls-current');
  const flsTotal = document.getElementById('fls-total');
  if (flsScrubber) {
    flsScrubber.value = pct;
    flsScrubber.style.setProperty('--p', `${pct}%`);
  }
  if (flsCurrent) flsCurrent.textContent = curStr;
  if (flsTotal) flsTotal.textContent = totStr;
}

function updateLockscreenPlayPause(isPlaying) {
  const playIconSvg = '<polygon points="6 4 20 12 6 20 6 4"></polygon>';
  const pauseIconSvg = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';

  const lsPlayIcon = document.getElementById('ls-play-icon');
  const flsPlayIcon = document.getElementById('fls-play-icon');
  if (lsPlayIcon) lsPlayIcon.innerHTML = isPlaying ? pauseIconSvg : playIconSvg;
  if (flsPlayIcon) flsPlayIcon.innerHTML = isPlaying ? pauseIconSvg : playIconSvg;
}

function initLockscreenWidgetUI() {
  const lsPlay = document.getElementById('ls-play');
  const lsPrev = document.getElementById('ls-prev');
  const lsNext = document.getElementById('ls-next');
  const flsPlay = document.getElementById('fls-play');
  const flsPrev = document.getElementById('fls-prev');
  const flsNext = document.getElementById('fls-next');

  if (lsPlay) lsPlay.addEventListener('click', () => btnMasterPlay.click());
  if (lsPrev) lsPrev.addEventListener('click', () => btnPrev.click());
  if (lsNext) lsNext.addEventListener('click', () => btnNext.click());

  if (flsPlay) flsPlay.addEventListener('click', () => btnMasterPlay.click());
  if (flsPrev) flsPrev.addEventListener('click', () => btnPrev.click());
  if (flsNext) flsNext.addEventListener('click', () => btnNext.click());

  const lsScrubber = document.getElementById('ls-scrubber');
  const flsScrubber = document.getElementById('fls-scrubber');

  [lsScrubber, flsScrubber].forEach(sc => {
    if (!sc) return;
    sc.addEventListener('pointerdown', () => { lsScrubbing = true; });
    sc.addEventListener('input', (e) => {
      const el = audioEngine.audioElement;
      if (el && el.duration) {
        const val = e.target.value;
        sc.style.setProperty('--p', `${val}%`);
        audioEngine.seek((val / 100) * el.duration);
      }
    });
  });
  window.addEventListener('pointerup', () => { lsScrubbing = false; });

  const floatingOverlay = document.getElementById('floating-widget-overlay');
  const btnToggleFloat = document.getElementById('btn-toggle-floating-widget');
  const btnPlayerMini = document.getElementById('btn-player-mini-widget');
  const btnCloseFloat = document.getElementById('btn-close-floating-widget');

  const toggleFloating = () => {
    if (floatingOverlay) floatingOverlay.classList.toggle('active');
  };
  if (btnToggleFloat) btnToggleFloat.addEventListener('click', toggleFloating);
  if (btnPlayerMini) btnPlayerMini.addEventListener('click', toggleFloating);
  if (btnCloseFloat) btnCloseFloat.addEventListener('click', () => {
    if (floatingOverlay) floatingOverlay.classList.remove('active');
  });
}

toggleMediaWidget.addEventListener('change', (e) => {
  mediaWidgetEnabled = e.target.checked;
  localStorage.setItem('aura.mediaWidget', mediaWidgetEnabled ? '1' : '0');
  updateMediaSession(mediaWidgetEnabled ? state.filteredTracks[state.currentTrackIndex] : null);
});

// Keep widget playback state/position in sync with the audio element
audioEngine.audioElement.addEventListener('play', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; updatePlayPauseState(true); });
audioEngine.audioElement.addEventListener('pause', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; updatePlayPauseState(false); });
audioEngine.audioElement.addEventListener('loadedmetadata', () => {
  updateMediaSession(state.filteredTracks[state.currentTrackIndex]);
});
audioEngine.audioElement.addEventListener('timeupdate', () => {
  const el = audioEngine.audioElement;
  if (mediaWidgetEnabled && 'mediaSession' in navigator && isFinite(el.duration) && el.duration > 0) {
    try {
      navigator.mediaSession.setPositionState({ duration: el.duration, playbackRate: el.playbackRate, position: el.currentTime });
    } catch (e) {}
  }
});

// Surface playback failures instead of failing silently
audioEngine.onError = (err) => {
  libraryCountText.textContent = `Playback error${err && err.message ? ': ' + err.message : ''} — the file may be unreadable or its format unsupported.`;
};

// 9. Fullscreen Now Playing (glass controls + matte details tile)
const fsPlayer = document.getElementById('fs-player');
const fsDetails = document.getElementById('fs-details');
const fsScrubber = document.getElementById('fs-scrubber');
let fsScrubbing = false;

function currentTrack() { return state.filteredTracks[state.currentTrackIndex]; }

function refreshFullscreen(animateGrid = false) {
  const track = currentTrack();
  if (!track) return;
  document.getElementById('fs-title').textContent = track.title;
  document.getElementById('fs-artist').textContent = track.artist;
  const tag = document.getElementById('fs-tag');
  tag.textContent = `${track.format} \u2022 ${track.bitsPerSample || 16}-BIT \u2022 ${(track.sampleRate / 1000).toFixed(1)} kHz`;
  tag.classList.toggle('flac-neon', track.format === 'FLAC');

  const art = document.getElementById('fs-art');
  const meta = document.getElementById('fs-meta');
  const backdrop = document.getElementById('fs-backdrop');

  if (animateGrid) {
    art.classList.remove('transition-grid');
    meta.classList.remove('transition-grid');
    // Trigger reflow to restart CSS animation
    void art.offsetWidth;
    art.classList.add('transition-grid');
    meta.classList.add('transition-grid');
  }

  const coverUrl = getTrackCover(track);
  art.innerHTML = `<img src="${coverUrl}" alt="" onerror="this.src='${DEFAULT_APP_COVER}'" />`;
  backdrop.style.backgroundImage = `url('${coverUrl}')`;
  if (fsDetails.classList.contains('open')) renderSongDetails();
}

function renderSongDetails() {
  const t = currentTrack();
  if (!t) return;
  document.getElementById('fd-title').textContent = t.title;
  document.getElementById('fd-artist').textContent = t.artist;
  const rows = [
    ['Album', t.album || 'Unknown'],
    ['Year', t.year || '\u2014'],
    ['Format', t.format],
    ['Bit depth', `${t.bitsPerSample || 16}-bit`],
    ['Sample rate', `${(t.sampleRate / 1000).toFixed(1)} kHz`],
    ['Bitrate', t.bitrate ? `${t.bitrate} kbps` : 'Lossless'],
    ['Duration', formatDuration(t.duration)],
    ['Size', t.size ? `${(t.size / 1048576).toFixed(1)} MB` : '\u2014'],
    ['Location', t.path]
  ];
  document.getElementById('fd-grid').innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('');
}

function openNowPlaying() {
  if (!currentTrack()) return;
  refreshFullscreen(false);
  fsPlayer.classList.add('open');
  fsPlayer.setAttribute('aria-hidden', 'false');
  // Attempt HTML5 Fullscreen API gracefully without breaking UI display
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch (err) {}
}

function closeNowPlaying() {
  closeSongDetails();
  fsPlayer.classList.remove('open');
  fsPlayer.setAttribute('aria-hidden', 'true');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function openSongDetails() {
  renderSongDetails();
  fsDetails.classList.add('open');
  fsDetails.setAttribute('aria-hidden', 'false');
}

function closeSongDetails() {
  fsDetails.classList.remove('open');
  fsDetails.setAttribute('aria-hidden', 'true');
}

document.querySelector('.player-track-info').addEventListener('click', openNowPlaying);
document.querySelector('.player-track-info').style.cursor = 'pointer';
document.getElementById('fs-close').addEventListener('click', closeNowPlaying);
document.getElementById('fs-meta').addEventListener('click', openSongDetails);
document.getElementById('fs-details-back').addEventListener('click', closeSongDetails);
fsDetails.addEventListener('click', (e) => { if (e.target === fsDetails) closeSongDetails(); });
document.getElementById('fs-prev').addEventListener('click', () => btnPrev.click());
document.getElementById('fs-next').addEventListener('click', () => btnNext.click());
document.getElementById('fs-play').addEventListener('click', () => btnMasterPlay.click());

// Esc: close details first, then the fullscreen player
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !fsPlayer.classList.contains('open')) return;
  if (fsDetails.classList.contains('open')) closeSongDetails(); else closeNowPlaying();
});
// Leaving OS fullscreen (e.g. via Esc) also leaves the player view
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && fsPlayer.classList.contains('open')) closeNowPlaying();
});

fsScrubber.addEventListener('pointerdown', () => { fsScrubbing = true; });
window.addEventListener('pointerup', () => { fsScrubbing = false; });
fsScrubber.addEventListener('input', (e) => {
  const el = audioEngine.audioElement;
  if (el && el.duration) {
    fsScrubber.style.setProperty('--p', `${e.target.value}%`);
    document.getElementById('fs-current').textContent = formatDuration((e.target.value / 100) * el.duration);
    audioEngine.seek((e.target.value / 100) * el.duration);
  }
});

(function fsProgressLoop() {
  const el = audioEngine.audioElement;
  if (fsPlayer.classList.contains('open') && !fsScrubbing && el && el.duration > 0) {
    const pct = (el.currentTime / el.duration) * 100;
    fsScrubber.value = pct;
    fsScrubber.style.setProperty('--p', `${pct}%`);
    document.getElementById('fs-current').textContent = formatDuration(el.currentTime);
    document.getElementById('fs-total').textContent = formatDuration(el.duration);
  }
  requestAnimationFrame(fsProgressLoop);
})();

// 10. Headphone crossfeed
const toggleCrossfeed = document.getElementById('toggle-crossfeed');
const crossfeedProfileSel = document.getElementById('crossfeed-profile');
const crossfeedAmount = document.getElementById('crossfeed-amount');
const crossfeedAmountVal = document.getElementById('crossfeed-amount-val');

function initCrossfeedUI() {
  crossfeedProfileSel.innerHTML = Object.entries(CROSSFEED_PROFILES)
    .map(([id, p]) => `<option value="${id}">${escapeHtml(p.name)}</option>`).join('');
  const saved = JSON.parse(localStorage.getItem('aura.crossfeed') || '{}');
  toggleCrossfeed.checked = !!saved.enabled;
  if (saved.profile && CROSSFEED_PROFILES[saved.profile]) crossfeedProfileSel.value = saved.profile;
  if (saved.amount !== undefined) crossfeedAmount.value = Math.round(saved.amount * 100);
  crossfeedAmountVal.textContent = `${crossfeedAmount.value}%`;
  applyCrossfeed();
}

function applyCrossfeed() {
  const cfg = {
    enabled: toggleCrossfeed.checked,
    profile: crossfeedProfileSel.value,
    amount: parseInt(crossfeedAmount.value, 10) / 100
  };
  crossfeedAmountVal.textContent = `${crossfeedAmount.value}%`;
  localStorage.setItem('aura.crossfeed', JSON.stringify(cfg));
  audioEngine.setCrossfeed(cfg.enabled, cfg.profile, cfg.amount);
  updateSignalPath();
}
[toggleCrossfeed, crossfeedProfileSel, crossfeedAmount].forEach(el => el.addEventListener('input', applyCrossfeed));

// 11. Subsonic / DC Rumble Filter & Black-Background Noise Gate UI
function initNoiseGateAndFilterUI() {
  const toggleDc = document.getElementById('toggle-dc-filter');
  const toggleGate = document.getElementById('toggle-noise-gate');
  const selectThresh = document.getElementById('select-gate-threshold');
  const chipGate = document.getElementById('gate-active-chip');

  // Load saved preferences (defaults to enabled for audiophile background clarity)
  const savedDc = localStorage.getItem('aura.subsonicFilter');
  const dcEnabled = savedDc === null ? true : savedDc === '1';

  const savedGate = localStorage.getItem('aura.noiseGate');
  const gateEnabled = savedGate === null ? true : savedGate === '1';

  const savedThresh = localStorage.getItem('aura.gateThreshold') || '-65';

  if (toggleDc) {
    toggleDc.checked = dcEnabled;
    audioEngine.setSubsonicFilter(dcEnabled);
    toggleDc.addEventListener('change', (e) => {
      const en = e.target.checked;
      localStorage.setItem('aura.subsonicFilter', en ? '1' : '0');
      audioEngine.setSubsonicFilter(en);
      updateSignalPath();
    });
  }

  function updateGateUI() {
    const en = toggleGate ? toggleGate.checked : false;
    const thresh = selectThresh ? parseFloat(selectThresh.value) : -65;
    if (chipGate) {
      if (en) {
        chipGate.textContent = `${thresh} dBFS`;
        chipGate.style.opacity = '1';
        chipGate.style.borderColor = 'rgba(212, 175, 55, 0.4)';
        chipGate.style.color = 'var(--accent-gold)';
      } else {
        chipGate.textContent = 'BYPASSED';
        chipGate.style.opacity = '0.5';
        chipGate.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        chipGate.style.color = 'var(--text-muted)';
      }
    }
  }

  if (toggleGate && selectThresh) {
    toggleGate.checked = gateEnabled;
    selectThresh.value = savedThresh;
    audioEngine.setNoiseGate(gateEnabled, parseFloat(savedThresh));
    updateGateUI();

    toggleGate.addEventListener('change', (e) => {
      const en = e.target.checked;
      localStorage.setItem('aura.noiseGate', en ? '1' : '0');
      audioEngine.setNoiseGate(en, parseFloat(selectThresh.value));
      updateGateUI();
      updateSignalPath();
    });

    selectThresh.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      localStorage.setItem('aura.gateThreshold', e.target.value);
      audioEngine.setNoiseGate(toggleGate.checked, val);
      updateGateUI();
      updateSignalPath();
    });
  }
}

// 12. Exclusive (WASAPI) output mode — takes effect after restart
async function initExclusiveMode() {
  const toggle = document.getElementById('toggle-exclusive-mode');
  const status = document.getElementById('exclusive-status');
  let settings = { exclusiveAudio: false, exclusiveActive: false, platform: 'unknown' };
  try { settings = await window.electronAPI.getEngineSettings(); } catch (e) {}
  audioEngine.exclusiveMode = !!settings.exclusiveActive;
  toggle.checked = !!settings.exclusiveAudio;
  const describe = () => {
    if (settings.platform !== 'win32') return 'Exclusive mode is only available on Windows.';
    if (settings.exclusiveActive) return 'Active: requesting exclusive low-latency output.';
    return 'Off: using the shared system mixer.';
  };
  status.textContent = describe();
  if (settings.platform !== 'win32') toggle.disabled = true;
  toggle.addEventListener('change', async (e) => {
    const res = await window.electronAPI.setExclusiveAudio(e.target.checked);
    status.textContent = res.restartRequired
      ? 'Saved. Restart the app to apply — click here to restart now.'
      : describe();
    if (res.restartRequired) {
      status.style.cursor = 'pointer';
      status.onclick = () => window.electronAPI.restartApp();
    }
  });
}

// 13. Master Edition Theme Personalisation Controller
function applyTheme(themeId, save = true) {
  const theme = MASTER_THEMES.find(t => t.id === themeId) || MASTER_THEMES[0];
  state.activeThemeId = theme.id;
  document.documentElement.setAttribute('data-theme', theme.id);

  if (save) {
    localStorage.setItem('aura.masterTheme', theme.id);
  }

  // Update Titlebar Quick Pill
  const pillLabel = document.getElementById('theme-pill-label');
  const indicatorDot = document.getElementById('theme-indicator-dot');
  if (pillLabel) pillLabel.textContent = theme.name;
  if (indicatorDot) indicatorDot.style.background = theme.swatchColor;

  // Update Settings View Badge & Cards
  const activeBadge = document.getElementById('theme-active-badge');
  if (activeBadge) activeBadge.textContent = theme.name;

  document.querySelectorAll('.theme-swatch-card').forEach(card => {
    card.classList.toggle('active', card.dataset.themeId === theme.id);
  });
}

function initThemePersonalisation() {
  const container = document.getElementById('theme-swatch-grid');
  if (container) {
    container.innerHTML = '';
    MASTER_THEMES.forEach(theme => {
      const card = document.createElement('div');
      card.className = `theme-swatch-card ${theme.id === state.activeThemeId ? 'active' : ''}`;
      card.dataset.themeId = theme.id;
      card.innerHTML = `
        <div class="theme-swatch-header">
          <div class="theme-swatch-circle" style="background: ${theme.swatchColor};"></div>
          <span class="spec-chip" style="font-size: 10px; border-color: ${theme.swatchColor}; color: ${theme.swatchColor};">${theme.badge}</span>
        </div>
        <div class="theme-swatch-name">${escapeHtml(theme.name)}</div>
        <div class="theme-swatch-desc">${escapeHtml(theme.description)}</div>
      `;
      card.addEventListener('click', () => applyTheme(theme.id));
      container.appendChild(card);
    });
  }

  // Titlebar Pill Cycle Click
  const titlebarPill = document.getElementById('titlebar-theme-pill');
  if (titlebarPill) {
    titlebarPill.addEventListener('click', () => {
      const currentIndex = MASTER_THEMES.findIndex(t => t.id === state.activeThemeId);
      const nextIndex = (currentIndex + 1) % MASTER_THEMES.length;
      applyTheme(MASTER_THEMES[nextIndex].id);
    });
  }

  // Initial apply
  applyTheme(state.activeThemeId, false);
}

async function bootDspExtras() {
  initThemePersonalisation();
  await initExclusiveMode(); // must run before the AudioContext is created
  initCrossfeedUI();
  initNoiseGateAndFilterUI();
  initLockscreenWidgetUI();
}
bootDspExtras();

initApp();

