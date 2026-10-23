/**
 * One registry of every instrument Wilsify knows, shared by the Tuner and the Chords page.
 *
 * An instrument is data, not a branch in the code: it says HOW it is tuned (`tunerMode`), HOW chords are
 * shown (`chordDisplayMode` / `chordRenderer`) and where its tuning data lives (`tuner`). Acoustic and
 * Electric Guitar point at the same tuning data; Piano, Keyboard, Organ and Synthesizer share one keyboard
 * renderer; Marimba and Xylophone share one mallet renderer. Chord theory itself is not here — see
 * lib/chordTheory.ts and lib/chords/theory.ts — renderers only decide how the notes are drawn and played.
 */

import { noteToMidi } from "../tuner/notes";

export type InstrumentCategory = "guitars" | "bass" | "folk" | "keys" | "mallet" | "wind" | "orchestral" | "chromatic";

/**
 * How the tuner treats the instrument.
 * - stringed: one string per peg;  coursed: strings come in pairs (12-string guitar, mandolin);
 * - harp: many diatonic strings, tuned by lever/pedal state;
 * - chromatic: any note (keys, voice);  mallet: struck bars — the attack is ignored;  reed: reeds with strong harmonics.
 */
export type TunerKind = "stringed" | "coursed" | "harp" | "chromatic" | "mallet" | "reed";

/** How chords are drawn. `none` = the instrument is Tuner-only (violin, viola, cello). */
export type ChordDisplayMode = "fretboard" | "strings" | "keyboard" | "harp" | "accordion" | "mallet" | "wind" | "harmonica" | "none";

/** Which renderer draws and plays the chord. Several instruments share one. */
export type ChordRenderer =
  | "guitar"
  | "guitar7"
  | "guitar12"
  | "ukulele"
  | "mandolin"
  | "banjo"
  | "cavaquinho"
  | "balalaika"
  | "bass"
  | "bowed"
  | "keyboard"
  | "harp"
  | "accordion"
  | "mallet"
  | "wind"
  | "harmonica";

/** Signal-processing profile for chromatic-style detection (see lib/tuner/profiles.ts). */
export type DetectionProfile = "default" | "keys" | "mallet" | "reed" | "harp";

export interface NoteRange {
  /** Scientific pitch names, e.g. "A0". */
  low: string;
  high: string;
}

export interface InstrumentDefinition {
  id: string;
  name: string;
  category: InstrumentCategory;
  /** Shown under the name in pickers. */
  blurb: string;
  tunerMode: TunerKind;
  chordDisplayMode: ChordDisplayMode;
  chordRenderer?: ChordRenderer;
  /** Where the tuning data lives (a TunerInstrument id in lib/tuner/tunings.ts and, optionally, a variant). */
  tuner?: { instrumentId: string; variantId?: string };
  /** Chromatic-style instruments: how the detector is configured. */
  profile?: DetectionProfile;
  stringCount?: number;
  courseCount?: number;
  /** Typical playing range — used to size the detection window, never to refuse a note. */
  range?: NoteRange;
  /** Honest limits shown to the player. */
  caveat?: string;
  /** Left-to-right order of the tuning is not low-to-high (banjo drone, re-entrant ukulele). */
  reentrant?: boolean;
  /** Transposing instrument: the written note is `semitones` above the note that sounds (B♭ clarinet: 2). `label` names the pitch ("B♭"). */
  transposition?: { semitones: number; label: string };
}

export const CATEGORY_LABEL: Record<InstrumentCategory, string> = {
  guitars: "Guitars",
  bass: "Bass",
  folk: "Folk / string",
  keys: "Keys",
  mallet: "Mallet",
  wind: "Wind",
  orchestral: "Orchestral strings",
  chromatic: "Chromatic",
};

export const CATEGORY_ORDER: InstrumentCategory[] = ["guitars", "bass", "folk", "keys", "mallet", "wind", "orchestral", "chromatic"];

const PIANO_CAVEAT = "A pitch-checking aid. Pianos are tuned with a stretched temperament; Wilsify compares against equal temperament and does not replace a professional piano tuner.";

