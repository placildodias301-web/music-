/**
 * Real-time pitch detection — YIN (the algorithm most tuner apps build
 * on), implementing the exact formulas from the spec:
 *
 *   f = 440 * 2^(n/12)              (note -> frequency)
 *   n = 12 * log2(f / 440)          (frequency -> nearest semitone from A4)
 *   cents = 1200 * log2(f_detected / f_target)   (sharp/flat needle)
 *
 * Includes a confidence/clarity score (YIN's 1 − aperiodicity)
 * so background noise is rejected, and per-instrument frequency ranges
 * so the detector only looks for pitches that instrument can produce —
 * exactly the "instrument-only" behavior called out as a required
 * feature, not an optional nicety.
 */

import { yinPitch } from "./tuner/pitch";

export interface TuningString {
  note: string;
  freq: number;
}

export interface InstrumentRange {
  id: string;
  label: string;
  fmin: number;
  fmax: number;
  /** Standard tuning, lowest string first. */
  strings: TuningString[];
}

const GUITAR_STANDARD: TuningString[] = [
  { note: "E2", freq: 82.41 },
  { note: "A2", freq: 110.0 },
  { note: "D3", freq: 146.83 },
  { note: "G3", freq: 196.0 },
  { note: "B3", freq: 246.94 },
  { note: "E4", freq: 329.63 },
];

// Violin and mandolin share GDAE tuning.
const GDAE: TuningString[] = [
  { note: "G3", freq: 196.0 },
  { note: "D4", freq: 293.66 },
  { note: "A4", freq: 440.0 },
  { note: "E5", freq: 659.26 },
];

export const INSTRUMENT_RANGES: InstrumentRange[] = [
  // Guitar floor 55 Hz: Drop D (D2 73 Hz), Drop C (C2 65 Hz) and custom tunings down to A1.
  { id: "guitar", label: "Acoustic Guitar", fmin: 55, fmax: 1319, strings: GUITAR_STANDARD },
  { id: "violin", label: "Violin", fmin: 180, fmax: 3520, strings: GDAE },
  {
    id: "bass",
    label: "Bass",
    fmin: 37,
    fmax: 400,
    strings: [
      { note: "E1", freq: 41.2 },
      { note: "A1", freq: 55.0 },
      { note: "D2", freq: 73.42 },
      { note: "G2", freq: 98.0 },
    ],
  },
  { id: "mandolin", label: "Mandolin", fmin: 180, fmax: 2100, strings: GDAE },
  { id: "electric-guitar", label: "Electric Guitar", fmin: 55, fmax: 1319, strings: GUITAR_STANDARD },
  // Any note, no strings: the target is simply the nearest semitone.
  { id: "chromatic", label: "Chromatic", fmin: 30, fmax: 2100, strings: [] },
];

const NOTE_NAMES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];

export interface PitchResult {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
  clarity: number;
}

/** n = 12 * log2(f / A4) — semitone distance from A4 (440 Hz unless set), then note name + octave. */
export function frequencyToNote(frequency: number, a4 = 440): { note: string; octave: number; cents: number } {
  const semitoneOffsetFromA4 = 12 * Math.log2(frequency / a4);
  const roundedSemitone = Math.round(semitoneOffsetFromA4);
  const cents = Math.round((semitoneOffsetFromA4 - roundedSemitone) * 100);

  const noteIndex = ((roundedSemitone % 12) + 12) % 12;
  const octave = 4 + Math.floor((roundedSemitone + 9) / 12); // A4 is in octave 4

  return { note: NOTE_NAMES[noteIndex], octave, cents };
}

/** f = A4 * 2^(n/12) — the target frequency for a given note/octave, for reference. */
export function noteToFrequency(semitoneFromA4: number, a4 = 440): number {
  return a4 * Math.pow(2, semitoneFromA4 / 12);
}

/**
 * YIN pitch detection restricted to the instrument's frequency range (the implementation lives in
 * lib/tuner/pitch.ts). Returns null when there's no clear periodic signal — silence, noise, or a pitch
 * outside the range — so the tuner ignores background sound and other instruments.
 */
export function detectPitch(buffer: Float32Array<ArrayBufferLike>, sampleRate: number, range: InstrumentRange, a4 = 440): PitchResult | null {
  const r = yinPitch(buffer, sampleRate, range.fmin, range.fmax, { rmsGate: 0.01 });
  if (!r) return null;
  const { note, octave, cents } = frequencyToNote(r.frequency, a4);
  return { frequency: r.frequency, note, octave, cents, clarity: r.clarity };
}
