# Aura 2.0 — Ultra-Premium Audiophile Lossless Workstation

**Aura 2.0** is an Apple-inspired desktop lossless audio workstation built specifically for FLAC, high-resolution WAV/AIFF, and bit-perfect DAC playback.

---

## 🌟 Key Features

### 1. Dynamic Dynamic Range (DR) & Crest Factor Heatmap Scrubber Timeline
- **Real-Time 60 FPS Crest Factor Analysis**: Measures sample-accurate instantaneous Peak-to-RMS ratios ($20 \log_{10}(\text{Peak} / \text{RMS})$) directly from the 32-bit floating-point Web Audio pipeline.
- **Visual Micro-Dynamics Heatmap Timeline**: Transforms the seekbar into an uncompressed transient density topography:
  - **Radiant Warm Gold ($DR \ge 13.0\text{ dB}$)**: Uncompressed acoustic transients, drum rimshots, and orchestral swells glow with an ambient champagne-gold bloom.
  - **Warm Studio Brass ($8.0 \le DR < 13.0\text{ dB}$)**: Balanced, punchy studio masters.
  - **Dense Brick-Red Bar ($DR < 8.0\text{ dB}$)**: Instantly reveals brick-walled, heavily compressed "Loudness War" masters where peaks are squashed near the RMS ceiling.
- **Live Scrubber DR Telemetry Badge**: Displays real-time dynamic range readings (e.g. `DR 14.5 dB` with color-coded status dot) across both the master player bar and Fullscreen view.

### 2. 32-Bit Float Processing, WASAPI Exclusive Engine & Output Settings
- **32-Bit Floating Point Pipeline**: Internal stream processing in 32-bit float Web Audio buffers, eliminating quantization distortion before output delivery.
- **Real-Time Black-Background Noise Gate / Expander**: Dynamically monitors the 32-bit audio stream. During silent passages, track pauses, or quiet moments below threshold (-75 dBFS, -65 dBFS, or -55 dBFS), smoothly ramps output gain to absolute digital zero (-∞ dB). Eliminates continuous motherboard analog amplifier hiss, static, and electrical hum, replicating the pitch-black background of high-end external DACs.
- **Software-Side DC Offset & Subsonic Rumble Filter**: 4th-order (-24 dB/oct) Butterworth high-pass filter at 20 Hz in the 32-bit float pipeline. Eliminates 0 Hz DC bias, power supply electrical ripple (5–18 Hz), and low-frequency rumble that strains headphone amplifiers, without affecting musical sub-bass.
- **Exclusive Mode & Jitter Buffer**: Low-latency WASAPI exclusive buffering support with a 1 MB read-ahead jitter buffer to prevent Windows shared mixer audio degradation.
- **Live Signal Path Inspector**: Real-time breakdown displaying source resolution, active 32-bit float DSP chain, crossfeed status, DC filter & noise gate states, headroom attenuation, and output endpoints.
- **True Stereo Mode & Soundstage Architecture**:
  - **100% Discrete Channel Isolation**: Strict dual-mono channel separation without inter-channel leakage or algorithmic cross-talk, preserving bit-accurate spatial imaging.
  - **Multi-Mode Soundfield Switch**: Seamless 1-click toggling between **True Stereo (Discrete 2.0)**, **Headphone Crossfeed (bs2b)**, and **Mono Sum (Phase Coherence Check)**.
  - **Mid/Side (M/S) Soundstage Width**: Calibrated continuous width expansion ($0\%$ Mono to $150\%$ Wide, with $100\%$ True Stereo Reference lock).
  - **Independent L/R Channel Balance Trim**: Micro-dB precision balance adjustments with dead-center detent.
  - **Acoustic Phase Polarity Invert (180°)**: Flips Left channel polarity ($180^\circ$) to instantly diagnose or correct out-of-phase audio files and center vocal cancellations.
  - **L ↔ R Channel Swap**: Quickly verifies channel orientation or corrects reversed headphone wiring.
  - **Quick Player-Bar Mode Pill**: One-click status badge on the master player bar for instant mode switching.
- **Pure Mode (DSP Bypass)**: Seamlessly bypasses all DSP, EQ, and crossfeed filters while preserving configurations for instant toggle.
- **Device Volume Mode**: Locks internal software digital attenuation at 100%, allowing system/hardware volume control with maximum bit-depth preservation.
- **Hardware DAC Interrogation Engine (Backend Preserved)**: Underlying WMI/PowerShell device discovery logic remains intact in the codebase for future hardware integration.

