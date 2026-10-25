// Acoustic compensation targets based on Harman Target 2019 / Diffuse Field / In-Ear Target curves
// Filter frequencies: 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz

export const HEADPHONE_PRESETS = [
  {
    id: 'flat_reference',
    name: 'Audiophile Reference (Bit-Perfect Flat)',
    category: 'Reference',
    description: 'Completely uncolored, bit-perfect response ideal for studio reference monitors and transparent setups.',
    impedance: 'Any',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    spatialEnhance: false,
    recommendedForDAC: true
  },
  {
    id: 'airpods_max',
    name: 'Apple AirPods Max',
    category: 'Headphones',
    description: 'Cleans up excessive lower-mid bloat, enhances upper treble air and restores transient sparkle.',
    impedance: '32 Ω (Digital)',
    gains: [-1.2, -0.8, -0.5, 0.2, 0.5, 0.8, 1.2, 2.0, 2.5, 2.8],
    spatialEnhance: true,
    recommendedForDAC: false
  },
  {
    id: 'sony_wh1000xm5',
    name: 'Sony WH-1000XM5 / XM4',
    category: 'Headphones',
    description: 'Tames overwhelming bass boominess and lifts the recessed vocal stage to match Harman In-Room curve.',
    impedance: '48 Ω',
    gains: [-3.5, -3.0, -1.8, -0.5, 0.8, 1.5, 2.2, 3.0, 3.2, 2.5],
    spatialEnhance: true,
    recommendedForDAC: false
  },
  {
    id: 'sennheiser_hd600',
    name: 'Sennheiser HD 600 / HD 650',
    category: 'Audiophile Open-Back',
    description: 'Compensates for open-back sub-bass roll-off while preserving legendary midrange purity.',
    impedance: '300 Ω (High-Gain Recommended)',
    gains: [4.5, 3.8, 2.2, 0.8, 0.0, -0.2, 0.4, 0.8, 1.5, 2.0],
    spatialEnhance: false,
    recommendedForDAC: true
  },
  {
    id: 'sennheiser_hd560s',
    name: 'Sennheiser HD 560S',
    category: 'Audiophile Open-Back',
    description: 'Softens slightly aggressive 4-6kHz treble peak and reinforces sub-bass foundation.',
    impedance: '120 Ω',
    gains: [2.5, 1.8, 0.5, 0.0, 0.0, -0.4, -1.2, -1.5, 0.5, 1.0],
    spatialEnhance: false,
    recommendedForDAC: true
  },
  {
    id: 'ath_m50x',
    name: 'Audio-Technica ATH-M50x',
    category: 'Studio Monitor',
    description: 'Smooths the V-shaped signature, soothing piercing 9kHz spikes and opening up mid vocals.',
    impedance: '38 Ω',
    gains: [-2.0, -1.5, -0.8, 0.5, 1.2, 1.0, 0.5, -2.0, -1.5, 1.0],
    spatialEnhance: false,
    recommendedForDAC: true
  },
  {
    id: 'moondrop_aria_blessing',
    name: 'Moondrop Aria / Blessing 2 / Kato',
    category: 'IEM',
    description: 'Tuned to Harman IEM target; expands micro-dynamics, enhances sub-bass punch without mid bleeding.',
    impedance: '32 Ω / 22 Ω',
    gains: [1.8, 1.2, 0.2, -0.5, 0.0, 0.3, 0.5, 1.0, 1.5, 2.2],
    spatialEnhance: false,
    recommendedForDAC: true
  },
  {
    id: 'kz_zsn_pro',
    name: 'KZ ZSN Pro / ZS10 Pro / Castor',
    category: 'IEM',
    description: 'Tames intense metallic treble fatigue common in budget hybrid balanced armature IEMs, balancing the bass.',
    impedance: '24 Ω',
    gains: [-1.5, -1.0, -0.5, 0.5, 1.0, 0.8, -1.5, -3.2, -3.8, -2.0],
    spatialEnhance: false,
    recommendedForDAC: true
  },
  {
    id: 'hifiman_sundara',
    name: 'HIFIMAN Sundara / Ananda (Planar)',
    category: 'Planar Magnetic',
    description: 'Adds rich sub-bass extension to planar speed while slightly relaxing the bright 8-10kHz planar shimmer.',
    impedance: '37 Ω',
    gains: [3.8, 2.5, 1.0, 0.0, 0.0, 0.2, 0.5, -0.8, -1.2, 0.5],
    spatialEnhance: false,
    recommendedForDAC: true
  },
  {
    id: 'warm_analog_tube',
    name: 'Warm Tube & Vinyl Warmth',
    category: 'Sound Signature',
    description: 'Simulates the warm second-order harmonic coloration and rounded highs of high-end tube amplifiers.',
    impedance: 'Any',
    gains: [2.0, 2.5, 1.8, 1.2, 0.8, 0.2, -0.5, -1.2, -2.0, -3.0],
    spatialEnhance: true,
    recommendedForDAC: true
  }
];

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
