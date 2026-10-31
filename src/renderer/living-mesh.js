// Apple Music-Style "Living Mesh" Backdrop Engine — Aligned with Master Edition Personalisation
// Extracts 4 dominant palette clusters from the current FLAC album artwork onto an offscreen canvas,
// maps them cleanly onto your active Master Edition Personalisation hue (or natural dark-graded cover colors),
// and animates multi-layered fluid blobs modulated by real-time 32–120 Hz sub-bass energy.

export const MASTER_THEME_PALETTES = {
  'gold': {
    // Master Gold: 24K Gold, Burnished Bronze, Warm Amber, Deep Obsidian
    hues: [0.108, 0.114, 0.088, 0.122],
    sats: [0.68, 0.78, 0.72, 0.64],
    lights: [0.12, 0.34, 0.24, 0.28],
    isAchromatic: false
  },
  'blood-red': {
    // Blood Red: Velvet Crimson, Deep Ruby, Burgundy, Garnet
    hues: [0.972, 0.978, 0.955, 0.988],
    sats: [0.76, 0.86, 0.80, 0.72],
    lights: [0.12, 0.34, 0.22, 0.28],
    isAchromatic: false
  },
  'spotify-green': {
    // Spotify Green: Forest Obsidian, Electric Emerald, Lush Jade, Mint-Emerald
    hues: [0.392, 0.392, 0.415, 0.375],
    sats: [0.72, 0.82, 0.76, 0.68],
    lights: [0.11, 0.31, 0.21, 0.26],
    isAchromatic: false
  },
  'platinum': {
    // Liquid Platinum: Aerospace Titanium, Brushed Silver, Cool Slate, Ice Mist
    hues: [0.595, 0.595, 0.605, 0.585],
    sats: [0.16, 0.14, 0.18, 0.10],
    lights: [0.11, 0.34, 0.22, 0.28],
    isAchromatic: true
  }
};

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
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

function hslToRgb(h, s, l) {
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

function buildPureThemePalette(themeId) {
  const spec = MASTER_THEME_PALETTES[themeId] || MASTER_THEME_PALETTES.gold;
  return [0, 1, 2, 3].map(i => hslToRgb(spec.hues[i], spec.sats[i], spec.lights[i]));
}

function buildThemeHarmonizedPalette(themeId, rawCoverColors) {
  const spec = MASTER_THEME_PALETTES[themeId] || MASTER_THEME_PALETTES.gold;
  if (!rawCoverColors || rawCoverColors.length < 4) {
    return buildPureThemePalette(themeId);
  }

  // Map the album cover's extracted luminance & energy contour strictly onto the
  // active Master Edition hue family in HSL space — zero muddy RGB cross-hue collisions!
  return [0, 1, 2, 3].map((i) => {
    const [, coverS, coverL] = rgbToHsl(rawCoverColors[i][0], rawCoverColors[i][1], rawCoverColors[i][2]);
    const h = spec.hues[i];
    const s = spec.isAchromatic
      ? spec.sats[i]
      : Math.max(spec.sats[i] * 0.85, Math.min(0.92, spec.sats[i] * 0.75 + coverS * 0.30));
    const l = Math.max(0.09, Math.min(0.38, spec.lights[i] * 0.72 + coverL * 0.28));
    return hslToRgb(h, s, l);
  });
}

function clonePalette(p) {
  return p.map(c => [c[0], c[1], c[2]]);
}

function colorDistance(c1, c2) {
  const dr = c1[0] - c2[0];
  const dg = c1[1] - c2[1];
  const db = c1[2] - c2[2];
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11 + (dr * dr + dg * dg + db * db) * 0.35);
}

function hueDistance(h1, h2) {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 1 - diff);
}

/**
 * Extracts 4 chromatically distinct dominant colors from an HTMLImageElement
 * using a 48x48 offscreen sampling canvas, calibrated for dark-studio contrast.
 */
