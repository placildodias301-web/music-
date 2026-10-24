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

export type InstrumentCategory = "guitars" | "bass" | "folk" | "world" | "keys" | "mallet" | "percussion" | "wind" | "orchestral" | "chromatic";

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
  | "guitar8"
  | "bouzouki"
  | "charango"
  | "cuatro"
  | "tres"
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
export type DetectionProfile = "default" | "keys" | "mallet" | "reed" | "harp" | "bowed" | "brass" | "wind" | "drum";

export interface NoteRange {
  /** Scientific pitch names, e.g. "A0". */
  low: string;
  high: string;
}

export interface RawInstrumentDefinition {
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
  /** Honest limits shown to the player, on the Tuner and on the Chords page (about the instrument itself or its tuning). */
  caveat?: string;
  /** Limits that only matter for how chords are shown for this instrument (fretless diagrams, notes-only display). Chords page only. */
  chordCaveat?: string;
  /** Violin family: no frets. Diagrams show a plain fingerboard with notes spaced by pitch, not fret lines or fret numbers. */
  fretless?: boolean;
  /** Left-to-right order of the tuning is not low-to-high (banjo drone, re-entrant ukulele). */
  reentrant?: boolean;
  /** Transposing instrument: the written note is `semitones` above the note that sounds (B♭ clarinet: 2). `label` names the pitch ("B♭"). */
  transposition?: { semitones: number; label: string };
  /** Overrides for the derived metadata below, for the few instruments that differ from their family. */
  meta?: Partial<InstrumentMeta>;
}

/**
 * What kind of tuning the instrument has:
 * strings = tuned string by string · percussion = a drum or bar set tuned to a pitch · wind = the player adjusts intonation ·
 * drone = a drone instrument tuned to the tonic · electronic = no physical tuning · fixed_pitch = tuned by a technician, not the player.
 */
export type TuningType = "strings" | "percussion" | "wind" | "drone" | "electronic" | "fixed_pitch";

/** How well a feature fits the instrument. "specialized" = a different, instrument-appropriate presentation, not the guitar one. */
export type SupportLevel = "full" | "limited" | "specialized" | "none";

/** What an instrument offers each page. Derived from its data (see `withMeta`) so the lists on every page come from ONE place. */
export interface InstrumentMeta {
  region: string;
  /** Does the player normally tune it (strings, drums, drone instruments, winds' intonation)? */
  requiresTuning: boolean;
  tuningType: TuningType;
  /** "equal" = Western equal temperament; "traditional" = the real tuning is traditional/raga/maqam-based and the app's notes are an approximation. */
  temperament: "equal" | "traditional";
  chordSupport: SupportLevel;
  tunerSupport: SupportLevel;
  fretboardSupport: SupportLevel;
  /** model = the app has a sound model for it; reference-tone = only a plain tuning tone; none = silent. */
  audioSupport: "model" | "reference-tone" | "none";
  chordSupported: boolean;
  tunerSupported: boolean;
  fretboardSupported: boolean;
  audioSupported: boolean;
}

export type InstrumentDefinition = RawInstrumentDefinition & InstrumentMeta;

export const CATEGORY_LABEL: Record<InstrumentCategory, string> = {
  guitars: "Guitars",
  bass: "Bass",
  folk: "Folk / string",
  world: "World / traditional",
  keys: "Keys",
  mallet: "Mallet",
  percussion: "Percussion",
  wind: "Wind",
  orchestral: "Orchestral strings",
  chromatic: "Chromatic",
};

export const CATEGORY_ORDER: InstrumentCategory[] = ["guitars", "bass", "folk", "world", "keys", "mallet", "percussion", "wind", "orchestral", "chromatic"];

const PIANO_CAVEAT = "A pitch-checking aid. Pianos are tuned with a stretched temperament; Wilsify compares against equal temperament and does not replace a professional piano tuner.";

