/**
 * Chord family of a key & mode — the chords that belong to it, what each one does,
 * secondary dominants, modal interchange / borrowed chords, tritone substitutions,
 * interactive cadences & progressions, and capo options.
 * Pure functions, no React: the UI renders the result and plays every chord.
 */

export type Mode = "major" | "minor";
export type HarmonicFunction = "tonic" | "subdominant" | "dominant";

export interface FamilyChord {
  /** Roman numeral, e.g. "ii", "V7", "viiø7", "bVII", "V/V", "subV7". */
  numeral: string;
  /** Spelled chord symbol, e.g. "F#m", "Bbmaj7". */
  name: string;
  /** Pitch class of the root, 0 = C. */
  root: number;
  /** Chord Library suffix ("", "m", "dim", "7", "m7b5", "maj7", "9", …). */
  suffix: string;
  /** Diatonic chords only. */
  function?: HarmonicFunction;
  /** Functional explanation e.g. "Resolves to Dm (ii)". */
  note?: string;
  category?: string;
  description?: string;
}

export interface ScaleSet {
  name: string;
  scale: string[];
  triads: FamilyChord[];
  sevenths: FamilyChord[];
  ninths: FamilyChord[];
  /** Passing chords built from this scale's own triads. */
  passing: PassingPattern[];
}

export interface KeyRef {
  tonic: string;
  mode: Mode;
  name: string;
}

export interface Progression {
  name: string;
  category?: string;
  description?: string;
  chords: FamilyChord[];
}

export interface PassingPattern {
  name: string;
  note: string;
  chords: FamilyChord[];
}

export interface CapoOption {
  shapes: string;
  capo: number;
  sounds: string;
}

export type ScaleFamilyCategory =
  | "Core Major & Minor"
  | "7 Diatonic Modes"
  | "Harmonic & Melodic Modes"
  | "Contemporary & Symmetric";

export interface ScaleFamilyDef {
  id: string;
  name: string;
  category: ScaleFamilyCategory;
  intervals: number[];
  characteristicNote?: string;
  characteristicChord?: string;
  description: string;
  isMinorLike?: boolean;
}

export interface ChordFamily {
  key: KeyRef;
  scaleFamily: ScaleFamilyDef;
  scale: string[];
  /** The key's main chord set. */
  triads: FamilyChord[];
  sevenths: FamilyChord[];
  ninths: FamilyChord[];
  counts: { major: number; minor: number; diminished: number; augmented: number };
  relative: KeyRef;
  parallel: KeyRef;
  signature: { sharps: string[]; flats: string[] };
  // Functional pillars
  tonicChords: FamilyChord[];
  subdominantChords: FamilyChord[];
  dominantChords: FamilyChord[];
  // Extended harmonic functions
  borrowed: FamilyChord[];
  allBorrowed: FamilyChord[];
  secondaryDominants: FamilyChord[];
  secondaryLeadingTones: FamilyChord[];
  tritoneSubs: FamilyChord[];
  progressions: Progression[];
  allProgressions: Progression[];
  cadences: Progression[];
  passing: PassingPattern[];
  minorSets?: ScaleSet[];
  capo: CapoOption[];
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const SHARP_ORDER = ["F#", "C#", "G#", "D#", "A#", "E#", "B#"];
const FLAT_ORDER = ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  melodic: [0, 2, 3, 5, 7, 9, 11],
};

