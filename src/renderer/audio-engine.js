// High-Resolution Web Audio Master Pipeline
import { EQ_FREQUENCIES } from './presets.js';

// Crossfeed profiles modelled on the bs2b library: cutoff of the feed filter and feed level.
// Direct and crossed paths are normalised so the low-frequency mono sum stays at unity.
export const CROSSFEED_PROFILES = {
  bauer: { name: 'Bauer (bs2b default)', fcut: 700, feedDb: 4.5 },
  chumoy: { name: 'Chu Moy', fcut: 700, feedDb: 6.0 },
  meier: { name: 'Jan Meier', fcut: 650, feedDb: 9.5 }
};

export class HighResAudioEngine {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.preampNode = null;
    this.eqNodes = [];
    this.analyserNode = null;
    this.subBassAnalyser = null;
    this.subBassBins = new Uint8Array(64);
    this.subBassSmooth = 0;
    this.lastSubBassTime = 0;
    this.lastSubBassSampleMs = 0;
    this.dynamicsBuffer = new Float32Array(512);
    this.lastDynamicsSampleMs = 0;
    this.cachedDynamics = { peak: 0, rms: 0, crestFactorDb: 0, dynamicRating: 'IDLE' };
    this.crossfeedNode = null;
    this.crossfeed = null;
    this.crossfeedEnabled = false;
    this.crossfeedProfile = 'bauer';
    this.crossfeedAmount = 1.0; // 0..1 scales the feed level
    this.exclusiveMode = false; // low-latency path required by Chromium's WASAPI exclusive mode

    // True Stereo & Soundstage Architecture
    this.stereoMode = 'true-stereo'; // 'true-stereo' (Direct 2.0 Reference) | 'wide' (Expanded 3D Stage) | 'crossfeed' (Speaker Stage) | 'mono' (Center Sum)
    this.stereoBalance = 0.0;        // -1.0 (Left) to +1.0 (Right), 0.0 = Dead Center
    this.stereoWidth = 1.0;          // 1.0 = 100% True Stereo reference, 0.0 = Mono, 1.5 = Wide
    this.channelSwap = false;        // Swap L <-> R channels
    this.phaseInvertL = false;       // Invert Left channel polarity 180 deg
    this.phaseInvertR = false;       // Invert Right channel polarity 180 deg
    this.stereoStage = null;
    
    // Subsonic & DC Offset Rumble Filter (20Hz High-Pass)
    this.subsonicFilterEnabled = true;
    this.dcFilter1 = null;
    this.dcFilter2 = null;

    // Real-Time Black-Background Noise Gate / Downward Expander
    this.noiseGateEnabled = true;
    this.noiseGateThreshold = -65; // dBFS
    this.noiseGateAttack = 0.005;  // 5ms
    this.noiseGateRelease = 0.090; // 90ms
    this.gateGainNode = null;
    this.gateAnalyserNode = null;
    this.gatePcmBuffer = new Float32Array(512);
    this.gateLoopId = null;
    this.gateState = 'open';
    this.sampleRate = 44100;
    this.bitDepth = 16;
    this.bitPerfect = false;
    this.dacDetected = false;
    this.dacDetails = null;
    this.dacMismatchGuard = true; // Prevents high-bit/high-kHz distortion or clipped output if no verified DAC is connected
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = 'anonymous';

    this.isPlaying = false;
    this.currentTrack = null;
    this.onTrackEnded = null;
    this.onTimeUpdate = null;
    this.onError = null;
    this.eqGains = new Array(10).fill(0);
    this.preampDb = 0;
    this.volume = 0.85;
    this.useDeviceVolume = false;

