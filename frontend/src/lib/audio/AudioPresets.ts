import { type InstrumentPreset, type InstrumentType, type StringAcousticProperties } from "./AudioTypes";

/**
 * Standard 6-string guitar acoustic profile (from String 0 = Low E to String 5 = High E)
 */
const GUITAR_STRINGS: StringAcousticProperties[] = [
  // Low E (wound nickel/steel: deep, slower damping)
  { brightness: 0.62, decay: 0.9982, maxSeconds: 3.2, pluckPosition: 0.16, transientSharpness: 0.8, stringMass: 1.8 },
  // A (wound: solid fundamental)
  { brightness: 0.68, decay: 0.9978, maxSeconds: 3.0, pluckPosition: 0.17, transientSharpness: 0.82, stringMass: 1.6 },
  // D (wound: warm, balanced)
  { brightness: 0.74, decay: 0.9972, maxSeconds: 2.8, pluckPosition: 0.18, transientSharpness: 0.85, stringMass: 1.4 },
  // G (plain/light wound: bright transition)
  { brightness: 0.78, decay: 0.9962, maxSeconds: 2.5, pluckPosition: 0.19, transientSharpness: 0.88, stringMass: 1.2 },
  // B (plain steel: crisp, bell-like)
  { brightness: 0.83, decay: 0.9952, maxSeconds: 2.3, pluckPosition: 0.20, transientSharpness: 0.90, stringMass: 1.1 },
  // High E (plain steel: shimmering, quickest decay)
  { brightness: 0.88, decay: 0.9942, maxSeconds: 2.0, pluckPosition: 0.21, transientSharpness: 0.92, stringMass: 1.0 },
];

/**
 * Standard 4-string bass profile (String 0 = E1, String 3 = G2)
 */
const BASS_STRINGS: StringAcousticProperties[] = [
  // Low E1 (~41 Hz)
  { brightness: 0.32, decay: 0.9988, maxSeconds: 3.8, pluckPosition: 0.14, transientSharpness: 0.65, stringMass: 3.5 },
  // A1 (~55 Hz)
  { brightness: 0.36, decay: 0.9985, maxSeconds: 3.5, pluckPosition: 0.15, transientSharpness: 0.70, stringMass: 3.0 },
  // D2 (~73 Hz)
  { brightness: 0.42, decay: 0.9980, maxSeconds: 3.2, pluckPosition: 0.16, transientSharpness: 0.75, stringMass: 2.6 },
  // G2 (~98 Hz)
  { brightness: 0.48, decay: 0.9975, maxSeconds: 2.9, pluckPosition: 0.17, transientSharpness: 0.80, stringMass: 2.2 },
];

/**
 * Standard 4-string ukulele profile (Nylon strings, re-entrant tuning)
 */
const UKULELE_STRINGS: StringAcousticProperties[] = [
  // G4 (~392 Hz)
  { brightness: 0.65, decay: 0.992, maxSeconds: 1.5, pluckPosition: 0.22, transientSharpness: 0.85, stringMass: 0.9 },
  // C4 (~261 Hz)
  { brightness: 0.58, decay: 0.993, maxSeconds: 1.8, pluckPosition: 0.20, transientSharpness: 0.82, stringMass: 1.1 },
  // E4 (~329 Hz)
  { brightness: 0.62, decay: 0.9925, maxSeconds: 1.6, pluckPosition: 0.21, transientSharpness: 0.84, stringMass: 1.0 },
  // A4 (~440 Hz)
  { brightness: 0.70, decay: 0.991, maxSeconds: 1.4, pluckPosition: 0.22, transientSharpness: 0.88, stringMass: 0.85 },
];

