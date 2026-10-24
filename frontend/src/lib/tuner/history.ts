/**
 * Tuning history and pitch stability. Pure: feed it readings, get the rows the history panel shows and a steadiness verdict.
 * "Stability" is how little the pitch wobbles over the last second or so; "trend" says whether the player is getting closer.
 */

export interface HistoryEntry {
  /** performance.now()-style milliseconds. */
  time: number;
  target: string | null;
  detected: string;
  frequency: number;
  cents: number;
  inTune: boolean;
  trend: "improving" | "worse" | "steady" | "first";
}

export interface HistoryInput {
  time: number;
  target: string | null;
  detected: string;
  frequency: number;
  cents: number;
}

export const HISTORY_SIZE = 8;
/** A new row is added at most this often, so the list reads like a log and not a blur. */
export const HISTORY_MIN_GAP_MS = 500;
/** |cents| at or below this is in tune (matches the tuner's own tolerance). */
export const HISTORY_IN_TUNE_CENTS = 5;
/** A change of less than this many cents is "steady", not better or worse. */
const TREND_DEADBAND = 2;

export class TuningHistory {
  private entries: HistoryEntry[] = [];
  private lastTime = -Infinity;

  /** Adds a reading if enough time passed since the last row. Returns the new row, or null. A change of target starts a new run. */
  push(r: HistoryInput): HistoryEntry | null {
    if (!Number.isFinite(r.cents) || !Number.isFinite(r.frequency)) return null;
    if (r.time - this.lastTime < HISTORY_MIN_GAP_MS) return null;
    const prev = this.entries[this.entries.length - 1];
    const sameTarget = prev && prev.target === r.target && prev.detected.replace(/\d/g, "") === r.detected.replace(/\d/g, "");
    let trend: HistoryEntry["trend"] = "first";
    if (sameTarget) {
      const delta = Math.abs(r.cents) - Math.abs(prev.cents);
      trend = delta < -TREND_DEADBAND ? "improving" : delta > TREND_DEADBAND ? "worse" : "steady";
    }
    const entry: HistoryEntry = { ...r, inTune: Math.abs(r.cents) <= HISTORY_IN_TUNE_CENTS, trend };
    this.entries.push(entry);
    if (this.entries.length > HISTORY_SIZE) this.entries.shift();
    this.lastTime = r.time;
    return entry;
  }

  /** Newest first. */
  rows(): HistoryEntry[] {
    return [...this.entries].reverse();
  }

  clear() {
    this.entries = [];
    this.lastTime = -Infinity;
  }
}

export type Stability = "stable" | "settling" | "unsteady" | "unknown";

/** Standard deviation (cents) of recent readings, and a plain-language verdict. Needs at least 4 readings. */
export function stabilityOf(recentCents: number[]): { deviation: number | null; verdict: Stability } {
  const v = recentCents.filter((c) => Number.isFinite(c));
  if (v.length < 4) return { deviation: null, verdict: "unknown" };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const deviation = Math.sqrt(v.reduce((s, c) => s + (c - mean) ** 2, 0) / v.length);
  return { deviation, verdict: deviation < 2 ? "stable" : deviation < 6 ? "settling" : "unsteady" };
}

/** Rolling window of recent cents readings for `stabilityOf`. */
export class StabilityWindow {
  private values: { t: number; c: number }[] = [];
  private readonly windowMs: number;
  constructor(windowMs = 1200) {
    this.windowMs = windowMs;
  }

  push(time: number, cents: number) {
    this.values.push({ t: time, c: cents });
    while (this.values.length && time - this.values[0].t > this.windowMs) this.values.shift();
  }

  clear() {
    this.values = [];
  }

  result() {
    return stabilityOf(this.values.map((v) => v.c));
  }
}
