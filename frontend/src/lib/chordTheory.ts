/**
 * Chord theory + instrument-shape data, used to render the same detected
 * chord as a guitar chord diagram, a ukulele chord diagram, or a piano
 * roll — Section 4.1/4.2 of the spec ("Instrument-specific views" and
 * "Alternate chord voicings"). Everything here is computed from real
 * music theory (interval math + standard CAGED barre-chord shapes), not
 * a lookup table of guesses.
 *
 * Major and minor chords use hand-checked open/barre shapes. Every other
 * chord quality is voiced by a small fretboard search that only returns
 * playable shapes (root in the bass, ≤4 fingers, ≤4-fret stretch).
 */

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/* ─── Chord qualities ─── */

export type ChordCategory = "Triads" | "Sixths & adds" | "Sevenths" | "Extended" | "Altered";

export interface QualityDef {
  /** Suffix used in the chord symbol, e.g. "m7" in "Am7". "" is major. */
  suffix: string;
  name: string;
  category: ChordCategory;
  /** [semitones above the root, scale degree] — degree drives note spelling. */
  tones: [number, number][];
  /** Semitone values that may be left out of a guitar/ukulele voicing. */
  optional: number[];
  /** Other ways people write this suffix (used by the parser and search). */
  aliases?: string[];
}

export const CHORD_QUALITIES: QualityDef[] = [
  // Triads
  { suffix: "", name: "major", category: "Triads", tones: [[0, 1], [4, 3], [7, 5]], optional: [], aliases: ["maj", "M"] },
  { suffix: "m", name: "minor", category: "Triads", tones: [[0, 1], [3, 3], [7, 5]], optional: [], aliases: ["min", "-"] },
  { suffix: "5", name: "power chord", category: "Triads", tones: [[0, 1], [7, 5]], optional: [] },
  { suffix: "dim", name: "diminished", category: "Triads", tones: [[0, 1], [3, 3], [6, 5]], optional: [], aliases: ["°", "o"] },
  { suffix: "aug", name: "augmented", category: "Triads", tones: [[0, 1], [4, 3], [8, 5]], optional: [], aliases: ["+"] },
  { suffix: "sus2", name: "suspended 2nd", category: "Triads", tones: [[0, 1], [2, 2], [7, 5]], optional: [] },
  { suffix: "sus4", name: "suspended 4th", category: "Triads", tones: [[0, 1], [5, 4], [7, 5]], optional: [], aliases: ["sus"] },
  // Sixths & added tones
  { suffix: "6", name: "major sixth", category: "Sixths & adds", tones: [[0, 1], [4, 3], [7, 5], [9, 6]], optional: [7] },
  { suffix: "m6", name: "minor sixth", category: "Sixths & adds", tones: [[0, 1], [3, 3], [7, 5], [9, 6]], optional: [7] },
  { suffix: "6/9", name: "six-nine", category: "Sixths & adds", tones: [[0, 1], [4, 3], [7, 5], [9, 6], [14, 9]], optional: [7], aliases: ["69"] },
  { suffix: "add9", name: "added ninth", category: "Sixths & adds", tones: [[0, 1], [4, 3], [7, 5], [14, 9]], optional: [7] },
  { suffix: "madd9", name: "minor added ninth", category: "Sixths & adds", tones: [[0, 1], [3, 3], [7, 5], [14, 9]], optional: [7] },
  // Sevenths
  { suffix: "7", name: "dominant seventh", category: "Sevenths", tones: [[0, 1], [4, 3], [7, 5], [10, 7]], optional: [7] },
  { suffix: "maj7", name: "major seventh", category: "Sevenths", tones: [[0, 1], [4, 3], [7, 5], [11, 7]], optional: [7], aliases: ["M7", "Δ7", "Δ"] },
  { suffix: "m7", name: "minor seventh", category: "Sevenths", tones: [[0, 1], [3, 3], [7, 5], [10, 7]], optional: [7], aliases: ["min7", "-7"] },
  { suffix: "mMaj7", name: "minor-major seventh", category: "Sevenths", tones: [[0, 1], [3, 3], [7, 5], [11, 7]], optional: [7], aliases: ["mmaj7", "m(maj7)"] },
  { suffix: "m7b5", name: "half-diminished", category: "Sevenths", tones: [[0, 1], [3, 3], [6, 5], [10, 7]], optional: [], aliases: ["ø", "ø7"] },
  { suffix: "dim7", name: "diminished seventh", category: "Sevenths", tones: [[0, 1], [3, 3], [6, 5], [9, 7]], optional: [], aliases: ["°7", "o7"] },
  { suffix: "7sus4", name: "dominant seventh sus4", category: "Sevenths", tones: [[0, 1], [5, 4], [7, 5], [10, 7]], optional: [7], aliases: ["7sus"] },
  // Extended
  { suffix: "9", name: "dominant ninth", category: "Extended", tones: [[0, 1], [4, 3], [7, 5], [10, 7], [14, 9]], optional: [7] },
  { suffix: "maj9", name: "major ninth", category: "Extended", tones: [[0, 1], [4, 3], [7, 5], [11, 7], [14, 9]], optional: [7], aliases: ["M9"] },
  { suffix: "m9", name: "minor ninth", category: "Extended", tones: [[0, 1], [3, 3], [7, 5], [10, 7], [14, 9]], optional: [7], aliases: ["min9", "-9"] },
  { suffix: "9sus4", name: "ninth sus4", category: "Extended", tones: [[0, 1], [5, 4], [7, 5], [10, 7], [14, 9]], optional: [7] },
  { suffix: "11", name: "dominant eleventh", category: "Extended", tones: [[0, 1], [4, 3], [7, 5], [10, 7], [14, 9], [17, 11]], optional: [4, 7, 14] },
  { suffix: "m11", name: "minor eleventh", category: "Extended", tones: [[0, 1], [3, 3], [7, 5], [10, 7], [14, 9], [17, 11]], optional: [7, 14], aliases: ["min11", "-11"] },
  { suffix: "13", name: "dominant thirteenth", category: "Extended", tones: [[0, 1], [4, 3], [7, 5], [10, 7], [14, 9], [21, 13]], optional: [7, 14] },
  { suffix: "maj13", name: "major thirteenth", category: "Extended", tones: [[0, 1], [4, 3], [7, 5], [11, 7], [14, 9], [21, 13]], optional: [7, 14], aliases: ["M13"] },
  { suffix: "m13", name: "minor thirteenth", category: "Extended", tones: [[0, 1], [3, 3], [7, 5], [10, 7], [14, 9], [21, 13]], optional: [7, 14], aliases: ["min13", "-13"] },
  // Altered
  { suffix: "7#5", name: "augmented seventh", category: "Altered", tones: [[0, 1], [4, 3], [8, 5], [10, 7]], optional: [], aliases: ["aug7", "+7"] },
  { suffix: "7b5", name: "seventh flat five", category: "Altered", tones: [[0, 1], [4, 3], [6, 5], [10, 7]], optional: [] },
  { suffix: "7b9", name: "seventh flat nine", category: "Altered", tones: [[0, 1], [4, 3], [7, 5], [10, 7], [13, 9]], optional: [7] },
  { suffix: "7#9", name: "seventh sharp nine", category: "Altered", tones: [[0, 1], [4, 3], [7, 5], [10, 7], [15, 9]], optional: [7] },
  { suffix: "maj7#11", name: "major seventh sharp eleven", category: "Altered", tones: [[0, 1], [4, 3], [7, 5], [11, 7], [18, 11]], optional: [7] },
];

