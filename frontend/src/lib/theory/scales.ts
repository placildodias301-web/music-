/**
 * Scalable Scale Theory Engine — Phase 2
 * Contains definitions for Diatonic scales, Modes, Melodic & Harmonic minor modes,
 * Pentatonics, Blues, Symmetrical, and World scales.
 * Fully extensible scale registry and strict theoretical spelling algorithm.
 */

import { parseNoteSpelling, spellDiatonicOffset, SHARP_NAMES, FLAT_NAMES } from "./notes";

export interface ScaleDefinition {
  id: string;
  name: string;
  category: "diatonic" | "minor_variants" | "pentatonic_blues" | "modes" | "symmetrical" | "world";
  intervals: number[]; // semitone offsets from root
  formula: string[];
  description: string;
  aliases?: string[];
}

export const SCALE_DEFINITIONS: ScaleDefinition[] = [
  // ── Diatonic & Modes of Major ─────────────────────────────────────────────
  {
    id: "major",
    name: "Major (Ionian)",
    category: "diatonic",
    intervals: [0, 2, 4, 5, 7, 9, 11],
    formula: ["1", "2", "3", "4", "5", "6", "7"],
    description: "The foundational diatonic scale. Bright, stable, triumphant.",
    aliases: ["ionian"],
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
    id: "phrygian",
    name: "Phrygian Mode",
    category: "modes",
    intervals: [0, 1, 3, 5, 7, 8, 10],
    formula: ["1", "♭2", "♭3", "4", "5", "♭6", "♭7"],
    description: "Minor mode with dark half-step Spanish flavor.",
  },
  {
    id: "lydian",
    name: "Lydian Mode",
    category: "modes",
    intervals: [0, 2, 4, 6, 7, 9, 11],
    formula: ["1", "2", "3", "♯4", "5", "6", "7"],
    description: "Major mode with a raised 4th; dreamy, ethereal, film-score sound.",
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
    id: "natural_minor",
    name: "Natural Minor (Aeolian)",
    category: "diatonic",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    formula: ["1", "2", "♭3", "4", "5", "♭6", "♭7"],
    description: "Standard minor scale, dark and emotional.",
    aliases: ["aeolian", "minor"],
  },
  {
    id: "locrian",
    name: "Locrian Mode",
    category: "modes",
    intervals: [0, 1, 3, 5, 6, 8, 10],
    formula: ["1", "♭2", "♭3", "4", "♭5", "♭6", "♭7"],
    description: "Diminished tonic mode with intense instability and dissonance.",
  },

  // ── Minor Variants & Jazz Modes ───────────────────────────────────────────
  {
    id: "harmonic_minor",
    name: "Harmonic Minor",
    category: "minor_variants",
    intervals: [0, 2, 3, 5, 7, 8, 11],
    formula: ["1", "2", "♭3", "4", "5", "♭6", "7"],
    description: "Natural minor with a raised 7th leading tone; classical/exotic flavor.",
  },
  {
    id: "phrygian_dominant",
    name: "Phrygian Dominant",
    category: "minor_variants",
    intervals: [0, 1, 4, 5, 7, 8, 10],
    formula: ["1", "♭2", "3", "4", "5", "♭6", "♭7"],
    description: "5th mode of Harmonic Minor; Spanish flamenco & Jewish Klezmer flavor.",
    aliases: ["freygish"],
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
    id: "lydian_dominant",
    name: "Lydian Dominant",
    category: "minor_variants",
    intervals: [0, 2, 4, 6, 7, 9, 10],
    formula: ["1", "2", "3", "♯4", "5", "6", "♭7"],
    description: "4th mode of Melodic Minor; ideal over 7#11 chords.",
    aliases: ["overtone", "acoustic"],
  },
  {
    id: "altered",
    name: "Altered Scale (Super Locrian)",
    category: "minor_variants",
    intervals: [0, 1, 3, 4, 6, 8, 10],
    formula: ["1", "♭2", "♯2", "3", "♭5", "♯5", "♭7"],
    description: "7th mode of Melodic Minor; maximizes tensions on dominant 7th chords.",
    aliases: ["super_locrian"],
  },

  // ── Pentatonic & Blues ────────────────────────────────────────────────────
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

  // ── Symmetrical & World Scales ────────────────────────────────────────────
  {
    id: "whole_tone",
    name: "Whole Tone",
    category: "symmetrical",
    intervals: [0, 2, 4, 6, 8, 10],
    formula: ["1", "2", "3", "♯4", "♯5", "♭7"],
    description: "Built entirely of whole steps; dream-like and impressionistic.",
  },
  {
    id: "chromatic",
    name: "Chromatic",
    category: "symmetrical",
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    formula: ["1", "♭2", "2", "♭3", "3", "4", "♭5", "5", "♭6", "6", "♭7", "7"],
    description: "All twelve pitches in half-step succession.",
  },
  {
    id: "diminished_wh",
    name: "Diminished (Whole-Half)",
    category: "symmetrical",
    intervals: [0, 2, 3, 5, 6, 8, 9, 11],
    formula: ["1", "2", "♭3", "4", "♭5", "♭6", "6", "7"],
    description: "Alternating whole and half steps; perfect over diminished seventh chords.",
  },
  {
    id: "double_harmonic",
    name: "Double Harmonic (Byzantine)",
    category: "world",
    intervals: [0, 1, 4, 5, 7, 8, 11],
    formula: ["1", "♭2", "3", "4", "5", "♭6", "7"],
    description: "Major scale with flat 2nd and flat 6th; two augmented 2nds. Middle Eastern/Arabic color.",
    aliases: ["byzantine", "arabic"],
  },
  {
    id: "hungarian_minor",
    name: "Hungarian Minor",
    category: "world",
    intervals: [0, 2, 3, 6, 7, 8, 11],
    formula: ["1", "2", "♭3", "♯4", "5", "♭6", "7"],
    description: "Harmonic minor with raised 4th; intense Eastern European gypsy flavor.",
  },
  // ── Bebop Scales ──
  {
    id: "bebop_dominant",
    name: "Bebop Dominant",
    category: "modes",
    intervals: [0, 2, 4, 5, 7, 9, 10, 11],
    formula: ["1", "2", "3", "4", "5", "6", "♭7", "7"],
    description: "Mixolydian with a passing major 7th; keeps chord tones on downbeats in 8th-note jazz runs.",
    aliases: ["dominant_bebop"],
  },
  {
    id: "bebop_major",
    name: "Bebop Major",
    category: "diatonic",
    intervals: [0, 2, 4, 5, 7, 8, 9, 11],
    formula: ["1", "2", "3", "4", "5", "♭6", "6", "7"],
    description: "Major scale with passing chromatic sharp 5th / flat 6th.",
  },
  {
    id: "bebop_dorian",
    name: "Bebop Dorian",
    category: "modes",
    intervals: [0, 2, 3, 4, 5, 7, 9, 10],
    formula: ["1", "2", "♭3", "3", "4", "5", "6", "♭7"],
    description: "Dorian with chromatic passing major 3rd, standard in Charlie Parker lines.",
  },
  {
    id: "major_blues",
    name: "Major Blues (Country / Gospel)",
    category: "pentatonic_blues",
    intervals: [0, 2, 3, 4, 7, 9],
    formula: ["1", "2", "♭3", "3", "5", "6"],
    description: "Major pentatonic with the minor 3rd blue note; staple of southern rock and country solos.",
  },
  {
    id: "egyptian",
    name: "Egyptian Pentatonic (Suspended)",
    category: "pentatonic_blues",
    intervals: [0, 2, 5, 7, 10],
    formula: ["1", "2", "4", "5", "♭7"],
    description: "Mode 2 of major pentatonic; floating suspended sound.",
  },
  {
    id: "diminished_hw",
    name: "Diminished (Half-Whole)",
    category: "symmetrical",
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    formula: ["1", "♭2", "♯2", "3", "♭5", "5", "6", "♭7"],
    description: "Alternating half and whole steps; essential dominant 7b9 scale in jazz.",
    aliases: ["dominant_diminished"],
  },
  {
    id: "augmented",
    name: "Augmented Scale",
    category: "symmetrical",
    intervals: [0, 3, 4, 7, 8, 11],
    formula: ["1", "♭3", "3", "5", "♯5", "7"],
    description: "Hexatonic symmetrical scale combining two augmented triads.",
  },
  {
    id: "dorian_b2",
    name: "Dorian ♭2",
    category: "minor_variants",
    intervals: [0, 1, 3, 5, 7, 9, 10],
    formula: ["1", "♭2", "♭3", "4", "5", "6", "♭7"],
    description: "2nd mode of Melodic Minor; dark modal jazz scale.",
  },
  {
    id: "lydian_augmented",
    name: "Lydian Augmented",
    category: "minor_variants",
    intervals: [0, 2, 4, 6, 8, 9, 11],
    formula: ["1", "2", "3", "♯4", "♯5", "6", "7"],
    description: "3rd mode of Melodic Minor; ideal over maj7#5 chords.",
  },
  {
    id: "mixolydian_b6",
    name: "Mixolydian ♭6 (Hindu)",
    category: "minor_variants",
    intervals: [0, 2, 4, 5, 7, 8, 10],
    formula: ["1", "2", "3", "4", "5", "♭6", "♭7"],
    description: "5th mode of Melodic Minor; dominant chord with minor 6th sadness.",
    aliases: ["aeolian_dominant", "hindu"],
  },
  {
    id: "locrian_sharp2",
    name: "Locrian ♯2",
    category: "minor_variants",
    intervals: [0, 2, 3, 5, 6, 8, 10],
    formula: ["1", "2", "♭3", "4", "♭5", "♭6", "♭7"],
    description: "6th mode of Melodic Minor; natural 2nd gives half-diminished m7b5 stability.",
  },
  {
    id: "hirajoshi",
    name: "Hirajoshi (Japanese Pentatonic)",
    category: "world",
    intervals: [0, 2, 3, 7, 8],
    formula: ["1", "2", "♭3", "5", "♭6"],
    description: "Traditional Japanese koto tuning; haunting, mystical pentatonic.",
  },
  {
    id: "insen",
    name: "Insen (Japanese Shamisen)",
    category: "world",
    intervals: [0, 1, 5, 7, 10],
    formula: ["1", "♭2", "4", "5", "♭7"],
    description: "Traditional Japanese shamisen folk scale; dark and evocative.",
  },
  {
    id: "miyako_bushi",
    name: "Miyako-Bushi (Japanese Folk)",
    category: "world",
    intervals: [0, 1, 5, 7, 8],
    formula: ["1", "♭2", "4", "5", "♭6"],
    description: "Ancient Japanese pentatonic mode with expressive half steps.",
  },
  {
    id: "persian",
    name: "Persian Scale",
    category: "world",
    intervals: [0, 1, 4, 5, 6, 8, 11],
    formula: ["1", "♭2", "3", "4", "♭5", "♭6", "7"],
    description: "Middle Eastern scale with augmented 2nd and major 7th.",
  },
  {
    id: "enigmatic",
    name: "Enigmatic Scale (Verdi)",
    category: "world",
    intervals: [0, 1, 4, 6, 8, 10, 11],
    formula: ["1", "♭2", "3", "♯4", "♯5", "♯6", "7"],
    description: "Invented by Adolfo Crescentini and popularized by Verdi; deeply mysterious.",
  },
  {
    id: "prometheus",
    name: "Prometheus Scale (Scriabin)",
    category: "world",
    intervals: [0, 2, 4, 6, 9, 10],
    formula: ["1", "2", "3", "♯4", "6", "♭7"],
    description: "Mystic hexachord invented by Alexander Scriabin.",
    aliases: ["mystic"],
  },
  {
    id: "neapolitan_major",
    name: "Neapolitan Major",
    category: "world",
    intervals: [0, 1, 3, 5, 7, 9, 11],
    formula: ["1", "♭2", "♭3", "4", "5", "6", "7"],
    description: "Major 6th and 7th with flat 2nd; dramatic classical tension.",
  },
  {
    id: "neapolitan_minor",
    name: "Neapolitan Minor",
    category: "world",
    intervals: [0, 1, 3, 5, 7, 8, 11],
    formula: ["1", "♭2", "♭3", "4", "5", "♭6", "7"],
    description: "Harmonic minor with lowered 2nd degree; intense romantic opera color.",
  },
];

