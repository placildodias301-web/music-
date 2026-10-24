/**
 * Wilsify Audio Engine — Core Types
 * Strongly typed options, presets, and performance configurations.
 */

export type InstrumentType =
  | "guitar"
  | "acoustic-guitar"
  | "electric-guitar"
  | "bass"
  | "ukulele"
  | "mandolin"
  | "banjo"
  | "piano";

export type PluckStyle = "pick" | "finger";

export type StrumDirection = "down" | "up" | "arpeggio-up" | "arpeggio-down";

export type StrumSpeed = "slow" | "normal" | "fast";

export interface StringAcousticProperties {
  /** Relative string brightness / harmonic richness (0.0 - 1.0) */
  brightness: number;
  /** High frequency damping factor per feedback loop iteration (0.985 - 0.999) */
  decay: number;
  /** Max sustain in seconds */
  maxSeconds: number;
  /** Pluck position relative to bridge (0.05 = bridge, 0.5 = 12th fret/sound hole) */
  pluckPosition: number;
  /** Pick transient sharpness */
  transientSharpness: number;
  /** Relative wound string mass factor (1.0 = normal, 1.5 = heavy bass/low E) */
  stringMass: number;
}

export interface InstrumentPreset {
  id: InstrumentType;
  /** Lowest and highest open-string MIDI the string profiles are spread across (for picking a profile by pitch, not by string index). */
  pitchRange?: [number, number];
  /** Order of `strings` by ascending pitch, when the array itself is not ascending (ukulele's re-entrant G). */
  pitchOrder?: number[];
  name: string;
  defaultPluckStyle: PluckStyle;
  bodyResonanceFreqs: { freq: number; Q: number; gainDb: number }[];
  roomReverbAmount: number; // 0.0 - 1.0
  strings: StringAcousticProperties[];
  defaultString: StringAcousticProperties;
}

export interface NotePlayOptions {
  midi: number;
  frequency?: number;
  stringIndex?: number; // 0-based: 0 = lowest pitch string
  totalStrings?: number;
  fret?: number | null; // null or < 0 = muted
  isMuted?: boolean;
  isOpen?: boolean;
  velocity?: number; // 0.0 - 1.0 (default 0.8)
  pluckStyle?: PluckStyle;
  pluckPosition?: number;
  instrument?: InstrumentType;
  startTime?: number; // AudioContext time
  pan?: number; // -1 to 1 (stereo spread)
  /** Linear voice gain. Set by the voice planner so many simultaneous voices stay balanced; defaults to a single-note level. */
  gain?: number;
  /** Strand offsets (semitones) when the note is a whole course: [0, 0] mandolin pair, [0, 12] 12-string octave pair. */
  strands?: number[];
}

export interface ChordPlayOptions {
  instrument?: InstrumentType;
  frets: (number | null)[];
  tuningMidi: number[];
  capo?: number;
  /** Per string/course, the semitone offsets of its strands (mandolin [[0,0],…], 12-string [[0,12],…]). Default: one strand each. */
  courses?: number[][];
  /** A new chord fades out whatever is still ringing from the previous one (default true), so rapid clicks never pile up. */
  exclusive?: boolean;
  direction?: StrumDirection;
  speed?: StrumSpeed | number; // presets or duration in seconds
  velocity?: number;
  pluckStyle?: PluckStyle;
  humanize?: boolean;
  onStart?: () => void;
  onEnded?: () => void;
}

export interface ArpeggioPlayOptions {
  instrument?: InstrumentType;
  frets: (number | null)[];
  tuningMidi: number[];
  courses?: number[][];
  exclusive?: boolean;
  speed?: StrumSpeed;
  direction?: "up" | "down" | "up-down";
  velocity?: number;
  pluckStyle?: PluckStyle;
  humanize?: boolean;
  onStart?: () => void;
  onEnded?: () => void;
}