export const CHORD_CATEGORIES: ChordCategory[] = ["Triads", "Sixths & adds", "Sevenths", "Extended", "Altered"];

const QUALITY_BY_SUFFIX = new Map<string, QualityDef>();
for (const q of CHORD_QUALITIES) {
  QUALITY_BY_SUFFIX.set(q.suffix, q);
  q.aliases?.forEach((a) => QUALITY_BY_SUFFIX.set(a, q));
}

/** Looks up a chord quality by its suffix or any alias ("", "m7", "min7", "-7", "ø"…). */
export function qualityForSuffix(suffix: string): QualityDef | undefined {
  return QUALITY_BY_SUFFIX.get(suffix);
}

/** Every chord symbol in the library: all 12 roots × every quality. */
export const ALL_CHORD_SYMBOLS: string[] = CHORD_QUALITIES.flatMap((q) => NOTE_NAMES.map((n) => `${n}${q.suffix}`));

/* ─── Parsing ─── */

export interface ParsedChord {
  root: number; // 0-11 pitch class
  quality: QualityDef;
  label: string;
}

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

export function parseChordSymbol(symbol: string): ParsedChord {
  const trimmed = symbol.trim();
  const match = /^([A-Ga-g])([#b♯♭]?)(.*)$/.exec(trimmed);
  if (!match) return { root: 0, quality: CHORD_QUALITIES[0], label: trimmed };

  const letter = match[1].toUpperCase();
  const accidental = match[2] === "#" || match[2] === "♯" ? 1 : match[2] ? -1 : 0;
  // Drop any slash bass ("C/E") — voicings are built on the chord root.
  const suffix = QUALITY_BY_SUFFIX.has(match[3]) ? match[3] : match[3].replace(/\/[A-G][#b♯♭]?$/, "");
  const quality = QUALITY_BY_SUFFIX.get(suffix) ?? CHORD_QUALITIES[0];

  return { root: (LETTER_PC[letter] + accidental + 12) % 12, quality, label: trimmed };
}

/** Semitone offsets of the chord's tones above its root. */
export function chordIntervals(chord: ParsedChord): number[] {
  return chord.quality.tones.map(([semi]) => semi);
}

/** Pitch-class note names (sharps), e.g. for matching against detected pitches. */
export function chordNoteNames(chord: ParsedChord): string[] {
  return chordIntervals(chord).map((o) => NOTE_NAMES[(chord.root + o) % 12]);
}

// Enharmonics that read awkwardly on a chord chart get their plain names.
const PLAIN_NAMES: Record<string, string> = {
  "E♯": "F", "B♯": "C", "F♭": "E", "C♭": "B",
  "C𝄪": "D", "D𝄪": "E", "E𝄪": "F♯", "F𝄪": "G", "G𝄪": "A", "A𝄪": "B", "B𝄪": "C♯",
  "C𝄫": "B♭", "D𝄫": "C", "E𝄫": "D", "F𝄫": "E♭", "G𝄫": "F", "A𝄫": "G", "B𝄫": "A",
};

/**
 * Note names for a chord, spelled from the root the symbol was written with
 * (Cm7 → C E♭ G B♭, D♭maj7 → D♭ F A♭ C), simplified for readability.
 */
export function spellChord(chord: ParsedChord): string[] {
  const match = /^([A-Ga-g])([#b♯♭]?)/.exec(chord.label);
  const rootLetter = match ? match[1].toUpperCase() : NOTE_NAMES[chord.root][0];
  const letterIndex = LETTERS.indexOf(rootLetter);
  return chord.quality.tones.map(([semi, degree]) => {
    const letter = LETTERS[(letterIndex + degree - 1) % 7];
    let diff = (chord.root + semi - LETTER_PC[letter]) % 12;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    const name = letter + (diff === 2 ? "𝄪" : diff === -2 ? "𝄫" : diff === 1 ? "♯" : diff === -1 ? "♭" : "");
    return PLAIN_NAMES[name] ?? name;
  });
}

/** Flat spelling of a sharp root, e.g. "C#" → "D♭" — for display and search. */
export function enharmonicRoot(pc: number): string | null {
  const flats: Record<number, string> = { 1: "D♭", 3: "E♭", 6: "G♭", 8: "A♭", 10: "B♭" };
  return flats[pc] ?? null;
}

export function chordFullName(chord: ParsedChord): string {
  return `${NOTE_NAMES[chord.root]} ${chord.quality.name}`;
}

/** MIDI note numbers for the chord, stacked upward from the root (octave 4). */
export function chordMidiNotes(chord: ParsedChord, baseOctaveMidi = 60): number[] {
  return chordIntervals(chord).map((o) => baseOctaveMidi + chord.root + o);
}

/* ─── Guitar ─── */

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

function isMinorTriad(chord: ParsedChord): boolean {
  return chord.quality.suffix === "m";
}

function eShapeBarre(chord: ParsedChord): GuitarVoicing {
  const b = distanceFromE(chord.root);
  const frets = isMinorTriad(chord) ? [b, b + 2, b + 2, b, b, b] : [b, b + 2, b + 2, b + 1, b, b];
  return { name: b === 0 ? "Open (E-shape)" : `Barre – E-shape (fret ${b})`, frets };
}

function aShapeBarre(chord: ParsedChord): GuitarVoicing {
  const b = distanceFromA(chord.root);
  const frets = isMinorTriad(chord) ? [null, b, b + 2, b + 2, b + 1, b] : [null, b, b + 2, b + 2, b + 2, b];
  return { name: b === 0 ? "Open (A-shape)" : `Barre – A-shape (fret ${b})`, frets };
}

const GUITAR_TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
const UKULELE_TUNING = [67, 60, 64, 69]; // G4 C4 E4 A4 (re-entrant)
const WINDOW = 4; // diagrams show four frets

interface Candidate {
  frets: (number | null)[];
  score: number;
  minFret: number;
}

/**
 * Searches the fretboard for playable shapes of `chord`.
 * `bassIsRoot` forces the lowest sounding string to be the root (guitar);
 * `allStrings` requires every string to ring (ukulele).
 */
function searchShapes(
  chord: ParsedChord,
  tuning: number[],
  opts: { bassIsRoot: boolean; allStrings: boolean; maxPosition: number; rootOptional?: boolean }
) {
  const chordPcs = new Set(chordIntervals(chord).map((o) => (chord.root + o) % 12));
  const optionalPcs = new Set(chord.quality.optional.map((o) => (chord.root + o) % 12));
  if (opts.rootOptional) optionalPcs.add(chord.root);
  const requiredPcs = [...chordPcs].filter((pc) => !optionalPcs.has(pc));
  const minPlayed = opts.allStrings ? tuning.length : chordPcs.size <= 2 ? 2 : chordPcs.size === 3 ? 3 : 4;

  const results = new Map<string, Candidate>();

  for (let pos = 1; pos <= opts.maxPosition; pos++) {
    const lo = pos;
    const hi = pos + WINDOW - 1;
    const options = tuning.map((open) => {
      const opts2: (number | null)[] = [null];
      if (chordPcs.has(open % 12)) opts2.push(0);
      for (let f = lo; f <= hi; f++) if (chordPcs.has((open + f) % 12)) opts2.push(f);
      return opts2;
    });

    const current: (number | null)[] = [];
    const walk = (i: number) => {
      if (i === tuning.length) {
        const cand = evaluate(current, tuning, chord.root, requiredPcs, optionalPcs, minPlayed, opts.bassIsRoot);
        if (cand) {
          const key = cand.frets.join(",");
          const prev = results.get(key);
          if (!prev || prev.score > cand.score) results.set(key, cand);
        }
        return;
      }
      for (const o of options[i]) {
        if (opts.allStrings && o === null) continue;
        current.push(o);
        walk(i + 1);
        current.pop();
      }
    };
    walk(0);
  }

  return [...results.values()].sort((a, b) => a.score - b.score);
}

function evaluate(
  frets: (number | null)[],
  tuning: number[],
  root: number,
  requiredPcs: number[],
  optionalPcs: Set<number>,
  minPlayed: number,
  bassIsRoot: boolean
): Candidate | null {
  const played = frets.map((f, i) => (f === null ? null : (tuning[i] + f) % 12));
  const playedIdx = played.flatMap((pc, i) => (pc === null ? [] : [i]));
  if (playedIdx.length < minPlayed) return null;

  if (bassIsRoot) {
    // Lowest-pitched sounding string must be the root.
    let lowest = playedIdx[0];
    for (const i of playedIdx) if (tuning[i] + (frets[i] as number) < tuning[lowest] + (frets[lowest] as number)) lowest = i;
    if (played[lowest] !== root) return null;
  }

  const pcs = new Set(playedIdx.map((i) => played[i] as number));
  if (!requiredPcs.every((pc) => pcs.has(pc))) return null;

  // Guitar: strings between the first and last played string may have at most one mute.
  const first = playedIdx[0];
  const last = playedIdx[playedIdx.length - 1];
  const interiorMutes = last - first + 1 - playedIdx.length;
  if (interiorMutes > 1) return null;

  const fretted = playedIdx.filter((i) => (frets[i] as number) > 0);
  const fretValues = fretted.map((i) => frets[i] as number);
  const minFret = fretValues.length ? Math.min(...fretValues) : 0;
  const maxFret = fretValues.length ? Math.max(...fretValues) : 0;
  if (maxFret - minFret > WINDOW - 1) return null;

  // Finger count. More than four fretted notes needs a barre at the lowest
  // fret, which only works if every string it crosses is fretted at or above it.
  let fingers = fretted.length;
  let barre = false;
  if (fingers > 4) {
    const atMin = fretted.filter((i) => frets[i] === minFret);
    const from = atMin[0];
    const to = atMin[atMin.length - 1];
    let ok = atMin.length >= 2;
    for (let i = from; i <= to; i++) {
      if (frets[i] === null || (frets[i] as number) < minFret) ok = false;
    }
    if (ok) {
      fingers = fingers - atMin.length + 1;
      barre = true;
    }
  }
  if (fingers > 4) return null;

  const opens = playedIdx.length - fretted.length;
  // Up the neck, keep shapes moveable: open strings only in open position.
  if (maxFret > WINDOW && opens > 0) return null;
  const mutes = frets.length - playedIdx.length;
  const optionalHit = [...pcs].filter((pc) => optionalPcs.has(pc)).length;
  const position = maxFret <= WINDOW ? 0 : minFret;

  const score =
    position * 1.3 +
    mutes * 1.1 +
    interiorMutes * 2 +
    fingers * 0.4 +
    (maxFret - minFret) * 0.5 -
    opens * 0.3 -
    optionalHit * 1 -
    playedIdx.length * 0.3 +
    (barre ? 0.6 : 0);

  return { frets: [...frets], score, minFret: maxFret <= WINDOW ? 0 : minFret };
}

/** Picks up to `count` good shapes spread across the neck. */
function pickSpread(cands: Candidate[], count: number): Candidate[] {
  const picked: Candidate[] = [];
  for (const c of cands) {
    if (picked.every((p) => Math.abs(p.minFret - c.minFret) >= 3)) picked.push(c);
    if (picked.length === count) break;
  }
  return picked;
}

function voicingName(frets: (number | null)[]): string {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const max = fretted.length ? Math.max(...fretted) : 0;
  if (max <= WINDOW) return frets.includes(0) ? "Open position" : "Position 1";
  return `Position ${Math.min(...fretted)}`;
}

const guitarCache = new Map<string, GuitarVoicing[]>();

/** Returns 2-3 real, playable fingering options for a chord — the "voicing picker". */
export function getGuitarVoicings(chord: ParsedChord): GuitarVoicing[] {
  const cacheKey = `${chord.root}:${chord.quality.suffix}`;
  const cached = guitarCache.get(cacheKey);
  if (cached) return cached;

  const voicings: GuitarVoicing[] = [];
  const isTriad = chord.quality.suffix === "" || chord.quality.suffix === "m";

  if (isTriad) {
    const openKey = `${NOTE_NAMES[chord.root]}${chord.quality.suffix}`;
    if (OPEN_GUITAR_CHORDS[openKey]) voicings.push({ name: "Open position", frets: OPEN_GUITAR_CHORDS[openKey] });
    voicings.push(eShapeBarre(chord));
    voicings.push(aShapeBarre(chord));
  } else if (chord.quality.suffix === "5") {
    // Power chords: the standard root–fifth–octave shapes on the E and A strings.
    const e = distanceFromE(chord.root);
    const a = distanceFromA(chord.root);
    voicings.push({ name: e === 0 ? "Open (E-string root)" : `E-string root (fret ${e})`, frets: [e, e + 2, e + 2, null, null, null] });
    voicings.push({ name: a === 0 ? "Open (A-string root)" : `A-string root (fret ${a})`, frets: [null, a, a + 2, a + 2, null, null] });
  } else {
    const found = pickSpread(searchShapes(chord, GUITAR_TUNING, { bassIsRoot: true, allStrings: false, maxPosition: 12 }), 3);
    found.forEach((c) => voicings.push({ name: voicingName(c.frets), frets: c.frets }));
  }

  // De-duplicate identical shapes (e.g. E major's open shape IS the E-shape barre at fret 0)
  const seen = new Set<string>();
  const unique = voicings.filter((v) => {
    const key = v.frets.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  guitarCache.set(cacheKey, unique);
  return unique;
}

/* ─── Ukulele ─── */

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

const ukuleleCache = new Map<string, (number | null)[]>();

export function getUkuleleShape(chord: ParsedChord): (number | null)[] {
  const tableKey = `${NOTE_NAMES[chord.root]}${chord.quality.suffix}`;
  if (UKULELE_CHORDS[tableKey]) return UKULELE_CHORDS[tableKey];

  const cached = ukuleleCache.get(tableKey);
  if (cached) return cached;
  // Four strings can't hold every tone of a big chord, so fall back the way
  // ukulele charts do: first drop the root, then allow a muted string.
  const attempts = [
    { allStrings: true },
    { allStrings: true, rootOptional: true },
    { allStrings: false },
  ];
  let shape: (number | null)[] = [0, 0, 0, 0];
  for (const attempt of attempts) {
    const best = searchShapes(chord, UKULELE_TUNING, { bassIsRoot: false, maxPosition: 10, ...attempt })[0];
    if (best) {
      shape = best.frets;
      break;
    }
  }
  ukuleleCache.set(tableKey, shape);
  return shape;
}
