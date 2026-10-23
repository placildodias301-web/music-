/**
 * Deep musical analysis engine for chords.
 * Generates formulas, interval breakdowns, "Why it works" theory explanations,
 * key/Roman-numeral relationships, and per-string note analysis.
 */

import {
  type ParsedChord,
  NOTE_NAMES,
  chordIntervals,
  spellChord,
} from "../chordTheory";
import { getIntervalInfo, type IntervalInfo } from "../theory/intervals";
import { midiToFrequency } from "../theory/notes";
import { findCompatibleScales, type ScaleInfo } from "../theory/scales";
import { assignFingers, type FingeringResult } from "./fingering";
import { describeChord, type ChordDescription } from "./describe";

export interface PlayedStringAnalysis {
  stringIndex: number;      // 0-indexed: 0 = lowest pitch string
  stringNumber: number;     // 1-indexed musical string (1 = High E)
  action: "fretted" | "open" | "muted";
  fret: number | null;
  midi: number | null;
  frequencyHz: number | null;
  noteName: string | null;
  pitchClass: number | null;
  interval: IntervalInfo | null;
  isRoot: boolean;
  finger: number | null;
  fingerName: string | null;
}

export interface DiatonicKeyRelation {
  keyRoot: string;
  mode: "major" | "minor";
  romanNumeral: string;
  degree: number; // 1-7
  keyLabel: string; // e.g. "C Major (I)"
}

export interface ChordAnalysis {
  parsed: ParsedChord;
  rootName: string;
  chordName: string;
  symbol: string;
  category: string;
  formula: string;
  intervals: IntervalInfo[];
  notes: string[];
  slashBassNote?: string;
  /** Sentences about how the chord sounds, joined (kept for existing callers). */
  whyItWorks: string;
  harmonicFunction: string;
  /** The full data-driven description: construction, sound, role, uses, related chords. */
  description: ChordDescription;
  diatonicKeys: DiatonicKeyRelation[];
  relatedScales: ScaleInfo[];
  comparison: {
    relativeChord: string;
    description: string;
  };
}

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

const MAJOR_ROMAN_BY_DEGREE: Record<number, string> = {
  0: "I",
  2: "ii",
  4: "iii",
  5: "IV",
  7: "V",
  9: "vi",
  11: "vii°",
};

const MINOR_ROMAN_BY_DEGREE: Record<number, string> = {
  0: "i",
  2: "ii°",
  3: "III",
  5: "iv",
  7: "v",
  8: "VI",
  10: "VII",
};

/**
 * Computes which major and natural minor keys contain all tones of this chord.
 */
function findDiatonicKeys(chordRoot: number, semitones: number[]): DiatonicKeyRelation[] {
  const chordPitchClasses = new Set(semitones.map((st) => (chordRoot + st) % 12));
  const results: DiatonicKeyRelation[] = [];

  for (let keyRoot = 0; keyRoot < 12; keyRoot++) {
    const keyName = NOTE_NAMES[keyRoot];

    // Check Major key
    const majorPcs = new Set(MAJOR_SCALE_INTERVALS.map((st) => (keyRoot + st) % 12));
    const isSubsetOfMajor = Array.from(chordPitchClasses).every((pc) => majorPcs.has(pc));
    if (isSubsetOfMajor) {
      const degreeOffset = (chordRoot - keyRoot + 12) % 12;
      const roman = MAJOR_ROMAN_BY_DEGREE[degreeOffset] || "?";
      const degreeNumber = MAJOR_SCALE_INTERVALS.indexOf(degreeOffset) + 1;
      results.push({
        keyRoot: keyName,
        mode: "major",
        romanNumeral: roman,
        degree: degreeNumber,
        keyLabel: `${keyName} Major (${roman})`,
      });
    }

    // Check Natural Minor key
    const minorPcs = new Set(NATURAL_MINOR_INTERVALS.map((st) => (keyRoot + st) % 12));
    const isSubsetOfMinor = Array.from(chordPitchClasses).every((pc) => minorPcs.has(pc));
    if (isSubsetOfMinor) {
      const degreeOffset = (chordRoot - keyRoot + 12) % 12;
      const roman = MINOR_ROMAN_BY_DEGREE[degreeOffset] || "?";
      const degreeNumber = NATURAL_MINOR_INTERVALS.indexOf(degreeOffset) + 1;
      results.push({
        keyRoot: keyName,
        mode: "minor",
        romanNumeral: roman,
        degree: degreeNumber,
        keyLabel: `${keyName} Minor (${roman})`,
      });
    }
  }

  return results;
}

