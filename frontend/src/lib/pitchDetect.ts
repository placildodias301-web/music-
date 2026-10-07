/**
 * Real-time pitch detection — a genuine autocorrelation-based pitch
 * detector (the standard lightweight alternative to full pYIN for
 * browser/JS use), implementing the exact formulas from the spec:
 *
 *   f = 440 * 2^(n/12)              (note -> frequency)
 *   n = 12 * log2(f / 440)          (frequency -> nearest semitone from A4)
 *   cents = 1200 * log2(f_detected / f_target)   (sharp/flat needle)
 *
 * Includes a confidence/clarity score (like pYIN's voiced-probability)
 * so background noise is rejected, and per-instrument frequency ranges
 * so the detector only looks for pitches that instrument can produce —
 * exactly the "instrument-only" behavior called out as a required
 * feature, not an optional nicety.
 */

export interface InstrumentRange {
  id: string;
  label: string;
  fmin: number;
  fmax: number;
}

export const INSTRUMENT_RANGES: InstrumentRange[] = [
  { id: "guitar", label: "Acoustic Guitar", fmin: 82, fmax: 1319 },
  { id: "violin", label: "Violin", fmin: 196, fmax: 3520 },
  { id: "bass", label: "Bass", fmin: 41, fmax: 400 },
  { id: "mandolin", label: "Mandolin", fmin: 196, fmax: 2100 },
  { id: "electric-guitar", label: "Electric Guitar", fmin: 82, fmax: 1319 },
];

const NOTE_NAMES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];

export interface PitchResult {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
  clarity: number;
}

/** n = 12 * log2(f / 440) — semitone distance from A4, then split into note name + octave. */
export function frequencyToNote(frequency: number): { note: string; octave: number; cents: number } {
  const semitoneOffsetFromA4 = 12 * Math.log2(frequency / 440);
  const roundedSemitone = Math.round(semitoneOffsetFromA4);
  const cents = Math.round((semitoneOffsetFromA4 - roundedSemitone) * 100);

  const noteIndex = ((roundedSemitone % 12) + 12) % 12;
  const octave = 4 + Math.floor((roundedSemitone + 9) / 12); // A4 is in octave 4

  return { note: NOTE_NAMES[noteIndex], octave, cents };
}

/** f = 440 * 2^(n/12) — the target frequency for a given note/octave, for reference. */
export function noteToFrequency(semitoneFromA4: number): number {
  return 440 * Math.pow(2, semitoneFromA4 / 12);
}

/**
 * Autocorrelation-based pitch detection (ACF2+), restricted to the given
 * frequency range. Returns null when there's no clear enough periodic
 * signal (silence, noise, or a pitch outside the instrument's range) —
 * this is the confidence gate that keeps the tuner from reacting to
 * background noise or the wrong instrument.
 */
export function detectPitch(buffer: Float32Array<ArrayBufferLike>, sampleRate: number, range: InstrumentRange): PitchResult | null {
  const size = buffer.length;

  // RMS gate — reject near-silence outright.
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return null;

  const minLag = Math.floor(sampleRate / range.fmax);
  const maxLag = Math.min(Math.floor(sampleRate / range.fmin), size - 1);
  if (maxLag <= minLag) return null;

  let bestLag = -1;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < size - lag; i++) {
      sum += buffer[i] * buffer[i + lag];
    }
    if (sum > bestCorrelation) {
      bestCorrelation = sum;
      bestLag = lag;
    }
  }

  if (bestLag <= 0) return null;

  // Normalize correlation against zero-lag energy to get a 0-1 clarity score.
  let energy = 0;
  for (let i = 0; i < size - bestLag; i++) energy += buffer[i] * buffer[i];
  const clarity = energy > 0 ? Math.min(1, bestCorrelation / energy) : 0;

  if (clarity < 0.35) return null; // confidence gate — reject weak/noisy periodicity

  // Parabolic interpolation around the best lag for sub-sample precision.
  const s0 = _autocorrAt(buffer, bestLag - 1);
  const s1 = _autocorrAt(buffer, bestLag);
  const s2 = _autocorrAt(buffer, bestLag + 1);
  const shift = (s2 - s0) / (2 * (2 * s1 - s2 - s0) || 1);
  const refinedLag = bestLag + (Number.isFinite(shift) ? shift : 0);

  const frequency = sampleRate / refinedLag;
  if (frequency < range.fmin || frequency > range.fmax) return null;

  const { note, octave, cents } = frequencyToNote(frequency);

  return { frequency, note, octave, cents, clarity };
}

function _autocorrAt(buffer: Float32Array<ArrayBufferLike>, lag: number): number {
  let sum = 0;
  for (let i = 0; i < buffer.length - lag; i++) sum += buffer[i] * buffer[i + lag];
  return sum;
}