---

### 3. Acoustic Target Presets for Popular Headsets, Earphones & IEMs
Calibrated acoustic compensation curves designed according to Harman Target 2019 and Diffuse-Field standards:
- **Apple AirPods Max** *(De-bloats bass resonance, enhances airy treble extension)*
- **Sony WH-1000XM5 / XM4** *(Tames boomy bass, elevates recessed vocal presence)*
- **Sennheiser HD 600 / HD 650** *(Compensates for open-back sub-bass roll-off while preserving iconic midrange purity)*
- **Sennheiser HD 560S** *(Softens treble fatigue and strengthens bottom-end punch)*
- **Audio-Technica ATH-M50x** *(Balances V-shape response, restores natural acoustic mids)*
- **Moondrop Aria / Blessing 2 / Kato** *(Harman IEM target; micro-detail dynamic expansion)*
- **KZ ZSN Pro / ZS10 Pro / Castor** *(Tames harsh 4kHz-8kHz balanced armature spike for fatigue-free listening)*
- **HIFIMAN Sundara / Ananda** *(Extends planar sub-bass speed and shimmers highs smoothly)*
- **Warm Tube & Vinyl Stage** *(Analog second-order harmonics simulation)*
- **Audiophile Reference** *(0.0dB bit-perfect studio monitor flat curve)*
- **Automatic Headroom Protection**: Auto-calculates negative preamp gain to prevent digital clipping when boosting EQ bands.

---

### 4. Audio Streaming Architecture & Advanced Search
- **Advanced Audiophile Search Engine & Fuzzy Finder**:
  - **Tokenized Multi-Field Querying**: Order-independent search matching simultaneously across Song Title, Artist, Album, Container Format, Bit Depth, Sample Rate, and File/Folder Path.
  - **Typo-Tolerant Fuzzy Matching**: Dynamic bounded Levenshtein distance matching for search tokens $\ge 3$ characters, forgiving accidental misspellings (e.g., `pink flyod`, `beethovn`, `calfornia`).
  - **Multi-Tiered Relevance Ranking**: Weighted scoring prioritizes exact Title matches (+120 pts), Title prefix (+85 pts), Word boundaries (+70 pts), Artist/Album (+80/+65 pts), and Tech specs (+35 pts) over fuzzy approximations.
  - **Natural Audiophile Qualifiers**: Direct support for query qualifiers including `hires` / `hi-res` ($>48\text{ kHz}$ or $>16\text{ bit}$), `24bit`, `16bit`, `96k`, `192k`, `format:flac`, `artist:<name>`, and `album:<name>`.
  - **Visual Match Highlighting**: Safely highlights matched tokens with warm metallic gold accents (`<mark class="search-highlight">`) across Title, Artist, and Album cells.
  - **Apple Glass UI & Global Shortcuts**: Sleek frosted glass search bar above the track table with live results counter chip, clear button (`×`), and global hotkeys (`Ctrl + F` or `/` to focus, `Escape` to clear).
- **Local HTTP Byte-Range Audio Streaming Engine**: Embedded zero-overhead HTTP audio server on `127.0.0.1` providing continuous chunked byte-range (`206 Partial Content`) and lossless FLAC playback with zero stalls or CORS issues.
- **Recursive Drive & Profile Scanner**: Auto-indexes user profiles and custom directories (`C:\Users\<user>\FLAC_files`, `C:\Users\<user>\Music`, and external drives).
- **Persistent Directory Library**: Automatically saves and re-indexes all imported folders across launches.
- **Cover Art Pipeline**: Extracts embedded FLAC Vorbis picture blocks and folder-level art (`cover.jpg`, `folder.jpg`, etc.), optimizing them via `nativeImage` for instant UI rendering.
- **Multi-Format Lossless Engine**: FLAC, WAV, AIFF, ALAC, M4A, MP3, OGG, AAC, OPUS.

---

### 5. Apple Pro Design System (Navy & Gold Studio Edition)
- **Palette**: Deep studio navy (`#07090e`, `#12161f`) with warm metallic gold accents (`#e5b95f`, `#f5d485`). All legacy blue and purple tints eliminated.
- **Ultra-Premium Play/Pause Master Button**: Floating 52px disc with radial champagne gradient, dual gold/white border, and multi-tier ambient halo glow.
- **Precision Scrubber Progress Bar**: Continuously filled gold seekbar powered by `requestAnimationFrame` for buttery 60 FPS time synchronization.
- **Themed Headroom Preamp Slider**: Fully integrated gold-themed slider matching the master console aesthetic.
- **Dynamic Ambient Light Glow**: Soft frosted glass glow (`blur(90px)`) that diffuses album artwork colors into the background.
- **Windows Lock Screen & Media Widget Integration**: Full Windows System Media Transport Controls (SMTC) integration showing artwork, track info, and playback controls on lock screen and volume flyouts.