export const INSTRUMENT_PRESETS: Record<InstrumentType, InstrumentPreset> = {
  guitar: {
    id: "guitar",
    pitchRange: [40, 64],
    name: "Acoustic Guitar",
    defaultPluckStyle: "pick",
    bodyResonanceFreqs: [
      { freq: 98, Q: 2.2, gainDb: 4.5 }, // Helmholtz air cavity: the low "boom"
      { freq: 215, Q: 2.0, gainDb: 3.5 }, // Main top wood plate
      { freq: 440, Q: 3.0, gainDb: 1.4 }, // Upper body harmonic
      { freq: 3300, Q: 1.2, gainDb: 3.0 }, // Pick presence and string sparkle
    ],
    roomReverbAmount: 0.08,
    strings: GUITAR_STRINGS,
    defaultString: GUITAR_STRINGS[2],
  },
  "acoustic-guitar": {
    id: "acoustic-guitar",
    pitchRange: [40, 64],
    name: "Acoustic Guitar",
    defaultPluckStyle: "pick",
    bodyResonanceFreqs: [
      { freq: 98, Q: 2.2, gainDb: 4.5 },
      { freq: 215, Q: 2.0, gainDb: 3.5 },
      { freq: 440, Q: 3.0, gainDb: 1.4 },
      { freq: 3300, Q: 1.2, gainDb: 3.0 },
    ],
    roomReverbAmount: 0.08,
    strings: GUITAR_STRINGS,
    defaultString: GUITAR_STRINGS[2],
  },
  "electric-guitar": {
    id: "electric-guitar",
    pitchRange: [40, 64],
    name: "Electric Guitar",
    defaultPluckStyle: "pick",
    bodyResonanceFreqs: [
      { freq: 140, Q: 1.8, gainDb: 1.5 },
      { freq: 750, Q: 2.0, gainDb: 2.0 },
      { freq: 2600, Q: 2.2, gainDb: 2.5 }, // Pickup presence peak
    ],
    roomReverbAmount: 0.05,
    strings: GUITAR_STRINGS,
    defaultString: GUITAR_STRINGS[2],
  },
  bass: {
    id: "bass",
    pitchRange: [28, 43],
    name: "Electric Bass",
    defaultPluckStyle: "finger",
    bodyResonanceFreqs: [
      { freq: 65, Q: 2.2, gainDb: 3.8 }, // Sub-bass punch
      { freq: 135, Q: 2.0, gainDb: 2.8 }, // Fundamental clarity
      { freq: 800, Q: 1.5, gainDb: -2.0 }, // Suppress excessive fret clack
    ],
    roomReverbAmount: 0.04,
    strings: BASS_STRINGS,
    defaultString: BASS_STRINGS[1],
  },
  ukulele: {
    id: "ukulele",
    pitchRange: [60, 69],
    // The array is in string order (G C E A, re-entrant); by pitch it runs C, E, G, A.
    pitchOrder: [1, 2, 0, 3],
    name: "Ukulele",
    defaultPluckStyle: "finger",
    bodyResonanceFreqs: [
      { freq: 380, Q: 2.5, gainDb: 3.5 }, // Small wooden box resonance
      { freq: 760, Q: 2.0, gainDb: 2.2 }, // Upper body tone
    ],
    roomReverbAmount: 0.06,
    strings: UKULELE_STRINGS,
    defaultString: UKULELE_STRINGS[1],
  },
  mandolin: {
    id: "mandolin",
    name: "Mandolin",
    defaultPluckStyle: "pick",
    pitchRange: [55, 76],
    // Courses by pitch: G3 D4 A4 E5 — bright, quick to fade (a plectrum on steel pairs).
    bodyResonanceFreqs: [
      { freq: 300, Q: 2.5, gainDb: 3.0 },
      { freq: 700, Q: 2.0, gainDb: 2.5 },
      { freq: 2200, Q: 2.0, gainDb: 2.0 },
    ],
    roomReverbAmount: 0.06,
    strings: [
      { brightness: 0.72, decay: 0.992, maxSeconds: 1.7, pluckPosition: 0.16, transientSharpness: 0.9, stringMass: 0.8 },
      { brightness: 0.78, decay: 0.99, maxSeconds: 1.5, pluckPosition: 0.17, transientSharpness: 0.92, stringMass: 0.7 },
      { brightness: 0.84, decay: 0.988, maxSeconds: 1.3, pluckPosition: 0.18, transientSharpness: 0.94, stringMass: 0.6 },
      { brightness: 0.9, decay: 0.985, maxSeconds: 1.1, pluckPosition: 0.19, transientSharpness: 0.95, stringMass: 0.5 },
    ],
    defaultString: { brightness: 0.8, decay: 0.989, maxSeconds: 1.4, pluckPosition: 0.17, transientSharpness: 0.93, stringMass: 0.65 },
  },
  banjo: {
    id: "banjo",
    name: "Banjo",
    defaultPluckStyle: "pick",
    pitchRange: [50, 67],
    // Open-back banjo: a drum head instead of a wooden body — sharp attack, twang, very short sustain, little bass.
    bodyResonanceFreqs: [
      { freq: 130, Q: 1.0, gainDb: -4.0 },
      { freq: 600, Q: 3.0, gainDb: 3.0 },
      { freq: 1100, Q: 2.5, gainDb: 4.0 },
      { freq: 2800, Q: 2.0, gainDb: 3.0 },
    ],
    roomReverbAmount: 0.05,
    strings: [
      { brightness: 0.88, decay: 0.984, maxSeconds: 1.0, pluckPosition: 0.14, transientSharpness: 0.97, stringMass: 0.9 },
      { brightness: 0.91, decay: 0.982, maxSeconds: 0.9, pluckPosition: 0.15, transientSharpness: 0.97, stringMass: 0.8 },
      { brightness: 0.93, decay: 0.98, maxSeconds: 0.8, pluckPosition: 0.16, transientSharpness: 0.98, stringMass: 0.7 },
      { brightness: 0.95, decay: 0.978, maxSeconds: 0.7, pluckPosition: 0.17, transientSharpness: 0.98, stringMass: 0.6 },
    ],
    defaultString: { brightness: 0.91, decay: 0.981, maxSeconds: 0.85, pluckPosition: 0.15, transientSharpness: 0.97, stringMass: 0.75 },
  },
  piano: {
    id: "piano",
    name: "Acoustic Piano",
    defaultPluckStyle: "finger",
    bodyResonanceFreqs: [
      { freq: 120, Q: 1.5, gainDb: 2.0 },
      { freq: 350, Q: 1.8, gainDb: 2.0 },
    ],
    roomReverbAmount: 0.12,
    strings: [],
    defaultString: { brightness: 0.70, decay: 0.996, maxSeconds: 3.5, pluckPosition: 0.12, transientSharpness: 0.75, stringMass: 1.3 },
  },
};

