/**
 * Shared chord theory — the ONE place that turns a chord into intervals, notes, a formula and inversions.
 * Instrument renderers (guitar, ukulele, keyboard, harp…) take these notes and decide how to draw and play them;
 * none of them has its own theory. The chord qualities themselves live in lib/chordTheory.ts.
 */

import { chordIntervals, chordMidiNotes, spellChord, type ParsedChord } from "../chordTheory";

/** Semitones of the major-scale degree, used to name each chord tone against the major scale (♭3, ♯5…). */
const MAJOR_DEGREE_SEMITONES: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21 };

/** Chord formula against the major scale: C → ["1","3","5"], Cm7 → ["1","♭3","5","♭7"]. */
export function chordFormula(chord: ParsedChord): string[] {
  return chord.quality.tones.map(([semi, degree]) => {
    const diff = semi - (MAJOR_DEGREE_SEMITONES[degree] ?? semi);
    return `${diff < 0 ? "♭".repeat(-diff) : diff > 0 ? "♯".repeat(diff) : ""}${degree}`;
  });
}

export function formulaText(chord: ParsedChord): string {
  return chordFormula(chord).join(" ");
}

/** Semitone steps above the root, e.g. major → [0, 4, 7]. */
export function chordSteps(chord: ParsedChord): number[] {
  return chordIntervals(chord);
}

const INVERSION_NAMES = ["Root position", "1st inversion", "2nd inversion", "3rd inversion"];

/** How many positions a chord has: root position plus one inversion per further tone (capped at 3 inversions). */
export function inversionCount(chord: ParsedChord): number {
  return Math.min(chord.quality.tones.length, 4);
}

export function inversionName(inversion: number): string {
  return INVERSION_NAMES[inversion] ?? `${inversion}th inversion`;
}

/** Clamp a requested inversion to what the chord has. */
export function clampInversion(chord: ParsedChord, inversion: number): number {
  return Math.max(0, Math.min(inversion, inversionCount(chord) - 1));
}

/** The chord's notes as MIDI numbers, lowest first, in the given inversion (root position → C4 E4 G4; 1st → E4 G4 C5). */
export function invertedMidi(chord: ParsedChord, inversion = 0, baseMidi = 60): number[] {
  const inv = clampInversion(chord, inversion);
  const notes = chordMidiNotes(chord, baseMidi);
  return notes.map((m, i) => (i < inv ? m + 12 : m)).sort((a, b) => a - b);
}

/** Each note of an inversion as { midi, name }, lowest first: C major, 1st inversion → E4 G4 C5. */
export function invertedNotes(chord: ParsedChord, inversion = 0, baseMidi = 60): { midi: number; name: string }[] {
  const inv = clampInversion(chord, inversion);
  const names = spellChord(chord);
  return chordMidiNotes(chord, baseMidi)
    .map((m, i) => ({ midi: i < inv ? m + 12 : m, name: names[i] }))
    .sort((a, b) => a.midi - b.midi);
}

/** Note names in playing order for an inversion: C major, 1st inversion → E G C. */
export function invertedNames(chord: ParsedChord, inversion = 0): string[] {
  return invertedNotes(chord, inversion).map((n) => n.name);
}

/** Lowest and highest key to draw so every note fits, rounded out to whole octaves (at least two). */
export function keyboardWindow(midi: number[], minOctaves = 2): { from: number; to: number } {
  const lo = Math.min(...midi);
  const hi = Math.max(...midi);
  const from = Math.floor(lo / 12) * 12;
  let to = Math.floor(hi / 12) * 12 + 11;
  if (to - from + 1 < minOctaves * 12) to = from + minOctaves * 12 - 1;
  return { from, to };
}