const CUSTOM_SCALES = new Map<string, ScaleDefinition>();

/** Registers a new scale definition dynamically into the engine without modifying source files */
export function registerScale(def: ScaleDefinition): void {
  CUSTOM_SCALES.set(def.id, def);
}

/** Retrieves all available scale definitions (built-in and custom) */
export function getAllScales(): ScaleDefinition[] {
  const map = new Map<string, ScaleDefinition>();
  for (const s of SCALE_DEFINITIONS) {
    map.set(s.id, s);
  }
  for (const c of CUSTOM_SCALES.values()) {
    map.set(c.id, c);
  }
  return Array.from(map.values());
}

/** Looks up scale definition by id or alias */
export function findScale(idOrAlias: string): ScaleDefinition | undefined {
  const clean = idOrAlias.toLowerCase().trim();
  if (CUSTOM_SCALES.has(clean)) {
    return CUSTOM_SCALES.get(clean);
  }
  const all = getAllScales();
  return all.find((s) => s.id === clean || s.aliases?.map((a) => a.toLowerCase()).includes(clean));
}

/**
 * Spells the notes of a scale theoretically.
 * For 7-note diatonic/heptatonic scales, ensures each letter (A-G) appears exactly once.
 */
export function spellScaleTheoretically(root: string, scale: ScaleDefinition): string[] {
  const rootSpelling = parseNoteSpelling(root);

  // If scale has 7 notes, use diatonic offsets (degrees 1..7)
  if (scale.intervals.length === 7) {
    return scale.intervals.map((semi, idx) => {
      const degree = idx + 1;
      const spelled = spellDiatonicOffset(rootSpelling, degree, semi);
      const acc = spelled.alteration < 0 ? "♭".repeat(-spelled.alteration) : spelled.alteration > 0 ? "♯".repeat(spelled.alteration) : "";
      return `${spelled.letter}${acc}`;
    });
  }

  // Pentatonic or other non-7 note scales: map against root note with diatonic preference
  const preferFlats = rootSpelling.alteration < 0 || rootSpelling.letter === "F";
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  const rootPc = (((rootSpelling.alteration + (rootSpelling.letter === "C" ? 0 : rootSpelling.letter === "D" ? 2 : rootSpelling.letter === "E" ? 4 : rootSpelling.letter === "F" ? 5 : rootSpelling.letter === "G" ? 7 : rootSpelling.letter === "A" ? 9 : 11)) % 12) + 12) % 12;

  return scale.intervals.map((semi) => names[(rootPc + semi) % 12]);
}

/** Backward-compatible getScaleNotes function */
export function getScaleNotes(rootPc: number, scale: ScaleDefinition, preferFlats = false): string[] {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return scale.intervals.map((semi) => names[(rootPc + semi) % 12]);
}

/** Finds compatible scales for a given chord's interval set */
export function getCompatibleScales(chordIntervals: number[]): ScaleDefinition[] {
  const chordSet = new Set(chordIntervals.map((i) => i % 12));
  return getAllScales().filter((scale) => {
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
