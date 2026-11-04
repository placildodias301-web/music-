/**
 * Core Music Data Types — Phase 1 Music Data Foundation
 * 
 * Machine-readable structures establishing strict separation between:
 * - Theoretical spelling and internal pitch-class calculations
 * - Pure music theory and physical instrument realizations
 * - Acoustic physics (Hz, cents) and symbolic representations
 */

// ─── Pitch & Physics ─────────────────────────────────────────────────────────

export type StandardTuningReferenceHz = number; // e.g., 440 Hz for A4

export interface Pitch {
  /** MIDI note number (0 - 127). Decimal allowed for microtonal fractional MIDI */
  midi: number;
  /** Exact frequency in Hertz */
  frequencyHz: number;
  /** Cents deviation from the nearest equal-tempered MIDI note (-50 to +50) */
  centsOffset: number;
  /** Reference frequency of A4 used for calculation (default 440) */
  referenceA4: StandardTuningReferenceHz;
}

/** Pitch Class (0 = C, 1 = C#/Db, ..., 11 = B) */
export type PitchClassNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface PitchClass {
  classNumber: PitchClassNumber;
  preferredName: string;
  isAccidental: boolean;
}

// ─── Notes & Spelling ────────────────────────────────────────────────────────

export type DiatonicLetter = "C" | "D" | "E" | "F" | "G" | "A" | "B";

export type AccidentalSymbol = "𝄫" | "♭" | "♮" | "♯" | "𝄪" | "bb" | "b" | "" | "#" | "##" | "x";

export type AccidentalAlteration = -2 | -1 | 0 | 1 | 2; // in semitones

export interface NoteSpelling {
  letter: DiatonicLetter;
  accidental: AccidentalSymbol;
  alteration: AccidentalAlteration;
  octave: number; // e.g., 4 in C4
}

export interface Note {
  /** Theoretical spelling (e.g., { letter: "C", accidental: "♯", octave: 4 }) */
  spelling: NoteSpelling;
  /** Scientific Pitch Notation (e.g. "C#4", "Db4", "F##3", "Ebb5") */
  scientificName: string;
  /** Modulo-12 pitch class (0-11) */
  pitchClass: PitchClassNumber;
  /** Corresponding pitch physics */
  pitch: Pitch;
}

// ─── Intervals ───────────────────────────────────────────────────────────────

export type IntervalQuality = 
  | "perfect" 
  | "major" 
  | "minor" 
  | "diminished" 
  | "augmented" 
  | "doubly_diminished" 
  | "doubly_augmented";

export interface Interval {
  /** Generic diatonic degree span (1 = unison, 2 = 2nd, 3 = 3rd, ..., 7 = 7th, 9 = 9th, 11 = 11th, 13 = 13th) */
  degree: number;
  /** Quality of the interval */
  quality: IntervalQuality;
  /** Distance in semitones */
  semitones: number;
  /** Standard abbreviated symbol (e.g. "P1", "m3", "M3", "P5", "m7", "M7", "b9", "#11") */
  shortName: string;
  /** Full name (e.g. "Minor 3rd", "Augmented 4th", "Perfect 5th") */
  fullName: string;
  /** Whether the interval exceeds an octave (> 12 semitones) */
  isCompound: boolean;
  /** Functional description in harmony */
  harmonicRole?: string;
}

// ─── Chord Formulas & Instances ──────────────────────────────────────────────

export type ChordQualityFamily =
  | "major"
  | "minor"
  | "diminished"
  | "augmented"
  | "suspended"
  | "power"
  | "dominant"
  | "altered"
  | "non_tertian";

export interface ChordFormula {
  /** Unique formula ID (e.g. "major", "m7", "7#9", "sus4") */
  id: string;
  canonicalName: string;
  family: ChordQualityFamily;
  symbolSuffix: string;
  aliases: string[];
  /** Scale degrees relative to major scale (e.g. ["1", "3", "5"], ["1", "b3", "5", "b7"]) */
  scaleDegrees: string[];
  /** Semitone offsets from the root (e.g. [0, 4, 7], [0, 3, 7, 10]) */
  semitoneOffsets: number[];
  /** Semitone indices that are optional in performance (e.g. 5th [7] in 7th/9th chords) */
  optionalSemitones: number[];
  /** Notes typically avoided in voice leading or over-clashing */
  avoidNotes?: string[];
  /** Standard harmonic context / resolution target */
  defaultHarmonicRole?: string;
}