---

## 📝 Changelog & Evolution

### Version 2.0.0 (Aura 2.0 — Dynamics Heatmap & Audiophile Search)
- **Dynamic Dynamic Range (DR) & Crest Factor Heatmap Timeline**:
  - Transformed the 60 FPS requestAnimationFrame scrubber into a real-time Crest Factor and micro-dynamics heatmap canvas.
  - Color-codes the progress bar dynamically: glowing warm gold during dynamic acoustic peaks ($DR \ge 13\text{ dB}$), warm studio brass during balanced passages ($8 \le DR < 13\text{ dB}$), and dense flat brick-red during heavily compressed/limited loudness-war sections ($DR < 8\text{ dB}$).
  - Added live DR telemetry badge (`DR 14.5 dB • DYNAMIC`) on both the bottom player bar and Fullscreen player.
  - Implemented `DynamicsHeatmapManager` with 160 timeline bins, deterministic baseline envelopes, and real-time live measurement updates.
- **Advanced Audiophile Search Engine & Fuzzy Finder**:
  - Multi-field tokenized query engine with order independence.
  - Bounded Levenshtein typo-tolerance for misspelled artist or track names.
  - Weighted relevance ranking with natural qualifiers (`hires`, `24bit`, `format:flac`).
  - Search highlighting and global shortcuts (`/`, `Ctrl + F`, `Esc`).
### Version 1.5.0 (Master Edition & Audio Engine Upgrade)
- **DAC Deduction UI Soft-Disable (Code Preserved)**:
  - Hidden DAC interrogation status indicators, real-time interrogator sidebar card, and hardware endpoints list from the front-end user interface for cleaner, distraction-free playback.
  - All native WMI interrogation scripts (`detectAudioHardware()`), PowerShell routines, Electron IPC bridges, and `HighResAudioEngine` DAC guard states remain **100% intact in code** for seamless future re-enablement or native driver hooks.
  - Renamed the configuration tab to **Output & Master Settings** to reflect its role across output transports and personalization.
- **Real-Time Black-Background Noise Gate / Expander**:
  - Monitors the audio stream RMS/peak levels in real-time within the 32-bit float pipeline.
  - When the audio stream encounters silence, track gaps, or quiet moments below threshold (-75 dB Subtle, -65 dB Balanced, -55 dB Aggressive), it smoothly ducks output gain to true digital zero (-∞ dB) using exponential ramps (`AudioParam.setTargetAtTime`).
  - Completely silences continuous background analog amplifier hiss, static, and motherboard ground noise, mimicking the pitch-black silent background of external physical DACs.
  - Features built-in +2 dB / -3 dB hysteresis to prevent gate chatter during delicate acoustic instrument decay tails, and automatically ducks to zero on pause/stop.
- **Software-Side DC Offset & Subsonic Rumble Filter (20Hz High-Pass)**:
  - Cascaded dual 2nd-order Butterworth biquad highpass filters yielding a steep 4th-order (-24 dB/octave) cutoff at 20 Hz with maximally flat passband response ($Q = 0.7071$).
  - Strips out 0 Hz DC offset bias and 5–18 Hz sub-audible AC mains hum/electrical power ripple that strains built-in headphone amplifiers, preventing amplifier saturation and intermodulation distortion while keeping musical sub-bass (>25 Hz) untouched.
  - Fully integrated into Live Signal Path Inspector and Output & Master Settings with persistence via `localStorage`.
- **Headphone Crossfeed Engine**:
  - Implemented configurable binaural crossfeed DSP filter stage to blend a subtle fraction of left and right channels with interaural time delay (~0.3ms), simulating physical studio monitors and eliminating "inside-the-head" ear fatigue.
  - Supported algorithms: **Bauer** (bs2b default: 700 Hz, 4.5 dB), **Chu Moy** (700 Hz, 6.0 dB), and **Jan Meier** (650 Hz, 9.5 dB) with live percentage depth control.
