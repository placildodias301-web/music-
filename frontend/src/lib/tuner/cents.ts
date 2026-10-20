/** Cents, tuning states (with hysteresis) and the plain-language guidance line. */

import { TUNER_CONFIG } from "./config";
import type { TuneState } from "./types";

/** cents = 1200 · log2(detected / target). The real value; only the needle is clamped. */
export function centsBetween(detectedFrequency: number, targetFrequency: number): number {
  return 1200 * Math.log2(detectedFrequency / targetFrequency);
}

/** Only the needle's drawn position is clamped; callers keep showing the real number. */
export function clampForNeedle(cents: number, limit: number = TUNER_CONFIG.gaugeRangeCents): number {
  return Math.max(-limit, Math.min(limit, cents));
}

export const VERY_ACCURATE_CENTS = 3;
export const IN_TUNE_CENTS = TUNER_CONFIG.inTuneCents;
export const GAUGE_RANGE_CENTS = TUNER_CONFIG.gaugeRangeCents;
export const SLIGHT_CENTS = 15;
export const FAR_CENTS = 30;
/** The pitch must clear a band edge by this much before the label changes, so it never flickers. */
export const HYSTERESIS_CENTS = 2;

const EDGES = [IN_TUNE_CENTS, SLIGHT_CENTS, FAR_CENTS];

function plainBand(abs: number): number {
  let band = 0;
  for (let i = 0; i < EDGES.length; i++) if (abs > EDGES[i]) band = i + 1;
  return band;
}

/** Stay in the previous band until the pitch is clearly (HYSTERESIS_CENTS) beyond its edges. */
function bandOf(abs: number, prevBand: number | null): number {
  if (prevBand !== null) {
    const lo = prevBand > 0 ? EDGES[prevBand - 1] - HYSTERESIS_CENTS : -Infinity;
    const hi = prevBand < EDGES.length ? EDGES[prevBand] + HYSTERESIS_CENTS : Infinity;
    if (abs >= lo && abs <= hi) return prevBand;
  }
  return plainBand(abs);
}

const BAND_STATES: Record<number, [TuneState, TuneState]> = {
  0: ["in-tune", "in-tune"],
  1: ["slightly-flat", "slightly-sharp"],
  2: ["flat", "sharp"],
  3: ["very-flat", "very-sharp"],
};

export function bandOfState(state: TuneState): number {
  if (state === "in-tune") return 0;
  if (state.startsWith("slightly")) return 1;
  if (state.startsWith("very")) return 3;
  return 2;
}

/** The tuning state for `cents`, sticky around the band edges when `previous` is given. */
export function tuneState(cents: number, previous: TuneState | null = null): TuneState {
  const band = bandOf(Math.abs(cents), previous ? bandOfState(previous) : null);
  const [flat, sharp] = BAND_STATES[band];
  return cents < 0 ? flat : sharp;
}

export const STATE_LABEL: Record<TuneState, string> = {
  "very-flat": "VERY FLAT",
  flat: "FLAT",
  "slightly-flat": "SLIGHTLY FLAT",
  "in-tune": "IN TUNE",
  "slightly-sharp": "SLIGHTLY SHARP",
  sharp: "SHARP",
  "very-sharp": "VERY SHARP",
};

export function isFlatState(s: TuneState): boolean {
  return s.endsWith("flat");
}
export function isSharpState(s: TuneState): boolean {
  return s.endsWith("sharp");
}

/** Beyond the gauge: the pitch is more than ±GAUGE_RANGE_CENTS from the target. −1 low, +1 high, 0 on the gauge. */
export function outOfRangeSide(targetCents: number | null, range = GAUGE_RANGE_CENTS): -1 | 0 | 1 {
  if (targetCents === null || !Number.isFinite(targetCents)) return 0;
  return targetCents < -range ? -1 : targetCents > range ? 1 : 0;
}

/** The label to show: IN TUNE strictly within the tolerance (the sticky band may linger a few cents past it). */
export function displayState(cents: number, state: TuneState | null, tolerance = IN_TUNE_CENTS): TuneState {
  if (Math.abs(cents) <= tolerance) return "in-tune";
  if (state && state !== "in-tune") return state;
  return cents < 0 ? "slightly-flat" : "slightly-sharp";
}

/** Deterministic coaching text from the numbers (no model call). `noteLabel` is how the note should be spoken. */
export function guidance(cents: number, noteLabel: string): string {
  const abs = Math.round(Math.abs(cents));
  if (abs <= IN_TUNE_CENTS) return `Perfect — ${noteLabel} is in tune.`;
  const flat = cents < 0;
  if (abs <= SLIGHT_CENTS) return `You're very close. Tune slightly ${flat ? "higher" : "lower"}.`;
  if (abs <= FAR_CENTS) return `String is ${abs} cents ${flat ? "flat — tighten it slightly" : "sharp — loosen it slowly"}.`;
  return `String is ${abs} cents ${flat ? "flat — tighten the peg to raise it" : "sharp — loosen the peg to lower it"}.`;
}
