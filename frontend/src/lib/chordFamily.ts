/**
 * Chord family of a key — the chords that belong to it, what each one does,
 * the chords songs commonly borrow, and how to play the key with a capo.
 * Pure functions, no React: the Chords page renders the result and opens
 * every chord's chart from chordTheory.ts.
 *
 * Chord qualities are derived by stacking thirds on the scale (never typed
 * in by hand), and every note is spelled letter by letter from the tonic,
 * so B♭ major reads B♭ C D E♭ F G A — not A♯ C D D♯…
 * Names use ASCII accidentals ("Bb", "F#m7b5"), the same symbols
 * parseChordSymbol reads.
 */

export type Mode = "major" | "minor";
export type HarmonicFunction = "tonic" | "subdominant" | "dominant";

export interface FamilyChord {
  /** Roman numeral, e.g. "ii", "V7", "viiø7", "bVII", "V/V". */
  numeral: string;
  /** Spelled chord symbol, e.g. "F#m", "Bbmaj7". */
  name: string;
  /** Pitch class of the root, 0 = C. */
  root: number;
  /** Chord Library suffix ("", "m", "dim", "7", "m7b5", …). */
  suffix: string;
  /** Diatonic chords only. */
  function?: HarmonicFunction;
  /** Borrowed and secondary chords: where it comes from / resolves to. */
  note?: string;
}

export interface ScaleSet {
  name: string;
  scale: string[];
  triads: FamilyChord[];
  sevenths: FamilyChord[];
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
  chords: FamilyChord[];
}

/** A short run of chords that connects two others — e.g. D → F#m → Bm in D major. */
export interface PassingPattern {
  /** The numerals joined with arrows, e.g. "I → iii → vi". */
  name: string;
  note: string;
  chords: FamilyChord[];
}

export interface CapoOption {
  /** Key whose open-chord shapes you play, e.g. "G" or "Em". */
  shapes: string;
  capo: number;
  /** "G major" — the key it sounds in. */
  sounds: string;
}

export interface ChordFamily {
  key: KeyRef;
  scale: string[];
  /** The key's main chord set (major scale, or natural minor). */
  triads: FamilyChord[];
  sevenths: FamilyChord[];
  counts: { major: number; minor: number; diminished: number; augmented: number };
  relative: KeyRef;
  parallel: KeyRef;
  signature: { sharps: string[]; flats: string[] };
  borrowed: FamilyChord[];
  secondaryDominants: FamilyChord[];
  progressions: Progression[];
  /** Passing chords: chords that carry you from one chord of the key to the next. */
  passing: PassingPattern[];
  /** Minor keys: natural, harmonic and melodic minor chord sets. */
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

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  melodic: [0, 2, 3, 5, 7, 9, 11],
};

/** Tonic function for degrees 1, 3, 6; subdominant for 2, 4; dominant for 5, 7. */
const FUNCTION_BY_DEGREE: HarmonicFunction[] = ["tonic", "subdominant", "tonic", "subdominant", "dominant", "tonic", "dominant"];

/** Tonics offered by the key picker, spelled the way the key is normally written. */
export const MAJOR_TONICS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const MINOR_TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** Open-chord keys guitarists like to play in, for the capo helper. */
const CAPO_SHAPES: Record<Mode, string[]> = { major: ["C", "G", "D", "A", "E"], minor: ["Am", "Em", "Dm"] };
const MAX_CAPO = 7;

interface Note {
  letter: number; // index into LETTERS
  pc: number;
}