- **32-Bit Floating Point Pipeline & Jitter Buffer**:
  - Streams processed internally via 32-bit float Web Audio buffers, eliminating internal truncation distortion before the signal leaves the digital pipeline.
  - Integrated 1 MB read-ahead jitter buffer in the streaming server (`STREAM_BUFFER_BYTES = 1024 * 1024`) for stall-free high-bitrate streaming.
  - Added optional **WASAPI Low-Latency Exclusive Mode** toggle (`enable-exclusive-audio` command-line switch) to bypass Windows shared-mode mixer resampling.
- **Master Edition Personalisation Engine**:
  - Preserved the Master Edition audiophile foundation while allowing instant personalization of the signature accent color across 4 curated profiles:
    - **Master Gold** (`#e5b95f`): Original 24K warm brass reference.
    - **Blood Red** (`#e62b42`): Deep velvet studio crimson.
    - **Spotify Green** (`#1db954`): Electric studio emerald soundstage.
    - **Liquid Platinum** (`#e2e8f0`): Aerospace brushed titanium & silver.
  - Updates all buttons, slider fills, thumb glows, playing indicators, and the real-time Spectrum Analyzer Canvas FFT gradient in real time. Quick-cycle pill in the titlebar and visual swatch grid in settings.
- **App Default Album Art Integration**:
  - Configured `DefaultCover/Gemini_Generated_Image_3vnl5n3vnl5n3vnl.png` as the universal fallback album artwork across the now-playing bar, library table thumbnails, ambient backdrop lighting, fullscreen mode, and Windows Lock Screen (SMTC).
- **Apple-Style Glass Toggle Switches & Alignment Fix**:
  - Redesigned all switches to 48px × 28px Cupertino glassmorphism switches featuring frosted blur backgrounds, theme accent glow when checked, top specular gloss highlights, and perfectly centered porcelain knobs with fluid spring stretch physics.
  - Standardized `.setting-row` alignment across DAC Safeguard, Pure Mode, Exclusive Mode, and Crossfeed.
- **Tile Hierarchy & Focused Nested Outlines (Outlines Only for Tiles in Tiles)**:
  - Outer panels, cards, and section containers (`.audiophile-banner`, `.track-table-container`, `.presets-card`, `.eq-console`, `.signal-path`, `.dsp-panel`, `.setting-row`) are borderless surfaces without exterior outlines for a clean, cohesive layout.
  - Dedicated outlines are focused **strictly on nested tiles inside tiles**:
    - **Presets Tile**: Individual `.preset-item` cards inside the presets container have clear outlines with hover and active theme illumination.
    - **EQ Console Tile**: The 10-band slider strip bay (`.eq-controls-strip`), the individual frequency channel slots (`.eq-band-slider`), and the `.visualizer-container` canvas have crisp outlines.
    - **Crossfeed DSP Tile**: Each `.dsp-row` inside the crossfeed panel is cleanly outlined with styled control boxes.
    - **Signal Path Inspector Tile**: Individual `.signal-stage` cards (`Source`, `Processing`, `Output`) and the `.signal-note` box have distinct borders.
    - **Settings & Personalisation Tile**: Master Edition `.theme-swatch-card`s have outlines with active accent states.
    - **Library Table Tile**: Artwork thumbnails (`.track-thumb`) and format pills have crisp borders.
- **Full Screen-Inspired Compact Lockscreen Widget**:
  - Re-engineered the lockscreen widget into a compact glass tile (~360px × 195px) that directly replicates the visual aesthetics of the Full Screen player in miniature form to sit cleanly alongside other widgets on lockscreens or desktop environments.
  - **Component Structure**:
    - Ambient radial blur backdrop (`.ls-backdrop`) dynamically diffused from the active album cover art.
    - Rounded cover artwork with specular glass depth and drop shadow.
    - Clean typography hierarchy: Bold song title, secondary artist label, and signature audiophile tag (`FLAC • 24-BIT • 96.0 kHz` with neon green or gold glow).
    - Floating frosted glass control bay (`.ls-glass-panel`) with high-precision timeline progress scrubber and circular glass playback controls (Prev, Master Play/Pause, Next).
  - **Integration & Access**:
    - Rendered interactively inside the **Output & Master Settings** view under *Lock Screen & System Media Widget*.
    - Added a floating pop-out Mini-Widget overlay accessible via the player bar and settings toggle.
    - Enabled interactive timeline scrubbing (`seekto`, `seekforward`, `seekbackward`) and dynamic composite card rendering for Windows System Media Transport Controls (SMTC) on the Windows Lock Screen.