export function getPresetForInstrument(instrument: string = "guitar"): InstrumentPreset {
  if (instrument.includes("bass")) return INSTRUMENT_PRESETS.bass;
  if (instrument.includes("ukulele") || instrument.includes("cavaquinho")) return INSTRUMENT_PRESETS.ukulele;
  if (instrument.includes("mandolin") || instrument.includes("balalaika")) return INSTRUMENT_PRESETS.mandolin;
  if (instrument.includes("banjo")) return INSTRUMENT_PRESETS.banjo;
  if (instrument.includes("piano") || instrument.includes("keyboard")) return INSTRUMENT_PRESETS.piano;
  if (instrument.includes("electric")) return INSTRUMENT_PRESETS["electric-guitar"];
  return INSTRUMENT_PRESETS.guitar;
}

/**
 * The acoustic profile for a note, chosen by its PITCH within the instrument's range — never by which string index it came
 * from — so a mandolin, a 7-string or a re-entrant ukulele all get a sensible profile from the same preset.
 */
export function profileForMidi(preset: InstrumentPreset, midi: number): StringAcousticProperties {
  const n = preset.strings.length;
  if (!n || !preset.pitchRange) return preset.defaultString;
  const [lo, hi] = preset.pitchRange;
  const t = Math.min(1, Math.max(0, (midi - lo) / Math.max(1, hi - lo)));
  const rank = Math.round(t * (n - 1));
  const idx = preset.pitchOrder ? preset.pitchOrder[rank] : rank;
  return preset.strings[idx] ?? preset.defaultString;
}
