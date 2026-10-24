/**
 * Comprehensive Note & Pitch Physics Engine
 * Handles enharmonic conversion, MIDI ↔ Frequency (Hz), Octave detection,
 * and scientific pitch notation.
 */

import { getReferencePitch } from "../audio/pitch";

export const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"] as const;

/** Maps a MIDI note number (e.g. 60 = C4) to Hz, relative to the app's reference pitch (A4 = 440 Hz unless the player changed it). */
export function midiToFrequency(midi: number, a4 = getReferencePitch()): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Pitch class 0-11 to frequency in a given octave (default octave 4) */
export function pitchClassToFrequency(pitchClass: number, octave = 4, a4 = getReferencePitch()): number {
  const midi = (octave + 1) * 12 + (((pitchClass % 12) + 12) % 12);
  return midiToFrequency(midi, a4);
}

/** Formats note name with octave (e.g. C4, F#3, Eb5) */
export function formatMidiWithOctave(midi: number, preferFlats = false): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const baseName = preferFlats ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
  return `${baseName}${octave}`;
}

/** Given a frequency in Hz, returns nearest note info with cents offset */
export function frequencyToPitchInfo(freq: number, a4 = getReferencePitch()): { midi: number; noteName: string; cents: number; octave: number } {
  const midiExact = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(midiExact);
  const cents = Math.round((midiExact - midi) * 100);
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return {
    midi,
    noteName: SHARP_NAMES[pc],
    cents,
    octave,
  };
}

/** Returns the enharmonic counterpart (e.g. C# -> Db, F# -> Gb, etc.) */
export function getEnharmonicEquivalent(note: string): string {
  const clean = note.trim();
  const map: Record<string, string> = {
    "C#": "D♭", "Db": "C♯", "D♭": "C♯",
    "D#": "E♭", "Eb": "D♯", "E♭": "D♯",
    "F#": "G♭", "Gb": "F♯", "G♭": "F♯",
    "G#": "A♭", "Ab": "G♯", "A♭": "G♯",
    "A#": "B♭", "Bb": "A♯", "B♭": "A♯",
    "E#": "F", "B#": "C", "Cb": "B", "C♭": "B", "Fb": "E", "F♭": "E",
  };
  return map[clean] || clean;
}
