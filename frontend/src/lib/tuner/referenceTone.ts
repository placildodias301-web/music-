/**
 * Synthesised reference tone (Web Audio): one voice at a time, so taps never pile up.
 * The tone's timbre follows the instrument being tuned: a clean pluck for strings, a steady bowed tone for violin-family,
 * a sustained breathy tone for winds, a brighter one for brass, a struck piano-like tone, a soft drum/bar tone. The PITCH is always
 * exactly the target frequency; only the colour changes, so the ear can match it to the real instrument.
 */

import type { ReferenceToneKind } from "./instrumentProfile";

export interface ReferenceTone {
  /** Plays `frequency`; stops whatever was playing. Returns how long (ms) the microphone should ignore input. */
  play(frequency: number, kind?: ReferenceToneKind): number;
  stop(): void;
  /** Stop and release the AudioContext. */
  dispose(): void;
}

/** How each kind of tone is built. `hold` = a steady level for this long; `decay` = a struck/plucked tone that fades by itself. */
export interface ToneRecipe {
  /** Relative strength of harmonics 1, 2, 3 … */
  harmonics: number[];
  attack: number;
  /** Seconds the tone lasts (including the fade). */
  seconds: number;
  /** "hold" keeps a flat level then fades out; "decay" fades exponentially from the start. */
  shape: "hold" | "decay";
  level: number;
}

export const TONE_RECIPES: Record<ReferenceToneKind, ToneRecipe> = {
  pluck: { harmonics: [1, 0.25, 0.12], attack: 0.01, seconds: 2.2, shape: "decay", level: 0.28 },
  bowed: { harmonics: [1, 0.5, 0.33, 0.25, 0.18, 0.12], attack: 0.18, seconds: 3.2, shape: "hold", level: 0.2 },
  wind: { harmonics: [1, 0.3, 0.1, 0.04], attack: 0.08, seconds: 3.2, shape: "hold", level: 0.26 },
  brass: { harmonics: [1, 0.9, 0.75, 0.55, 0.4, 0.25, 0.12], attack: 0.05, seconds: 3.0, shape: "hold", level: 0.14 },
  piano: { harmonics: [1, 0.55, 0.35, 0.2, 0.12, 0.06], attack: 0.004, seconds: 3.4, shape: "decay", level: 0.28 },
  drum: { harmonics: [1, 0.15], attack: 0.01, seconds: 3.0, shape: "hold", level: 0.34 },
  mallet: { harmonics: [1, 0, 0, 0.25], attack: 0.003, seconds: 2.6, shape: "decay", level: 0.3 },
};

export function createReferenceTone(): ReferenceTone {
  let ctx: AudioContext | null = null;
  let stopCurrent: (() => void) | null = null;

  function context(): AudioContext | null {
    try {
      if (!ctx || ctx.state === "closed") {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctor();
      }
      if (ctx.state === "suspended") void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function stop() {
    stopCurrent?.();
    stopCurrent = null;
  }

  return {
    play(frequency, kind = "pluck") {
      const c = context();
      if (!c || !Number.isFinite(frequency) || frequency <= 0) return 0;
      stop();
      const r = TONE_RECIPES[kind];
      const now = c.currentTime;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(r.level, now + r.attack);
      if (r.shape === "hold") {
        gain.gain.setValueAtTime(r.level, now + r.seconds - 0.4);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + r.seconds);
      } else {
        gain.gain.exponentialRampToValueAtTime(0.0001, now + r.seconds);
      }
      gain.connect(c.destination);
      // One oscillator with a harmonic wave table: exactly the target pitch, coloured by the recipe.
      const real = new Float32Array(r.harmonics.length + 1);
      const imag = new Float32Array([0, ...r.harmonics]);
      const osc = c.createOscillator();
      osc.setPeriodicWave(c.createPeriodicWave(real, imag));
      osc.frequency.setValueAtTime(frequency, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + r.seconds + 0.05);
      stopCurrent = () => {
        try {
          gain.gain.cancelScheduledValues(c.currentTime);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), c.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.05);
          osc.stop(c.currentTime + 0.06);
        } catch {
          // already stopped
        }
      };
      return r.seconds * 1000 + 200;
    },
    stop() {
      stop();
    },
    dispose() {
      stop();
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
