/**
 * Monophonic pitch detection: YIN (de Cheveigné & Kawahara, 2002) with parabolic interpolation.
 * This is plain DSP, not AI. YIN normalises every lag so it has no short-lag bias and rarely lands on a
 * harmonic; a periodicity check at twice the lag backs that up. Returns null when nothing periodic is found.
 */

export interface YinOptions {
  /** Frames quieter than this RMS are rejected outright. */
  rmsGate?: number;
  /** CMNDF dip that counts as "clearly periodic". */
  threshold?: number;
  /** Above this aperiodicity there is no usable pitch (noise, chords). */
  maxAperiodicity?: number;
  /** For weak-fundamental sounds: prefer the lower octave when the signal clearly repeats at twice the chosen period. */
  octaveGuard?: "lower";
}

export interface YinResult {
  frequency: number;
  /** 1 − aperiodicity of the chosen dip (0…1). */
  clarity: number;
  /** clarity discounted when the signal is not also periodic at twice the lag (harmonic consistency). */
  confidence: number;
  rms: number;
}

export function rmsOf(buffer: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

export function yinPitch(buffer: Float32Array<ArrayBufferLike>, sampleRate: number, fmin: number, fmax: number, opts: YinOptions = {}): YinResult | null {
  const size = buffer.length;
  const threshold = opts.threshold ?? 0.15;
  const maxAperiodicity = opts.maxAperiodicity ?? 0.35;

  const rms = rmsOf(buffer);
  if (rms < (opts.rmsGate ?? 0.01)) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / fmax));
  const maxLag = Math.min(Math.ceil(sampleRate / fmin), Math.floor(size / 2));
  if (maxLag <= minLag) return null;
  const window = size - maxLag - 1;

  const diffs = new Float64Array(maxLag + 2);
  const cmnd = new Float64Array(maxLag + 2);
  cmnd[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let d = 0;
    for (let i = 0; i < window; i++) {
      const diff = buffer[i] - buffer[i + lag];
      d += diff * diff;
    }
    diffs[lag] = d;
    running += d;
    cmnd[lag] = running > 0 ? (d * lag) / running : 1;
  }

  // First dip under the threshold (lowest point of that dip), else the deepest dip anywhere.
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmnd[lag] < threshold) {
      bestLag = lag;
      for (; lag <= maxLag && cmnd[lag] < threshold; lag++) {
        if (cmnd[lag] < cmnd[bestLag]) bestLag = lag;
      }
      break;
    }
  }
  if (bestLag < 0) {
    let min = Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (cmnd[lag] < min) {
        min = cmnd[lag];
        bestLag = lag;
      }
    }
  }
  if (bestLag < 0 || cmnd[bestLag] > maxAperiodicity) return null;
  // Weak fundamental: the upper partials repeat at `bestLag`, but the real period is twice that. A truly periodic signal at
  // `bestLag` dips to ~0 at BOTH lags, so only switch when the longer lag is clearly the better match.
  if (opts.octaveGuard === "lower") {
    const longer = bestLag * 2;
    if (longer <= maxLag && cmnd[bestLag] > 0.04 && cmnd[longer] < cmnd[bestLag] * 0.5 && cmnd[longer] < threshold) {
      let refined = longer;
      for (let l = Math.max(minLag, longer - 2); l <= Math.min(maxLag, longer + 2); l++) if (cmnd[l] < cmnd[refined]) refined = l;
      bestLag = refined;
    }
  }
  // Out-of-range guard: a pure tone ABOVE the search range repeats at every multiple of its period, so the first in-range dip
  // would be a subharmonic of it (a 3 kHz whistle read as 400 Hz). If the signal is clearly periodic at a SHORTER lag than the
  // range allows, and the chosen lag is a whole multiple of that, the real pitch is above range: report nothing.
  for (let lag = 3; lag < minLag; lag++) {
    if (cmnd[lag] < 0.1 && cmnd[lag] <= cmnd[lag - 1] && cmnd[lag] <= cmnd[lag + 1]) {
      const ratio = bestLag / lag;
      const nearest = Math.round(ratio);
      if (nearest >= 2 && Math.abs(ratio - nearest) < 0.03 * nearest) return null;
    }
  }
  const clarity = 1 - cmnd[bestLag];

  // Harmonic consistency: a true period repeats, so the signal should dip again at twice the lag.
  let consistency = 1;
  const twice = bestLag * 2;
  if (twice <= maxLag) consistency = 1 - 0.5 * Math.min(1, cmnd[twice]);

  const a = diffs[bestLag - 1];
  const b = diffs[bestLag];
  const c = diffs[bestLag + 1];
  const denom = a - 2 * b + c;
  const shift = denom > 0 ? (a - c) / (2 * denom) : 0;
  const refinedLag = bestLag + Math.max(-1, Math.min(1, shift));

  const frequency = sampleRate / refinedLag;
  if (frequency < fmin || frequency > fmax) return null;
  return { frequency, clarity, confidence: clarity * consistency, rms };
}