export function extractPaletteFromImage(img, samplerCanvas) {
  const size = 48;
  const canvas = samplerCanvas || document.createElement('canvas');
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);

  const { data } = ctx.getImageData(0, 0, size, size);
  const buckets = new Map();
  let maxObservedSat = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 140) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, rSum: 0, gSum: 0, bSum: 0 };
      buckets.set(key, bucket);
    }
    bucket.count++;
    bucket.rSum += r;
    bucket.gSum += g;
    bucket.bSum += b;
  }

  if (buckets.size === 0) return buildPureThemePalette('gold');

  const candidates = [];
  for (const b of buckets.values()) {
    const r = b.rSum / b.count;
    const g = b.gSum / b.count;
    const bl = b.bSum / b.count;
    const [h, s, l] = rgbToHsl(r, g, bl);
    if (s > maxObservedSat) maxObservedSat = s;

    const lumPenalty = (l < 0.07 || l > 0.94)
      ? 0.12
      : (1 - Math.abs(l - 0.45) * 0.55);

    const score = Math.pow(b.count, 0.72) * (0.32 + s * 2.1) * Math.max(0.1, lumPenalty);
    candidates.push({ rgb: [r, g, bl], hsl: [h, s, l], count: b.count, baseScore: score });
  }

  candidates.sort((a, b) => b.baseScore - a.baseScore);

  const isMonochrome = maxObservedSat < 0.13;
  const chosen = [];

  for (let slot = 0; slot < 4; slot++) {
    let best = null;
    let bestAdjusted = -1;

    for (let i = 0; i < Math.min(candidates.length, 90); i++) {
      const cand = candidates[i];
      if (chosen.includes(cand)) continue;

      let diversity = 1.0;
      for (const prev of chosen) {
        const dist = colorDistance(cand.rgb, prev.rgb);
        const hDiff = hueDistance(cand.hsl[0], prev.hsl[0]);
        if (dist < 42) {
          diversity *= 0.08;
        } else if (dist < 85) {
          diversity *= 0.38 + (dist / 85) * 0.5;
        }
        if (!isMonochrome && hDiff < 0.07) {
          diversity *= 0.45;
        } else if (!isMonochrome && hDiff > 0.14) {
          diversity *= 1.18;
        }
      }

      const adjusted = cand.baseScore * diversity;
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        best = cand;
      }
    }

    if (best) {
      chosen.push(best);
    }
  }

  while (chosen.length < 4) {
    const base = chosen[chosen.length - 1] || { hsl: [0.11, 0.55, 0.30] };
    const [h, s, l] = base.hsl;
    const nextH = (h + 0.14 * chosen.length) % 1;
    const nextL = Math.max(0.14, Math.min(0.38, l + (chosen.length % 2 === 0 ? 0.08 : -0.08)));
    chosen.push({ hsl: [nextH, s, nextL], rgb: hslToRgb(nextH, s, nextL) });
  }

  // Calibrate into deep dark-studio lightness (0.12..0.38) so text & glass UI stay razor-sharp
  return chosen.map((item, idx) => {
    let [h, s, l] = item.hsl;
    if (isMonochrome) {
      const targetLights = [0.12, 0.30, 0.22, 0.18];
      l = l * 0.40 + targetLights[idx] * 0.60;
      s = Math.min(0.12, s);
      return hslToRgb(h, s, l);
    }

    if (idx === 0) {
      s = Math.min(0.82, s * 1.12 + 0.06);
      l = Math.max(0.11, Math.min(0.24, l * 0.62));
    } else if (idx === 1) {
      s = Math.min(0.90, s * 1.20 + 0.10);
      l = Math.max(0.24, Math.min(0.40, l * 0.85));
    } else if (idx === 2) {
      s = Math.min(0.86, s * 1.15 + 0.06);
      l = Math.max(0.18, Math.min(0.35, l * 0.78));
    } else {
      s = Math.min(0.84, s * 1.12 + 0.05);
      l = Math.max(0.16, Math.min(0.32, l * 0.74));
    }
    return hslToRgb(h, s, l);
  });
}

