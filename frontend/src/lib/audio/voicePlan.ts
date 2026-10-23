/**
 * Voice planning: the ONE place that turns "which strings sound, at which frets, on which tuning" into the list of
 * voices the audio engine must play. It is pure (no Web Audio), so what is heard can be tested exactly:
 *
 *   shape (frets) + tuning (+ courses) → every sounding string → every strand of that string → one voice each
 *
 * A *course* is what a player calls "a string" on a mandolin, 12-string guitar or similar: two strings struck together.
 * Each strand of a course is its own voice, so a mandolin chord is 8 voices and a 12-string chord is 12 — nothing is
 * collapsed to one note per course. The same plan feeds the visual (note names), the strum and the arpeggio.
 */

import { detunedFreq, midiToFreq } from "./pitch";

export interface PlannedVoice {
  /** Index of the string/course in the instrument's string order (the same index the diagram uses). */
  stringIndex: number;
  /** Which strand of the course this is (0 for ordinary single strings). */
  strand: number;
  strandCount: number;
  midi: number;
  /** Hz, including the small detune between unison strands. */
  frequency: number;
  fret: number;
  isOpen: boolean;
  velocity: number;
  /** Linear gain for this voice, already normalised for how many voices play together. */
  gain: number;
  /** Seconds after the start of playback. */
  startOffset: number;
  /** Stereo position -1..1. */
  pan: number;
}

export interface SoundingString {
  stringIndex: number;
  fret: number;
  /** MIDI of the open string (the course's lowest strand). */
  openMidi: number;
}

/** Unison strands (mandolin pairs) are tuned a few cents apart, as on the real instrument. */
export const UNISON_DETUNE_CENTS = 4;
/** The thin octave string of a 12-string course is quieter than the main string. */
export const OCTAVE_STRAND_GAIN = 0.65;
/** Strands of one course are struck a few milliseconds apart, never as a single flat click. */
export const STRAND_STAGGER_SECONDS = 0.004;

const MAX_SENSIBLE_FRET = 36;

/** A fret value that can actually be played: a finite integer from 0 up. Everything else (null, negative, NaN) is "not sounding". */
export function isSoundingFret(f: number | null | undefined): f is number {
  return typeof f === "number" && Number.isFinite(f) && Number.isInteger(f) && f >= 0 && f <= MAX_SENSIBLE_FRET;
}

/** Which strings of a shape make sound. Muted (null), invalid or untuned strings are skipped — they stay silent. */
export function soundingStrings(frets: (number | null)[], tuningMidi: number[]): SoundingString[] {
  const out: SoundingString[] = [];
  frets.forEach((fret, stringIndex) => {
    const open = tuningMidi[stringIndex];
    if (isSoundingFret(fret) && typeof open === "number" && Number.isFinite(open)) out.push({ stringIndex, fret, openMidi: open });
  });
  return out;
}

/** Combined loudness rule: voices are uncorrelated, so power adds. Each voice gets ~1/√N so 1 note and 12 notes feel equally loud and never clip. */
export function voiceGainFor(voiceCount: number): number {
  return Math.min(0.75, 0.75 * Math.sqrt(1.5 / Math.max(1, voiceCount)));
}

/** Semitone offsets of each strand of string `i` (default one strand at 0). */
function strandsOf(courses: number[][] | undefined, i: number): number[] {
  const s = courses?.[i];
  return s && s.length ? s : [0];
}

function strandGain(offset: number, index: number): number {
  if (index === 0) return 1;
  return offset >= 12 ? OCTAVE_STRAND_GAIN : 0.9;
}

function strandDetune(offsets: number[], index: number): number {
  // Only strands that sound the same pitch get detuned, spread symmetrically around 0.
  const sameAs = offsets.filter((o) => o === offsets[index]);
  if (sameAs.length < 2) return 0;
  const rank = offsets.slice(0, index).filter((o) => o === offsets[index]).length;
  return (rank - (sameAs.length - 1) / 2) * UNISON_DETUNE_CENTS;
}

export interface ShapeVoiceOptions {
  frets: (number | null)[];
  tuningMidi: number[];
  /** Per string/course, the semitone offsets of its strands (mandolin [[0,0],…], 12-string [[0,12],…]). */
  courses?: number[][];
  capo?: number;
  velocity?: number;
  humanize?: boolean;
  random?: () => number;
}

export interface StrumVoiceOptions extends ShapeVoiceOptions {
  direction?: "down" | "up";
  /** Total seconds from the first string to the last. */
  strumSeconds?: number;
}

export interface ArpeggioVoiceOptions extends ShapeVoiceOptions {
  direction?: "up" | "down" | "up-down";
  /** Seconds between consecutive strings. */
  gapSeconds?: number;
}

function stringPan(stringIndex: number, total: number): number {
  return (stringIndex / Math.max(1, total - 1) - 0.5) * 0.28;
}

