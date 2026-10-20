/**
 * Transpose + capo math for the Analysis page. Everything works in
 * semitones on the stored ASCII symbols ("G#m", "C/E"), so the transposed
 * analysis drops straight into the timeline, voicings and exports.
 *
 * Three controls, combined:
 *  - Audio + chords: the recording itself is pitch-shifted, chords follow.
 *  - Chords only:    chord names move, the recording doesn't (sing/play in
 *                    another key against the original track for reference).
 *  - Capo:           what you hear stays the same; the chord *shapes* shown
 *                    are the ones to fret with a capo on that fret.
 */

import type { AnalysisResult } from "./api";
import { NOTE_NAMES } from "./chordTheory";

export interface TransposeSettings {
  capo: number;
  chordsOnly: number;
  audio: number;
}

export const NO_TRANSPOSE: TransposeSettings = { capo: 0, chordsOnly: 0, audio: 0 };

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function shiftRoot(root: string, semitones: number): string {
  const letter = root[0].toUpperCase();
  const acc = root.slice(1);
  const offset = acc === "#" || acc === "♯" ? 1 : acc === "b" || acc === "♭" ? -1 : 0;
  const pc = (((LETTER_PC[letter] + offset + semitones) % 12) + 12) % 12;
  return NOTE_NAMES[pc];
}

/** "G#m" +2 → "A#m"; "C/E" +2 → "D/F#". Non-chord symbols ("N.C.") pass through. */
export function transposeChord(symbol: string, semitones: number): string {
  if (!semitones) return symbol;
  const m = /^([A-Ga-g][#b♯♭]?)(.*)$/.exec(symbol.trim());
  if (!m) return symbol;
  const suffix = m[2].replace(/\/([A-G][#b♯♭]?)$/, (_, bass: string) => `/${shiftRoot(bass, semitones)}`);
  return shiftRoot(m[1], semitones) + suffix;
}

/** "G# Minor" +2 → "A# Minor". */
export function transposeKey(key: string, semitones: number): string {
  if (!semitones) return key;
  const [root, ...rest] = key.split(" ");
  return [transposeChord(root, semitones), ...rest].join(" ");
}

/** Semitones the *sounding* music moved (capo doesn't change what you hear). */
export function soundingShift(s: TransposeSettings): number {
  return s.chordsOnly + s.audio;
}

/** Semitones applied to the chord names you play (sounding shift minus the capo). */
export function shapeShift(s: TransposeSettings): number {
  return s.chordsOnly + s.audio - s.capo;
}

/** The analysis with every chord and the key re-spelled as the shapes to play. */
export function transposeAnalysis(analysis: AnalysisResult, semitones: number): AnalysisResult {
  if (!semitones) return analysis;
  return {
    ...analysis,
    key: transposeKey(analysis.key, semitones),
    chordProgression: analysis.chordProgression.map((c) => transposeChord(c, semitones)),
    chordTimeline: analysis.chordTimeline.map((seg) => ({
      ...seg,
      chord: transposeChord(seg.chord, semitones),
      alternative: seg.alternative ? transposeChord(seg.alternative, semitones) : seg.alternative,
    })),
    keyAlternatives: analysis.keyAlternatives?.map((k) => ({ ...k, key: transposeKey(k.key, semitones) })),
  };
}

// First-position chords a beginner can play without a barre.
const OPEN_SHAPES = new Set([
  "C", "D", "E", "G", "A", "Am", "Dm", "Em",
  "C7", "D7", "E7", "G7", "A7", "B7", "Am7", "Dm7", "Em7", "Cmaj7", "Fmaj7", "Dsus2", "Dsus4", "Asus2", "Asus4", "Esus4",
]);

function baseSymbol(symbol: string): string {
  return symbol.replace(/\/[A-G][#b♯♭]?$/, "");
}

export interface CapoSuggestion {
  capo: number;
  /** Share of the song's playing time spent on open (no-barre) shapes, 0–1. */
  openShare: number;
}

/**
 * Ranks capo positions 0–7 by how much of the song can then be played with
 * open chords, weighted by how long each chord rings. `sounding` is the
 * shift already applied by the audio/chords-only controls.
 */
export function capoSuggestions(analysis: AnalysisResult, sounding: number, limit = 3): CapoSuggestion[] {
  const timeline = analysis.chordTimeline;
  const total = timeline.reduce((sum, s) => sum + (s.end - s.start), 0);
  if (!total) return [];

  const results: CapoSuggestion[] = [];
  for (let capo = 0; capo <= 7; capo++) {
    let open = 0;
    for (const seg of timeline) {
      if (OPEN_SHAPES.has(baseSymbol(transposeChord(seg.chord, sounding - capo)))) open += seg.end - seg.start;
    }
    results.push({ capo, openShare: open / total });
  }
  // Best coverage first; on a tie the lower capo wins (less to move, better tone).
  return results.sort((a, b) => b.openShare - a.openShare || a.capo - b.capo).slice(0, limit);
}