const RAW_INSTRUMENTS: RawInstrumentDefinition[] = [
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
  { id: "piano", name: "Piano", category: "keys", meta: { tunerSupport: "specialized" }, blurb: "Note check", tunerMode: "chromatic", chordDisplayMode: "keyboard", chordRenderer: "keyboard", profile: "keys", range: { low: "A0", high: "C8" }, caveat: PIANO_CAVEAT },
  { id: "keyboard", name: "Keyboard", category: "keys", blurb: "Note check", tunerMode: "chromatic", chordDisplayMode: "keyboard", chordRenderer: "keyboard", profile: "keys", range: { low: "C2", high: "C7" } },
  { id: "organ", name: "Organ", category: "keys", blurb: "Note check", tunerMode: "chromatic", chordDisplayMode: "keyboard", chordRenderer: "keyboard", profile: "keys", range: { low: "C2", high: "C7" } },
  { id: "synthesizer", name: "Synthesizer", category: "keys", blurb: "Check oscillator pitch", tunerMode: "chromatic", chordDisplayMode: "keyboard", chordRenderer: "keyboard", profile: "keys", range: { low: "C1", high: "C7" } },
  {
    id: "accordion", name: "Accordion", category: "keys", blurb: "Reed note check", tunerMode: "reed", chordDisplayMode: "accordion", chordRenderer: "accordion", profile: "reed", range: { low: "F3", high: "C7" },
    caveat: "Reeds are rich in harmonics, so Wilsify waits for a steadier reading. It is a note check, not a replacement for professional reed tuning, and has not been validated on a real accordion.",
  },
  /* Mallet */
  {
    id: "marimba", name: "Marimba", category: "mallet", meta: { tunerSupport: "specialized" }, blurb: "Bar note check", tunerMode: "mallet", chordDisplayMode: "mallet", chordRenderer: "mallet", profile: "mallet", range: { low: "C2", high: "C7" },
    caveat: "Strike a bar and let it ring — Wilsify ignores the first moment of the strike and reads the steadier ring-out.",
  },
  {
    id: "xylophone", name: "Xylophone", category: "mallet", meta: { tunerSupport: "specialized" }, blurb: "Bar note check", tunerMode: "mallet", chordDisplayMode: "mallet", chordRenderer: "mallet", profile: "mallet", range: { low: "F3", high: "C8" },
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
  { id: "violin", name: "Violin", category: "orchestral", fretless: true, blurb: "G D A E", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "bowed", tuner: { instrumentId: "violin" }, stringCount: 4, chordCaveat: "Violin-family instruments have no frets: there is nothing on the neck to press against, so each finger is placed by ear and by feel. The diagrams show where the notes sit along the fingerboard (spaced by pitch, closer together toward the bridge). Chords are played as rolled or double stops. The sound is a simple bowed-string tone, not a recording." },
  { id: "viola", name: "Viola", category: "orchestral", fretless: true, blurb: "C G D A", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "bowed", tuner: { instrumentId: "viola" }, stringCount: 4, chordCaveat: "Violin-family instruments have no frets: there is nothing on the neck to press against, so each finger is placed by ear and by feel. The diagrams show where the notes sit along the fingerboard (spaced by pitch, closer together toward the bridge). Chords are played as rolled or double stops. The sound is a simple bowed-string tone, not a recording." },
  { id: "cello", name: "Cello", category: "orchestral", fretless: true, blurb: "C G D A", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "bowed", tuner: { instrumentId: "cello" }, stringCount: 4, chordCaveat: "Violin-family instruments have no frets: there is nothing on the neck to press against, so each finger is placed by ear and by feel. The diagrams show where the notes sit along the fingerboard (spaced by pitch, closer together toward the bridge). Chords are played as rolled or double stops. The sound is a simple bowed-string tone, not a recording." },
  /* More string instruments: classical and 8-string guitar, double bass, folk and world instruments */
  { id: "classical-guitar", name: "Classical Guitar", category: "guitars", blurb: "Nylon string, 6 string", tunerMode: "stringed", chordDisplayMode: "fretboard", chordRenderer: "guitar", tuner: { instrumentId: "guitar", variantId: "classical-6" }, stringCount: 6, meta: { region: "Spain" } },
  { id: "guitar-8", name: "8-String Guitar", category: "guitars", blurb: "F♯ B E A D G B E", tunerMode: "stringed", chordDisplayMode: "fretboard", chordRenderer: "guitar8", tuner: { instrumentId: "guitar", variantId: "guitar-8" }, stringCount: 8 },
  { id: "double-bass", name: "Double Bass", category: "orchestral", fretless: true, blurb: "E A D G", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "bass", tuner: { instrumentId: "double-bass", variantId: "db-4" }, stringCount: 4, chordCaveat: "The double bass has no frets. Numbers on the diagram are semitones above the open string; place each finger by ear." },
  { id: "bouzouki", name: "Bouzouki", category: "folk", blurb: "Greek and Irish · courses", tunerMode: "coursed", chordDisplayMode: "strings", chordRenderer: "bouzouki", tuner: { instrumentId: "bouzouki", variantId: "bouzouki-8" }, stringCount: 8, courseCount: 4, meta: { region: "Greece / Ireland" } },
  { id: "charango", name: "Charango", category: "folk", blurb: "5 courses · Andean", tunerMode: "coursed", chordDisplayMode: "strings", chordRenderer: "charango", tuner: { instrumentId: "charango", variantId: "charango-10" }, stringCount: 10, courseCount: 5, reentrant: true, meta: { region: "Andes" } },
  { id: "cuatro", name: "Cuatro", category: "folk", blurb: "Venezuelan, re-entrant", tunerMode: "stringed", chordDisplayMode: "strings", chordRenderer: "cuatro", tuner: { instrumentId: "cuatro", variantId: "cuatro-4" }, stringCount: 4, reentrant: true, meta: { region: "Venezuela" } },
  { id: "tres", name: "Tres", category: "folk", blurb: "Cuban · 3 courses", tunerMode: "coursed", chordDisplayMode: "strings", chordRenderer: "tres", tuner: { instrumentId: "tres", variantId: "tres-6" }, stringCount: 6, courseCount: 3, meta: { region: "Cuba" } },
  {
    id: "oud", name: "Oud", category: "world", fretless: true, blurb: "Arabic · fretless, 11 strings", tunerMode: "coursed", chordDisplayMode: "wind", chordRenderer: "wind", tuner: { instrumentId: "oud", variantId: "oud-11" }, stringCount: 11, courseCount: 6, range: { low: "C2", high: "C5" },
    caveat: "The tuning is pitch-relative: players tune the whole set to the singer or ensemble.",
    chordCaveat: "The oud is fretless and played melodically in maqam, not in chord shapes, so chords are shown as the notes to play one at a time.",
    meta: { region: "Middle East", temperament: "traditional", chordSupport: "specialized", audioSupport: "model" },
  },
  {
    id: "sitar", name: "Sitar", category: "world", blurb: "Sa-based · playing strings", tunerMode: "stringed", chordDisplayMode: "wind", chordRenderer: "wind", tuner: { instrumentId: "sitar", variantId: "sitar-7" }, stringCount: 7, range: { low: "C2", high: "C6" },
    caveat: "The tuning shown is a Western equal-temperament approximation of a Sa-based layout; players adjust it by ear and by raga.",
    chordCaveat: "The sitar is not played in chords: it is a melodic and drone instrument with movable frets. Chords are shown as the notes to play one at a time.",
    meta: { region: "South Asia", temperament: "traditional", chordSupport: "specialized", fretboardSupport: "specialized", audioSupport: "model" },
  },
  { id: "tanpura", name: "Tanpura", category: "world", blurb: "Drone · tuned to Sa", tunerMode: "stringed", chordDisplayMode: "none", tuner: { instrumentId: "tanpura", variantId: "tanpura-pa" }, stringCount: 4, meta: { region: "South Asia", tuningType: "drone", temperament: "traditional" } },
  { id: "erhu", name: "Erhu", category: "world", fretless: true, blurb: "D A · bowed, 2 strings", tunerMode: "stringed", chordDisplayMode: "none", tuner: { instrumentId: "erhu", variantId: "erhu-2" }, stringCount: 2, meta: { region: "East Asia" } },
  { id: "tabla", name: "Tabla", category: "percussion", blurb: "Dayan tuned to Sa", tunerMode: "chromatic", chordDisplayMode: "none", tuner: { instrumentId: "tabla", variantId: "dayan" }, stringCount: 1, meta: { region: "South Asia", tuningType: "percussion", temperament: "traditional", requiresTuning: true, tunerSupport: "specialized" } },
  { id: "timpani", name: "Timpani", category: "percussion", blurb: "Tuned drums", tunerMode: "mallet", chordDisplayMode: "none", profile: "mallet", range: { low: "D2", high: "C4" }, caveat: "Timpani are tuned to the note the music asks for: strike the head, let it ring, and tune to the target shown.", meta: { tuningType: "percussion", requiresTuning: true, tunerSupport: "specialized" } },
  { id: "vibraphone", name: "Vibraphone", category: "mallet", blurb: "Bar note check", tunerMode: "mallet", chordDisplayMode: "mallet", chordRenderer: "mallet", profile: "mallet", range: { low: "F3", high: "F6" }, caveat: "Strike a bar and let it ring — Wilsify ignores the first moment of the strike and reads the steadier ring-out.", meta: { tunerSupport: "specialized" } },
  /* Brass and winds added for the intonation tuner */
  { id: "euphonium", name: "Euphonium", category: "wind", blurb: "B♭ · concert pitch", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "E2", high: "B♭4" } },
  { id: "cornet", name: "Cornet", category: "wind", blurb: "B♭ — reads a tone higher", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "F♯3", high: "D6" }, transposition: { semitones: 2, label: "B♭" } },
  { id: "shakuhachi", name: "Shakuhachi", category: "wind", blurb: "Japanese end-blown flute", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "D4", high: "D6" }, caveat: "Shakuhachi come in several lengths and pitches. The tuner reads the pitch you play; it does not assume one length.", meta: { region: "Japan" } },
  { id: "dizi", name: "Dizi", category: "wind", blurb: "Chinese bamboo flute", tunerMode: "chromatic", chordDisplayMode: "wind", chordRenderer: "wind", range: { low: "C4", high: "C7" }, caveat: "Dizi are made in several keys (C, D, G and others). The tuner reads the pitch you play; it does not assume one key.", meta: { region: "China" } },
  /* Hand drums and drum heads */
  { id: "bayan", name: "Bayan (tabla bass drum)", category: "percussion", blurb: "Pitch range — no fixed note", tunerMode: "mallet", chordDisplayMode: "none", profile: "drum", range: { low: "F1", high: "G3" }, caveat: "The bayan has no fixed note: its pitch is adjusted by the player and by the weight of the head. The tuner shows the pitch it hears and how steady it is.", meta: { region: "South Asia", tuningType: "percussion", requiresTuning: true, temperament: "traditional", tunerSupport: "specialized" } },
  { id: "mridangam", name: "Mridangam", category: "percussion", blurb: "Right head tuned to Sa", tunerMode: "chromatic", chordDisplayMode: "none", profile: "drum", tuner: { instrumentId: "mridangam", variantId: "right-head" }, stringCount: 1, meta: { region: "South India", tuningType: "percussion", temperament: "traditional", requiresTuning: true, tunerSupport: "specialized" } },
  { id: "pakhawaj", name: "Pakhawaj", category: "percussion", blurb: "Right head tuned to Sa", tunerMode: "chromatic", chordDisplayMode: "none", profile: "drum", tuner: { instrumentId: "pakhawaj", variantId: "right-head" }, stringCount: 1, meta: { region: "North India", tuningType: "percussion", temperament: "traditional", requiresTuning: true, tunerSupport: "specialized" } },
  { id: "dholak", name: "Dholak", category: "percussion", blurb: "Hand drum · tuned by ear", tunerMode: "mallet", chordDisplayMode: "none", profile: "drum", range: { low: "C2", high: "C4" }, caveat: "A dholak is tuned by wedges or ropes to suit the singer or the song, so there is no fixed target. The tuner shows the pitch of the head and how steady it is.", meta: { region: "South Asia", tuningType: "percussion", requiresTuning: true, tunerSupport: "specialized" } },
  { id: "tunable-drum", name: "Tunable drum (tom / snare)", category: "percussion", blurb: "Drum-head pitch, lug by lug", tunerMode: "mallet", chordDisplayMode: "none", profile: "drum", range: { low: "C2", high: "C5" }, caveat: "A drum head has no standard pitch. The tuner reads the fundamental of the head and compares lugs relative to each other.", meta: { tuningType: "percussion", requiresTuning: true, tunerSupport: "specialized" } },
  /* Indian string instruments without a single standard tuning: a note check with a Sa reference, not an invented preset */
  { id: "sarod", name: "Sarod", category: "world", fretless: true, blurb: "Tunings vary by gharana and raga", tunerMode: "chromatic", chordDisplayMode: "none", caveat: "Sarod tunings differ by gharana, raga and the player's Sa, so Wilsify does not assume one. Play a reference Sa, then check each string against the note you want.", meta: { region: "South Asia", temperament: "traditional", requiresTuning: true, tunerSupport: "specialized", tuningType: "strings" } },
  { id: "veena", name: "Veena", category: "world", blurb: "Tunings vary by tradition and Sa", tunerMode: "chromatic", chordDisplayMode: "none", caveat: "Veena tuning depends on the type of veena and the player's Sa, so Wilsify does not assume one. Play a reference Sa, then check each string against the note you want.", meta: { region: "South India", temperament: "traditional", requiresTuning: true, tunerSupport: "specialized", tuningType: "strings" } },
  { id: "santoor", name: "Santoor", category: "world", blurb: "Many strings · tuned by scale", tunerMode: "chromatic", chordDisplayMode: "none", caveat: "A santoor has dozens of strings tuned to the scale the player needs, so Wilsify does not assume one. Check each string against the note you want.", meta: { region: "Kashmir / Persia", temperament: "traditional", requiresTuning: true, tunerSupport: "specialized", tuningType: "strings" } },
  { id: "sarangi", name: "Sarangi", category: "world", fretless: true, blurb: "Tunings vary by tradition and Sa", tunerMode: "chromatic", chordDisplayMode: "none", caveat: "Sarangi tuning depends on the tradition and the player's Sa, so Wilsify does not assume one. Play a reference Sa, then check each string against the note you want.", meta: { region: "North India", temperament: "traditional", requiresTuning: true, tunerSupport: "specialized", tuningType: "strings" } },
  /* Chromatic */
  { id: "chromatic", name: "Chromatic", category: "chromatic", blurb: "Any note — voice, piano, anything", tunerMode: "chromatic", chordDisplayMode: "none", profile: "default" },
];