export const SCALE_FAMILIES: ScaleFamilyDef[] = [
  // 1. Core Major & Minor
  {
    id: "major",
    name: "Major (Ionian)",
    category: "Core Major & Minor",
    intervals: [0, 2, 4, 5, 7, 9, 11],
    description: "The foundational Western diatonic scale. Bright, resolved, and stable.",
  },
  {
    id: "natural_minor",
    name: "Natural Minor (Aeolian)",
    category: "Core Major & Minor",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    isMinorLike: true,
    description: "The pure natural minor scale (minor 3rd, 6th, and 7th). Somber, melancholy, and introspective.",
  },
  {
    id: "harmonic_minor",
    name: "Harmonic Minor",
    category: "Core Major & Minor",
    intervals: [0, 2, 3, 5, 7, 8, 11],
    isMinorLike: true,
    characteristicNote: "Raised Major 7th Leading Tone",
    characteristicChord: "Major V7 & vii°7",
    description: "Features a raised 7th degree creating a leading tone, yielding an exotic augmented 2nd and a strong V7 dominant resolution in minor.",
  },
  {
    id: "melodic_minor",
    name: "Melodic Minor (Jazz Minor)",
    category: "Core Major & Minor",
    intervals: [0, 2, 3, 5, 7, 9, 11],
    isMinorLike: true,
    characteristicNote: "Natural 6th & Natural 7th with Minor 3rd",
    characteristicChord: "i(maj7), ii, IV7",
    description: "Ascending classical & jazz melodic minor with raised 6th and 7th degrees. The harmonic foundation for modern jazz modal theory.",
  },

  // 2. All 7 Diatonic Modes
  {
    id: "ionian",
    name: "Ionian Mode (Mode I)",
    category: "7 Diatonic Modes",
    intervals: [0, 2, 4, 5, 7, 9, 11],
    characteristicNote: "Natural 4th (Avoid tone in major)",
    characteristicChord: "Imaj7, IVmaj7",
    description: "1st mode of the major scale. Tonal center of modern Western harmony.",
  },
  {
    id: "dorian",
    name: "Dorian Mode (Mode II)",
    category: "7 Diatonic Modes",
    intervals: [0, 2, 3, 5, 7, 9, 10],
    isMinorLike: true,
    characteristicNote: "Natural 6th (Bright minor color)",
    characteristicChord: "IV (Major IV) & ii (or i7 – IV7)",
    description: "2nd mode of the major scale. Minor with a bright natural 6th. The defining sound of Miles Davis, Santana, funk, and modern jazz.",
  },
  {
    id: "phrygian",
    name: "Phrygian Mode (Mode III)",
    category: "7 Diatonic Modes",
    intervals: [0, 1, 3, 5, 7, 8, 10],
    isMinorLike: true,
    characteristicNote: "Minor 2nd (b2)",
    characteristicChord: "bII (Neapolitan Major chord)",
    description: "3rd mode of the major scale. Minor with a dark, flamenco half-step b2 degree that creates intense tension resolving to the tonic.",
  },
  {
    id: "lydian",
    name: "Lydian Mode (Mode IV)",
    category: "7 Diatonic Modes",
    intervals: [0, 2, 4, 6, 7, 9, 11],
    characteristicNote: "Augmented 4th (#4 / Tritone)",
    characteristicChord: "II (Major II) or Imaj7#11",
    description: "4th mode of the major scale. Major with a raised #4th degree. Ethereal, dreamy, futuristic, and a favorite of film composers.",
  },
  {
    id: "mixolydian",
    name: "Mixolydian Mode (Mode V)",
    category: "7 Diatonic Modes",
    intervals: [0, 2, 4, 5, 7, 9, 10],
    characteristicNote: "Minor 7th (b7)",
    characteristicChord: "bVII (Major bVII) & v",
    description: "5th mode of the major scale. Major triad with a dominant flat 7th. The quintessential sound of classic rock, blues-rock, and Celtic music.",
  },
  {
    id: "aeolian",
    name: "Aeolian Mode (Mode VI)",
    category: "7 Diatonic Modes",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    isMinorLike: true,
    characteristicNote: "Minor 6th (b6)",
    characteristicChord: "bVI & bVII",
    description: "6th mode of the major scale (natural minor). Melancholy, emotional, and ubiquitous in rock, pop ballads, and cinematic cues.",
  },
  {
    id: "locrian",
    name: "Locrian Mode (Mode VII)",
    category: "7 Diatonic Modes",
    intervals: [0, 1, 3, 5, 6, 8, 10],
    isMinorLike: true,
    characteristicNote: "Diminished 5th (b5)",
    characteristicChord: "i° (Diminished tonic) & bV",
    description: "7th mode of the major scale. Highly unstable with an inherent diminished fifth on the tonic. Used in heavy metal and dark jazz passages.",
  },

  // 3. Harmonic & Melodic Minor Modes
  {
    id: "phrygian_dominant",
    name: "Phrygian Dominant (Spanish Gypsy)",
    category: "Harmonic & Melodic Modes",
    intervals: [0, 1, 4, 5, 7, 8, 10],
    characteristicNote: "Minor 2nd (b2) with Major 3rd",
    characteristicChord: "I / I7 & bII (Major)",
    description: "5th mode of Harmonic Minor. Unmistakable Spanish, Flamenco, and Middle Eastern flavor with intense exotic resolution.",
  },
  {
    id: "lydian_dominant",
    name: "Lydian Dominant (Overtone Scale)",
    category: "Harmonic & Melodic Modes",
    intervals: [0, 2, 4, 6, 7, 9, 10],
    characteristicNote: "Raised 4th (#4) & Flat 7th (b7)",
    characteristicChord: "I7 (#11) & II7",
    description: "4th mode of Melodic Minor. Acoustic overtone scale combining the bright #4 of Lydian with the bluesy b7 of Mixolydian. The standard chord-scale for tritone substitutions.",
  },
  {
    id: "altered",
    name: "Altered Scale (Super Locrian)",
    category: "Harmonic & Melodic Modes",
    intervals: [0, 1, 3, 4, 6, 8, 10],
    characteristicNote: "All alterations: b9, #9, b5, #5",
    characteristicChord: "7alt, 7#9, 7b9#11",
    description: "7th mode of Melodic Minor. Every non-tonic scale tone is altered, creating maximum harmonic tension on dominant chords leading to minor or major resolutions.",
  },
  {
    id: "dorian_b2",
    name: "Dorian b2 (Javanese Mode)",
    category: "Harmonic & Melodic Modes",
    intervals: [0, 1, 3, 5, 7, 9, 10],
    isMinorLike: true,
    characteristicNote: "Flat 2nd with Natural 6th",
    characteristicChord: "i7, II",
    description: "2nd mode of Melodic Minor. Phrygian-like half step opening paired with Dorian's bright natural 6th.",
  },

  // 4. Contemporary & Symmetric Families
  {
    id: "blues",
    name: "Blues Family",
    category: "Contemporary & Symmetric",
    intervals: [0, 3, 5, 6, 7, 10],
    isMinorLike: true,
    characteristicNote: "Blue Note (b5 / diminished 5th)",
    characteristicChord: "I7, IV7, V7, bIII7",
    description: "Hexatonic blues scale harmonized as dominant 7th chords on degrees I, IV, and V, plus passing flat-3 and flat-7 substitutions.",
  },
  {
    id: "major_pentatonic",
    name: "Major Pentatonic Harmony",
    category: "Contemporary & Symmetric",
    intervals: [0, 2, 4, 7, 9],
    characteristicNote: "Omission of 4th and 7th (No half-steps)",
    characteristicChord: "I, ii, iii, V, vi (Open & Sus Voicings)",
    description: "5-note universal major scale. Clean, consonant harmonies without tritone dissonance; ideal for open modal pads and gospel/country voicings.",
  },
  {
    id: "minor_pentatonic",
    name: "Minor Pentatonic Harmony",
    category: "Contemporary & Symmetric",
    intervals: [0, 3, 5, 7, 10],
    isMinorLike: true,
    characteristicNote: "Roots: 1, b3, 4, 5, b7",
    characteristicChord: "i7, bIII, iv7, v7, bVII",
    description: "5-note rock and blues foundation. Produces open quartal voicings, power chords, and bluesy modal vamp structures.",
  },
  {
    id: "diminished_hw",
    name: "Diminished (Octatonic Half-Whole)",
    category: "Contemporary & Symmetric",
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    characteristicNote: "Alternating half-step and whole-step symmetry",
    characteristicChord: "7b9, dim7, 7#9, 13b9",
    description: "8-tone symmetric scale generating four interlocking dominant 7b9 and diminished 7th chords separated by minor thirds.",
  },
  {
    id: "whole_tone",
    name: "Whole-Tone Family",
    category: "Contemporary & Symmetric",
    intervals: [0, 2, 4, 6, 8, 10],
    characteristicNote: "Six whole steps (Total root symmetry)",
    characteristicChord: "I+, 7#5, 9#5",
    description: "Symmetric 6-tone scale built entirely of whole steps. Debussy-esque impressionistic dreaminess with augmented triads on all degrees.",
  },
];

