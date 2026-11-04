/**
 * Comprehensive Note & Pitch Physics Engine — Phase 2
 * Handles Scientific Pitch Notation (SPN), MIDI note numbers, pitch classes,
 * frequency calculation, A4 reference pitch, and strictly preserves
 * theoretical musical spelling (double sharps, sharps, naturals, flats, double flats).
 */

import { getReferencePitch } from "../audio/pitch";
import type {
  AccidentalAlteration,
  AccidentalSymbol,
  DiatonicLetter,
  Note,
  NoteSpelling,
  Pitch,
  PitchClassNumber,
} from "./coreTypes";

export type { NoteSpelling, DiatonicLetter, AccidentalSymbol, AccidentalAlteration, Pitch, PitchClassNumber };

export const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"] as const;

export const DIATONIC_LETTERS: readonly DiatonicLetter[] = ["C", "D", "E", "F", "G", "A", "B"];
export const LETTER_NATURAL_SEMITONES: Record<DiatonicLetter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const ACCIDENTAL_ALTERATIONS: Record<string, AccidentalAlteration> = {
  "𝄫": -2,
  "bb": -2,
  "♭": -1,
  "b": -1,
  "": 0,
  "♮": 0,
  "#": 1,
  "♯": 1,
  "##": 2,
  "x": 2,
  "𝄪": 2,
};

const ALTERATION_SYMBOLS: Record<AccidentalAlteration, { standard: string; unicode: string }> = {
  [-2]: { standard: "bb", unicode: "𝄫" },
  [-1]: { standard: "b", unicode: "♭" },
  [0]: { standard: "", unicode: "" },
  [1]: { standard: "#", unicode: "♯" },
  [2]: { standard: "##", unicode: "𝄪" },
};

