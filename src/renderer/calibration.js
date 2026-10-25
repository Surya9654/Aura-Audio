// Auto-EQ style headphone calibration.
//
// Each model stores its measured frequency-response DEVIATION (dB) from the Harman 2018
// target at the 10 EQ band centres (32 Hz ... 16 kHz). The correction applied is:
//     gain[band] = strength * (targetOffset[band] - deviation[band])
// so a model that is +4 dB hot at 8 kHz receives a -4 dB cut there.
//
// NOTE: The numbers below are approximate, hand-condensed summaries of typical
// published measurements (e.g. oratory1990 / Crinacle / AutoEQ style graphs), NOT raw
// lab data. Replace/extend MEASUREMENTS with real data for production-grade accuracy.

import { HEADPHONE_PRESETS, EQ_FREQUENCIES } from './presets.js';

export const MAX_BAND_GAIN = 12;

// Target curves expressed as an offset from Harman 2018 (0 = Harman itself)
export const TARGETS = [
  { id: 'harman', name: 'Harman 2018 (Recommended)', offsets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'diffuse', name: 'Diffuse Field (Neutral)', offsets: [-3.5, -3, -2.5, -1.5, 0, 0, -1, -2, 1, 2] },
  { id: 'bass_boost', name: 'Harman + Bass Boost', offsets: [4, 3.5, 2, 0.5, 0, 0, 0, 0, 0, 0] },
  { id: 'flat', name: 'Flat (Studio Monitor)', offsets: [-5, -4.5, -3, -1.5, 0, 0, -1.5, -3, -1, 0] }
];

// Deviation of each product from the Harman target [32,64,125,250,500,1k,2k,4k,8k,16k] (dB)
const NEW_MEASUREMENTS = [
  { id: 'laptop_speakers', name: 'Laptop Speakers (Typical)', category: 'Speakers', dev: [-18, -14, -9, -4, 0, 1, 2, 0, -3, -8] },
  { id: 'generic_earbuds', name: 'Generic $20 Earbuds', category: 'Budget', dev: [-6, -5, -3, -1, 0, 2, 3, 4, -2, -8] },
  { id: 'apple_earpods', name: 'Apple EarPods (Wired)', category: 'Budget', dev: [-4, -3, -1, 0, 0, 1, 0, -3, -2, -6] },
  { id: 'airpods_pro2', name: 'Apple AirPods Pro 2', category: 'Earbuds', dev: [1, 1, 0, 0, 0, 0, 1, -1, -2, -1] },
  { id: 'galaxy_buds', name: 'Samsung Galaxy Buds', category: 'Earbuds', dev: [2, 3, 2, 0, 0, 1, -1, -3, 1, -2] },
  { id: 'jbl_tune510', name: 'JBL Tune 510BT', category: 'Budget', dev: [4, 4, 3, 1, 0, -1, -3, -1, -2, -5] },
  { id: 'beats_studio', name: 'Beats Studio / Solo', category: 'Headphones', dev: [5, 5, 4, 2, 0, -1, -2, -1, 0, -3] },
  { id: 'bose_qc', name: 'Bose QuietComfort 35 / 45', category: 'Headphones', dev: [3, 3, 2, 1, 0, 0, -1, -3, -2, -4] },
  { id: 'beyer_dt770', name: 'Beyerdynamic DT 770 Pro', category: 'Studio Monitor', dev: [0, 0, 1, 1, 0, 0, 3, 6, 4, -2] },
  { id: 'beyer_dt990', name: 'Beyerdynamic DT 990', category: 'Studio Monitor', dev: [-1, 0, 0, 0, 0, 0, 1, 4, 6, 2] },
  { id: 'akg_k702', name: 'AKG K702 / K712', category: 'Audiophile Open-Back', dev: [-6, -4, -2, 0, 0, 0, 1, 0, -2, -3] },
  { id: 'sony_7506', name: 'Sony MDR-7506 / V6', category: 'Studio Monitor', dev: [-3, -2, 0, 0, 1, 1, 3, 4, 3, -2] }
];

// Existing presets are already corrections, so their deviation is the negated gains.
const FROM_PRESETS = HEADPHONE_PRESETS
  .filter(p => p.category !== 'Reference' && p.category !== 'Sound Signature')
  .map(p => ({ id: p.id, name: p.name, category: p.category, dev: p.gains.map(g => -g) }));

export const MEASUREMENTS = [...NEW_MEASUREMENTS, ...FROM_PRESETS];

const roundHalf = v => Math.round(v * 2) / 2;

export function computeCorrection(model, target = TARGETS[0], strength = 1) {
  return model.dev.map((d, i) => {
    const raw = strength * ((target.offsets[i] || 0) - d);
    return roundHalf(Math.max(-MAX_BAND_GAIN, Math.min(MAX_BAND_GAIN, raw)));
  });
}

export function buildAutoEQPreset(model, target, strength) {
  const gains = computeCorrection(model, target, strength);
  return {
    id: `autoeq_${model.id}`,
    name: `${model.name} → ${target.name.split(' (')[0]}`,
    category: 'Auto-EQ',
    description: `Auto-calibrated to ${target.name} at ${Math.round(strength * 100)}% strength.`,
    impedance: 'Auto-EQ',
    gains,
    spatialEnhance: false,
    recommendedForDAC: false
  };
}

export { EQ_FREQUENCIES };
