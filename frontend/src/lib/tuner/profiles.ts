/**
 * Detection profiles: the same YIN pitch detector, tuned for how different instruments actually sound.
 * Plain DSP parameters — nothing here is learned or "AI".
 *
 * - default: strings, voice.
 * - keys:    piano / organ / synth — notes decay or sustain evenly; hold the last reading a little longer.
 * - mallet:  struck bars (marimba, xylophone) — the first ~200 ms is a loud, inharmonic strike, so it is skipped
 *            and the steadier ring-out is read; more agreeing frames are needed; the reading is held as the bar decays.
 * - reed:    accordion reeds — rich in harmonics and slow to settle, so only confident, stable readings are shown.
 * - harp:    plucked strings over a wide range with a short pluck transient.
 */

import type { DetectionProfile } from "../instruments/definitions";
import { TUNER_CONFIG } from "./config";

export interface ProfileSettings {
  /** Detections below this confidence are ignored ("Listening…"). */
  minConfidence: number;
  /** Frames that must agree with the median before a reading is trusted. */
  minStableFrames: number;
  /** Keep showing the last reading this long after the sound stops. */
  holdReadingMs: number;
  /** A loudness jump of this factor between frames counts as a strike/attack… */
  transientRatio: number;
  /** …and frames are ignored for this long afterwards. */
  transientHoldMs: number;
  /** A strike arriving from silence at this loudness is also skipped (struck bars). Infinity = never. */
  onsetRms: number;
  /** YIN "clearly periodic" dip. Drums and other imperfectly periodic sounds need a looser threshold. Default: config. */
  yinThreshold?: number;
  /** Above this aperiodicity there is no pitch. Drums tolerate more than strings. Default: config. */
  yinMaxAperiodicity?: number;
  /**
   * Octave guard for sounds whose FUNDAMENTAL is weaker than its upper harmonics (bowed strings, low brass, voice): when the
   * signal repeats cleanly at twice the chosen period but not quite at the chosen one, the lower pitch is the real one.
   */
  octaveGuard?: "lower";
}

export const PROFILES: Record<DetectionProfile, ProfileSettings> = {
  default: { minConfidence: 0.7, minStableFrames: 3, holdReadingMs: TUNER_CONFIG.silenceTimeoutMs, transientRatio: 2.5, transientHoldMs: 60, onsetRms: Infinity },
  keys: { minConfidence: 0.7, minStableFrames: 3, holdReadingMs: 1500, transientRatio: 2.5, transientHoldMs: 70, onsetRms: Infinity },
  mallet: { minConfidence: 0.75, minStableFrames: 4, holdReadingMs: 2500, transientRatio: 2.0, transientHoldMs: 220, onsetRms: 0.03 },
  reed: { minConfidence: 0.8, minStableFrames: 5, holdReadingMs: 1500, transientRatio: 2.5, transientHoldMs: 80, onsetRms: Infinity },
  harp: { minConfidence: 0.7, minStableFrames: 3, holdReadingMs: 1800, transientRatio: 2.5, transientHoldMs: 90, onsetRms: Infinity },
  // Bowed strings: the fundamental is often weaker than the 2nd–4th partials, and bow noise is steady, so the octave guard is on
  // and more agreeing frames are required before a reading is trusted.
  bowed: { minConfidence: 0.75, minStableFrames: 4, holdReadingMs: 900, transientRatio: 2.2, transientHoldMs: 120, onsetRms: Infinity, octaveGuard: "lower" },
  // Brass: strong upper harmonics (and weak fundamentals on low instruments); the lip slurs between partials, so readings are held briefly.
  brass: { minConfidence: 0.75, minStableFrames: 4, holdReadingMs: 700, transientRatio: 2.2, transientHoldMs: 100, onsetRms: Infinity, octaveGuard: "lower" },
  // Woodwinds (flute, clarinet, oboe, sax, recorder…): near-pure or odd-harmonic tones; wait for a stable tone.
  wind: { minConfidence: 0.75, minStableFrames: 4, holdReadingMs: 700, transientRatio: 2.2, transientHoldMs: 90, onsetRms: Infinity },
  // Drums (tabla, timpani, hand drums, drum heads): a loud inharmonic strike, then a decaying tone. Skip the strike, read the ring-out,
  // accept a less perfectly periodic signal, and hold the reading as it decays.
  drum: { minConfidence: 0.6, minStableFrames: 4, holdReadingMs: 2500, transientRatio: 2.0, transientHoldMs: 220, onsetRms: 0.025, yinThreshold: 0.2, yinMaxAperiodicity: 0.5 },
};
