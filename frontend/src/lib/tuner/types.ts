/** Data model for the tuner. Frequencies are never stored: they are derived from MIDI + the A4 calibration. */

export type TuningCategory = "standard" | "drop" | "open" | "down" | "up" | "alternate" | "custom";

export type PairRelation = "octave" | "unison";

export interface TunerString {
  id: string;
  /** Printed string number (1 = highest string of the instrument, as players count). */
  displayNumber: number;
  /** Note name as displayed, e.g. "Eb2" or "F#3". */
  note: string;
  octave: number;
  midi: number;
  /** Course (group of strings played together). Absent = the string is its own course. */
  course?: number;
  /** Strings that share a pairId belong to the same course. */
  pairId?: string;
  pairRelation?: PairRelation;
}

export interface TuningPreset {
  id: string;
  name: string;
  category: TuningCategory;
  /** Anything the player should know about where this tuning's data comes from (assumed octaves, regional variants). */
  note?: string;
  /** Physical strings in the order they appear on the instrument (lowest first, except re-entrant/drone instruments). */
  strings: TunerString[];
}

/** How the tuner draws the instrument. "headstock" shapes exist for a few; others use a generic head. */
export type TunerLayout = "headstock" | "linear" | "courses" | "harp";

export type HeadKind = "acoustic" | "electric" | "bass" | "violin" | "mandolin" | "inline" | "split";

export interface TunerVariant {
  id: string;
  name: string;
  stringCount: number;
  /** Number of courses (pegs); equals stringCount unless strings are paired. */
  courseCount: number;
  layout: TunerLayout;
  head: HeadKind;
  tunings: TuningPreset[];
}

export interface TunerInstrument {
  id: string;
  /** Instrument family shown in the first selector ("Guitar", "Bass", …). */
  family: string;
  /** One-line description for the dropdown. */
  blurb: string;
  /** What the second selector is called: "Strings" (default), "Size", "Harp type". */
  variantLabel?: string;
  variants: TunerVariant[];
}

/** A tuning the user saved. */
export interface CustomTuning {
  id: string;
  name: string;
  instrumentId: string;
  variantId: string;
  /** One note name per physical string, in the variant's string order. */
  notes: string[];
}

export type TuneState =
  | "very-flat"
  | "flat"
  | "slightly-flat"
  | "in-tune"
  | "slightly-sharp"
  | "sharp"
  | "very-sharp";

/** One pitch estimate, as the spec describes it. */
export interface PitchEstimate {
  frequency: number;
  note: string;
  midi: number;
  cents: number;
  confidence: number;
  stable: boolean;
}
