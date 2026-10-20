/**
 * Harp tuning model. A harp's strings are diatonic — one string per scale step, seven per octave — and a lever
 * or pedal raises every string of one note-letter by a semitone (or, on a pedal harp, a second time). So a harp
 * is not "a list of notes": it is a RANGE (lowest string + how many) plus an ACCIDENTAL for each of the seven
 * letters C D E F G A B (-1 flat, 0 natural, +1 sharp). Everything else is derived.
 *
 * Sources: Wikipedia "Pedal harp" (47 strings, C1–G7, default tuning C♭ major with pedals up; the lowest C, the
 * lowest D and the highest G have no pedal and are normally natural) and Wikipedia "Stringed instrument tunings"
 * (Celtic/lever harp: typically 34 strings, C2 up, tuned to the C diatonic scale). Real harps vary: use the
 * custom harp for any other range.
 */

import { noteToMidi, octaveOfMidi } from "./notes";
import type { TunerString, TuningPreset } from "./types";

export type HarpLetter = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export type HarpAccidental = -1 | 0 | 1;
export type HarpAccidentals = Record<HarpLetter, HarpAccidental>;

export const HARP_LETTERS: HarpLetter[] = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_SEMITONES: Record<HarpLetter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface HarpRange {
  /** Lowest string as a natural note name, e.g. "C2". */
  lowest: string;
  count: number;
  /** Strings that have no lever/pedal and stay natural (pedal harp: C1, D1, G7). */
  fixedNatural?: string[];
}

export const LEVER_HARP_RANGE: HarpRange = { lowest: "C2", count: 34 }; // C2 … A6
export const PEDAL_HARP_RANGE: HarpRange = { lowest: "C1", count: 47, fixedNatural: ["C1", "D1", "G7"] }; // C1 … G7
export const DEFAULT_CUSTOM_RANGE: HarpRange = { lowest: "C3", count: 22 }; // C3 … A6 region, a small folk harp

export const NATURAL_STATE: HarpAccidentals = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };

const SHARP_ORDER: HarpLetter[] = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER: HarpLetter[] = ["B", "E", "A", "D", "G", "C", "F"];

export interface HarpState {
  id: string;
  name: string;
  /** Major key this lever/pedal setting sounds in. */
  tonic: string;
  fifths: number;
  accidentals: HarpAccidentals;
  /** What it means on a pedal harp. */
  blurb?: string;
}

const KEY_NAMES: Record<number, string> = {
  [-7]: "C♭", [-6]: "G♭", [-5]: "D♭", [-4]: "A♭", [-3]: "E♭", [-2]: "B♭", [-1]: "F",
  0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F♯", 7: "C♯",
};
const KEY_ID: Record<number, string> = {
  [-7]: "Cb", [-6]: "Gb", [-5]: "Db", [-4]: "Ab", [-3]: "Eb", [-2]: "Bb", [-1]: "F", 0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
};

/** Accidentals of the major key `fifths` steps around the circle (−7 = C♭ … +7 = C♯). */
export function keyAccidentals(fifths: number): HarpAccidentals {
  const acc: HarpAccidentals = { ...NATURAL_STATE };
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach((l) => (acc[l] = 1));
  if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach((l) => (acc[l] = -1));
  return acc;
}

export const HARP_STATES: HarpState[] = Array.from({ length: 15 }, (_, i) => i - 7).map((fifths) => ({
  id: `key-${KEY_ID[fifths]}`,
  name: `${KEY_NAMES[fifths]} major`,
  tonic: KEY_NAMES[fifths],
  fifths,
  accidentals: keyAccidentals(fifths),
  blurb: fifths === -7 ? "All flat — pedals up (concert harp default), levers off" : fifths === 0 ? "All natural — pedals in the middle, levers on" : fifths === 7 ? "All sharp — pedals down" : undefined,
}));

/** Preset id used when the player sets individual lever/pedal positions by hand. */
export const CUSTOM_POSITIONS_ID = "custom-positions";

export function harpStateById(id: string): HarpState | undefined {
  return HARP_STATES.find((s) => s.id === id);
}

export function accidentalSymbol(a: HarpAccidental): string {
  return a === -1 ? "♭" : a === 1 ? "♯" : "♮";
}

/** Do the accidentals match one of the 15 named key settings? */
export function matchingState(acc: HarpAccidentals): HarpState | undefined {
  return HARP_STATES.find((s) => HARP_LETTERS.every((l) => s.accidentals[l] === acc[l]));
}

export interface RangeCheck {
  ok: boolean;
  error?: string;
}

