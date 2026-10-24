/**
 * Instrument tuner profiles: what KIND of tuning an instrument has, and everything the tuner page and the detector need to know
 * to handle it. One shared engine (engine.ts) does the listening; the profile decides how it listens (detection strategy), what it
 * compares against (targets), what the player sees (UI configuration) and what the words mean (terminology).
 *
 *   registry (InstrumentDefinition)  →  InstrumentTunerProfile  →  engine config + page layout
 *
 * Nothing here is a separate implementation per instrument: profiles are derived from the instrument database, with explicit
 * tables only for the few facts that cannot be derived (which instruments are brass, which are bowed, which transpose how).
 */

import { findDefinition, type DetectionProfile, type InstrumentDefinition, type NoteRange } from "../instruments/definitions";
import { noteToMidi } from "./notes";

/** Which tuner the player gets. */
export type TunerType =
  | "string" //             string tuner: targets per string or course (guitar, violin, mandolin…)
  | "chromatic" //          any note, nearest-semitone readout (and instruments with no single standard tuning)
  | "wind" //               woodwind intonation: how in tune the note you play is
  | "brass" //              brass intonation (embouchure / slide / tuning slide)
  | "percussion-pitch" //   tonic-tuned hand drums and pitched bars/pitch-range drums: drum pitch against a target or range
  | "drum-head" //          tunable drum heads: head pitch and lug-to-lug comparison
  | "timpani" //            precise target pitch per drum
  | "keyboard" //           piano: reference and pitch assistance, not professional tuning
  | "drone" //              tanpura-style drone strings: tuned by their relation to Sa
  | "custom"; //            a tuning the player defined themselves (applies on top of a string tuner)

export type TuningMethod = "string-targets" | "intonation" | "target-pitch" | "pitch-reference" | "drone-relations" | "free-pitch";

/** What the thing being tuned is called: a string, a course, a drum, a note. */
export type TargetType = "string" | "course" | "note" | "drum" | "tonic" | "bar" | "none";

export type ReferenceToneKind = "pluck" | "bowed" | "wind" | "brass" | "piano" | "drum" | "mallet";

export type HarmonicHandling = "default" | "weak-fundamental" | "strong-upper-harmonics" | "inharmonic" | "decaying-strike";

/** The written note is `semitones` above the note that sounds (B♭ clarinet: 2). */
export interface TransposeOption {
  semitones: number;
  label: string;
}

export interface TunerTerminology {
  unit: string;
  units: string;
}

export interface TunerUiConfig {
  /** Shows the picture of strings/pegs and the auto/manual string switch. */
  showStrings: boolean;
  /** Shows the tuning-preset selector (Standard, Drop D, Sa = D…). */
  showPresets: boolean;
  /** Shows a picker for any target note (timpani, piano, hand-drum range). */
  showTargetPicker: boolean;
  /** Shows the drum-lug comparison panel. */
  showLugs: boolean;
  /** Shows how the strings relate to each other (drones). */
  showRelations: boolean;
  /** Shows concert AND written pitch. */
  showWrittenPitch: boolean;
  /** Shows the reference-tone bar (pick a note and play it) for instruments without tap-a-peg. */
  showReferenceBar: boolean;
  headline: string;
  description: string;
  terminology: TunerTerminology;
}

export interface InstrumentTunerProfile {
  instrumentId: string;
  tunerType: TunerType;
  requiresTuning: boolean;
  tuningMethod: TuningMethod;
  targetType: TargetType;
  /** The detector strategy (key into PROFILES in profiles.ts): how the shared engine listens to THIS instrument. */
  detection: DetectionProfile;
  harmonicHandling: HarmonicHandling;
  /** Plain-language description of the strategy, shown in the UI's "how it listens" help. */
  detectionNote: string;
  frequencyRange: NoteRange | null;
  /** The instrument's default transposition (null = sounds as written). */
  transposition: TransposeOption | null;
  /** All transpositions this instrument comes in (e.g. clarinet in B♭, A or C), when more than one. */
  transpositionOptions: TransposeOption[];
  supportsAutomaticDetection: boolean;
  supportsManualSelection: boolean;
  supportsChromaticMode: boolean;
  supportsReferenceTone: boolean;
  referenceTone: ReferenceToneKind;
  supportsPitchHistory: boolean;
  supportsCustomTuning: boolean;
  ui: TunerUiConfig;
}

