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
  whyItWorks: string;
  harmonicFunction: string;
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
 * Returns music-theory explanations for the chord's emotional color and function.
 */
function getTheoryExplanation(suffix: string): { whyItWorks: string; harmonicFunction: string } {
  switch (suffix) {
    case "":
      return {
        whyItWorks: "A consonant, stable acoustic foundation built from a root, a bright major third (4 semitones), and a grounding perfect fifth (7 semitones). It acts as the ultimate harmonic point of rest.",
        harmonicFunction: "Tonic / Resolution — the standard harmonic home base in major keys.",
      };
    case "m":
      return {
        whyItWorks: "Warm, introspective, and emotive. Formed by flattening the 3rd by one half-step (3 semitones), creating gentle acoustic contrast against the bright major triad.",
        harmonicFunction: "Tonic (in minor) or Subdominant/Mediant (in major) — expresses emotional depth and introspection.",
      };
    case "5":
      return {
        whyItWorks: "Powerful and harmonically neutral. Containing only the root and fifth with no 3rd, it is neither major nor minor, making it heavily used with distortion in rock and metal.",
        harmonicFunction: "Driving power chord — unambiguous root reinforcement without modal flavor.",
      };
    case "dim":
      return {
        whyItWorks: "High harmonic tension formed by stacking two minor thirds (1 - b3 - b5). The flat fifth (tritone) creates an urgent desire to resolve upward by a half-step.",
        harmonicFunction: "Leading-tone dissonance — strongly pulls toward tonic resolution.",
      };
    case "aug":
      return {
        whyItWorks: "Dreamy and symmetrical. Stacking two major thirds (1 - 3 - #5) produces a floating whole-tone quality with restless forward motion.",
        harmonicFunction: "Dominant substitution — pushes outward into major or minor target chords.",
      };
    case "sus2":
      return {
        whyItWorks: "Open, modern, and spacious. Replacing the third with a major second removes major/minor classification and creates smooth melodic suspension.",
        harmonicFunction: "Suspension — floats ambiguously before resolving into a full triad.",
      };
    case "sus4":
      return {
        whyItWorks: "Anticipatory and bright. Replacing the third with a perfect fourth sets up a classic harmonic suspension that resolves downward into the third.",
        harmonicFunction: "Classic suspension — creates tension that begs to step down to the major 3rd.",
      };
    case "7":
      return {
        whyItWorks: "The engine of Western harmony. The tension between the major 3rd and minor 7th forms an active tritone (6 semitones) that pulls irresistibly toward the tonic a 5th below.",
        harmonicFunction: "Dominant — creates maximum harmonic momentum toward the tonic (V7 -> I).",
      };
    case "maj7":
      return {
        whyItWorks: "Lush, dreamy, and sophisticated. The natural 7th interval sits just one half-step below the octave, producing sweet, shimmering dissonance without tension.",
        harmonicFunction: "Tonic relaxation — staple of jazz, bossa nova, and modern pop.",
      };
    case "m7":
      return {
        whyItWorks: "Mellow, warm, and soulful. A minor triad enriched with a gentle minor 7th, avoiding harsh dissonance while offering rich melodic texture.",
        harmonicFunction: "Predominant / Dorian color — the foundational ii chord in jazz ii-V-I progressions.",
      };
    case "m7b5":
      return {
        whyItWorks: "Dark, melancholic, and mysterious. Combines a diminished triad with a minor 7th. It is the cornerstone of minor-key harmony.",
        harmonicFunction: "Half-diminished ii chord — leads cleanly into V7(b9) in minor ii-V-i progressions.",
      };
    case "dim7":
      return {
        whyItWorks: "Symmetrical tension. Composed of four notes each spaced exactly 3 semitones apart. Any note can act as a leading tone resolving in 4 separate keys.",
        harmonicFunction: "Universal modulation tool and dramatic climax chord.",
      };
    case "add9":
      return {
        whyItWorks: "Modern acoustic warmth. Adds the sparkling 9th (2nd scale degree an octave up) to a standard triad without introducing a 7th.",
        harmonicFunction: "Acoustic pop & indie color — adds emotional sweetness to plain triads.",
      };
    case "9":
      return {
        whyItWorks: "Expansive blues and funk vibe. Combines the driving tritone tension of a dominant 7th with the bright sophistication of the major 9th.",
        harmonicFunction: "Dominant extension — standard blues, funk, and R&B staple.",
      };
    default:
      return {
        whyItWorks: "Extended and altered harmonic color. Stacks higher degree intervals (9th, 11th, 13th) to add complex acoustic overtones above the fundamental triad.",
        harmonicFunction: "Advanced harmonic color and voice-leading texture.",
      };
  }
}

/**
 * Builds a comparison with a closely related chord (e.g. Major vs Minor).
 */
function getChordComparison(parsed: ParsedChord): { relativeChord: string; description: string } {
  const root = NOTE_NAMES[parsed.root];
  const suffix = parsed.quality.suffix;

  if (suffix === "") {
    return {
      relativeChord: `${root}m`,
      description: `Minor lowers the 3rd scale degree by one half-step (4 semitones down to 3), transforming the bright major sound into a warm, reflective mood.`,
    };
  }
  if (suffix === "m") {
    return {
      relativeChord: `${root}`,
      description: `Major raises the minor 3rd by one half-step (3 semitones up to 4), brightening the chord into an open, consonant harmony.`,
    };
  }
  if (suffix === "7") {
    return {
      relativeChord: `${root}maj7`,
      description: `Major 7th raises the 7th from a minor 7th (10 semitones) to a major 7th (11 semitones), replacing the bluesy tritone with a dreamy, floating shimmer.`,
    };
  }
  if (suffix === "maj7") {
    return {
      relativeChord: `${root}7`,
      description: `Dominant 7th lowers the 7th from a major 7th to a minor 7th, creating a tritone that drives forward motion toward resolution.`,
    };
  }
  if (suffix === "sus4") {
    return {
      relativeChord: `${root}`,
      description: `Suspended 4th replaces the 3rd with a 4th. Resolving the 4th down one half-step releases the suspension into this full major chord.`,
    };
  }
  return {
    relativeChord: `${root}`,
    description: `The foundational root triad provides the primary harmonic center upon which this quality is built.`,
  };
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

  // Theory explanations
  const { whyItWorks, harmonicFunction } = getTheoryExplanation(parsed.quality.suffix);

  // Diatonic keys
  const diatonicKeys = findDiatonicKeys(parsed.root, semitones);

  // Compatible scales
  const relatedScales = findCompatibleScales(parsed.root, semitones);

  // Comparison
  const comparison = getChordComparison(parsed);

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
    whyItWorks,
    harmonicFunction,
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
  fingering?: FingeringResult
): PlayedStringAnalysis[] {
  const result: PlayedStringAnalysis[] = [];
  const numStrings = frets.length;
  const fResult = fingering || assignFingers(frets);

  for (let i = 0; i < numStrings; i++) {
    const stringNumber = numStrings - i;
    const fret = frets[i];
    const finger = fResult.fingers[i] ?? null;
    const fingerName = fResult.fingerNames[i] ?? null;

    if (fret === null || fret < 0) {
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

    const openMidi = tuningMidi[i] ?? 40;
    const midi = openMidi + fret;
    const pitchClass = midi % 12;
    const noteName = NOTE_NAMES[pitchClass];
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