- **Audiophile Smart Rewind / Repeat on Previous**:
  - Implemented standard studio behavior for the Previous track control: if the current song has been playing for more than **3 seconds**, clicking Previous instantly rewinds the track to `0:00` and repeats playback from the beginning instead of jumping to the previous track.
  - Clicking Previous within the first 3 seconds navigates to the previous song in the playlist.
  - Applied consistently across the main player bar, Fullscreen player, compact Lockscreen Widgets, keyboard media keys, and Windows SMTC.

### Version 1.4.0
- **Immersive Fullscreen Now Playing Engine**:
  - Clicking any active playing song or the bottom now-playing card triggers full-window playback with ambient frosted blurred album art background.
  - **Glassmorphism Controls**: Play/pause disc, prev/next buttons, and full scrubber progress bar rendered in frosted translucent glass with light border highlights and blur filters.
  - **Matte Track Details Tile**: Clicking the title or artwork opens a modal matte tile with background blur, displaying comprehensive technical metadata (album, year, format, bit depth, sample rate, bitrate, duration, file size, location) with a dedicated top-left back-arrow button.
  - **Dynamic Polygon Grid Transition**: Next and previous track transitions in fullscreen animate via a custom polygonal grid reveal (`@keyframes fsGridTransition`) with smooth spring physics.
- **Refined Fluorescent Green FLAC Identification**:
  - Calibrated the fluorescent green styling from harsh overexposed neon to an audiophile mint emerald (`#2ee677` / `rgba(46, 230, 119, 0.12)`) across library badges, sidebar filters, and telemetry tags to ensure legibility and visual balance.
- **Context-Aware Audio Formats Selector**:
  - The sidebar audio format filter is now view-aware: it remains accessible on the **Music Library** view and automatically hides when the user navigates to configuration screens (EQ/Acoustic Presets, DAC Output, hardware endpoints).
- **Persistent Real-Time Spectrum Analyser**:
  - Resolved sporadic visualizer stalls by implementing automatic audio context wake and resume unlocks across playback transitions and user interactions.
- **Streamlined Lock Screen Widget (SMTC)**:
  - Cleaned up Windows System Media Transport Controls to cleanly showcase high-resolution album artwork and core playback controls (Previous, Play/Pause, Next) without unwanted seek sliders.
- **100% Reliable Fullscreen Trigger**:
  - Fixed fullscreen overlay activation to guarantee instant response on every click regardless of browser fullscreen API permission state.

### Version 1.3.0
- **Audio Streaming Engine**: Replaced custom electron protocol with internal zero-overhead HTTP streaming server (`127.0.0.1`) with full byte-range seeking support, resolving silent playback on Windows.
- **Ultra-Premium UI Refresh**: Added luxury gold disc play/pause button with spring-physics hover/active states.
- **Enhanced Scrubber**: Built 60 FPS `requestAnimationFrame` seekbar with real-time gold fill.
- **Unified Colorway**: Converted Headroom Preamp and all sliders to luxury gold palette, eliminating all remaining blue UI artifacts.

### Version 1.2.0
- **Navy & Gold Palette Overhaul**: Completely purged cold blue/cyan/purple palette in favor of refined deep navy and champagne gold.
- **Cover Art Pipeline Fix**: Fixed `Uint8Array` base64 serialization for embedded FLAC art and added directory-level fallback searching.
- **Dynamic Artwork Glow**: Ambient glow now mirrors and diffuses album art colors into the background.
- **Sensible Preset & Headroom Logic**: Presets now automatically calculate necessary negative preamp headroom to prevent digital inter-sample clipping.
- **Live Signal Path Inspector**: Added real-time chain visualizer showing source format, active DSP, and output endpoints.

### Version 1.1.0
- **Lock Screen & System Media Widget (SMTC)**: Integrated Media Session API for Windows lock screen, media keys, and system volume flyout.
- **Device Volume Setting**: Added toggle to bypass software digital attenuation and use DAC/system hardware volume.
- **Full Profile Scanning**: Expanded scanner to index user profile subdirectories including `FLAC_files` and persistent custom folders.

### Version 1.0.0
- Initial release featuring Electron desktop architecture, Web Audio DSP pipeline, 10-band parametric equalizer, and hardware DAC interrogation.

---

## 🚀 How to Launch

```bash
cd c:\Users\surya\FLAC_player
npm start
```
