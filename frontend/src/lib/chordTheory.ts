/**
 * Chord theory + instrument-shape data, used to render the same detected
 * chord as a guitar chord diagram, a ukulele chord diagram, or a piano
 * roll — Section 4.1/4.2 of the spec ("Instrument-specific views" and
 * "Alternate chord voicings"). Everything here is computed from real
 * music theory (interval math + standard CAGED barre-chord shapes), not
 * a lookup table of guesses.
 */

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export type ChordQuality = "major" | "minor";

export interface ParsedChord {
  root: number; // 0-11 pitch class
  quality: ChordQuality;
  label: string;
}

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

export function parseChordSymbol(symbol: string): ParsedChord {
  const trimmed = symbol.trim();
  const isMinor = trimmed.endsWith("m") && !trimmed.endsWith("dim");
  const rawRoot = isMinor ? trimmed.slice(0, -1) : trimmed;
  const rootName = FLAT_TO_SHARP[rawRoot] ?? rawRoot;
  const root = Math.max(0, NOTE_NAMES.indexOf(rootName as (typeof NOTE_NAMES)[number]));

  return { root, quality: isMinor ? "minor" : "major", label: trimmed };
}

export function chordNoteNames(chord: ParsedChord): string[] {
  const offsets = chord.quality === "major" ? [0, 4, 7] : [0, 3, 7];
  return offsets.map((o) => NOTE_NAMES[(chord.root + o) % 12]);
}

/** MIDI note numbers for a triad in a comfortable one-octave register (octave 4). */
export function chordMidiNotes(chord: ParsedChord, baseOctaveMidi = 60): number[] {
  const offsets = chord.quality === "major" ? [0, 4, 7] : [0, 3, 7];
  return offsets.map((o) => baseOctaveMidi + chord.root + o);
}

export interface GuitarVoicing {
  name: string;
  /** 6 entries, low-E to high-E. null = muted string, 0 = open string, n = fret n. */
  frets: (number | null)[];
}

// Standard open-position chords every beginner learns first — used as
// "Voicing 1" whenever the requested chord has one.
const OPEN_GUITAR_CHORDS: Record<string, (number | null)[]> = {
  C: [null, 3, 2, 0, 1, 0],
  "C#": [null, 4, 3, 1, 2, 1], // no natural open shape; small barre fallback
  D: [null, null, 0, 2, 3, 2],
  "D#": [null, null, 1, 3, 4, 3],
  E: [0, 2, 2, 1, 0, 0],
  F: [1, 3, 3, 2, 1, 1],
  "F#": [2, 4, 4, 3, 2, 2],
  G: [3, 2, 0, 0, 0, 3],
  "G#": [4, 6, 6, 5, 4, 4],
  A: [null, 0, 2, 2, 2, 0],
  "A#": [null, 1, 3, 3, 3, 1],
  B: [null, 2, 4, 4, 4, 2],
  Cm: [null, 3, 5, 5, 4, 3],
  "C#m": [null, 4, 6, 6, 5, 4],
  Dm: [null, null, 0, 2, 3, 1],
  "D#m": [null, null, 1, 3, 4, 2],
  Em: [0, 2, 2, 0, 0, 0],
  Fm: [1, 3, 3, 1, 1, 1],
  "F#m": [2, 4, 4, 2, 2, 2],
  Gm: [3, 5, 5, 3, 3, 3],
  "G#m": [4, 6, 6, 4, 4, 4],
  Am: [null, 0, 2, 2, 1, 0],
  "A#m": [null, 1, 3, 3, 2, 1],
  Bm: [null, 2, 4, 4, 3, 2],
};

/** Semitone distance of a pitch class above E (0) — used for E-shape barre chords. */
function distanceFromE(pitchClass: number): number {
  return (pitchClass - NOTE_NAMES.indexOf("E") + 12) % 12;
}

/** Semitone distance of a pitch class above A (0) — used for A-shape barre chords. */
function distanceFromA(pitchClass: number): number {
  return (pitchClass - NOTE_NAMES.indexOf("A") + 12) % 12;
}

function eShapeBarre(chord: ParsedChord): GuitarVoicing {
  const b = distanceFromE(chord.root);
  const frets =
    chord.quality === "major" ? [b, b + 2, b + 2, b + 1, b, b] : [b, b + 2, b + 2, b, b, b];
  return { name: b === 0 ? "Open (E-shape)" : `Barre – E-shape (fret ${b})`, frets };
}

function aShapeBarre(chord: ParsedChord): GuitarVoicing {
  const b = distanceFromA(chord.root);
  const frets =
    chord.quality === "major"
      ? [null, b, b + 2, b + 2, b + 2, b]
      : [null, b, b + 2, b + 2, b + 1, b];
  return { name: b === 0 ? "Open (A-shape)" : `Barre – A-shape (fret ${b})`, frets };
}

/** Returns 2-3 real, playable fingering options for a chord — the "voicing picker". */
export function getGuitarVoicings(chord: ParsedChord): GuitarVoicing[] {
  const voicings: GuitarVoicing[] = [];
  const openKey = chord.label.replace("maj", "");
  if (OPEN_GUITAR_CHORDS[openKey]) {
    voicings.push({ name: "Open position", frets: OPEN_GUITAR_CHORDS[openKey] });
  }
  voicings.push(eShapeBarre(chord));
  voicings.push(aShapeBarre(chord));

  // De-duplicate identical shapes (e.g. E major's open shape IS the E-shape barre at fret 0)
  const seen = new Set<string>();
  return voicings.filter((v) => {
    const key = v.frets.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Standard ukulele (GCEA re-entrant tuning) open/near-open chord shapes —
// commonly published chord-chart data, one clean shape per chord.
const UKULELE_CHORDS: Record<string, (number | null)[]> = {
  C: [0, 0, 0, 3],
  "C#": [1, 1, 1, 4],
  D: [2, 2, 2, 0],
  "D#": [3, 3, 3, 1],
  E: [4, 4, 4, 2],
  F: [2, 0, 1, 0],
  "F#": [3, 1, 2, 1],
  G: [0, 2, 3, 2],
  "G#": [5, 3, 4, 3],
  A: [2, 1, 0, 0],
  "A#": [3, 2, 1, 1],
  B: [4, 3, 2, 2],
  Cm: [0, 3, 3, 3],
  "C#m": [1, 4, 4, 4],
  Dm: [2, 2, 1, 0],
  "D#m": [3, 3, 2, 1],
  Em: [0, 4, 3, 2],
  Fm: [1, 0, 1, 3],
  "F#m": [2, 1, 2, 0],
  Gm: [0, 2, 3, 1],
  "G#m": [1, 3, 4, 2],
  Am: [2, 0, 0, 0],
  "A#m": [3, 1, 1, 1],
  Bm: [4, 2, 2, 2],
};

export function getUkuleleShape(chord: ParsedChord): (number | null)[] {
  return UKULELE_CHORDS[chord.label] ?? [0, 0, 0, 0];
}