/**
 * Analyzes a parsed chord completely.
 */
export function analyzeChord(parsed: ParsedChord): ChordAnalysis {
  const rootName = NOTE_NAMES[parsed.root];
  const chordName = `${rootName} ${parsed.quality.name}`;
  const symbol = parsed.label || `${rootName}${parsed.quality.suffix}`;
  const semitones = chordIntervals(parsed);
  const spelledNotes = spellChord(parsed);

  // Interval definitions
  const intervals: IntervalInfo[] = parsed.quality.tones.map(([st, deg]) => getIntervalInfo(st, deg));

  // Formula string: e.g. "1 - 3 - 5 - b7"
  const formula = intervals.map((i) => i.shortName).join(" - ");

  // Theory: derived from the chord's interval structure (lib/chords/describe.ts), not looked up per chord name
  const description = describeChord(parsed);

  // Diatonic keys
  const diatonicKeys = findDiatonicKeys(parsed.root, semitones);

  // Compatible scales
  const relatedScales = findCompatibleScales(parsed.root, semitones);

  const firstRelated = description.related[0];
  const comparison = { relativeChord: firstRelated?.symbol ?? symbol, description: firstRelated ? `${firstRelated.relation}: ${firstRelated.detail}` : description.role };

  return {
    parsed,
    rootName,
    chordName,
    symbol,
    category: parsed.quality.category,
    formula,
    intervals,
    notes: spelledNotes,
    slashBassNote: parsed.slashBassNote,
    whyItWorks: description.sound.join(" "),
    harmonicFunction: description.role,
    description,
    diatonicKeys,
    relatedScales,
    comparison,
  };
}

/**
 * Analyzes each individual string played in a specific voicing.
 */
export function analyzePlayedStrings(
  frets: (number | null)[],
  tuningMidi: number[],
  chordRoot: number,
  fingering?: FingeringResult,
  chord?: ParsedChord
): PlayedStringAnalysis[] {
  const result: PlayedStringAnalysis[] = [];
  const numStrings = frets.length;
  const fResult = fingering || assignFingers(frets);
  // Note names are spelled the way the chord is (E♭, not D♯, in Cm) so the table never disagrees with the theory card.
  const spelledByPc = new Map<number, string>();
  if (chord) {
    const names = spellChord(chord);
    chord.quality.tones.forEach(([semi], idx) => spelledByPc.set((chord.root + semi) % 12, names[idx]));
  }

  for (let i = 0; i < numStrings; i++) {
    const stringNumber = numStrings - i;
    const fret = frets[i];
    const finger = fResult.fingers[i] ?? null;
    const fingerName = fResult.fingerNames[i] ?? null;

    // A string with no fret, or no tuning data, cannot sound — it is shown (and played) as muted rather than guessed.
    if (fret === null || fret < 0 || !Number.isFinite(tuningMidi[i])) {
      result.push({
        stringIndex: i,
        stringNumber,
        action: "muted",
        fret: null,
        midi: null,
        frequencyHz: null,
        noteName: null,
        pitchClass: null,
        interval: null,
        isRoot: false,
        finger: null,
        fingerName: null,
      });
      continue;
    }

    const openMidi = tuningMidi[i];
    const midi = openMidi + fret;
    const pitchClass = midi % 12;
    const noteName = spelledByPc.get(pitchClass) ?? NOTE_NAMES[pitchClass];
    const frequencyHz = midiToFrequency(midi);
    const semitonesFromRoot = (pitchClass - chordRoot + 12) % 12;
    const interval = getIntervalInfo(semitonesFromRoot);
    const isRoot = pitchClass === chordRoot;

    result.push({
      stringIndex: i,
      stringNumber,
      action: fret === 0 ? "open" : "fretted",
      fret,
      midi,
      frequencyHz,
      noteName,
      pitchClass,
      interval,
      isRoot,
      finger,
      fingerName,
    });
  }

  return result;
}