export class LivingMeshController {
  constructor({ getSubBassEnergy, onPaletteChange } = {}) {
    this.getSubBassEnergy = typeof getSubBassEnergy === 'function' ? getSubBassEnergy : () => 0;
    this.onPaletteChange = typeof onPaletteChange === 'function' ? onPaletteChange : null;

    this.samplerCanvas = document.createElement('canvas');
    this.samplerCanvas.width = 48;
    this.samplerCanvas.height = 48;

    this.paletteCache = new Map();
    this.currentUrl = '';
    this.hasRealCover = false;
    this.rawCoverColors = null;

    this.activeThemeId = localStorage.getItem('aura.masterTheme') || 'gold';
    const savedMode = localStorage.getItem('aura.backdropMode');
    this.backdropMode = (savedMode === 'artwork' || savedMode === 'harmonized') ? savedMode : 'harmonized';

    const initial = buildPureThemePalette(this.activeThemeId);
    this.ambientCurrentColors = clonePalette(initial);
    this.ambientTargetColors = clonePalette(initial);
    this.fsCurrentColors = clonePalette(initial);
    this.fsTargetColors = clonePalette(initial);

    this.fsCanvas = null;
    this.fsCtx = null;
    this.ambientCanvas = null;
    this.ambientCtx = null;
    this.lsCanvas = null;
    this.lsCtx = null;
    this.flsCanvas = null;
    this.flsCtx = null;
    this.fsPlayerEl = null;
    this.fsArtEl = null;
    this.viewDacEl = null;
    this.floatingOverlayEl = null;

    this.phase = Math.random() * 100;
    this.lastTime = 0;
    this.ambientFrameToggle = 0;
    this.rafId = null;
  }

  mount({ fsCanvas, ambientCanvas, lsCanvas, flsCanvas, fsPlayerEl, fsArtEl } = {}) {
    this.fsCanvas = fsCanvas || document.getElementById('fs-mesh-canvas');
    this.ambientCanvas = ambientCanvas || document.getElementById('ambient-mesh-canvas');
    this.lsCanvas = lsCanvas || document.getElementById('ls-mesh-canvas');
    this.flsCanvas = flsCanvas || document.getElementById('fls-mesh-canvas');
    this.fsPlayerEl = fsPlayerEl || document.getElementById('fs-player');
    this.fsArtEl = fsArtEl || document.getElementById('fs-art');
    this.viewDacEl = document.getElementById('view-dac');
    this.floatingOverlayEl = document.getElementById('floating-widget-overlay');

    if (this.fsCanvas) {
      this.fsCanvas.width = 168;
      this.fsCanvas.height = 168;
      this.fsCtx = this.fsCanvas.getContext('2d', { alpha: false });
    }

    if (this.ambientCanvas) {
      this.ambientCanvas.width = 136;
      this.ambientCanvas.height = 136;
      this.ambientCtx = this.ambientCanvas.getContext('2d', { alpha: false });
    }

    if (this.lsCanvas) {
      this.lsCanvas.width = 96;
      this.lsCanvas.height = 64;
      this.lsCtx = this.lsCanvas.getContext('2d', { alpha: false });
    }

    if (this.flsCanvas) {
      this.flsCanvas.width = 96;
      this.flsCanvas.height = 64;
      this.flsCtx = this.flsCanvas.getContext('2d', { alpha: false });
    }

    this.recomputeTargets();
    this.start();
  }

  setTheme(themeId) {
    const validId = MASTER_THEME_PALETTES[themeId] ? themeId : 'gold';
    this.activeThemeId = validId;
    this.recomputeTargets();
  }

  setBackdropMode(mode) {
    if (!['harmonized', 'artwork'].includes(mode)) return;
    this.backdropMode = mode;
    localStorage.setItem('aura.backdropMode', mode);
    this.recomputeTargets();
  }

  getBackdropMode() {
    return this.backdropMode;
  }