/* ─── The few facts that are not derivable from the database ─── */

const BRASS = new Set(["trumpet", "trombone", "french-horn", "tuba", "euphonium", "cornet"]);
/** Bowed strings: the fundamental is often weaker than the 2nd–4th partials. */
const BOWED = new Set(["violin", "viola", "cello", "double-bass", "erhu", "sarangi"]);
/** Single hand drum tuned to the concert's tonic (Sa): a target note, chosen by key. */
const TONIC_DRUMS = new Set(["tabla", "mridangam", "pakhawaj"]);
const HAND_DRUM_FREE = new Set(["bayan"]);
const DRUM_HEADS = new Set(["dholak", "tunable-drum"]);
const BAR_INSTRUMENTS = new Set(["marimba", "xylophone", "vibraphone"]);

const T = (semitones: number, label: string): TransposeOption => ({ semitones, label });
/** Transpositions an instrument is commonly built in. Saxophones are fixed by their size; these are the ones with real choices. */
const TRANSPOSITION_OPTIONS: Record<string, TransposeOption[]> = {
  clarinet: [T(2, "B♭"), T(3, "A"), T(0, "C")],
  trumpet: [T(2, "B♭"), T(0, "C"), T(-3, "E♭")],
  cornet: [T(2, "B♭"), T(-3, "E♭")],
  "french-horn": [T(7, "F"), T(2, "B♭")],
  euphonium: [T(0, "Concert (bass clef)"), T(14, "B♭ (treble clef)")],
  trombone: [T(0, "Concert"), T(14, "B♭ (treble clef)")],
};

function terminologyFor(def: InstrumentDefinition, type: TunerType): TunerTerminology {
  if (type === "timpani" || type === "drum-head") return { unit: "drum", units: "drums" };
  if (type === "percussion-pitch") return BAR_INSTRUMENTS.has(def.id) ? { unit: "bar", units: "bars" } : { unit: "head", units: "heads" };
  if (type === "wind" || type === "brass" || type === "chromatic" || type === "keyboard") return { unit: "note", units: "notes" };
  if (def.tunerMode === "coursed" || (def.courseCount && def.courseCount !== def.stringCount)) return { unit: "course", units: "courses" };
  return { unit: "string", units: "strings" };
}

/** The tuner type for an instrument, or null for instruments the Tuner doesn't offer. */
export function tunerTypeFor(def: InstrumentDefinition): TunerType | null {
  if (!def.tunerSupported) return null;
  if (def.id === "chromatic") return "chromatic";
  if (def.id === "timpani") return "timpani";
  if (def.id === "piano") return "keyboard";
  if (def.id === "tanpura") return "drone";
  if (def.category === "wind") return BRASS.has(def.id) ? "brass" : "wind";
  if (DRUM_HEADS.has(def.id)) return "drum-head";
  if (TONIC_DRUMS.has(def.id) || HAND_DRUM_FREE.has(def.id) || BAR_INSTRUMENTS.has(def.id)) return "percussion-pitch";
  // String instruments with tuning data get a string tuner; those without one (sarod, veena…) a chromatic note check with a Sa reference.
  return def.tuner ? "string" : "chromatic";
}