/** Tonic function for degrees 1, 3, 6; subdominant for 2, 4; dominant for 5, 7. */
const FUNCTION_BY_DEGREE: HarmonicFunction[] = ["tonic", "subdominant", "tonic", "subdominant", "dominant", "tonic", "dominant"];

/** Tonics offered by the key picker. */
export const MAJOR_TONICS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const MINOR_TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

export const ALL_TONIC_ENTRIES = [
  { pc: 0, sharp: "C", flat: "C", label: "C" },
  { pc: 1, sharp: "C#", flat: "Db", label: "C♯ / D♭" },
  { pc: 2, sharp: "D", flat: "D", label: "D" },
  { pc: 3, sharp: "D#", flat: "Eb", label: "D♯ / E♭" },
  { pc: 4, sharp: "E", flat: "E", label: "E" },
  { pc: 5, sharp: "F", flat: "F", label: "F" },
  { pc: 6, sharp: "F#", flat: "Gb", label: "F♯ / G♭" },
  { pc: 7, sharp: "G", flat: "G", label: "G" },
  { pc: 8, sharp: "G#", flat: "Ab", label: "G♯ / A♭" },
  { pc: 9, sharp: "A", flat: "A", label: "A" },
  { pc: 10, sharp: "A#", flat: "Bb", label: "A♯ / B♭" },
  { pc: 11, sharp: "B", flat: "B", label: "B" },
];

