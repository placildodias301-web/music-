/** Works out which string of the selected tuning is being played, without flapping between strings. */

import { centsBetween } from "./cents";
import { TUNER_CONFIG } from "./config";

export interface TargetLike {
  midi: number;
  frequency: number;
}

export interface StringMatch {
  index: number;
  cents: number;
}

/**
 * Closest target by pitch distance. Strings with the same pitch (unison pairs, balalaika) are
 * indistinguishable, so among those the first one not yet tuned wins.
 */
export function nearestString(frequency: number, targets: TargetLike[], tuned: ReadonlySet<number> = new Set()): StringMatch | null {
  if (!targets.length) return null;
  let best = 0;
  let bestAbs = Infinity;
  targets.forEach((t, i) => {
    const abs = Math.abs(centsBetween(frequency, t.frequency));
    if (abs < bestAbs - 0.5) {
      best = i;
      bestAbs = abs;
    }
  });
  const sameNote = targets.map((t, i) => (Math.abs(t.midi - targets[best].midi) < 0.01 ? i : -1)).filter((i) => i >= 0);
  const pick = sameNote.find((i) => !tuned.has(i)) ?? sameNote[0];
  return { index: pick, cents: centsBetween(frequency, targets[pick].frequency) };
}

export interface AutoOptions {
  /** While the pitch stays this close (cents) to the current string, it is still that string. */
  stickCents?: number;
  /** A challenger must be at least this many cents closer than the current string… */
  marginCents?: number;
  /** …continuously for this long (ms). */
  persistMs?: number;
}

/**
 * Sticky string identification by absolute cents distance (octaves are never folded away).
 * The current string is kept while the pitch is within `stickCents` of it (you are tuning it). Another string takes over
 * only when it is clearly closer (`marginCents`) and has stayed the closest for `persistMs`; an in-tune string hands over
 * to an untuned unison twin at once. Time-based, so it behaves the same at any frame rate.
 */
export class AutoStringTracker {
  current: number | null = null;
  private candidate: number | null = null;
  private candidateSince = 0;

  private readonly stickCents: number;
  private readonly marginCents: number;
  private readonly persistMs: number;

  constructor(opts: AutoOptions = {}) {
    this.stickCents = opts.stickCents ?? TUNER_CONFIG.autoStickCents;
    this.marginCents = opts.marginCents ?? TUNER_CONFIG.autoMarginCents;
    this.persistMs = opts.persistMs ?? TUNER_CONFIG.autoPersistMs;
  }

  reset() {
    this.current = null;
    this.candidate = null;
    this.candidateSince = 0;
  }

  update(frequency: number, targets: TargetLike[], tuned: ReadonlySet<number> = new Set(), nowMs = 0): number | null {
    const near = nearestString(frequency, targets, tuned);
    if (!near) return null;
    if (this.current === null || this.current >= targets.length) {
      this.current = near.index;
      return this.current;
    }
    const cur = targets[this.current];
    const toCurrent = Math.abs(centsBetween(frequency, cur.frequency));
    // An in-tune unison string with an untuned twin: hand over to the twin (same pitch, not yet done).
    const twinOfTuned = tuned.has(this.current) && near.index !== this.current && Math.abs(targets[near.index].midi - cur.midi) < 0.01;
    const clearlyCloser = near.index !== this.current && toCurrent - Math.abs(near.cents) > this.marginCents;
    if (twinOfTuned) {
      this.switchTo(near.index);
      return this.current;
    }
    if (toCurrent <= this.stickCents || !clearlyCloser) {
      this.candidate = null;
      return this.current;
    }
    if (near.index !== this.candidate) {
      this.candidate = near.index;
      this.candidateSince = nowMs;
    }
    if (nowMs - this.candidateSince >= this.persistMs) this.switchTo(near.index);
    return this.current;
  }

  private switchTo(index: number) {
    this.current = index;
    this.candidate = null;
  }
}
