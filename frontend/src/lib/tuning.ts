/** String tunings as note names, turned into frequencies for the chosen A4 reference. */

import { TUNINGS, type TuningId } from "./settings/model";

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "D#2" → MIDI note number (A4 = 69), or null if it isn't a note. */
export function noteToMidi(note: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]?)(-?\d)$/.exec(note.trim());
  if (!m) return null;
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + LETTER[m[1].toUpperCase()] + acc;
}

export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Six notes, low → high, all valid and rising — else null. */
export function parseTuning(text: string): string[] | null {
  const notes = text.trim().split(/\s+/);
  if (notes.length !== 6) return null;
  const midi = notes.map(noteToMidi);
  if (midi.some((m) => m === null)) return null;
  if (midi.some((m, i) => i > 0 && (m as number) <= (midi[i - 1] as number) - 12)) return null;
  return notes.map((n) => n.charAt(0).toUpperCase() + n.slice(1));
}

export function tuningNotes(id: TuningId, custom: string): string[] {
  if (id === "custom") return parseTuning(custom) ?? TUNINGS.standard.notes.split(" ");
  return TUNINGS[id].notes.split(" ");
}

/** Strings for the tuner: note name + frequency at the given A4. */
export function tuningStrings(notes: string[], a4: number): { note: string; freq: number }[] {
  return notes.map((note) => ({ note, freq: Math.round(midiToFrequency(noteToMidi(note) ?? 69, a4) * 100) / 100 }));
}