/** Open-chord keys guitarists like to play in, for the capo helper. */
const CAPO_SHAPES: Record<Mode, string[]> = { major: ["C", "G", "D", "A", "E"], minor: ["Am", "Em", "Dm"] };
const MAX_CAPO = 7;

interface Note {
  letter: number; // index into LETTERS
  pc: number;
}

export function parseTonic(tonic: string): Note {
  const m = /^([A-G])([#b]?)$/.exec(tonic);
  if (!m) throw new Error(`Not a key tonic: ${tonic}`);
  const letter = LETTERS.indexOf(m[1]);
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return { letter, pc: (LETTER_PC[letter] + acc + 12) % 12 };
}

/** Spells pitch class `pc` on letter `letter`; a double sharp/flat falls back to its plain name. */
export function spell(letter: number, pc: number): string {
  const l = ((letter % 7) + 7) % 7;
  const acc = ((((pc - LETTER_PC[l]) % 12) + 18) % 12) - 6;
  if (acc === 0) return LETTERS[l];
  if (acc === 1) return LETTERS[l] + "#";
  if (acc === -1) return LETTERS[l] + "b";
  return acc > 0 ? SHARP_NAMES[pc] : FLAT_NAMES[pc];
}

/** The note `degree` steps (1 = unison, 5 = fifth) and `semitones` above `from`. */
export function above(from: Note, degree: number, semitones: number): Note {
  return { letter: from.letter + degree - 1, pc: (from.pc + semitones) % 12 };
}

const TRIAD_SUFFIX: Record<string, string> = {
  "4,7": "",
  "3,7": "m",
  "3,6": "dim",
  "4,8": "aug",
  "4,6": "b5",
  "5,7": "sus4",
  "2,7": "sus2",
};

const SEVENTH_SUFFIX: Record<string, string> = {
  "4,7,11": "maj7",
  "4,7,10": "7",
  "3,7,10": "m7",
  "3,6,10": "m7b5",
  "3,6,9": "dim7",
  "3,7,11": "mMaj7",
  "4,8,11": "maj7#5",
  "4,8,10": "aug7",
  "4,6,10": "7b5",
  "4,6,11": "maj7b5",
  "5,7,10": "7sus4",
};

const NINTH_SUFFIX: Record<string, string> = {
  maj7: "maj9",
  "7": "9",
  m7: "m9",
  m7b5: "m7b5",
  dim7: "dim7",
  mMaj7: "mMaj9",
  aug7: "9#5",
  "maj7#5": "maj9#5",
  "7b5": "7b9",
};

/** Roman numeral for a chord of `suffix` on scale degree `degree` (1-7). */
export function romanNumeral(degree: number, suffix: string, prefix = ""): string {
  const upper = ROMAN[degree - 1];
  const lower = upper.toLowerCase();
  const forms: Record<string, string> = {
    "": upper,
    m: lower,
    dim: `${lower}°`,
    b5: `${lower}b5`,
    aug: `${upper}+`,
    maj7: `${upper}maj7`,
    "7": `${upper}7`,
    m7: `${lower}7`,
    m7b5: `${lower}ø7`,
    dim7: `${lower}°7`,
    mMaj7: `${lower}(maj7)`,
    "maj7#5": `${upper}+maj7`,
    "9": `${upper}9`,
    maj9: `${upper}maj9`,
    m9: `${lower}9`,
    "7b9": `${upper}7b9`,
    "7#9": `${upper}7#9`,
  };
  return prefix + (forms[suffix] ?? upper + suffix);
}

function chord(rootNote: Note, suffix: string, numeral: string, extra: Partial<FamilyChord> = {}): FamilyChord {
  return { numeral, name: spell(rootNote.letter, rootNote.pc) + suffix, root: rootNote.pc, suffix, ...extra };
}

/** Triads, sevenths and ninths built on each degree of `intervals` (semitones above the tonic). */
export function scaleSet(name: string, tonic: Note, intervals: number[]): ScaleSet {
  const isSevenNote = intervals.length === 7;
  const count = intervals.length;
  const notes = intervals.map((semi, i) => above(tonic, i + 1, semi));
  const stack = (d: number, steps: number) => (intervals[(d + steps) % count] - intervals[d] + 12) % 12;

  const triads: FamilyChord[] = [];
  const sevenths: FamilyChord[] = [];
  const ninths: FamilyChord[] = [];

  for (let d = 0; d < count; d++) {
    const third = stack(d, 2 % count);
    const fifth = stack(d, 4 % count);
    const seventh = isSevenNote ? stack(d, 6) : 10;
    const triad = TRIAD_SUFFIX[`${third},${fifth}`] ?? (third === 4 ? "" : "m");
    const sev = SEVENTH_SUFFIX[`${third},${fifth},${seventh}`] ?? (triad === "m" ? "m7" : triad === "dim" ? "m7b5" : "7");
    const ninth = NINTH_SUFFIX[sev] ?? `${sev}`;
    const fn = isSevenNote ? FUNCTION_BY_DEGREE[d] : d === 0 ? "tonic" : d === 3 ? "subdominant" : "dominant";

    triads.push(chord(notes[d], triad, romanNumeral(d + 1, triad), { function: fn }));
    sevenths.push(chord(notes[d], sev, romanNumeral(d + 1, sev), { function: fn }));
    ninths.push(chord(notes[d], ninth, romanNumeral(d + 1, ninth), { function: fn }));
  }

  const passing = passingPatterns(intervals[2] === 4 ? "major" : "minor", triads);
  return { name, scale: notes.map((n) => spell(n.letter, n.pc)), triads, sevenths, ninths, passing };
}

function keyRef(tonic: string, mode: Mode): KeyRef {
  return { tonic, mode, name: `${tonic} ${mode}` };
}

function signatureOf(scale: string[]): ChordFamily["signature"] {
  return {
    sharps: SHARP_ORDER.filter((n) => scale.includes(n)),
    flats: FLAT_ORDER.filter((n) => scale.includes(n)),
  };
}

/** How many major, minor, diminished and augmented chords a set of triads has. */
export function triadCounts(triads: FamilyChord[]): ChordFamily["counts"] {
  const counts = { major: 0, minor: 0, diminished: 0, augmented: 0 };
  for (const c of triads) {
    if (c.suffix === "") counts.major++;
    else if (c.suffix === "m") counts.minor++;
    else if (c.suffix === "dim") counts.diminished++;
    else counts.augmented++;
  }
  return counts;
}

/** "play in shapes of X with capo N to sound in key Y", for the usual open-chord keys. */
export function capoOptions(tonic: string, mode: Mode): CapoOption[] {
  const target = parseTonic(tonic).pc;
  return CAPO_SHAPES[mode]
    .map((shapes) => ({ shapes, capo: (target - parseTonic(shapes.replace("m", "")).pc + 12) % 12, sounds: `${tonic} ${mode}` }))
    .filter((o) => o.capo <= MAX_CAPO)
    .sort((a, b) => a.capo - b.capo);
}

/**
 * Main harmonic family generator.
 * Supports legacy "major" and "minor" mode strings, as well as full ScaleFamilyId strings.
 */
export function chordFamily(tonic: string, modeOrScale: string = "major"): ChordFamily {
  const t = parseTonic(tonic);

  // Normalize mode/scale
  const scaleDef =
    SCALE_FAMILIES.find((s) => s.id === modeOrScale) ??
    (modeOrScale === "minor"
      ? SCALE_FAMILIES.find((s) => s.id === "natural_minor")!
      : SCALE_FAMILIES.find((s) => s.id === "major")!);

  const isMajorMode = modeOrScale === "major" || (!scaleDef.isMinorLike && modeOrScale !== "natural_minor");
  const mode: Mode = isMajorMode ? "major" : "minor";

  const main = scaleSet(
    modeOrScale === "major" ? "Major" : modeOrScale === "minor" ? "Natural minor" : scaleDef.name,
    t,
    scaleDef.intervals
  );

  const { triads, sevenths, scale } = main;
  const ninths = main.ninths ?? sevenths;
  const counts = triadCounts(triads);

  const relativeNote = mode === "major" ? above(t, 6, 9) : above(t, 3, 3);
  const relative = keyRef(spell(relativeNote.letter, relativeNote.pc), mode === "major" ? "minor" : "major");
  const parallel = keyRef(tonic, mode === "major" ? "minor" : "major");
  const parallelName = parallel.name;

  // Functional pillars
  const tonicChords: FamilyChord[] = [];
  const subdominantChords: FamilyChord[] = [];
  const dominantChords: FamilyChord[] = [];

  triads.forEach((c) => {
    if (c.function === "tonic") tonicChords.push(c);
    else if (c.function === "subdominant") subdominantChords.push(c);
    else if (c.function === "dominant") dominantChords.push(c);
  });

  // Backward-compatible primary borrowed chords
  const borrowed: FamilyChord[] =
    mode === "major"
      ? [
          chord(above(t, 7, 10), "", "bVII", { note: `from ${parallelName}` }),
          chord(above(t, 6, 8), "", "bVI", { note: `from ${parallelName}` }),
          chord(above(t, 4, 5), "m", "iv", { note: `from ${parallelName}` }),
        ]
      : [
          chord(t, "", "I", { note: `Picardy third, from ${parallelName}` }),
          chord(above(t, 4, 5), "", "IV", { note: `from ${parallelName} (Dorian IV)` }),
          chord(above(t, 2, 1), "", "bII", { note: "Neapolitan" }),
        ];

  // Comprehensive Modal Interchange
  const allBorrowed: FamilyChord[] =
    mode === "major"
      ? [
          chord(above(t, 2, 1), "", "bII", { note: "Neapolitan Major", description: "Borrowed from Phrygian. Dramatic half-step pull to I or V." }),
          chord(above(t, 3, 3), "", "bIII", { note: "Flat Mediant (bIII)", description: "Borrowed from Aeolian. Epic cinematic rock & film score sound." }),
          chord(above(t, 4, 5), "m", "iv", { note: "Minor Subdominant (iv)", description: "Borrowed from Aeolian. Emotional, bittersweet resolution into I." }),
          chord(above(t, 6, 8), "", "bVI", { note: "Flat Submediant (bVI)", description: "Borrowed from Aeolian. Powerful, triumphant modal lift." }),
          chord(above(t, 7, 10), "", "bVII", { note: "Subtonic (bVII)", description: "Borrowed from Mixolydian. Standard rock anthem cadence." }),
          chord(above(t, 2, 2), "m7b5", "iiø7", { note: "Half-Diminished iiø7", description: "Borrowed from minor. Smooth jazz minor cadence into V7." }),
          chord(above(t, 5, 7), "m", "v", { note: "Minor Dominant (v)", description: "Borrowed from Aeolian/Mixolydian. Gentle, unresolved modal cadence." }),
        ]
      : [
          chord(t, "", "I", { note: "Picardy Third (I)", description: "Major tonic resolution ending a minor key piece in light." }),
          chord(above(t, 4, 5), "", "IV", { note: "Major Subdominant (IV)", description: "Borrowed from Dorian. Bright soulful modal uplift." }),
          chord(above(t, 2, 1), "", "bII", { note: "Neapolitan (bII)", description: "Classic pre-dominant chord with rich baroque and romantic color." }),
          chord(above(t, 7, 11), "7", "VII7", { note: "Major Seventh (VII7)", description: "Leading tone dominant pointing to the relative major." }),
          chord(above(t, 6, 9), "m", "vi", { note: "Minor Submediant (vi)", description: "Borrowed from Dorian. Melodic minor color." }),
        ];

  // Secondary Dominants (a fifth above diatonic chords)
  const secondaryDominants = triads
    .map((target, d) => ({ target, d }))
    .filter(({ target, d }) => d > 0 && (target.suffix === "" || target.suffix === "m"))
    .map(({ target, d }) => {
      const targetNote = above(t, d + 1, (mode === "major" ? SCALES.major : SCALES.natural)[d]);
      const label = mode === "minor" && d === 4 ? "V" : target.numeral;
      return chord(above(targetNote, 5, 7), "7", `V/${label}`, { note: `resolves to ${target.name}` });
    });

  // Secondary Leading-Tone Chords (diminished 7th a half-step below target chord)
  const secondaryLeadingTones = triads
    .map((target, d) => ({ target, d }))
    .filter(({ target, d }) => d > 0 && (target.suffix === "" || target.suffix === "m"))
    .map(({ target, d }) => {
      const targetNote = above(t, d + 1, (mode === "major" ? SCALES.major : SCALES.natural)[d]);
      const leadingNote = above(targetNote, 1, 11);
      const label = mode === "minor" && d === 4 ? "V" : target.numeral;
      return chord(leadingNote, "dim7", `vii°7/${label}`, { note: `resolves up a half-step to ${target.name}` });
    });

  // Tritone Substitutions (subV7 = dominant 7th a tritone away from V7, resolving down a half-step)
  const tritoneSubs: FamilyChord[] = [
    chord(above(t, 2, 1), "7", "subV7", { note: `Tritone sub for V7; resolves down to ${triads[0].name}` }),
    chord(above(t, 3, 3), "7", "subV7/ii", { note: `Tritone sub for V7/ii; resolves down to ${triads[1]?.name ?? "ii"}` }),
    chord(above(t, 5, 6), "7", "subV7/IV", { note: `Tritone sub for V7/IV; resolves down to ${triads[3]?.name ?? "IV"}` }),
    chord(above(t, 6, 8), "7", "subV7/V", { note: `Tritone sub for V7/V; resolves down to ${triads[4]?.name ?? "V"}` }),
    chord(above(t, 7, 10), "7", "subV7/vi", { note: `Tritone sub for V7/vi; resolves down to ${triads[5]?.name ?? "vi"}` }),
  ];

  const pick = (set: FamilyChord[], ...degrees: number[]) => degrees.map((d) => set[(d - 1 + set.length) % set.length]);

  // Comprehensive Curated Progressions & Cadences
  let progressions: Progression[];
  const harmonicSet = scaleSet("Harmonic minor", t, SCALES.harmonic);

  let allProgressions: Progression[];

  if (mode === "major") {
    progressions = [
      { name: "I–V–vi–IV", chords: pick(triads, 1, 5, 6, 4) },
      { name: "ii–V–I", chords: pick(sevenths, 2, 5, 1) },
      { name: "I–vi–IV–V", chords: pick(triads, 1, 6, 4, 5) },
      { name: "12-bar blues", chords: blues(t, "7", "7", "7", (d) => romanNumeral(d, "7")) },
    ];
    allProgressions = [
      ...progressions,
      { name: "IVmaj7–V7–iii7–vi", category: "Popular & Modern", description: "Royal Road (Oudou) progression celebrated in J-Pop, anime, and R&B.", chords: [sevenths[3], sevenths[4], sevenths[2], triads[5]] },
      { name: "ii7–subV7–Imaj7", category: "Jazz & Neo-Soul", description: "Jazz turnaround with chromatic tritone substitution.", chords: [sevenths[1], tritoneSubs[0], sevenths[0]] },
      { name: "IVmaj9–iii7–vi9–I", category: "Jazz & Neo-Soul", description: "Lush, modern Neo-Soul and R&B chord cycle.", chords: [ninths[3] ?? sevenths[3], sevenths[2], ninths[5] ?? sevenths[5], triads[0]] },
    ];
  } else {
    progressions = [
      { name: "i–VI–III–VII", chords: pick(triads, 1, 6, 3, 7) },
      { name: "ii°–V–i", chords: [sevenths[1], harmonicSet.sevenths[4], triads[0]] },
      { name: "i–iv–V", chords: [triads[0], triads[3], harmonicSet.triads[4]] },
      { name: "Minor 12-bar blues", chords: blues(t, "m7", "m7", "7", (d, s) => romanNumeral(d, s)) },
    ];
    allProgressions = [
      ...progressions,
      { name: "i–bVII–bVI–V7", category: "Modal & World", description: "Andalusian Cadence: classic Spanish Flamenco descending progression.", chords: [triads[0], chord(above(t, 7, 10), "", "bVII"), chord(above(t, 6, 8), "", "bVI"), harmonicSet.sevenths[4]] },
      { name: "i7–IV7–i7–IV7", category: "Modal & World", description: "Dorian groove: Santana and funk modal vamp.", chords: [sevenths[0], chord(above(t, 4, 5), "7", "IV7"), sevenths[0], chord(above(t, 4, 5), "7", "IV7")] },
    ];
  }

  // Classical Cadences
  const cadences: Progression[] = [
    { name: "Authentic Cadence (V7 → I)", description: "Strongest harmonic resolution in tonal music.", chords: [sevenths[4] ?? triads[4], triads[0]] },
    { name: "Plagal Cadence (IV → I)", description: "The warm 'Amen' cadence found across gospel and classical hymns.", chords: [triads[3], triads[0]] },
    { name: "Deceptive Cadence (V7 → vi)", description: "Surprise resolution moving from dominant tension to submediant stability.", chords: [sevenths[4] ?? triads[4], triads[5]] },
    { name: "Half Cadence (I → V)", description: "Open comma-like pause awaiting continuation.", chords: [triads[0], triads[4]] },
  ];

  return {
    key: keyRef(tonic, mode),
    scaleFamily: scaleDef,
    scale,
    triads,
    sevenths,
    ninths: ninths && ninths.length ? ninths : sevenths,
    counts,
    relative,
    parallel,
    signature: signatureOf(scale),
    tonicChords,
    subdominantChords,
    dominantChords,
    borrowed,
    allBorrowed,
    secondaryDominants,
    secondaryLeadingTones,
    tritoneSubs,
    progressions,
    allProgressions,
    cadences,
    passing: main.passing,
    minorSets:
      mode === "minor"
        ? [main, scaleSet("Harmonic minor", t, SCALES.harmonic), scaleSet("Melodic minor", t, SCALES.melodic)]
        : undefined,
    capo: capoOptions(tonic, mode),
  };
}

/** The 12-bar blues: I I I I | IV IV I I | V IV I V, each bar one chord. */
function blues(t: Note, one: string, four: string, five: string, numeral: (degree: number, suffix: string) => string): FamilyChord[] {
  const I = chord(t, one, numeral(1, one));
  const IV = chord(above(t, 4, 5), four, numeral(4, four));
  const V = chord(above(t, 5, 7), five, numeral(5, five));
  return [I, I, I, I, IV, IV, I, I, V, IV, I, V];
}

/** The same chord with a dominant 7th on top (C → C7), used as a passing chord toward the IV. */
function withSeventh(c: FamilyChord, degree: number): FamilyChord {
  return { ...c, name: c.name + "7", suffix: "7", numeral: romanNumeral(degree, "7"), function: undefined };
}

/** The diminished chord a semitone above `c` — the chromatic step between a chord and the next one up. */
function chromaticDiminished(c: FamilyChord, degree: number): FamilyChord {
  const from: Note = { letter: LETTERS.indexOf(c.name[0]), pc: c.root };
  return chord(above(from, 1, 1), "dim", romanNumeral(degree, "dim", "#"));
}

/**
 * Passing chords of a key.
 */
function passingPatterns(mode: Mode, triads: FamilyChord[]): PassingPattern[] {
  const tri = (...degrees: number[]) => degrees.map((d) => triads[d - 1]);
  const make = (note: string, chords: FamilyChord[]): PassingPattern => ({
    name: chords.map((c) => c.numeral).join(" → "),
    note,
    chords,
  });
  if (mode === "major") {
    return [
      make("Step down in thirds from the tonic to its relative minor.", tri(1, 3, 6)),
      make("Climb from the tonic through iii up to IV.", tri(1, 3, 4)),
      make("Walk up the scale from the tonic to IV.", tri(1, 2, 3, 4)),
      make("Walk back down the scale to the tonic.", tri(4, 3, 2, 1)),
      make("Descending bass line, as in the Canon progression.", tri(1, 5, 6, 3, 4)),
      make("Turn the tonic into a dominant 7th to lead into IV.", [triads[0], withSeventh(triads[0], 1), triads[3]]),
      make("A chromatic diminished chord between I and ii.", [triads[0], chromaticDiminished(triads[0], 1), triads[1]]),
      make("A chromatic diminished chord between IV and V.", [triads[3], chromaticDiminished(triads[3], 4), triads[4]]),
    ];
  }
  return [
    make("Climb in thirds from the tonic.", tri(1, 3, 5)),
    make("Step down from the tonic through the chord on the 7th degree.", tri(1, 7, 6)),
    make("Step back up to the tonic.", tri(6, 7, 1)),
    make("Move from the tonic to the 4th chord and on to the 5th.", tri(1, 4, 5)),
    make("From the tonic up to the 4th chord by way of the 3rd.", tri(1, 3, 4)),
    make("A chromatic diminished chord between the 1st and 2nd chords.", [triads[0], chromaticDiminished(triads[0], 1), triads[1]]),
    make("A chromatic diminished chord between the 4th and 5th chords.", [triads[3], chromaticDiminished(triads[3], 4), triads[4]]),
  ];
}
