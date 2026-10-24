/**
 * Pitch logic for pitched percussion and the piano: timpani drums with their note ranges, drum-head lug comparison, and the
 * piano reference with an (empty by default) stretch-tuning table. Pure functions: no React, no microphone.
 */

import { midiToNoteName, midiToFrequency, noteToMidi } from "./notes";

/* ─── Timpani ─── */

export interface TimpaniDrum {
  id: string;
  label: string;
  /** Typical playable range of this drum size (scientific pitch). Check your own drums: makers differ. */
  low: string;
  high: string;
}

/** The standard orchestral set. These are the usual ranges for each size, not a promise about a particular instrument. */
export const TIMPANI_DRUMS: TimpaniDrum[] = [
  { id: "32", label: "32″ (large)", low: "D2", high: "A2" },
  { id: "29", label: "29″", low: "F2", high: "C3" },
  { id: "26", label: "26″", low: "Bb2", high: "F3" },
  { id: "23", label: "23″ (small)", low: "D3", high: "A3" },
];

export function timpaniDrum(id: string): TimpaniDrum {
  return TIMPANI_DRUMS.find((d) => d.id === id) ?? TIMPANI_DRUMS[0];
}

/** Notes a drum can be tuned to, lowest first. */
export function timpaniNotes(drum: TimpaniDrum): { note: string; midi: number }[] {
  const lo = noteToMidi(drum.low) ?? 38;
  const hi = noteToMidi(drum.high) ?? 45;
  return Array.from({ length: hi - lo + 1 }, (_, i) => ({ midi: lo + i, note: midiToNoteName(lo + i) }));
}

/* ─── Drum-head lugs ─── */

export interface LugReading {
  /** Fundamental frequency heard when this lug was struck (Hz), or null if not recorded yet. */
  frequency: number | null;
}

export type LugEvenness = "even" | "slightly-uneven" | "uneven" | "unknown";

export interface LugSummary {
  recorded: number;
  /** Mean of the recorded pitches, in Hz. */
  meanHz: number | null;
  /** Each recorded lug's deviation from the mean, in cents (null where not recorded). */
  deviations: (number | null)[];
  /** Highest minus lowest recorded pitch, in cents. */
  spreadCents: number | null;
  evenness: LugEvenness;
}

/** Spread (high − low) at or under this is an approximately even head; the limits are deliberately generous because one microphone is not a tension gauge. */
export const LUG_EVEN_CENTS = 15;
export const LUG_SLIGHT_CENTS = 40;

/**
 * Compares the pitch recorded at each lug. This is a RELATIVE comparison from one microphone: it can say the head is approximately
 * even or that one lug is higher or lower than the others, not the actual tension of any lug.
 */
export function summariseLugs(lugs: LugReading[]): LugSummary {
  const heard = lugs.filter((l): l is { frequency: number } => l.frequency !== null && l.frequency > 0);
  if (heard.length < 2) {
    return { recorded: heard.length, meanHz: heard[0]?.frequency ?? null, deviations: lugs.map(() => (heard.length === 1 && lugs.some((l) => l.frequency !== null) ? 0 : null)), spreadCents: null, evenness: "unknown" };
  }
  const logMean = heard.reduce((s, l) => s + Math.log2(l.frequency), 0) / heard.length;
  const meanHz = 2 ** logMean;
  const deviations = lugs.map((l) => (l.frequency === null ? null : 1200 * (Math.log2(l.frequency) - logMean)));
  const cents = deviations.filter((d): d is number => d !== null);
  const spreadCents = Math.max(...cents) - Math.min(...cents);
  return {
    recorded: heard.length,
    meanHz,
    deviations,
    spreadCents,
    evenness: spreadCents <= LUG_EVEN_CENTS ? "even" : spreadCents <= LUG_SLIGHT_CENTS ? "slightly-uneven" : "uneven",
  };
}

/* ─── Piano reference ─── */

/**
 * Stretch tuning: real pianos are tuned with octaves slightly wider than 2:1 (low notes a little flat, high notes sharp) because of
 * string inharmonicity. The size depends on the individual piano, so Wilsify ships NO table: this map stays empty unless one is
 * supplied (for example measured from a specific instrument), and the reference then follows it. Cents relative to equal temperament.
 */
const stretchTable = new Map<number, number>();

export function setPianoStretchTable(cents: Record<number, number>): void {
  stretchTable.clear();
  for (const [midi, c] of Object.entries(cents)) if (Number.isFinite(c)) stretchTable.set(Number(midi), c);
}

export function pianoStretchCents(midi: number): number {
  return stretchTable.get(midi) ?? 0;
}

export interface PianoReference {
  note: string;
  midi: number;
  /** Target frequency: equal temperament at the reference pitch plus any supplied stretch. */
  frequency: number;
  stretchCents: number;
  /** The same pitch class one octave down and up, to compare octaves by ear. */
  octaves: { note: string; midi: number; frequency: number }[];
}

export function pianoReference(midi: number, a4: number): PianoReference {
  const at = (m: number) => ({ note: midiToNoteName(m), midi: m, frequency: midiToFrequency(m, a4) * 2 ** (pianoStretchCents(m) / 1200) });
  const here = at(midi);
  return {
    note: here.note,
    midi,
    frequency: here.frequency,
    stretchCents: pianoStretchCents(midi),
    octaves: [midi - 12, midi + 12].filter((m) => m >= 21 && m <= 108).map(at),
  };
}