export const INSTRUMENTS_DEFINITIONS: InstrumentDefinition[] = [
  /* Guitars */
  { id: "guitar", name: "Guitar", category: "guitars", blurb: "6 string, standard", tunerMode: "stringed", chordDisplayMode: "fretboard", chordRenderer: "guitar", tuner: { instrumentId: "guitar", variantId: "acoustic-6" }, stringCount: 6 },
  { id: "acoustic-guitar", name: "Acoustic Guitar", category: "guitars", blurb: "6 string", tunerMode: "stringed", chordDisplayMode: "fretboard", chordRenderer: "guitar", tuner: { instrumentId: "guitar", variantId: "acoustic-6" }, stringCount: 6 },
  { id: "electric-guitar", name: "Electric Guitar", category: "guitars", blurb: "6 string", tunerMode: "stringed", chordDisplayMode: "fretboard", chordRenderer: "guitar", tuner: { instrumentId: "guitar", variantId: "electric-6" }, stringCount: 6 },
  { id: "guitar-7", name: "7-String Guitar", category: "guitars", blurb: "B E A D G B E", tunerMode: "stringed", chordDisplayMode: "fretboard", chordRenderer: "guitar7", tuner: { instrumentId: "guitar", variantId: "guitar-7" }, stringCount: 7 },
  { id: "guitar-12", name: "12-String Guitar", category: "guitars", blurb: "6 courses, 12 strings", tunerMode: "coursed", chordDisplayMode: "fretboard", chordRenderer: "guitar12", tuner: { instrumentId: "guitar", variantId: "guitar-12" }, stringCount: 12, courseCount: 6 },
  /* Bass */
  { id: "bass", name: "Bass Guitar", category: "bass", blurb: "4, 5 and 6 string", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "bass", tuner: { instrumentId: "bass", variantId: "bass-4" }, stringCount: 4 },
  /* Folk / string */
  { id: "ukulele", name: "Ukulele", category: "folk", blurb: "G C E A, re-entrant", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "ukulele", tuner: { instrumentId: "ukulele" }, stringCount: 4, reentrant: true },
  { id: "mandolin", name: "Mandolin", category: "folk", blurb: "G D A E · 4 courses", tunerMode: "coursed", chordDisplayMode: "strings", chordRenderer: "mandolin", tuner: { instrumentId: "mandolin" }, stringCount: 8, courseCount: 4 },
  { id: "banjo", name: "Banjo", category: "folk", blurb: "5 string, high drone", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "banjo", tuner: { instrumentId: "banjo", variantId: "banjo-5" }, stringCount: 5, reentrant: true },
  { id: "cavaquinho", name: "Cavaquinho", category: "folk", blurb: "D G B D", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "cavaquinho", tuner: { instrumentId: "cavaquinho" }, stringCount: 4 },
  { id: "balalaika", name: "Balalaika", category: "folk", blurb: "Prima and other sizes", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "balalaika", tuner: { instrumentId: "balalaika", variantId: "balalaika-3" }, stringCount: 3 },
  {
    id: "harp", name: "Harp", category: "folk", blurb: "Lever, pedal or custom", tunerMode: "harp", chordDisplayMode: "harp", chordRenderer: "harp", tuner: { instrumentId: "harp" }, profile: "harp",
    range: { low: "C1", high: "G7" },
    caveat: "Harp tuning depends on the lever or pedal position. Tuning the lowest octaves by microphone needs a quiet room and has not been validated on a real harp.",
  },
  /* Keys */
  { id: "piano", name: "Piano", category: "keys", blurb: "Note check", tunerMode: "chromatic", chordDisplayMode: "keyboard", chordRenderer: "keyboard", profile: "keys", range: { low: "A0", high: "C8" }, caveat: PIANO_CAVEAT },
  { id: "keyboard", name: "Keyboard", category: "keys", blurb: "Note check", tunerMode: "chromatic", chordDisplayMode: "keyboard", chordRenderer: "keyboard", profile: "keys", range: { low: "C2", high: "C7" } },
  { id: "organ", name: "Organ", category: "keys", blurb: "Note check", tunerMode: "chromatic", chordDisplayMode: "keyboard", chordRenderer: "keyboard", profile: "keys", range: { low: "C2", high: "C7" } },
  { id: "synthesizer", name: "Synthesizer", category: "keys", blurb: "Check oscillator pitch", tunerMode: "chromatic", chordDisplayMode: "keyboard", chordRenderer: "keyboard", profile: "keys", range: { low: "C1", high: "C7" } },
  {
    id: "accordion", name: "Accordion", category: "keys", blurb: "Reed note check", tunerMode: "reed", chordDisplayMode: "accordion", chordRenderer: "accordion", profile: "reed", range: { low: "F3", high: "C7" },
    caveat: "Reeds are rich in harmonics, so Wilsify waits for a steadier reading. It is a note check, not a replacement for professional reed tuning, and has not been validated on a real accordion.",
  },
  /* Mallet */
  {
    id: "marimba", name: "Marimba", category: "mallet", blurb: "Bar note check", tunerMode: "mallet", chordDisplayMode: "mallet", chordRenderer: "mallet", profile: "mallet", range: { low: "C2", high: "C7" },
    caveat: "Strike a bar and let it ring — Wilsify ignores the first moment of the strike and reads the steadier ring-out.",
  },
  {
    id: "xylophone", name: "Xylophone", category: "mallet", blurb: "Bar note check", tunerMode: "mallet", chordDisplayMode: "mallet", chordRenderer: "mallet", profile: "mallet", range: { low: "F3", high: "C8" },
    caveat: "Strike a bar and let it ring — Wilsify ignores the first moment of the strike and reads the steadier ring-out.",
  },
  /* Wind — chord tones as notes (one note at a time); transposing instruments also show the written pitch */
  { id: "flute", name: "Flute", category: "wind", blurb: "Concert C", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "C4", high: "C7" } },
  { id: "piccolo", name: "Piccolo", category: "wind", blurb: "Sounds an octave above written", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "D5", high: "C8" } },
  { id: "recorder", name: "Recorder", category: "wind", blurb: "Soprano / descant in C", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "C5", high: "D7" } },
  { id: "tin-whistle", name: "Tin Whistle", category: "wind", blurb: "D whistle", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "D5", high: "B7" } },
  { id: "bansuri", name: "Bansuri", category: "wind", blurb: "Bamboo flute — notes by pitch", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "C4", high: "C6" }, caveat: "Bansuri flutes come in many sizes and keys. Notes here are the sounding pitches; match them to the flute you hold." },
  { id: "oboe", name: "Oboe", category: "wind", blurb: "Concert C", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "B♭3", high: "A6" } },
  { id: "clarinet", name: "Clarinet", category: "wind", blurb: "B♭ — reads a tone higher", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "D3", high: "G6" }, transposition: { semitones: 2, label: "B♭" } },
  { id: "bassoon", name: "Bassoon", category: "wind", blurb: "Concert C", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "B♭1", high: "E♭5" } },
  { id: "soprano-sax", name: "Soprano Saxophone", category: "wind", blurb: "B♭", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "A♭3", high: "E6" }, transposition: { semitones: 2, label: "B♭" } },
  { id: "alto-sax", name: "Alto Saxophone", category: "wind", blurb: "E♭ — reads a sixth higher", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "D♭3", high: "A5" }, transposition: { semitones: 9, label: "E♭" } },
  { id: "tenor-sax", name: "Tenor Saxophone", category: "wind", blurb: "B♭ — reads a ninth higher", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "A♭2", high: "E5" }, transposition: { semitones: 2, label: "B♭" } },
  { id: "baritone-sax", name: "Baritone Saxophone", category: "wind", blurb: "E♭ — reads a thirteenth higher", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "D♭2", high: "A4" }, transposition: { semitones: 9, label: "E♭" } },
  { id: "trumpet", name: "Trumpet", category: "wind", blurb: "B♭ — reads a tone higher", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "F♯3", high: "D6" }, transposition: { semitones: 2, label: "B♭" } },
  { id: "french-horn", name: "French Horn", category: "wind", blurb: "F — reads a fifth higher", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "B1", high: "F5" }, transposition: { semitones: 7, label: "F" } },
  { id: "trombone", name: "Trombone", category: "wind", blurb: "Concert pitch", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "E2", high: "F5" } },
  { id: "tuba", name: "Tuba", category: "wind", blurb: "Concert pitch", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "D1", high: "F4" } },
  {
    id: "harmonica", name: "Harmonica", category: "wind", blurb: "10-hole diatonic (Richter)", tunerMode: "chromatic", chordDisplayMode: "harmonica", chordRenderer: "harmonica", range: { low: "C4", high: "C7" },
    caveat: "Shows the holes you can blow or draw together on a standard 10-hole diatonic harmonica. Bends, overblows and tongue-blocking are not shown, and some chords have no clean hole group.",
  },
  /* Orchestral strings — fretless: chord finger positions as semitones above the open string */
  { id: "violin", name: "Violin", category: "orchestral", blurb: "G D A E", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "bowed", tuner: { instrumentId: "violin" }, stringCount: 4, caveat: "Violin-family instruments have no frets. Numbers show how many semitones above the open string to place a finger (first position) — set each finger by ear. The reference sound is a simple bowed-string tone, not a recording." },
  { id: "viola", name: "Viola", category: "orchestral", blurb: "C G D A", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "bowed", tuner: { instrumentId: "viola" }, stringCount: 4, caveat: "Violin-family instruments have no frets. Numbers show how many semitones above the open string to place a finger (first position) — set each finger by ear. The reference sound is a simple bowed-string tone, not a recording." },
  { id: "cello", name: "Cello", category: "orchestral", blurb: "C G D A", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "bowed", tuner: { instrumentId: "cello" }, stringCount: 4, caveat: "Violin-family instruments have no frets. Numbers show how many semitones above the open string to place a finger (first position) — set each finger by ear. The reference sound is a simple bowed-string tone, not a recording." },
  /* Chromatic */
  { id: "chromatic", name: "Chromatic", category: "chromatic", blurb: "Any note — voice, piano, anything", tunerMode: "chromatic", chordDisplayMode: "none", profile: "default" },
];