/** Lowest note must be a natural note name; the harp has to fit inside C0–C8 and have a sensible string count. */
export function validateHarpRange(lowest: string, count: number): RangeCheck {
  const m = /^([A-G])(-?\d)$/.exec(lowest.trim());
  if (!m) return { ok: false, error: "Lowest string must be a natural note with an octave, like C2." };
  if (!Number.isInteger(count) || count < 5 || count > 60) return { ok: false, error: "A harp has between 5 and 60 strings." };
  const low = noteToMidi(lowest.trim())!;
  if (low < 12) return { ok: false, error: "Lowest string is below C0." };
  const top = harpStrings({ lowest: lowest.trim(), count }, NATURAL_STATE, "check").at(-1)!;
  if (top.midi > 108) return { ok: false, error: "The top string would be above C8 — use fewer strings or a higher lowest note." };
  return { ok: true };
}

/** Name of the i-th string above `lowest`, stepping through the seven letters (C D E F G A B C …). */
function stepFrom(lowest: string, i: number): { letter: HarpLetter; octave: number } {
  const m = /^([A-G])(-?\d)$/.exec(lowest)!;
  const start = HARP_LETTERS.indexOf(m[1] as HarpLetter);
  const idx = start + i;
  return { letter: HARP_LETTERS[idx % 7], octave: Number(m[2]) + Math.floor(idx / 7) };
}

export function harpStrings(range: HarpRange, acc: HarpAccidentals, presetId: string): TunerString[] {
  const fixed = new Set(range.fixedNatural ?? []);
  return Array.from({ length: range.count }, (_, i) => {
    const { letter, octave } = stepFrom(range.lowest, i);
    const natural = `${letter}${octave}`;
    const a: HarpAccidental = fixed.has(natural) ? 0 : acc[letter];
    const note = `${letter}${a === -1 ? "b" : a === 1 ? "#" : ""}${octave}`;
    const midi = (octave + 1) * 12 + LETTER_SEMITONES[letter] + a;
    return { id: `${presetId}-s${i + 1}`, displayNumber: range.count - i, note, octave: octaveOfMidi(midi), midi, course: i + 1 };
  });
}

export function harpPreset(id: string, name: string, range: HarpRange, acc: HarpAccidentals, category: TuningPreset["category"] = "standard"): TuningPreset {
  return { id, name, category, strings: harpStrings(range, acc, id) };
}

/** Preset for a named key setting, or the hand-set positions when `id` is CUSTOM_POSITIONS_ID. */
export function resolveHarpPreset(range: HarpRange, tuningId: string, custom: HarpAccidentals): TuningPreset {
  if (tuningId === CUSTOM_POSITIONS_ID) return harpPreset(CUSTOM_POSITIONS_ID, "Custom positions", range, custom, "custom");
  const state = harpStateById(tuningId) ?? harpStateById("key-C")!;
  return harpPreset(state.id, state.name, range, state.accidentals);
}

/** Presets for the instrument data table: every named key setting for a range. */
export function harpPresets(range: HarpRange): TuningPreset[] {
  return HARP_STATES.map((s) => harpPreset(s.id, s.name, range, s.accidentals));
}

/* ─── What a chord needs from a harp (used by the Chords page) ─── */

export interface HarpNeed {
  letter: HarpLetter;
  accidental: HarpAccidental;
}

/** Spelled chord notes ("F#", "Bb", "C") → the lever/pedal setting each note's letter must be in. Returns a conflict when one letter is needed twice with different accidentals. */
export function harpNeedsForNotes(spelled: string[]): { needs: HarpNeed[]; conflict: HarpLetter | null } {
  const needs: HarpNeed[] = [];
  let conflict: HarpLetter | null = null;
  for (const n of spelled) {
    const m = /^([A-G])(♯|♭|#|b|𝄪|𝄫)?/.exec(n);
    if (!m) continue;
    const letter = m[1] as HarpLetter;
    const accidental: HarpAccidental = m[2] === "♯" || m[2] === "#" ? 1 : m[2] === "♭" || m[2] === "b" ? -1 : 0;
    const prior = needs.find((x) => x.letter === letter);
    if (prior && prior.accidental !== accidental) conflict = letter;
    else if (!prior) needs.push({ letter, accidental });
  }
  return { needs, conflict };
}

/* ─── Saved harp settings ─── */

export interface SavedHarp {
  accidentals: HarpAccidentals;
  lowest: string;
  count: number;
}

const KEY = "wilsify:tuner-harp";

export function loadHarp(): SavedHarp {
  const fallback: SavedHarp = { accidentals: { ...NATURAL_STATE }, lowest: DEFAULT_CUSTOM_RANGE.lowest, count: DEFAULT_CUSTOM_RANGE.count };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<SavedHarp>;
    const acc = v.accidentals;
    const accOk = !!acc && HARP_LETTERS.every((l) => acc[l] === -1 || acc[l] === 0 || acc[l] === 1);
    const range = typeof v.lowest === "string" && typeof v.count === "number" ? validateHarpRange(v.lowest, v.count) : { ok: false };
    return { accidentals: accOk ? (acc as HarpAccidentals) : fallback.accidentals, lowest: range.ok ? v.lowest! : fallback.lowest, count: range.ok ? v.count! : fallback.count };
  } catch {
    return fallback;
  }
}

export function saveHarp(h: SavedHarp) {
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // not remembered — fine
  }
}
