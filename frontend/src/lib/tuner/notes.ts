/** Note ↔ MIDI ↔ frequency, equal temperament: f(n) = A4 · 2^((n − 69) / 12). */

export const A4_MIN = 415;
export const A4_MAX = 466;
export const A4_DEFAULT = 440;

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "D#2" / "Eb2" → MIDI note number (A4 = 69), or null if it isn't a note. */
export function noteToMidi(note: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]?)(-?\d)$/.exec(note.trim());
  if (!m) return null;
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + LETTER[m[1].toUpperCase()] + acc;
}

export function midiToFrequency(midi: number, a4 = A4_DEFAULT): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Fractional MIDI number of a frequency (69 = A4). */
export function frequencyToMidiFloat(frequency: number, a4 = A4_DEFAULT): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

export function midiToNoteName(midi: number, flats = false): string {
  const names = flats ? FLAT_NAMES : SHARP_NAMES;
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function octaveOfMidi(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export interface NearestNote {
  midi: number;
  note: string;
  octave: number;
  /** Equal-tempered frequency of that note at the given A4. */
  targetFrequency: number;
  /** How far the detected pitch is from it, in cents (−50…+50). */
  cents: number;
}

/** The chromatic target: the nearest semitone. */
export function nearestNote(frequency: number, a4 = A4_DEFAULT, flats = false): NearestNote {
  const exact = frequencyToMidiFloat(frequency, a4);
  const midi = Math.round(exact);
  return {
    midi,
    note: midiToNoteName(midi, flats),
    octave: octaveOfMidi(midi),
    targetFrequency: midiToFrequency(midi, a4),
    cents: (exact - midi) * 100,
  };
}

export function clampA4(value: number): number {
  if (!Number.isFinite(value)) return A4_DEFAULT;
  return Math.min(A4_MAX, Math.max(A4_MIN, Math.round(value * 10) / 10));
}