/* ─── Metadata: derived from the data above, with explicit overrides, so every page lists instruments from ONE source ─── */

const STRING_CATEGORIES: InstrumentCategory[] = ["guitars", "bass", "folk", "world", "orchestral"];

/** Where an instrument comes from, when not simply "Western". */
const REGIONS: Record<string, string> = {
  mandolin: "Italy", banjo: "United States", cavaquinho: "Portugal / Brazil", balalaika: "Russia", ukulele: "Hawaii", harp: "Worldwide",
  accordion: "Europe", harmonica: "Worldwide", bansuri: "South Asia", "tin-whistle": "Ireland",
};

function withMeta(raw: RawInstrumentDefinition): InstrumentDefinition {
  const strings = STRING_CATEGORIES.includes(raw.category) || raw.id === "harp";
  const hasTunerData = Boolean(raw.tuner);

  const tuningType: TuningType =
    raw.category === "wind" ? "wind"
    : raw.category === "percussion" || raw.category === "mallet" ? "percussion"
    : raw.id === "synthesizer" || raw.category === "chromatic" ? "electronic"
    : raw.category === "keys" && raw.id !== "harp" ? "fixed_pitch"
    : "strings";

  const chordSupport: SupportLevel =
    raw.chordDisplayMode === "none" ? "none"
    : raw.chordDisplayMode === "wind" || raw.chordDisplayMode === "harmonica" ? "limited"
    : "full";

  const tunerSupport: SupportLevel =
    raw.id === "chromatic" ? "full"
    : hasTunerData ? "full"
    : raw.category === "wind" ? "specialized" // player intonation, not string tuning
    : "none";

  const fretboardSupport: SupportLevel =
    (raw.chordDisplayMode === "fretboard" || raw.chordDisplayMode === "strings") && !raw.fretless ? "full"
    : (raw.chordDisplayMode === "fretboard" || raw.chordDisplayMode === "strings") && raw.fretless ? "specialized"
    : "none";

  const derived: Omit<InstrumentMeta, "chordSupported" | "tunerSupported" | "fretboardSupported" | "audioSupported"> = {
    region: REGIONS[raw.id] ?? "Western",
    // Winds are "tuned" by the player's intonation; mallets and keys are set by the maker/technician.
    requiresTuning: strings || raw.category === "wind" || raw.id === "harp",
    tuningType,
    temperament: "equal",
    chordSupport,
    tunerSupport,
    fretboardSupport,
    audioSupport: chordSupport !== "none" ? "model" : tunerSupport !== "none" || hasTunerData ? "reference-tone" : "none",
  };
  const m = { ...derived, ...raw.meta };
  return {
    ...raw,
    ...m,
    chordSupported: m.chordSupport !== "none" && raw.chordDisplayMode !== "none",
    tunerSupported: m.tunerSupport !== "none",
    fretboardSupported: m.fretboardSupport !== "none",
    audioSupported: m.audioSupport !== "none",
  };
}

