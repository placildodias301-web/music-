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
}

export interface ChordPlayOptions {
  instrument?: InstrumentType;
  frets: (number | null)[];
  tuningMidi: number[];
  capo?: number;
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
  speed?: StrumSpeed;
  direction?: "up" | "down" | "up-down";
  velocity?: number;
  pluckStyle?: PluckStyle;
  humanize?: boolean;
  onStart?: () => void;
  onEnded?: () => void;
}
