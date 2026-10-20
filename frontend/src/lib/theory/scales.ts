/**
 * Scale Theory Engine
 * Contains definitions for major, minor, modes, pentatonics, blues,
 * and functions to find matching scales for any chord.
 */

import { SHARP_NAMES, FLAT_NAMES } from "./notes";

export interface ScaleDefinition {
  id: string;
  name: string;
  category: "diatonic" | "minor_variants" | "pentatonic_blues" | "modes";
  intervals: number[]; // semitone offsets from root
  formula: string[];
  description: string;
}

export const SCALE_DEFINITIONS: ScaleDefinition[] = [
  {
    id: "major",
    name: "Major (Ionian)",
    category: "diatonic",
    intervals: [0, 2, 4, 5, 7, 9, 11],
    formula: ["1", "2", "3", "4", "5", "6", "7"],
    description: "The foundational diatonic scale. Bright, stable, triumphant.",
  },
  {
    id: "natural_minor",
    name: "Natural Minor (Aeolian)",
    category: "diatonic",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    formula: ["1", "2", "♭3", "4", "5", "♭6", "♭7"],
    description: "Standard minor scale, dark and emotional.",
  },
  {
    id: "harmonic_minor",
    name: "Harmonic Minor",
    category: "minor_variants",
    intervals: [0, 2, 3, 5, 7, 8, 11],
    formula: ["1", "2", "♭3", "4", "5", "♭6", "7"],
    description: "Natural minor with a raised 7th leading tone; classical/exotic flavor.",
  },
  {
    id: "melodic_minor",
    name: "Melodic Minor (Jazz)",
    category: "minor_variants",
    intervals: [0, 2, 3, 5, 7, 9, 11],
    formula: ["1", "2", "♭3", "4", "5", "6", "7"],
    description: "Minor with natural 6th and 7th; foundation for modern jazz harmony.",
  },
  {
    id: "major_pentatonic",
    name: "Major Pentatonic",
    category: "pentatonic_blues",
    intervals: [0, 2, 4, 7, 9],
    formula: ["1", "2", "3", "5", "6"],
    description: "5-note scale without half-step tensions. Clean, sweet, melodic.",
  },
  {
    id: "minor_pentatonic",
    name: "Minor Pentatonic",
    category: "pentatonic_blues",
    intervals: [0, 3, 5, 7, 10],
    formula: ["1", "♭3", "4", "5", "♭7"],
    description: "Essential rock/blues soloing scale.",
  },
  {
    id: "blues",
    name: "Blues Scale",
    category: "pentatonic_blues",
    intervals: [0, 3, 5, 6, 7, 10],
    formula: ["1", "♭3", "4", "♭5", "5", "♭7"],
    description: "Minor pentatonic with the chromatic 'blue note' (♭5).",
  },
  {
    id: "dorian",
    name: "Dorian Mode",
    category: "modes",
    intervals: [0, 2, 3, 5, 7, 9, 10],
    formula: ["1", "2", "♭3", "4", "5", "6", "♭7"],
    description: "Minor mode with a bright natural 6th; funky, soulful.",
  },
  {
    id: "mixolydian",
    name: "Mixolydian Mode",
    category: "modes",
    intervals: [0, 2, 4, 5, 7, 9, 10],
    formula: ["1", "2", "3", "4", "5", "6", "♭7"],
    description: "Major mode with a flat 7th; quintessential dominant/classic rock scale.",
  },
  {
    id: "lydian",
    name: "Lydian Mode",
    category: "modes",
    intervals: [0, 2, 4, 6, 7, 9, 11],
    formula: ["1", "2", "3", "♯4", "5", "6", "7"],
    description: "Major mode with a raised 4th; dreamy, ethereal, film-score sound.",
  },
];

/** Spells the notes of a scale given root pitch class (0-11) and scale definition */
export function getScaleNotes(rootPc: number, scale: ScaleDefinition, preferFlats = false): string[] {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return scale.intervals.map((semi) => names[(rootPc + semi) % 12]);
}

/** Finds compatible scales for a given chord's interval set */
export function getCompatibleScales(chordIntervals: number[]): ScaleDefinition[] {
  const chordSet = new Set(chordIntervals.map((i) => i % 12));
  return SCALE_DEFINITIONS.filter((scale) => {
    const scaleSet = new Set(scale.intervals.map((i) => i % 12));
    for (const c of chordSet) {
      if (!scaleSet.has(c)) return false;
    }
    return true;
  });
}

export interface ScaleInfo extends ScaleDefinition {
  notes: string[];
}

export function findCompatibleScales(chordRoot: number, chordIntervals: number[]): ScaleInfo[] {
  const compatible = getCompatibleScales(chordIntervals);
  return compatible.map((scale) => ({
    ...scale,
    notes: getScaleNotes(chordRoot, scale),
  }));
}
