/**
 * Every tunable number of the tuner, in one place. Nothing here touches React or the microphone.
 * (Per-instrument detector settings live next to it in `profiles.ts`.)
 */

export const TUNER_CONFIG = {
  /** ── What the player sees ── */
  /** |cents from the target| at or below this is IN TUNE (and the green arc on the gauge is this wide). */
  inTuneCents: 5,
  /** The gauge spans −range…+range cents around the target. Only the needle is clamped; the number never is. */
  gaugeRangeCents: 50,
  /** Needle smoothing: time constant (ms) of the exponential follower. ~63 % of a jump in this time (60–100 ms feels live but calm). */
  needleTauMs: 80,

  /** ── Is there a usable pitch? ── */
  /** Frames quieter than this RMS never reach the detector. */
  minRms: 0.0015,
  /** Sound stops (or turns unreliable) for this long → the readout falls back to "--" and the tuned flag clears. */
  silenceTimeoutMs: 300,
  /** The detector listens this many semitones below the lowest open string, so a slack string (G3 sounding as D3) still shows what it really is. */
  lowSlackSemitones: 8,
  /** Strings quieter than this for this long show "we can't hear anything". */
  quietRms: 0.006,
  quietMs: 3000,

  /** YIN: a dip in the normalised difference function below this counts as "clearly periodic" (lower = stricter). */
  yinThreshold: 0.15,
  /** Above this aperiodicity (1 − clarity) there is no pitch at all. */
  yinMaxAperiodicity: 0.35,

  /** ── Accepted-pitch estimation (rolling median in log-frequency / cents space) ── */
  /** Readings kept in the rolling history. */
  historySize: 5,
  /** A reading this far (cents) from the history median is an outlier (octave glitch, harmonic, neighbouring string)… */
  outlierCents: 60,
  /** …and is accepted as a real pitch change only after this many consecutive readings agree on it. */
  switchReadings: 4,

  /** ── Tuned tracking ── */
  /** A string only counts as tuned at or above this confidence. */
  tunedConfidence: 0.85,
  /** In tune this long, continuously, marks the string tuned. */
  holdMs: 450,

  /** ── AUTO string choice ── */
  /** A different string must be at least this many cents closer than the current one… */
  autoMarginCents: 25,
  /** …for this long (ms) before the target switches. */
  autoPersistMs: 200,
  /** While the pitch stays within this many cents of the current string, it is still that string. */
  autoStickCents: 80,

  /** ── Reference tone ── */
  /** After the tone (and its tail) ends the microphone stays ignored this much longer, so the room echo is not mistaken for the string. */
  toneSettleMs: 400,

  /** ── Timing of the analysis loop ── */
  analysisIntervalMs: 33,
  renderIntervalMs: 50,
} as const;

export type TunerConfig = typeof TUNER_CONFIG;