function detectionFor(def: InstrumentDefinition, type: TunerType): { detection: DetectionProfile; harmonic: HarmonicHandling; note: string } {
  if (def.id === "harp") return { detection: "harp", harmonic: "default", note: "Reads the steady ring after each pluck." };
  if (BOWED.has(def.id)) return { detection: "bowed", harmonic: "weak-fundamental", note: "Bowed strings often have a weaker fundamental than their upper partials, so Wilsify checks for the lower octave and waits for several matching readings." };
  if (type === "brass") return { detection: "brass", harmonic: "strong-upper-harmonics", note: "Brass tones are rich in upper harmonics, so Wilsify checks for the lower octave and holds a reading briefly through slurs." };
  if (type === "wind") return { detection: "wind", harmonic: "default", note: "Waits for a steady tone before showing a reading." };
  if (type === "keyboard") return { detection: "keys", harmonic: "inharmonic", note: "Piano strings are slightly inharmonic (upper partials run sharp), so the fundamental is read from the steady part of the note." };
  if (type === "timpani" || type === "drum-head" || (type === "percussion-pitch" && !BAR_INSTRUMENTS.has(def.id))) return { detection: "drum", harmonic: "decaying-strike", note: "Skips the loud strike and reads the pitch as the head rings out, accepting a less perfectly periodic sound than a string." };
  if (BAR_INSTRUMENTS.has(def.id)) return { detection: "mallet", harmonic: "inharmonic", note: "Skips the strike and reads the steadier ring-out of the bar." };
  return { detection: def.profile ?? "default", harmonic: "default", note: "Finds the repeating pattern of the sound (not the loudest harmonic), then smooths and confirms it." };
}

function referenceFor(def: InstrumentDefinition, type: TunerType): ReferenceToneKind {
  if (BOWED.has(def.id)) return "bowed";
  if (type === "brass") return "brass";
  if (type === "wind") return "wind";
  if (type === "keyboard") return "piano";
  if (BAR_INSTRUMENTS.has(def.id)) return "mallet";
  if (type === "timpani" || type === "drum-head" || type === "percussion-pitch") return "drum";
  if (def.id === "tanpura" || def.id === "sarod" || def.id === "veena" || def.id === "sarangi") return "bowed";
  return "pluck";
}

const HEADLINE: Record<TunerType, [string, string]> = {
  string: ["String tuner", "Tune each string to its target note. Wilsify can tell which string you play, or you can pick one."],
  chromatic: ["Chromatic tuner", "Shows the note you play and how many cents sharp or flat it is."],
  wind: ["Woodwind intonation", "Checks how in tune the notes you play are against concert pitch. You tune the instrument itself by ear to a reference, then check your notes here."],
  brass: ["Brass intonation", "Checks how in tune the notes you play are, so you can adjust your embouchure, slide or tuning slide."],
  "percussion-pitch": ["Percussion pitch tuner", "Shows the pitch of the drum or bar, how steady it is, and how far it is from the target."],
  "drum-head": ["Drum-head tuner", "Shows the pitch of the head and compares lugs relative to each other. It cannot give exact lug tension from one microphone."],
  timpani: ["Timpani tuner", "Pick the drum and the note the music asks for, strike the head, and tune to the target."],
  keyboard: ["Piano pitch reference", "A pitch and reference aid, not professional piano tuning: real pianos are tuned with stretched octaves, which this does not model."],
  drone: ["Drone tuner", "Tune each drone string to its place relative to Sa."],
  custom: ["Custom tuning", "Tuning to the notes you defined."],
};

