/** Needle motion, kept apart from the pitch maths: a time-based exponential follower. */

/**
 * Moves `current` toward `target` over `dtMs` with time constant `tauMs`:
 * current += (target − current) · (1 − e^(−dt/τ)). Frame-rate independent, so 30, 60 and 120 Hz screens move alike.
 * tauMs ≤ 0 jumps straight to the target (reduced motion).
 */
export function smoothToward(current: number, target: number, dtMs: number, tauMs: number): number {
  if (!(tauMs > 0) || !(dtMs > 0)) return tauMs > 0 ? current : target;
  return current + (target - current) * (1 - Math.exp(-dtMs / tauMs));
}