/** Parses any note string (e.g. "C4", "F#3", "G##5", "Dbb2", "Bb") into a structured NoteSpelling */
export function parseNoteSpelling(noteStr: string, defaultOctave = 4): NoteSpelling {
  const clean = noteStr.trim();
  const match = clean.match(/^([A-Ga-g])(𝄫|𝄪|##|bb|[#b♯♭♮x]?)(-?\d+)?$/);
  if (!match) {
    throw new Error(`Invalid note spelling: '${noteStr}'`);
  }

  const letter = match[1].toUpperCase() as DiatonicLetter;
  const rawAcc = match[2] ?? "";
  const alteration = ACCIDENTAL_ALTERATIONS[rawAcc] ?? 0;
  const octave = match[3] !== undefined ? parseInt(match[3], 10) : defaultOctave;

  return {
    letter,
    accidental: rawAcc as AccidentalSymbol,
    alteration,
    octave,
  };
}

/** Formats a NoteSpelling into standard Scientific Pitch Notation (e.g. "C#4", "Dbb2") */
export function formatNoteSpelling(spelling: NoteSpelling, useUnicodeAccidentals = false): string {
  const sym = useUnicodeAccidentals
    ? ALTERATION_SYMBOLS[spelling.alteration].unicode
    : ALTERATION_SYMBOLS[spelling.alteration].standard;
  return `${spelling.letter}${sym}${spelling.octave}`;
}

/** Converts NoteSpelling to MIDI note number */
export function noteSpellingToMidi(spelling: NoteSpelling): number {
  const naturalSemitones = LETTER_NATURAL_SEMITONES[spelling.letter];
  return (spelling.octave + 1) * 12 + naturalSemitones + spelling.alteration;
}

/** Maps a MIDI note number (e.g. 60 = C4) to Hz, relative to the reference pitch (default A4 = 440 Hz) */
export function midiToFrequency(midi: number, a4 = getReferencePitch()): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Converts frequency in Hz to pitch info with cents offset */
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

/** Creates a full Note object with both theoretical spelling and physical acoustics */
export function createNote(input: string | NoteSpelling, a4 = getReferencePitch()): Note {
  const spelling = typeof input === "string" ? parseNoteSpelling(input) : input;
  const midi = noteSpellingToMidi(spelling);
  const pitchClass = (((midi % 12) + 12) % 12) as PitchClassNumber;
  const frequencyHz = midiToFrequency(midi, a4);

  const pitch: Pitch = {
    midi,
    frequencyHz,
    centsOffset: 0,
    referenceA4: a4,
  };

  return {
    spelling,
    scientificName: formatNoteSpelling(spelling, false),
    pitchClass,
    pitch,
  };
}

/**
 * Theoretical Spelling Engine:
 * Calculates the exact theoretical note spelling for a given diatonic degree offset and semitone offset.
 * Example:
 * C4 + (3rd, 4 semitones) -> E4
 * C4 + (diminished 5th, 6 semitones) -> Gb4 (letter must be G)
 * C4 + (augmented 4th, 6 semitones) -> F#4 (letter must be F)
 * D4 + (minor 3rd, 3 semitones) -> F4
 */
export function spellDiatonicOffset(
  rootSpelling: NoteSpelling,
  degreeSpan: number, // 1 for unison, 2 for second, 3 for third, 5 for fifth, etc.
  targetSemitones: number
): NoteSpelling {
  const rootIndex = DIATONIC_LETTERS.indexOf(rootSpelling.letter);
  const targetDegreeIndex = (rootIndex + (degreeSpan - 1)) % 7;
  const targetLetter = DIATONIC_LETTERS[targetDegreeIndex];

  // Calculate octave shift
  const octaveAdvance = Math.floor((rootIndex + (degreeSpan - 1)) / 7);
  let targetOctave = rootSpelling.octave + octaveAdvance;

  // The base semitones of root
  const rootMidi = noteSpellingToMidi(rootSpelling);
  const targetMidi = rootMidi + targetSemitones;

  // Find the required alteration for targetLetter in targetOctave
  const naturalTargetMidi = (targetOctave + 1) * 12 + LETTER_NATURAL_SEMITONES[targetLetter];
  let diff = targetMidi - naturalTargetMidi;

  // Wrap octave if alteration is excessive (> 2 or < -2)
  while (diff > 2) {
    targetOctave++;
    diff -= 12;
  }
  while (diff < -2) {
    targetOctave--;
    diff += 12;
  }

  const alteration = diff as AccidentalAlteration;
  const accidental = (ALTERATION_SYMBOLS[alteration]?.standard ?? "") as AccidentalSymbol;

  return {
    letter: targetLetter,
    accidental,
    alteration,
    octave: targetOctave,
  };
}

/**
 * Returns enharmonic counterpart (e.g. C# -> Db, F# -> Gb, etc.)
 */
export function getEnharmonicEquivalent(note: string): string {
  const clean = note.trim();
  const map: Record<string, string> = {
    "C#": "D♭", "Db": "C♯", "D♭": "C♯",
    "D#": "E♭", "Eb": "D♯", "E♭": "D♯",
    "F#": "G♭", "Gb": "F♯", "G♭": "F♯",
    "G#": "A♭", "Ab": "G♯", "A♭": "G♯",
    "A#": "B♭", "Bb": "A♯", "B♭": "A♯",
    "E#": "F", "B#": "C", "Cb": "B", "C♭": "B", "Fb": "E", "F♭": "E",
    "C##": "D", "D##": "E", "F##": "G", "G##": "A", "A##": "B",
    "Dbb": "C", "Ebb": "D", "Gbb": "F", "Abb": "G", "Bbb": "A",
  };
  return map[clean] || clean;
}

/** Returns all valid enharmonic spellings for a pitch (e.g., C# -> ["C#", "Db", "B##"]) */
export function getEnharmonicSpellings(note: string | NoteSpelling): string[] {
  const spelling = typeof note === "string" ? parseNoteSpelling(note) : note;
  const targetMidi = noteSpellingToMidi(spelling);
  const spellings: string[] = [];

  for (const letter of DIATONIC_LETTERS) {
    for (let oct = spelling.octave - 1; oct <= spelling.octave + 1; oct++) {
      const naturalMidi = (oct + 1) * 12 + LETTER_NATURAL_SEMITONES[letter];
      const diff = targetMidi - naturalMidi;
      if (diff >= -2 && diff <= 2) {
        const alt = diff as AccidentalAlteration;
        const sym = ALTERATION_SYMBOLS[alt].standard;
        spellings.push(`${letter}${sym}${oct}`);
      }
    }
  }

  return spellings;
}
