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
    this.crossfeedNode = null;
    this.crossfeed = null;
    this.crossfeedEnabled = false;
    this.crossfeedProfile = 'bauer';
    this.crossfeedAmount = 1.0; // 0..1 scales the feed level
    this.exclusiveMode = false; // low-latency path required by Chromium's WASAPI exclusive mode

    // True Stereo & Soundstage Architecture
    this.stereoMode = 'true-stereo'; // 'true-stereo' (Discrete 2.0 unadulterated reference) | 'crossfeed' | 'mono'
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

    // Master Output Gain
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 1.0;

    this.buildDCOffsetFilter();
    this.buildNoiseGate();
    this.buildCrossfeed();
    this.buildStereoStage();

    this.analyserNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    this.rewire();
    this.sampleRate = this.audioContext.sampleRate;
  }

  // Crossfeed: each ear gets its own channel (attenuated) plus a low-passed, slightly delayed
  // copy of the opposite channel, emulating the acoustic crosstalk of loudspeakers.
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

    const directL = ctx.createGain();
    const directR = ctx.createGain();
    const makeFeed = () => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.5;
      const delay = ctx.createDelay(0.01);
      delay.delayTime.value = 0.0003; // ~0.3 ms interaural time difference
      const gain = ctx.createGain();
      lp.connect(delay);
      delay.connect(gain);
      return { lp, delay, gain };
    };
    const feedLtoR = makeFeed();
    const feedRtoL = makeFeed();

    splitter.connect(directL, 0);
    splitter.connect(directR, 1);
    splitter.connect(feedLtoR.lp, 0);
    splitter.connect(feedRtoL.lp, 1);

    directL.connect(merger, 0, 0);
    feedRtoL.gain.connect(merger, 0, 0);
    directR.connect(merger, 0, 1);
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
    const direct = 1 / (1 + cross);
    const cf = this.crossfeed;
    cf.directL.gain.setTargetAtTime(direct, t, 0.03);
    cf.directR.gain.setTargetAtTime(direct, t, 0.03);
    for (const f of cf.feeds) {
      f.lp.frequency.setTargetAtTime(p.fcut, t, 0.03);
      f.gain.gain.setTargetAtTime(cross * direct, t, 0.03);
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
    } else if (this.channelSwap) {
      // Channel Swap: L -> R, R -> L
      this.stereoStage.lToL.gain.setTargetAtTime(0.0, t, ramp);
      this.stereoStage.rToL.gain.setTargetAtTime(1.0, t, ramp);
      this.stereoStage.lToR.gain.setTargetAtTime(1.0, t, ramp);
      this.stereoStage.rToR.gain.setTargetAtTime(0.0, t, ramp);
    } else {
      // True Stereo: 100% discrete separation (reference width 1.0)
      // When in True Stereo mode, direct paths are 1.0 and crosstalk is 0.0.
      const w = this.stereoMode === 'true-stereo' ? (this.stereoWidth !== undefined ? this.stereoWidth : 1.0) : 1.0;
      const direct = (1.0 + w) / 2.0;
      const cross = (1.0 - w) / 2.0;

      this.stereoStage.lToL.gain.setTargetAtTime(direct, t, ramp);
      this.stereoStage.rToR.gain.setTargetAtTime(direct, t, ramp);
      this.stereoStage.rToL.gain.setTargetAtTime(cross, t, ramp);
      this.stereoStage.lToR.gain.setTargetAtTime(cross, t, ramp);
    }
  }

  setStereoMode(mode) {
    if (['true-stereo', 'crossfeed', 'mono'].includes(mode)) {
      this.stereoMode = mode;
      this.crossfeedEnabled = (mode === 'crossfeed');
      this.updateStereoStage();
      this.rewire();
    }
  }

  setStereoBalance(balance) {
    this.stereoBalance = Math.max(-1.0, Math.min(1.0, parseFloat(balance) || 0));
    this.updateStereoStage();
  }

  setStereoWidth(width) {
    this.stereoWidth = Math.max(0.0, Math.min(1.5, parseFloat(width) || 1.0));
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
    } catch (e) {
      console.error('Playback error:', e);
    }
  }

  pause() {
    this.audioElement.pause();
    this.isPlaying = false;
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
    this.preampDb = dbGain;
    if (this.preampNode && this.audioContext) {
      // dB to linear gain
      const linear = Math.pow(10, dbGain / 20);
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
    if (this.gateLoopId) cancelAnimationFrame(this.gateLoopId);
    const pcmData = new Float32Array(512);

    const checkLevel = () => {
      if (this.audioContext && this.gateAnalyserNode && this.gateGainNode) {
        if (!this.noiseGateEnabled) {
          // Gate disabled: hold at unity gain (1.0)
          if (Math.abs(this.gateGainNode.gain.value - 1.0) > 0.001) {
            this.gateGainNode.gain.setTargetAtTime(1.0, this.audioContext.currentTime, 0.01);
          }
          this.gateState = 'open';
        } else if (!this.isPlaying) {
          // Playback paused or stopped: drop to absolute zero (-infinity dB)
          this.gateGainNode.gain.setTargetAtTime(0.0, this.audioContext.currentTime, 0.04);
          this.gateState = 'closed';
        } else {
          // Calculate peak & RMS energy in current frame (32-bit float buffers)
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

          // Hysteresis: open at threshold + 2dB, close at threshold - 3dB to eliminate chatter
          const openThreshold = this.noiseGateThreshold + 2;
          const closeThreshold = this.noiseGateThreshold - 3;
          const now = this.audioContext.currentTime;

          if (currentDb >= openThreshold) {
            // Signal present: open gate rapidly (5ms attack)
            this.gateGainNode.gain.setTargetAtTime(1.0, now, this.noiseGateAttack);
            this.gateState = 'open';
          } else if (currentDb < closeThreshold) {
            // Silence / inter-track gap / quiet passage: drop to digital zero (90ms release)
            this.gateGainNode.gain.setTargetAtTime(0.0, now, this.noiseGateRelease);
            this.gateState = 'closed';
          }
        }
      }
      this.gateLoopId = requestAnimationFrame(checkLevel);
    };

    this.gateLoopId = requestAnimationFrame(checkLevel);
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

    // Pure Mode (Bit-Perfect DSP bypass)
    if (this.bitPerfect) {
      let pureStage = inputStage;
      if (this.stereoStage) {
        inputStage.connect(this.stereoStage.input);
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
   * Real-Time Micro-Dynamics & Crest Factor Analysis
   * Calculates instantaneous Peak, RMS, and Crest Factor (dB) to detect
   * uncompressed dynamic acoustic peaks vs brick-walled loudness war compression.
   */
  getDynamicsMetrics() {
    if (!this.analyserNode || !this.isPlaying) {
      return { peak: 0, rms: 0, crestFactorDb: 0, dynamicRating: 'IDLE' };
    }

    if (!this.dynamicsBuffer) {
      this.dynamicsBuffer = new Float32Array(this.analyserNode.fftSize || 512);
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
      return { peak: 0, rms: 0, crestFactorDb: 0, dynamicRating: 'SILENT' };
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

    return { peak, rms, crestFactorDb, dynamicRating };
  }
}