export const INSTRUMENTS_DEFINITIONS: InstrumentDefinition[] = RAW_INSTRUMENTS.map(withMeta);

export function findDefinition(id: string | undefined): InstrumentDefinition | undefined {
  return INSTRUMENTS_DEFINITIONS.find((d) => d.id === id);
}

/** Instruments the Chords page offers: those with a chord presentation that makes musical sense for them. */
export function chordInstruments(): InstrumentDefinition[] {
  return INSTRUMENTS_DEFINITIONS.filter((d) => d.chordSupported);
}

/**
 * Instruments the Tuner offers: every string instrument and drum that is tuned, the chromatic tuner, winds (as player intonation
 * against concert pitch) and bar/drum instruments where checking pitch makes sense. NOT pianos, keyboards, organs, accordions or
 * synthesizers — those are set by a technician or have no physical tuning.
 */
export function tunerInstruments(): InstrumentDefinition[] {
  return INSTRUMENTS_DEFINITIONS.filter((d) => d.tunerSupported);
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


/**
 * The ONE instrument database. Every page and engine asks it: the Chords page, the Tuner, the audio engine, the fretboard.
 * `InstrumentRegistry.get("guitar")` gives the instrument's tuning data, chord representation, support flags and sound together.
 */
export const InstrumentRegistry = {
  get: findDefinition,
  all: (): InstrumentDefinition[] => INSTRUMENTS_DEFINITIONS,
  forChords: chordInstruments,
  forTuner: tunerInstruments,
  forFretboard: (): InstrumentDefinition[] => INSTRUMENTS_DEFINITIONS.filter((d) => d.fretboardSupported),
  forAudio: (): InstrumentDefinition[] => INSTRUMENTS_DEFINITIONS.filter((d) => d.audioSupported),
  byRegion: (region: string): InstrumentDefinition[] => INSTRUMENTS_DEFINITIONS.filter((d) => d.region === region),
};