    this.audioElement.addEventListener('error', () => {
      const err = this.audioElement.error;
      console.error('Audio element error:', err);
      if (this.onError) this.onError(err);
    });

    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      if (this.onTrackEnded) this.onTrackEnded();
    });

    this.audioElement.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.audioElement.currentTime, this.audioElement.duration || 0);
      }
    });

    const unlockAudio = async () => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        try { await this.audioContext.resume(); } catch (e) {}
      }
    };
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
  }

  async initAudioContext() {
    // One persistent context: MediaElementSource may only be created once per <audio>.
    // The context runs at the output device's native rate; the browser resamples cleanly.
    if (this.audioContext) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    // Web Audio processes everything as 32-bit float internally (no intermediate truncation).
    this.audioContext = new AudioContextClass({ latencyHint: this.exclusiveMode ? 'interactive' : 'playback' });

    // Build Master DSP Chain:
    // AudioElement -> MediaElementSource -> Preamp Gain -> 10-Band Biquad EQ -> Analyser -> Output Master Gain -> Destination
    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    this.preampNode = this.audioContext.createGain();
    this.preampNode.gain.value = 1.0;

    // Create 10 EQ Biquad Filter Nodes
    this.eqNodes = EQ_FREQUENCIES.map((freq, i) => {
      const filter = this.audioContext.createBiquadFilter();
      if (i === 0) {
        filter.type = 'lowshelf';
      } else if (i === EQ_FREQUENCIES.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.value = 1.414; // Standard 1-octave Q
      }
      filter.frequency.value = freq;
      filter.gain.value = 0;
      return filter;
    });

    // Spectrum Analyser
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.85;

    // Dedicated high-resolution Sub-Bass FFT tap (32–120 Hz) for Living Mesh visuals
    // Leaf node tap: adds zero latency or coloration to the master signal path
    this.subBassAnalyser = this.audioContext.createAnalyser();
    this.subBassAnalyser.fftSize = 4096;
    this.subBassAnalyser.minDecibels = -85;
    this.subBassAnalyser.maxDecibels = -18;
    this.subBassAnalyser.smoothingTimeConstant = 0.58;

    // Master Output Gain
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 1.0;

    this.buildDCOffsetFilter();
    this.buildNoiseGate();
    this.buildCrossfeed();
    this.buildStereoStage();

    this.analyserNode.connect(this.subBassAnalyser);
    this.analyserNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    this.rewire();
    this.sampleRate = this.audioContext.sampleRate;
  }

  // Crossfeed (bs2b binaural speaker simulation):
  // Each ear receives its own direct channel at full high-frequency clarity (with a compensated low-shelf
  // cut below fcut) plus a low-passed, 0.32ms-delayed feed from the opposite channel, emulating studio
  // monitors in a room without muffling treble or dropping overall loudness.
  buildCrossfeed() {
    const ctx = this.audioContext;
    const input = ctx.createGain();
    input.channelCount = 2;
    input.channelCountMode = 'explicit';
    input.channelInterpretation = 'speakers';
    const output = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    input.connect(splitter);

    const makeDirect = () => {
      const shelf = ctx.createBiquadFilter();
      shelf.type = 'lowshelf';
      shelf.frequency.value = 700;
      shelf.gain.value = -3.0;
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      shelf.connect(gain);
      return { shelf, gain };
    };
    const directL = makeDirect();
    const directR = makeDirect();

    const makeFeed = () => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.6;
      const delay = ctx.createDelay(0.01);
      delay.delayTime.value = 0.00032; // ~0.32 ms interaural time difference (speaker angle ~30 deg)
      const gain = ctx.createGain();
      lp.connect(delay);
      delay.connect(gain);
      return { lp, delay, gain };
    };
    const feedLtoR = makeFeed();
    const feedRtoL = makeFeed();

    splitter.connect(directL.shelf, 0);
    splitter.connect(directR.shelf, 1);
    splitter.connect(feedLtoR.lp, 0);
    splitter.connect(feedRtoL.lp, 1);

    directL.gain.connect(merger, 0, 0);
    feedRtoL.gain.connect(merger, 0, 0);
    directR.gain.connect(merger, 0, 1);
    feedLtoR.gain.connect(merger, 0, 1);
    merger.connect(output);

    this.crossfeed = { input, output, directL, directR, feeds: [feedLtoR, feedRtoL] };
    this.updateCrossfeed();
  }

  updateCrossfeed() {
    if (!this.crossfeed || !this.audioContext) return;
    const p = CROSSFEED_PROFILES[this.crossfeedProfile] || CROSSFEED_PROFILES.bauer;
    const t = this.audioContext.currentTime;
    const cross = Math.pow(10, -p.feedDb / 20) * this.crossfeedAmount;
    // Preserve 0 dB high-frequency clarity on the direct path; only attenuate low frequencies (< fcut)
    // by the low-frequency mono sum factor so bass stays tight and level-matched.
    const lowFreqDirect = 1 / (1 + cross);
    const lowShelfDb = 20 * Math.log10(Math.max(0.25, lowFreqDirect));
    const cf = this.crossfeed;

    cf.directL.shelf.frequency.setTargetAtTime(p.fcut, t, 0.03);
    cf.directR.shelf.frequency.setTargetAtTime(p.fcut, t, 0.03);
    cf.directL.shelf.gain.setTargetAtTime(lowShelfDb, t, 0.03);
    cf.directR.shelf.gain.setTargetAtTime(lowShelfDb, t, 0.03);
    cf.directL.gain.gain.setTargetAtTime(1.0, t, 0.03);
    cf.directR.gain.gain.setTargetAtTime(1.0, t, 0.03);

    for (const f of cf.feeds) {
      f.lp.frequency.setTargetAtTime(p.fcut, t, 0.03);
      f.gain.gain.setTargetAtTime(cross * lowFreqDirect, t, 0.03);
    }
  }

  setCrossfeed(enabled, profile, amount) {
    if (enabled !== undefined) {
      this.crossfeedEnabled = enabled;
      if (enabled) {
        this.stereoMode = 'crossfeed';
      } else if (this.stereoMode === 'crossfeed') {
        this.stereoMode = 'true-stereo';
      }
    }
    if (profile && CROSSFEED_PROFILES[profile]) this.crossfeedProfile = profile;
    if (amount !== undefined) this.crossfeedAmount = Math.max(0, Math.min(1, amount));
    this.updateCrossfeed();
    this.updateStereoStage();
    this.rewire();
  }

  // True Stereo & Soundstage Stage:
  // Independent discrete L/R paths with 2x2 matrix for 100% true channel separation,
  // Mid/Side soundstage width, L/R balance trim, polarity inversion, and channel swap.
  buildStereoStage() {
    const ctx = this.audioContext;
    const input = ctx.createGain();
    input.channelCount = 2;
    input.channelCountMode = 'explicit';
    input.channelInterpretation = 'discrete';

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    const gainL = ctx.createGain();
    const gainR = ctx.createGain();

    const lToL = ctx.createGain();
    const lToR = ctx.createGain();
    const rToL = ctx.createGain();
    const rToR = ctx.createGain();

    input.connect(splitter);

    splitter.connect(gainL, 0);
    splitter.connect(gainR, 1);

    gainL.connect(lToL);
    gainL.connect(lToR);
    gainR.connect(rToL);
    gainR.connect(rToR);

    lToL.connect(merger, 0, 0);
    rToL.connect(merger, 0, 0);
    lToR.connect(merger, 0, 1);
    rToR.connect(merger, 0, 1);

    const output = ctx.createGain();
    output.channelCount = 2;
    output.channelCountMode = 'explicit';
    output.channelInterpretation = 'discrete';
    merger.connect(output);

    this.stereoStage = {
      input,
      output,
      gainL,
      gainR,
      lToL,
      lToR,
      rToL,
      rToR
    };
    this.updateStereoStage();
  }

  updateStereoStage() {
    if (!this.stereoStage || !this.audioContext) return;
    const t = this.audioContext.currentTime;
    const ramp = 0.03; // Smooth 30ms click-free transition

    // 1. Balance Calculation (smooth linear pan with center detent)
    let bL = 1.0;
    let bR = 1.0;
    if (this.stereoBalance < 0) {
      bR = Math.max(0, 1.0 + this.stereoBalance);
    } else if (this.stereoBalance > 0) {
      bL = Math.max(0, 1.0 - this.stereoBalance);
    }

    // Polarity phase inversion (0 or 180 degrees)
    const polL = this.phaseInvertL ? -1.0 : 1.0;
    const polR = this.phaseInvertR ? -1.0 : 1.0;

    this.stereoStage.gainL.gain.setTargetAtTime(bL * polL, t, ramp);
    this.stereoStage.gainR.gain.setTargetAtTime(bR * polR, t, ramp);

    // 2. Routing Matrix
    if (this.stereoMode === 'mono') {
      // Mono folddown: (L + R) / 2 to both channels
      this.stereoStage.lToL.gain.setTargetAtTime(0.5, t, ramp);
      this.stereoStage.rToL.gain.setTargetAtTime(0.5, t, ramp);
      this.stereoStage.lToR.gain.setTargetAtTime(0.5, t, ramp);
      this.stereoStage.rToR.gain.setTargetAtTime(0.5, t, ramp);
    } else {
      // Determine effective Mid/Side width:
      // - 'true-stereo': 1.0 (100% discrete 2.0 separation) unless custom width set
      // - 'wide': 1.45 (145% expanded 3D soundstage) unless custom width > 1.05
      // - 'crossfeed': 1.0 (binaural crossfeed handled by upstream bs2b stage)
      let w = 1.0;
      if (this.stereoMode === 'wide') {
        w = (this.stereoWidth !== undefined && this.stereoWidth > 1.05) ? this.stereoWidth : 1.45;
      } else if (this.stereoMode === 'true-stereo') {
        w = (this.stereoWidth !== undefined) ? this.stereoWidth : 1.0;
      }

      // Mid/Side matrix with gentle power normalization when widened (>1.0) so center vocal stays anchored
      const norm = w > 1.0 ? 1 / Math.sqrt((1 + w * w) / 2) : 1.0;
      const direct = ((1.0 + w) / 2.0) * norm;
      const cross = ((1.0 - w) / 2.0) * norm;

      if (this.channelSwap) {
        // Channel Swap: L <-> R while preserving active stereo width
        this.stereoStage.lToL.gain.setTargetAtTime(cross, t, ramp);
        this.stereoStage.rToL.gain.setTargetAtTime(direct, t, ramp);
        this.stereoStage.lToR.gain.setTargetAtTime(direct, t, ramp);
        this.stereoStage.rToR.gain.setTargetAtTime(cross, t, ramp);
      } else {
        this.stereoStage.lToL.gain.setTargetAtTime(direct, t, ramp);
        this.stereoStage.rToR.gain.setTargetAtTime(direct, t, ramp);
        this.stereoStage.rToL.gain.setTargetAtTime(cross, t, ramp);
        this.stereoStage.lToR.gain.setTargetAtTime(cross, t, ramp);
      }
    }
  }

  setStereoMode(mode) {
    if (['true-stereo', 'wide', 'crossfeed', 'mono'].includes(mode)) {
      this.stereoMode = mode;
      this.crossfeedEnabled = (mode === 'crossfeed');
      if (mode === 'true-stereo') {
        this.stereoWidth = 1.0;
      } else if (mode === 'wide') {
        this.stereoWidth = 1.45;
      } else if (mode === 'mono') {
        this.stereoWidth = 0.0;
      } else if (mode === 'crossfeed') {
        this.stereoWidth = 1.0;
      }
      this.updateCrossfeed();
      this.updateStereoStage();
      this.rewire();
    }
  }

  setStereoBalance(balance) {
    const val = parseFloat(balance);
    this.stereoBalance = isNaN(val) ? 0 : Math.max(-1.0, Math.min(1.0, val));
    this.updateStereoStage();
  }

  setStereoWidth(width) {
    const val = parseFloat(width);
    this.stereoWidth = isNaN(val) ? 1.0 : Math.max(0.0, Math.min(1.6, val));
    if (this.stereoMode !== 'crossfeed') {
      if (this.stereoWidth <= 0.02) {
        this.stereoMode = 'mono';
      } else if (this.stereoWidth > 1.05) {
        this.stereoMode = 'wide';
      } else {
        this.stereoMode = 'true-stereo';
      }
    }
    this.updateStereoStage();
  }

  setChannelSwap(swap) {
    this.channelSwap = !!swap;
    this.updateStereoStage();
  }

  setPhaseInvert(invertL, invertR = false) {
    this.phaseInvertL = !!invertL;
    this.phaseInvertR = !!invertR;
    this.updateStereoStage();
  }

  async loadTrack(track) {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch (e) {}
    }
    this.isPlaying = false;
    this.currentTrack = track;
    const targetSampleRate = track.sampleRate && track.sampleRate >= 44100 ? track.sampleRate : 44100;

    // Check DAC compatibility safeguard:
    // If track is > 48kHz (e.g. 96kHz, 192kHz) or 24/32-bit and user hasn't connected a DAC,
    // we alert or throttle to avoid OS audio kernel clipping.
    if (!this.dacDetected && (targetSampleRate > 48000 || track.bitsPerSample > 16)) {
      console.warn(`[DAC Safety Guard]: Hi-Res track (${targetSampleRate}Hz/${track.bitsPerSample}-bit) detected on non-DAC hardware. Guard mode active.`);
    }

    if (!this.audioContext) {
      await this.initAudioContext();
      this.applyState();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Format URL for streaming via local high-throughput audio server
    let streamPort = 0;
    try {
      if (window.electronAPI && window.electronAPI.getStreamPort) {
        streamPort = await window.electronAPI.getStreamPort();
      }
    } catch (e) {}

    const cleanPath = encodeURIComponent(track.path);
    if (streamPort > 0) {
      this.audioElement.src = `http://127.0.0.1:${streamPort}/audio?file=${cleanPath}`;
    } else {
      this.audioElement.src = `file:///${track.path.replace(/\\/g, '/')}`;
    }
    this.audioElement.load();
  }

  async play() {
    if (!this.audioContext) {
      await this.initAudioContext();
      this.applyState();
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('AudioContext resume error:', e);
      }
    }
    try {
      await this.audioElement.play();
      this.isPlaying = true;
      if (this.noiseGateEnabled && !this.gateLoopId) {
        this.startNoiseGateMonitoring();
      }
    } catch (e) {
      console.error('Playback error:', e);
    }
  }

  pause() {
    this.audioElement.pause();
    this.isPlaying = false;
    if (this.noiseGateEnabled && this.gateGainNode && this.audioContext && this.gateState !== 'closed') {
      this.gateGainNode.gain.setTargetAtTime(0.0, this.audioContext.currentTime, 0.04);
      this.gateState = 'closed';
    }
  }

  seek(seconds) {
    if (this.audioElement) {
      this.audioElement.currentTime = seconds;
    }
  }

  async setOutputDevice(deviceId) {
    if (this.audioElement && typeof this.audioElement.setSinkId === 'function') {
      try {
        await this.audioElement.setSinkId(deviceId);
        console.log(`[AudioEngine]: Output routed to device: ${deviceId}`);
        return true;
      } catch (err) {
        console.warn('setSinkId failed:', err);
        return false;
      }
    }
    return false;
  }

  setVolume(volume0to1) {
    this.volume = volume0to1;
    this.applyVolume();
  }

  // When enabled, the app never attenuates digitally: loudness is controlled by the
  // device / OS (hardware) volume, keeping the stream at full resolution.
  setUseDeviceVolume(enabled) {
    this.useDeviceVolume = enabled;
    this.applyVolume();
  }

  applyVolume() {
    const effective = this.useDeviceVolume ? 1.0 : (this.volume ?? 0.85);
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(effective, this.audioContext.currentTime);
    }
    this.audioElement.volume = 1.0;
  }

  setPreamp(dbGain) {
    const clamped = Math.max(-12, Math.min(10, parseFloat(dbGain) || 0));
    this.preampDb = clamped;
    if (this.preampNode && this.audioContext) {
      // dB to linear gain (-12.0 dB to +10.0 dB max headroom boost)
      const linear = Math.pow(10, clamped / 20);
      this.preampNode.gain.setTargetAtTime(linear, this.audioContext.currentTime, 0.05);
    }
  }

  applyEQPreset(gains) {
    this.eqGains = [...gains];
    if (!this.eqNodes || !this.audioContext) return;
    gains.forEach((gain, index) => {
      if (this.eqNodes[index]) {
        this.eqNodes[index].gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.08);
      }
    });
  }

  setBandGain(bandIndex, gainValue) {
    this.eqGains[bandIndex] = gainValue;
    if (this.eqNodes && this.eqNodes[bandIndex] && this.audioContext) {
      this.eqNodes[bandIndex].gain.setTargetAtTime(gainValue, this.audioContext.currentTime, 0.05);
    }
  }

  setBitPerfect(enabled) {
    // Pure Mode: bypass preamp + EQ entirely (settings are preserved for when it is turned off)
    this.bitPerfect = enabled;
    this.rewire();
  }

  // 4th-Order Steep Subsonic Rumble & DC Offset Filter (20Hz High-Pass)
  buildDCOffsetFilter() {
    if (!this.audioContext) return;
    // Cascaded 2x 2nd-order Butterworth high-pass filters at 20 Hz = 4th-order 24dB/octave
    this.dcFilter1 = this.audioContext.createBiquadFilter();
    this.dcFilter1.type = 'highpass';
    this.dcFilter1.frequency.value = 20;
    this.dcFilter1.Q.value = 0.7071;

    this.dcFilter2 = this.audioContext.createBiquadFilter();
    this.dcFilter2.type = 'highpass';
    this.dcFilter2.frequency.value = 20;
    this.dcFilter2.Q.value = 0.7071;

    this.dcFilter1.connect(this.dcFilter2);
  }

  // Real-Time Black-Background Noise Gate / Downward Expander
  buildNoiseGate() {
    if (!this.audioContext) return;
    this.gateGainNode = this.audioContext.createGain();
    this.gateGainNode.gain.value = 1.0;

    // Real-time envelope sidechain detector
    this.gateAnalyserNode = this.audioContext.createAnalyser();
    this.gateAnalyserNode.fftSize = 512;
    this.gateAnalyserNode.smoothingTimeConstant = 0.2;

    this.startNoiseGateMonitoring();
  }

  startNoiseGateMonitoring() {
    if (this.gateLoopId) {
      cancelAnimationFrame(this.gateLoopId);
      this.gateLoopId = null;
    }
    const pcmData = this.gatePcmBuffer;

    const checkLevel = () => {
      this.gateLoopId = null;
      if (!this.audioContext || !this.gateAnalyserNode || !this.gateGainNode) return;

      if (!this.noiseGateEnabled) {
        if (this.gateState !== 'open') {
          this.gateGainNode.gain.setTargetAtTime(1.0, this.audioContext.currentTime, 0.01);
          this.gateState = 'open';
        }
        return; // Sleep RAF loop completely while gate is disabled
      }

      if (!this.isPlaying) {
        if (this.gateState !== 'closed') {
          this.gateGainNode.gain.setTargetAtTime(0.0, this.audioContext.currentTime, 0.04);
          this.gateState = 'closed';
        }
        return; // Sleep RAF loop during idle/pause; play() wakes it immediately
      }

      // Calculate peak & RMS energy in current frame (pre-allocated 32-bit float buffer)
      this.gateAnalyserNode.getFloatTimeDomainData(pcmData);
      let sumSquares = 0;
      let peak = 0;
      for (let i = 0; i < pcmData.length; i++) {
        const v = Math.abs(pcmData[i]);
        if (v > peak) peak = v;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / pcmData.length);
      const currentDb = 20 * Math.log10(Math.max(peak, rms, 1e-7));

      // Hysteresis: open at threshold + 2dB, close at threshold - 3dB; schedule AudioParam only on state transitions
      const openThreshold = this.noiseGateThreshold + 2;
      const closeThreshold = this.noiseGateThreshold - 3;
      const now = this.audioContext.currentTime;

      if (currentDb >= openThreshold && this.gateState !== 'open') {
        this.gateGainNode.gain.setTargetAtTime(1.0, now, this.noiseGateAttack);
        this.gateState = 'open';
      } else if (currentDb < closeThreshold && this.gateState !== 'closed') {
        this.gateGainNode.gain.setTargetAtTime(0.0, now, this.noiseGateRelease);
        this.gateState = 'closed';
      }

      this.gateLoopId = requestAnimationFrame(checkLevel);
    };

    if (this.isPlaying && this.noiseGateEnabled) {
      this.gateLoopId = requestAnimationFrame(checkLevel);
    }
  }

  setSubsonicFilter(enabled) {
    this.subsonicFilterEnabled = !!enabled;
    this.rewire();
  }

  setNoiseGate(enabled, thresholdDb = null) {
    if (enabled !== undefined) this.noiseGateEnabled = !!enabled;
    if (thresholdDb !== null && !isNaN(thresholdDb)) this.noiseGateThreshold = parseFloat(thresholdDb);
    this.rewire();
    if (!this.noiseGateEnabled && this.gateGainNode && this.audioContext) {
      this.gateGainNode.gain.setTargetAtTime(1.0, this.audioContext.currentTime, 0.02);
      this.gateState = 'open';
    } else if (this.noiseGateEnabled && this.isPlaying && !this.gateLoopId) {
      this.startNoiseGateMonitoring();
    }
  }

  // Route source -> [DC 20Hz filter] -> [preamp -> EQ -> crossfeed] -> [noise gate] -> analyser -> gain -> destination
  rewire() {
    if (!this.sourceNode || !this.eqNodes.length || !this.analyserNode) return;
    const lastEq = this.eqNodes[this.eqNodes.length - 1];

    try { this.sourceNode.disconnect(); } catch (e) {}
    if (this.dcFilter1) { try { this.dcFilter1.disconnect(); } catch (e) {} }
    if (this.dcFilter2) { try { this.dcFilter2.disconnect(); } catch (e) {} }
    try { this.preampNode.disconnect(); } catch (e) {}
    try { lastEq.disconnect(); } catch (e) {}
    if (this.crossfeed) { try { this.crossfeed.output.disconnect(); } catch (e) {} }
    if (this.stereoStage) { try { this.stereoStage.output.disconnect(); } catch (e) {} }
    if (this.gateGainNode) { try { this.gateGainNode.disconnect(); } catch (e) {} }
    if (this.gateAnalyserNode) { try { this.gateAnalyserNode.disconnect(); } catch (e) {} }

    // Stage 1: Input with optional Subsonic DC & Rumble Filter (20Hz High-Pass)
    let inputStage = this.sourceNode;
    if (this.subsonicFilterEnabled && this.dcFilter1 && this.dcFilter2) {
      this.sourceNode.connect(this.dcFilter1);
      this.dcFilter1.connect(this.dcFilter2);
      inputStage = this.dcFilter2;
    }

    // Pure Mode (Bit-Perfect DSP bypass of EQ/Preamp; honors explicit Stereo Mode selection)
    if (this.bitPerfect) {
      let pureStage = inputStage;
      if (this.stereoMode === 'crossfeed' && this.crossfeedEnabled && this.crossfeed) {
        pureStage.connect(this.crossfeed.input);
        pureStage = this.crossfeed.output;
      }
      if (this.stereoStage) {
        pureStage.connect(this.stereoStage.input);
        pureStage = this.stereoStage.output;
      }
      if (this.noiseGateEnabled && this.gateGainNode) {
        pureStage.connect(this.gateGainNode);
        if (this.gateAnalyserNode) pureStage.connect(this.gateAnalyserNode);
        this.gateGainNode.connect(this.analyserNode);
      } else {
        pureStage.connect(this.analyserNode);
      }
      return;
    }

    // Standard DSP processing chain: Input -> Preamp -> EQ
    inputStage.connect(this.preampNode);
    let currentNode = this.preampNode;
    for (const filter of this.eqNodes) {
      currentNode.connect(filter);
      currentNode = filter;
    }

    // After EQ: route through Crossfeed if in crossfeed mode
    let postDsp = lastEq;
    if (this.stereoMode === 'crossfeed' && this.crossfeedEnabled && this.crossfeed) {
      lastEq.connect(this.crossfeed.input);
      postDsp = this.crossfeed.output;
    }

    // Route through True Stereo & Soundstage stage
    if (this.stereoStage) {
      postDsp.connect(this.stereoStage.input);
      postDsp = this.stereoStage.output;
    }

    // Noise Gate Stage: sidechain level detection + gain ducking
    if (this.noiseGateEnabled && this.gateGainNode) {
      postDsp.connect(this.gateGainNode);
      if (this.gateAnalyserNode) postDsp.connect(this.gateAnalyserNode);
      this.gateGainNode.connect(this.analyserNode);
    } else {
      postDsp.connect(this.analyserNode);
    }
  }

  // Re-apply all stored state onto the live graph
  applyState() {
    this.applyEQPreset(this.eqGains);
    this.setPreamp(this.preampDb);
    this.updateCrossfeed();
    this.updateStereoStage();
    this.rewire();
    this.applyVolume();
  }

  get outputSampleRate() {
    return this.audioContext ? this.audioContext.sampleRate : null;
  }

  getFrequencyData(array) {
    if (this.analyserNode) {
      this.analyserNode.getByteFrequencyData(array);
    }
  }

  getWaveformData(array) {
    if (this.analyserNode) {
      this.analyserNode.getByteTimeDomainData(array);
    }
  }

  /**
   * Real-time Sub-Bass Energy (32–120 Hz) normalized 0..1 with asymmetric
   * musical attack/release smoothing and per-frame memoization (zero thread blocking / zero GC).
   */
  getSubBassEnergy() {
    const now = performance.now();
    // Memoize within the current 60 FPS frame (~10ms window) so multiple callers share one FFT read
    if (this.lastSubBassSampleMs > 0 && (now - this.lastSubBassSampleMs) < 10) {
      return this.subBassSmooth;
    }
    this.lastSubBassSampleMs = now;

    const dt = this.lastSubBassTime > 0
      ? Math.min(0.1, Math.max(0.004, (now - this.lastSubBassTime) / 1000))
      : 0.016;
    this.lastSubBassTime = now;

    if (!this.subBassAnalyser || !this.audioContext || !this.isPlaying) {
      if (this.subBassSmooth > 0) {
        this.subBassSmooth *= Math.exp(-dt * 5.5);
        if (this.subBassSmooth < 0.002) this.subBassSmooth = 0;
      }
      return this.subBassSmooth;
    }

    const binHz = this.audioContext.sampleRate / this.subBassAnalyser.fftSize;
    const minBin = Math.max(1, Math.floor(32 / binHz));
    const maxBin = Math.min(this.subBassAnalyser.frequencyBinCount - 1, Math.ceil(120 / binHz));

    const needed = maxBin + 2;
    if (!this.subBassBins || this.subBassBins.length < needed) {
      this.subBassBins = new Uint8Array(Math.max(64, needed));
    }

    // Partial bin readback: Web Audio copies only subBassBins.length bytes (~64 bytes instead of 2048)
    this.subBassAnalyser.getByteFrequencyData(this.subBassBins);

    let weightedSum = 0;
    let weightTotal = 0;
    let peakVal = 0;

    for (let b = minBin; b <= maxBin; b++) {
      const freq = b * binHz;
      const val = this.subBassBins[b];
      if (val > peakVal) peakVal = val;
      // Emphasize deep chest-punch & sub-bass fundamentals (40–95 Hz)
      const weight = (freq >= 40 && freq <= 95) ? 1.35 : 1.0;
      weightedSum += val * weight;
      weightTotal += weight;
    }

    const avgVal = weightTotal > 0 ? (weightedSum / weightTotal) : 0;
    const combined = (avgVal * 0.62 + peakVal * 0.38) / 255;

    // Noise-floor gate + punchy curve so 32–120 Hz bass kicks visibly drive the Living Mesh
    const gated = Math.max(0, Math.min(1, (combined - 0.08) / 0.56));
    const target = Math.pow(gated, 1.08);

    // Fast transient attack (~45ms), silky liquid release (~230ms)
    const rate = target > this.subBassSmooth ? 22.0 : 4.4;
    this.subBassSmooth += (target - this.subBassSmooth) * (1 - Math.exp(-dt * rate));
    this.subBassSmooth = Math.max(0, Math.min(1, this.subBassSmooth));

    return this.subBassSmooth;
  }

  /**
   * Real-Time Micro-Dynamics & Crest Factor Analysis
   * Pre-allocated Float32Array + per-frame memoization for zero-GC 60 FPS telemetry.
   */
  getDynamicsMetrics() {
    if (!this.analyserNode || !this.isPlaying) {
      this.cachedDynamics.peak = 0;
      this.cachedDynamics.rms = 0;
      this.cachedDynamics.crestFactorDb = 0;
      this.cachedDynamics.dynamicRating = 'IDLE';
      return this.cachedDynamics;
    }

    const now = performance.now();
    if (this.lastDynamicsSampleMs > 0 && (now - this.lastDynamicsSampleMs) < 14) {
      return this.cachedDynamics;
    }
    this.lastDynamicsSampleMs = now;

    const fftLen = this.analyserNode.fftSize || 512;
    if (!this.dynamicsBuffer || this.dynamicsBuffer.length !== fftLen) {
      this.dynamicsBuffer = new Float32Array(fftLen);
    }
    this.analyserNode.getFloatTimeDomainData(this.dynamicsBuffer);

    let peak = 0;
    let sumSquares = 0;
    const len = this.dynamicsBuffer.length;

    for (let i = 0; i < len; i++) {
      const abs = Math.abs(this.dynamicsBuffer[i]);
      if (abs > peak) peak = abs;
      sumSquares += abs * abs;
    }

    const rms = Math.sqrt(sumSquares / len);

    if (rms < 0.001 || peak < 0.002) {
      this.cachedDynamics.peak = 0;
      this.cachedDynamics.rms = 0;
      this.cachedDynamics.crestFactorDb = 0;
      this.cachedDynamics.dynamicRating = 'SILENT';
      return this.cachedDynamics;
    }

    // Crest Factor: ratio of peak amplitude to RMS
    const cfRatio = peak / Math.max(rms, 1e-4);
    const crestFactorDb = Math.min(24, Math.max(0, 20 * Math.log10(cfRatio)));

    let dynamicRating = 'BALANCED';
    if (crestFactorDb >= 13.0) {
      dynamicRating = 'DYNAMIC'; // Uncompressed acoustic transients / drum peaks / orchestral swells
    } else if (crestFactorDb < 8.0) {
      dynamicRating = 'COMPRESSED'; // Loudness war / brickwalled master
    }

    this.cachedDynamics.peak = peak;
    this.cachedDynamics.rms = rms;
    this.cachedDynamics.crestFactorDb = crestFactorDb;
    this.cachedDynamics.dynamicRating = dynamicRating;
    return this.cachedDynamics;
  }
}