function parseTonic(tonic: string): Note {
  const m = /^([A-G])([#b]?)$/.exec(tonic);
  if (!m) throw new Error(`Not a key tonic: ${tonic}`);
  const letter = LETTERS.indexOf(m[1]);
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return { letter, pc: (LETTER_PC[letter] + acc + 12) % 12 };
}

/** Spells pitch class `pc` on letter `letter`; a double sharp/flat falls back to its plain name. */
function spell(letter: number, pc: number): string {
  const l = ((letter % 7) + 7) % 7;
  const acc = ((((pc - LETTER_PC[l]) % 12) + 18) % 12) - 6;
  if (acc === 0) return LETTERS[l];
  if (acc === 1) return LETTERS[l] + "#";
  if (acc === -1) return LETTERS[l] + "b";
  return acc > 0 ? SHARP_NAMES[pc] : FLAT_NAMES[pc];
}

/** The note `degree` steps (1 = unison, 5 = fifth) and `semitones` above `from`. */
function above(from: Note, degree: number, semitones: number): Note {
  return { letter: from.letter + degree - 1, pc: (from.pc + semitones) % 12 };
}

const TRIAD_SUFFIX: Record<string, string> = { "4,7": "", "3,7": "m", "3,6": "dim", "4,8": "aug" };
const SEVENTH_SUFFIX: Record<string, string> = {
  "4,7,11": "maj7",
  "4,7,10": "7",
  "3,7,10": "m7",
  "3,6,10": "m7b5",
  "3,6,9": "dim7",
  "3,7,11": "mMaj7",
  "4,8,11": "maj7#5",
};

/** Roman numeral for a chord of `suffix` on scale degree `degree` (1-7). */
export function romanNumeral(degree: number, suffix: string, prefix = ""): string {
  const upper = ROMAN[degree - 1];
  const lower = upper.toLowerCase();
  const forms: Record<string, string> = {
    "": upper,
    m: lower,
    dim: `${lower}°`,
    aug: `${upper}+`,
    maj7: `${upper}maj7`,
    "7": `${upper}7`,
    m7: `${lower}7`,
    m7b5: `${lower}ø7`,
    dim7: `${lower}°7`,
    mMaj7: `${lower}(maj7)`,
    "maj7#5": `${upper}+maj7`,
  };
  return prefix + (forms[suffix] ?? upper + suffix);
}

function chord(rootNote: Note, suffix: string, numeral: string, extra: Partial<FamilyChord> = {}): FamilyChord {
  return { numeral, name: spell(rootNote.letter, rootNote.pc) + suffix, root: rootNote.pc, suffix, ...extra };
}

/** Triads and sevenths built on each degree of `intervals` (semitones above the tonic). */
function scaleSet(name: string, tonic: Note, intervals: number[]): ScaleSet {
  const notes = intervals.map((semi, i) => above(tonic, i + 1, semi));
  const stack = (d: number, steps: number) => (intervals[(d + steps) % 7] - intervals[d] + 12) % 12;
  const triads: FamilyChord[] = [];
  const sevenths: FamilyChord[] = [];
  for (let d = 0; d < 7; d++) {
    const third = stack(d, 2);
    const fifth = stack(d, 4);
    const seventh = stack(d, 6);
    const triad = TRIAD_SUFFIX[`${third},${fifth}`];
    const sev = SEVENTH_SUFFIX[`${third},${fifth},${seventh}`];
    const fn = FUNCTION_BY_DEGREE[d];
    triads.push(chord(notes[d], triad, romanNumeral(d + 1, triad), { function: fn }));
    sevenths.push(chord(notes[d], sev, romanNumeral(d + 1, sev), { function: fn }));
  }
  const passing = passingPatterns(intervals[2] === 4 ? "major" : "minor", triads);
  return { name, scale: notes.map((n) => spell(n.letter, n.pc)), triads, sevenths, passing };
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

export function chordFamily(tonic: string, mode: Mode): ChordFamily {
  const t = parseTonic(tonic);
  const main = scaleSet(mode === "major" ? "Major" : "Natural minor", t, mode === "major" ? SCALES.major : SCALES.natural);
  const { triads, sevenths, scale } = main;

  const counts = triadCounts(triads);

  const relativeNote = mode === "major" ? above(t, 6, 9) : above(t, 3, 3);
  const relative = keyRef(spell(relativeNote.letter, relativeNote.pc), mode === "major" ? "minor" : "major");
  const parallel = keyRef(tonic, mode === "major" ? "minor" : "major");
  const parallelName = parallel.name;

  const borrowed =
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

  // A dominant 7th a fifth above each major or minor diatonic chord (not the tonic).
  const secondaryDominants = triads
    .map((target, d) => ({ target, d }))
    .filter(({ target, d }) => d > 0 && (target.suffix === "" || target.suffix === "m"))
    .map(({ target, d }) => {
      const targetNote = above(t, d + 1, (mode === "major" ? SCALES.major : SCALES.natural)[d]);
      const label = mode === "minor" && d === 4 ? "V" : target.numeral;
      return chord(above(targetNote, 5, 7), "7", `V/${label}`, { note: `resolves to ${target.name}` });
    });

  const pick = (set: FamilyChord[], ...degrees: number[]) => degrees.map((d) => set[d - 1]);
  let progressions: Progression[];
  if (mode === "major") {
    progressions = [
      { name: "I–V–vi–IV", chords: pick(triads, 1, 5, 6, 4) },
      { name: "ii–V–I", chords: pick(sevenths, 2, 5, 1) },
      { name: "I–vi–IV–V", chords: pick(triads, 1, 6, 4, 5) },
      { name: "12-bar blues", chords: blues(t, "7", "7", "7", (d) => romanNumeral(d, "7")) },
    ];
  } else {
    const harmonic = scaleSet("Harmonic minor", t, SCALES.harmonic);
    progressions = [
      { name: "i–VI–III–VII", chords: pick(triads, 1, 6, 3, 7) },
      { name: "ii°–V–i", chords: [sevenths[1], harmonic.sevenths[4], triads[0]] },
      { name: "i–iv–V", chords: [triads[0], triads[3], harmonic.triads[4]] },
      { name: "Minor 12-bar blues", chords: blues(t, "m7", "m7", "7", (d, s) => romanNumeral(d, s)) },
    ];
  }

  return {
    key: keyRef(tonic, mode),
    scale,
    triads,
    sevenths,
    counts,
    relative,
    parallel,
    signature: signatureOf(scale),
    borrowed,
    secondaryDominants,
    progressions,
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
 * Passing chords of a key. Every chord comes from the key's own scale (or a chromatic step
 * between two of them), so it is spelled correctly in every key: in D major the first
 * pattern reads D → F#m → Bm, in C major C → Em → Am.
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
