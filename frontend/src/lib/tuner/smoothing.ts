/** Smoothing, outlier rejection and "held steady" tracking for noisy pitch frames. Pure and unit-tested. */

import { centsBetween } from "./cents";
import { TUNER_CONFIG } from "./config";

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median taken in log-frequency (cents) space, so it is the same "middle pitch" whatever the register. */
export function logMedian(values: number[]): number {
  return 2 ** median(values.map((v) => Math.log2(v)));
}

export interface SmootherOptions {
  /** Frames in the rolling window. */
  window?: number;
  /** A frame this far from the current median is an outlier (octave errors, harmonics, neighbouring strings). */
  outlierCents?: number;
  /** Consistent outliers needed before the tuner accepts that the pitch really changed. */
  switchFrames?: number;
}

export interface SmoothedPitch {
  frequency: number;
  /** Frames in the window agreeing with the median. */
  stableFrames: number;
  /** True when this frame was ignored as an isolated outlier. */
  rejected: boolean;
}

/**
 * Median of the last few valid frames. An isolated frame that is far from the median (the classic
 * 110, 110.2, 109.9, 220.1, 110.1 octave glitch) is ignored; a new pitch is accepted only after
 * several consecutive frames agree on it (the player really moved to another string).
 */
export class PitchSmoother {
  private history: number[] = [];
  private pending: number[] = [];
  private readonly window: number;
  private readonly outlierCents: number;
  private readonly switchFrames: number;

  constructor(opts: SmootherOptions = {}) {
    this.window = opts.window ?? TUNER_CONFIG.historySize;
    this.outlierCents = opts.outlierCents ?? TUNER_CONFIG.outlierCents;
    this.switchFrames = opts.switchFrames ?? TUNER_CONFIG.switchReadings;
  }

  reset() {
    this.history = [];
    this.pending = [];
  }

  get size() {
    return this.history.length;
  }

  push(frequency: number): SmoothedPitch {
    if (this.history.length >= 3) {
      const m = logMedian(this.history);
      if (Math.abs(centsBetween(frequency, m)) > this.outlierCents) {
        // Candidate for a real change: keep it only while consecutive outliers agree with each other.
        if (this.pending.length && Math.abs(centsBetween(frequency, logMedian(this.pending))) > 35) this.pending = [];
        this.pending.push(frequency);
        if (this.pending.length >= this.switchFrames) {
          this.history = this.pending;
          this.pending = [];
        } else {
          return { frequency: m, stableFrames: this.stableCount(m), rejected: true };
        }
      } else {
        this.pending = [];
      }
    }
    this.history.push(frequency);
    if (this.history.length > this.window) this.history.shift();
    const m = logMedian(this.history);
    return { frequency: m, stableFrames: this.stableCount(m), rejected: false };
  }

  private stableCount(m: number): number {
    let n = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (Math.abs(centsBetween(this.history[i], m)) <= 15) n++;
      else break;
    }
    return n;
  }
}

/**
 * Adaptive noise floor: follows the quietest recent input, so a fan or hum raises the bar while a quiet
 * string still clears it. `floor` rises slowly, falls immediately.
 */
export class NoiseFloor {
  floor: number;
  private readonly minimum: number;
  constructor(minimum = 0.003, initial = 0.003) {
    this.minimum = minimum;
    this.floor = initial;
  }
  update(rms: number): number {
    this.floor = rms < this.floor ? rms : this.floor + (rms - this.floor) * 0.002;
    this.floor = Math.max(this.minimum, this.floor);
    return this.floor;
  }
  /** Input must clear the floor by this factor and an absolute minimum to be considered. */
  threshold(factor = 2.2): number {
    return Math.max(this.minimum * 1.5, this.floor * factor);
  }
}

/** Skips the frames right after a loud jump: a pick attack is noise, not pitch. */
export class TransientGate {
  private prev = 0;
  private holdUntil = 0;
  private readonly ratio: number;
  private readonly holdMs: number;
  /** Loudness (RMS) that counts as a strike when it arrives from silence; Infinity = only jumps from an already-sounding signal count. */
  private readonly onsetRms: number;
  constructor(ratio = 2.5, holdMs = 60, onsetRms = Infinity) {
    this.ratio = ratio;
    this.holdMs = holdMs;
    this.onsetRms = onsetRms;
  }
  reset() {
    this.prev = 0;
    this.holdUntil = 0;
  }
  /** True when this frame should be ignored. */
  update(rms: number, nowMs: number): boolean {
    if (this.prev > 0.002 ? rms > this.prev * this.ratio : rms >= this.onsetRms) this.holdUntil = nowMs + this.holdMs;
    this.prev = rms;
    return nowMs < this.holdUntil;
  }
}

/** Marks a string tuned only after it has been in tune with good confidence for `holdMs` of consecutive frames. */
export class HoldTracker {
  private since: number | null = null;
  private readonly holdMs: number;
  constructor(holdMs: number = TUNER_CONFIG.holdMs) {
    this.holdMs = holdMs;
  }
  reset() {
    this.since = null;
  }
  /** Returns true once the condition has held continuously long enough. */
  update(ok: boolean, nowMs: number): boolean {
    if (!ok) {
      this.since = null;
      return false;
    }
    if (this.since === null) this.since = nowMs;
    return nowMs - this.since >= this.holdMs;
  }
}