  recomputeTargets() {
    // 1. Studio / Main Window backdrop ALWAYS honors your Master Edition Personalisation hue family
    //    (modulated in luminance/depth by the playing album cover) so Blood Red, Spotify Green,
    //    Master Gold, and Liquid Platinum NEVER clash or muddy into olive/brown!
    const themeAligned = this.hasRealCover && this.rawCoverColors
      ? buildThemeHarmonizedPalette(this.activeThemeId, this.rawCoverColors)
      : buildPureThemePalette(this.activeThemeId);

    this.ambientTargetColors = clonePalette(themeAligned);

    // 2. Fullscreen & Mobile Remote:
    //    - 'harmonized' (Master Theme Aligned — Default): uses the Master Edition hue-aligned 4-stop palette
    //    - 'artwork' (Album Cover Colors): uses the 4 dark-calibrated dominant colors from the FLAC cover
    if (this.backdropMode === 'artwork' && this.hasRealCover && this.rawCoverColors) {
      this.fsTargetColors = clonePalette(this.rawCoverColors);
    } else {
      this.fsTargetColors = clonePalette(themeAligned);
    }

    this.emitPalette();
  }

  getPalette() {
    return this.fsTargetColors.map(c => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]);
  }

  emitPalette() {
    if (this.onPaletteChange) {
      this.onPaletteChange(this.getPalette());
    }
  }

  setArtwork(coverUrl, isRealTrackCover = true) {
    this.hasRealCover = !!isRealTrackCover;

    if (!isRealTrackCover || !coverUrl) {
      this.currentUrl = '';
      this.rawCoverColors = null;
      this.recomputeTargets();
      return;
    }

    if (coverUrl === this.currentUrl && this.rawCoverColors) {
      this.recomputeTargets();
      return;
    }

    this.currentUrl = coverUrl;

    if (this.paletteCache.has(coverUrl)) {
      this.rawCoverColors = clonePalette(this.paletteCache.get(coverUrl));
      this.recomputeTargets();
      return;
    }

    const requestUrl = coverUrl;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const extracted = extractPaletteFromImage(img, this.samplerCanvas);
        if (this.paletteCache.size >= 80) {
          const oldestKey = this.paletteCache.keys().next().value;
          this.paletteCache.delete(oldestKey);
        }
        this.paletteCache.set(requestUrl, extracted);
        if (this.currentUrl === requestUrl) {
          this.rawCoverColors = clonePalette(extracted);
          this.recomputeTargets();
        }
      } catch (e) {
        console.warn('[LivingMesh] Palette extraction fallback:', e);
      }
    };
    img.src = coverUrl;
  }

  start() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.lastTime = performance.now();

    const tick = (now) => {
      this.rafId = requestAnimationFrame(tick);
      if (document.hidden) {
        this.lastTime = now;
        return;
      }

      const dt = Math.min(0.08, Math.max(0.004, (now - this.lastTime) / 1000));
      this.lastTime = now;

      const energy = Math.max(0, Math.min(1, this.getSubBassEnergy() || 0));

      // Organic drift speed: meditative idle flow + sub-bass kinetic swell
      this.phase += dt * (0.42 + energy * 1.55);

      // Smoothly crossfade 4 palette colors (~0.75s transition on theme or track change)
      const lerp = 1 - Math.exp(-dt * 3.8);
      for (let i = 0; i < 4; i++) {
        for (let ch = 0; ch < 3; ch++) {
          this.ambientCurrentColors[i][ch] += (this.ambientTargetColors[i][ch] - this.ambientCurrentColors[i][ch]) * lerp;
          this.fsCurrentColors[i][ch] += (this.fsTargetColors[i][ch] - this.fsCurrentColors[i][ch]) * lerp;
        }
      }

      const isFsOpen = !!(this.fsPlayerEl && this.fsPlayerEl.classList.contains('open'));

      if (isFsOpen && this.fsCtx) {
        this.renderMesh(this.fsCtx, this.fsCanvas.width, this.fsCanvas.height, this.fsCurrentColors, energy, 0.95);
        if (this.fsArtEl) {
          const c1 = this.fsCurrentColors[1];
          const glowAlpha = (0.32 + energy * 0.36).toFixed(3);
          const spread = Math.round(58 + energy * 40);
          this.fsArtEl.style.boxShadow =
            `0 30px 80px rgba(0, 0, 0, 0.65), 0 0 ${spread}px rgba(${Math.round(c1[0])}, ${Math.round(c1[1])}, ${Math.round(c1[2])}, ${glowAlpha}), 0 0 0 1px rgba(255, 255, 255, 0.14)`;
        }
      } else {
        // Render subtle dark-studio aura & visible lockscreen widgets at 30 FPS
        this.ambientFrameToggle = (this.ambientFrameToggle + 1) & 1;
        if (this.ambientFrameToggle === 0) {
          if (this.ambientCtx) {
            this.renderMesh(this.ambientCtx, this.ambientCanvas.width, this.ambientCanvas.height, this.ambientCurrentColors, energy, 0.58);
          }
          if (this.lsCtx && this.viewDacEl && this.viewDacEl.classList.contains('active')) {
            this.renderMesh(this.lsCtx, this.lsCanvas.width, this.lsCanvas.height, this.fsCurrentColors, energy, 0.92);
          }
          if (this.flsCtx && this.floatingOverlayEl && this.floatingOverlayEl.classList.contains('active')) {
            this.renderMesh(this.flsCtx, this.flsCanvas.width, this.flsCanvas.height, this.fsCurrentColors, energy, 0.92);
          }
        }
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  renderMesh(ctx, w, h, palette, energy, intensity = 1.0) {
    const c0 = palette[0];
    const c1 = palette[1];
    const c2 = palette[2];
    const c3 = palette[3];
    const t = this.phase;

    // 1. Deep obsidian studio base (#07090e) subtly tinted by shadow layer c0
    const baseR = Math.round(7 + c0[0] * 0.18 * intensity);
    const baseG = Math.round(9 + c0[1] * 0.18 * intensity);
    const baseB = Math.round(14 + c0[2] * 0.20 * intensity);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`;
    ctx.fillRect(0, 0, w, h);

    // 2. Multi-layered fluid color blobs on non-repeating Lissajous orbits
    // Controlled alpha prevents additive washout so dark studio contrast stays rich
    const maxDim = Math.max(w, h);
    const blobs = [
      {
        color: c1,
        x: 0.62 + Math.sin(t * 0.37) * 0.26 + Math.cos(t * 0.19) * 0.08,
        y: 0.28 + Math.cos(t * 0.29) * 0.22 + Math.sin(t * 0.17) * 0.07,
        r: (0.62 + energy * 0.22) * maxDim,
        alpha: (0.52 + energy * 0.22) * intensity
      },
      {
        color: c2,
        x: 0.22 + Math.cos(t * 0.31 + 1.4) * 0.24,
        y: 0.72 + Math.sin(t * 0.23 + 0.8) * 0.22,
        r: (0.58 + energy * 0.18) * maxDim,
        alpha: (0.46 + energy * 0.16) * intensity
      },
      {
        color: c3,
        x: 0.80 + Math.sin(t * 0.27 + 2.6) * 0.22,
        y: 0.66 + Math.cos(t * 0.33 + 1.9) * 0.24,
        r: (0.52 + energy * 0.18) * maxDim,
        alpha: (0.40 + energy * 0.16) * intensity
      },
      {
        // Harmonic sub-bass core pulse
        color: c1,
        x: 0.50 + Math.cos(t * 0.43) * 0.12,
        y: 0.42 + Math.sin(t * 0.39) * 0.12,
        r: (0.34 + energy * 0.30) * maxDim,
        alpha: (0.16 + energy * 0.34) * intensity
      }
    ];

    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const cx = b.x * w;
      const cy = b.y * h;
      const rad = b.r;
      const r = Math.round(b.color[0]);
      const g = Math.round(b.color[1]);
      const bl = Math.round(b.color[2]);

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${Math.min(0.88, b.alpha).toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(${r}, ${g}, ${bl}, ${(b.alpha * 0.40).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