export interface ChordInstance {
  root: Note;
  formula: ChordFormula;
  canonicalSymbol: string;
  displayName: string;
  /** Correctly spelled notes of the chord in root position */
  spelledNotes: Note[];
  /** Pitch classes involved */
  pitchClasses: PitchClassNumber[];
  /** Intervals relative to the root */
  intervals: Interval[];
  /** Inversion: 0 = root position, 1 = 1st, 2 = 2nd, 3 = 3rd */
  inversion: number;
  /** The actual lowest sounding note (spelled bass) */
  bassNote: Note;
  /** Is this a slash chord where bass != root? */
  isSlashChord: boolean;
}

// ─── Scales & Keys ───────────────────────────────────────────────────────────

export type ScaleCategory =
  | "diatonic"
  | "modes_major"
  | "melodic_minor"
  | "harmonic_minor"
  | "pentatonic"
  | "blues"
  | "symmetric"
  | "world_modal";

export interface ScaleDefinitionModel {
  id: string;
  name: string;
  category: ScaleCategory;
  intervals: number[]; // semitone offsets
  formula: string[]; // degree symbols (e.g. ["1", "2", "b3", "4", "5", "b6", "b7"])
  description: string;
  aliases?: string[];
}

export interface ScaleInstance {
  definition: ScaleDefinitionModel;
  root: Note;
  spelledNotes: Note[];
  pitchClasses: PitchClassNumber[];
}

export interface KeySignature {
  accidental: "♯" | "♭" | "♮";
  count: number;
  alteredNotes: string[];
}

export interface Key {
  tonic: Note;
  mode: "major" | "minor";
  name: string;
  keySignature: KeySignature;
  relativeKey: string;
  parallelKey: string;
  diatonicScale: ScaleInstance;
}

// ─── Tunings & Voicings ──────────────────────────────────────────────────────

export interface TuningString {
  stringNumber: number; // 1 = highest physical string or standard 1-index
  courseIndex?: number;
  canonicalName: string;
  targetNote: Note;
  targetMidi: number;
  frequencyHz: number;
  centsOffset: number;
}

export interface TuningModel {
  id: string;
  instrumentId: string;
  name: string;
  strings: TuningString[];
  isStandard: boolean;
  isReentrant: boolean;
  droneStringIndex?: number;
}

export type VoicingType =
  | "close"
  | "open"
  | "drop2"
  | "drop3"
  | "shell"
  | "rootless"
  | "spread"
  | "quartal"
  | "quintal"
  | "upper_structure";

export interface PlayedTone {
  stringIndex: number; // 0 = lowest sounding string or pitch
  fretNumber: number | null; // null = muted, 0 = open, >0 = fretted
  note: Note;
  interval: Interval;
  finger: number | null; // 1=index, 2=middle, 3=ring, 4=pinky, 0=thumb, null=none
  isBarre: boolean;
}

export interface InstrumentVoicing {
  chord: ChordInstance;
  instrumentId: string;
  tuningId: string;
  voicingType: VoicingType;
  tones: PlayedTone[];
  mutedStrings: number[];
  bassStringIndex: number;
  highestStringIndex: number;
  fretSpan: number; // difference between highest and lowest non-zero fret
  minFret: number;
  maxFret: number;
  isPlayable: boolean;
  difficultyRating: 1 | 2 | 3 | 4 | 5;
}

// ─── Instrument Constraints & Audio Assets ───────────────────────────────────

export interface InstrumentConstraints {
  polyphony: number;
  maxFretSpan: number;
  canPlayChords: boolean;
  hasOpenStrings: boolean;
  isFretless: boolean;
  isReentrant: boolean;
  range: {
    lowestMidi: number;
    highestMidi: number;
  };
}

export type AudioAssetProvider = "physical-string" | "synth-recipe" | "sample" | "none";

export type AudioHonestyStatus =
  | "professional_sample"
  | "licensed_sample"
  | "verified_open_sample"
  | "synthesized"
  | "unavailable";

export interface AudioAssetDescriptor {
  id: string;
  instrumentId: string;
  provider: AudioAssetProvider;
  status: AudioHonestyStatus;
  isPhysicalModel: boolean;
  license?: string;
  attribution?: string;
  sourceUrl?: string;
  sampleRateHz: number;
}