export function findDefinition(id: string | undefined): InstrumentDefinition | undefined {
  return INSTRUMENTS_DEFINITIONS.find((d) => d.id === id);
}

/** Instruments the Chords page can draw. */
export function chordInstruments(): InstrumentDefinition[] {
  return INSTRUMENTS_DEFINITIONS.filter((d) => d.chordDisplayMode !== "none");
}

/** The Tuner is for string instruments: keys, mallets and wind instruments are left out (Chromatic still checks any note). */
const NOT_TUNED_HERE: InstrumentCategory[] = ["keys", "mallet", "wind"];

/** Instruments the Tuner offers: every string instrument, plus Chromatic. */
export function tunerInstruments(): InstrumentDefinition[] {
  return INSTRUMENTS_DEFINITIONS.filter((d) => !NOT_TUNED_HERE.includes(d.category));
}

/** The renderer that draws and plays chords for an instrument (undefined for Tuner-only instruments). */
export function rendererFor(def: InstrumentDefinition): ChordRenderer | undefined {
  return def.chordDisplayMode === "none" ? undefined : def.chordRenderer;
}

export function groupByCategory(defs: InstrumentDefinition[]): { category: InstrumentCategory; label: string; items: InstrumentDefinition[] }[] {
  return CATEGORY_ORDER.map((category) => ({ category, label: CATEGORY_LABEL[category], items: defs.filter((d) => d.category === category) })).filter((g) => g.items.length);
}

/** Detection window for a chromatic-style instrument, from its typical range (a little wider on both ends). */
export function detectionWindow(def: InstrumentDefinition, a4 = 440): { fmin: number; fmax: number } {
  if (!def.range) return { fmin: 30, fmax: 2100 };
  const lo = noteToMidi(def.range.low);
  const hi = noteToMidi(def.range.high);
  if (lo === null || hi === null) return { fmin: 30, fmax: 2100 };
  const f = (m: number) => a4 * Math.pow(2, (m - 69) / 12);
  return { fmin: Math.max(24, f(lo) * 0.9), fmax: Math.min(4300, f(hi) * 1.05) };
}

/** Does `def` match what the player typed? Matches the name, the blurb and the category ("keys", "mallet"…). */
export function matchesInstrument(def: InstrumentDefinition, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [def.name, def.blurb, CATEGORY_LABEL[def.category]].some((t) => t.toLowerCase().includes(q));
}