/** Builds the voices of ONE string (all its strands) starting at `startOffset`. */
function strandVoices(
  s: SoundingString,
  opts: ShapeVoiceOptions,
  startOffset: number,
  velocity: number,
  perVoiceGain: number,
  jitter: number,
): PlannedVoice[] {
  const capo = opts.capo ?? 0;
  const offsets = strandsOf(opts.courses, s.stringIndex);
  return offsets.map((offset, strand) => {
    const midi = s.openMidi + s.fret + capo + offset;
    const cents = strandDetune(offsets, strand);
    return {
      stringIndex: s.stringIndex,
      strand,
      strandCount: offsets.length,
      midi,
      frequency: cents ? detunedFreq(midi, cents) : midiToFreq(midi),
      fret: s.fret + capo,
      isOpen: s.fret === 0 && capo === 0,
      velocity,
      gain: perVoiceGain * strandGain(offset, strand) * velocity,
      startOffset: Math.max(0, startOffset + strand * STRAND_STAGGER_SECONDS + jitter),
      pan: stringPan(s.stringIndex, opts.tuningMidi.length),
    };
  });
}

function totalVoiceCount(strings: SoundingString[], courses?: number[][]): number {
  return strings.reduce((n, s) => n + strandsOf(courses, s.stringIndex).length, 0);
}

/** A strum: every sounding string in sweep order, each a little after the last — all voices overlap and ring together. */
export function planStrumVoices(opts: StrumVoiceOptions): PlannedVoice[] {
  const strings = soundingStrings(opts.frets, opts.tuningMidi);
  if (!strings.length) return [];
  const ordered = (opts.direction ?? "down") === "up" ? [...strings].reverse() : strings;
  const total = opts.strumSeconds ?? 0.22;
  const step = total / Math.max(1, ordered.length - 1);
  const humanize = opts.humanize ?? false;
  const rand = opts.random ?? Math.random;
  const base = opts.velocity ?? 0.82;
  const perVoice = voiceGainFor(totalVoiceCount(strings, opts.courses));
  const down = (opts.direction ?? "down") === "down";

  return ordered.flatMap((s, order) => {
    const profile = down ? 1.05 - (order / ordered.length) * 0.15 : 0.9 + (order / ordered.length) * 0.18;
    const velocity = Math.min(1, Math.max(0.2, base * profile + (humanize ? (rand() - 0.5) * 0.06 : 0)));
    return strandVoices(s, opts, order * step, velocity, perVoice, humanize ? (rand() - 0.5) * 0.005 : 0);
  });
}

/** An arpeggio: one string at a time, each string's strands together. */
export function planArpeggioVoices(opts: ArpeggioVoiceOptions): PlannedVoice[] {
  const strings = soundingStrings(opts.frets, opts.tuningMidi);
  if (!strings.length) return [];
  let sequence = [...strings];
  if (opts.direction === "down") sequence.reverse();
  else if (opts.direction === "up-down" && strings.length > 2) sequence = [...strings, ...strings.slice(1, -1).reverse()];
  const gap = opts.gapSeconds ?? 0.18;
  const humanize = opts.humanize ?? false;
  const rand = opts.random ?? Math.random;
  const base = opts.velocity ?? 0.8;
  // In an arpeggio notes ring over each other but only ~3 are loud at once.
  const perVoice = voiceGainFor(Math.min(totalVoiceCount(strings, opts.courses), 6));

  return sequence.flatMap((s, idx) => {
    const velocity = Math.min(1, Math.max(0.3, base + (humanize ? (rand() - 0.5) * 0.08 : 0)));
    return strandVoices(s, opts, idx * gap, velocity, perVoice, humanize ? (rand() - 0.5) * 0.008 : 0);
  });
}

export interface NoteVoiceOptions {
  midi: number;
  /** Fret the note is played on (0 = open). */
  fret?: number | null;
  stringIndex?: number;
  totalStrings?: number;
  /** Strand offsets when the note is a whole course (mandolin pair, 12-string octave pair). */
  strands?: number[];
  velocity?: number;
}

/** One played note: one voice, or one per strand when the string is a course. */
export function planNoteVoices(opts: NoteVoiceOptions): PlannedVoice[] {
  if (!Number.isFinite(opts.midi)) return [];
  if (opts.fret === null || (typeof opts.fret === "number" && opts.fret < 0)) return [];
  const offsets = opts.strands && opts.strands.length ? opts.strands : [0];
  const velocity = Math.min(1, Math.max(0.1, opts.velocity ?? 0.8));
  const perVoice = voiceGainFor(offsets.length);
  const fret = typeof opts.fret === "number" ? opts.fret : 0;
  const stringIndex = opts.stringIndex ?? 0;
  return offsets.map((offset, strand) => {
    const midi = opts.midi + offset;
    const cents = strandDetune(offsets, strand);
    return {
      stringIndex,
      strand,
      strandCount: offsets.length,
      midi,
      frequency: cents ? detunedFreq(midi, cents) : midiToFreq(midi),
      fret,
      isOpen: fret === 0,
      velocity,
      gain: perVoice * strandGain(offset, strand) * velocity,
      startOffset: strand * STRAND_STAGGER_SECONDS,
      pan: opts.totalStrings ? stringPan(stringIndex, opts.totalStrings) : 0,
    };
  });
}

/**
 * The pitches a shape sounds, lowest string first — the single definition used by the diagram's note names,
 * the audio and the tests, so what is drawn and what is heard cannot drift apart.
 */
export function soundedMidi(frets: (number | null)[], tuningMidi: number[], courses?: number[][], capo = 0): number[] {
  return soundingStrings(frets, tuningMidi).flatMap((s) => strandsOf(courses, s.stringIndex).map((o) => s.openMidi + s.fret + capo + o));
}