/** The tuner profile for an instrument, or null when the Tuner doesn't offer it (drum kit, accordion, synthesizer…). */
export function tunerProfileFor(def: InstrumentDefinition): InstrumentTunerProfile | null {
  const type = tunerTypeFor(def);
  if (!type) return null;
  const { detection, harmonic, note } = detectionFor(def, type);
  const stringLike = type === "string" || type === "drone";
  const multiTarget = stringLike && (def.stringCount ?? 2) > 1;
  const options = TRANSPOSITION_OPTIONS[def.id] ?? (def.transposition ? [def.transposition] : []);
  const [headline, description] = HEADLINE[type];

  const targetType: TargetType =
    stringLike ? (def.tunerMode === "coursed" ? "course" : "string")
    : type === "timpani" || type === "drum-head" ? "drum"
    : type === "percussion-pitch" ? (TONIC_DRUMS.has(def.id) ? "tonic" : BAR_INSTRUMENTS.has(def.id) ? "bar" : "none")
    : type === "wind" || type === "brass" || type === "keyboard" || type === "chromatic" ? "note"
    : "none";

  const tuningMethod: TuningMethod =
    type === "string" ? "string-targets"
    : type === "drone" ? "drone-relations"
    : type === "wind" || type === "brass" || type === "chromatic" ? "intonation"
    : type === "keyboard" ? "pitch-reference"
    : type === "timpani" || TONIC_DRUMS.has(def.id) ? "target-pitch"
    : "free-pitch";

  return {
    instrumentId: def.id,
    tunerType: type,
    requiresTuning: def.requiresTuning,
    tuningMethod,
    targetType,
    detection,
    harmonicHandling: harmonic,
    detectionNote: note,
    frequencyRange: def.range ?? null,
    transposition: def.transposition ?? null,
    transpositionOptions: options.length > 1 || (options.length === 1 && !def.transposition) ? options : [],
    supportsAutomaticDetection: multiTarget && type === "string",
    supportsManualSelection: stringLike,
    supportsChromaticMode: type === "string" || type === "chromatic",
    supportsReferenceTone: true,
    referenceTone: referenceFor(def, type),
    supportsPitchHistory: true,
    supportsCustomTuning: type === "string" && def.tuner !== undefined,
    ui: {
      showStrings: stringLike,
      showPresets: Boolean(def.tuner) && type !== "keyboard",
      showTargetPicker: type === "timpani" || type === "keyboard",
      showLugs: type === "drum-head",
      showRelations: type === "drone",
      showWrittenPitch: type === "wind" || type === "brass",
      showReferenceBar: !stringLike && type !== "timpani" && !TONIC_DRUMS.has(def.id),
      headline,
      description,
      terminology: terminologyFor(def, type),
    },
  };
}

export function tunerProfileForId(id: string): InstrumentTunerProfile | null {
  const def = findDefinition(id);
  return def ? tunerProfileFor(def) : null;
}

/** "tuner type → which instruments", for the capability check and the tests. */
export function tunerTypesOf(defs: InstrumentDefinition[]): Record<TunerType, string[]> {
  const out = {} as Record<TunerType, string[]>;
  for (const d of defs) {
    const t = tunerTypeFor(d);
    if (t) (out[t] ??= []).push(d.id);
  }
  return out;
}

/* ─── Transposition: concert (what sounds) vs written (what the player reads) ─── */

/** Written MIDI for a sounding MIDI: B♭ clarinet playing written C4 sounds B♭3, so written = sounding + 2. */
export function writtenMidi(concertMidi: number, t: TransposeOption | null): number {
  return concertMidi + (t?.semitones ?? 0);
}

/** The option an instrument uses by default, from its stored choice when valid. */
export function resolveTransposition(profile: InstrumentTunerProfile, chosenLabel: string | null): TransposeOption | null {
  if (chosenLabel) {
    const hit = profile.transpositionOptions.find((o) => o.label === chosenLabel);
    if (hit) return hit;
  }
  return profile.transposition ?? profile.transpositionOptions[0] ?? null;
}

/** A frequency window around one target note, so the detector looks for THAT pitch (fewer octave errors). */
export function targetWindow(frequency: number): { fmin: number; fmax: number } {
  return { fmin: Math.max(24, frequency * 0.6), fmax: Math.min(4200, frequency * 1.6) };
}

/** Every note between two scientific-pitch names, inclusive: the choices in a target picker. */
export function notesBetween(range: NoteRange, flats = false): { note: string; midi: number }[] {
  const lo = noteToMidi(normaliseNote(range.low));
  const hi = noteToMidi(normaliseNote(range.high));
  if (lo === null || hi === null || hi < lo) return [];
  const sharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const flat = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
  const names = flats ? flat : sharp;
  return Array.from({ length: hi - lo + 1 }, (_, i) => {
    const midi = lo + i;
    return { midi, note: `${names[midi % 12]}${Math.floor(midi / 12) - 1}` };
  });
}

function normaliseNote(n: string): string {
  return n.replace("♭", "b").replace("♯", "#");
}
