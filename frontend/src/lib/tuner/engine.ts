/**
 * The tuner's signal chain, free of React and of the microphone: feed it audio frames, get a snapshot back.
 *
 *   frame → adaptive noise floor → transient gate → YIN (range-limited) → confidence gate      (detector validation)
 *         → outlier-rejecting median of the last few readings, in cents space                  (accepted-pitch estimation)
 *         → detected note (nearest semitone, always shown)  ┐
 *         → target (auto / manual / chromatic) → target cents ┘ kept separate
 *         → state → tuned tracking (reliable + within the tolerance + held)
 *   The needle's own smoothing is visual only and lives in the gauge (see needle.ts).
 */

import { AutoStringTracker } from "./autoString";
import { centsBetween, clampForNeedle, GAUGE_RANGE_CENTS, guidance, IN_TUNE_CENTS, tuneState } from "./cents";
import { TUNER_CONFIG } from "./config";
import { frequencyToMidiFloat, midiToNoteName, nearestNote } from "./notes";
import { yinPitch } from "./pitch";
import { HoldTracker, NoiseFloor, PitchSmoother, TransientGate } from "./smoothing";
import type { DetectionProfile } from "../instruments/definitions";
import { PROFILES, type ProfileSettings } from "./profiles";
import type { TargetString } from "./tunings";
import type { TuneState } from "./types";

export type TunerMode = "auto" | "manual" | "chromatic";

export interface EngineConfig {
  mode: TunerMode;
  targets: TargetString[];
  /** Manual mode: index into `targets`. */
  selectedIndex: number;
  a4: number;
  fmin: number;
  fmax: number;
  /** How the detector is tuned for the instrument (strings by default). */
  profile?: DetectionProfile;
}

/** Kept for callers that read the old constants; the values live in config.ts. */
export const ENGINE = {
  tunedConfidence: TUNER_CONFIG.tunedConfidence,
  holdMs: TUNER_CONFIG.holdMs,
  quietMs: TUNER_CONFIG.quietMs,
  quietRms: TUNER_CONFIG.quietRms,
} as const;

export interface TunerSnapshot {
  listening: boolean;
  /** Smoothed pitch, or null while listening / nothing valid. */
  frequency: number | null;
  /** True while showing the last reading after the sound faded. */
  held: boolean;
  rms: number;
  noiseFloor: number;
  confidence: number;
  stableFrames: number;
  rawFrequency: number | null;
  /** Detected note (e.g. "A2") and fractional MIDI. */
  detectedNote: string | null;
  detectedMidi: number | null;
  /** Detected pitch against the nearest semitone (−50…+50), independent of any target. */
  chromaticCents: number | null;
  /** A valid, stable, confident pitch is being reported (false → show "--" / "Listening…"). */
  pitchReliable: boolean;
  /** Target string index in `targets` (null in chromatic mode / when nothing is playing in auto). */
  targetIndex: number | null;
  targetNote: string | null;
  targetFrequency: number | null;
  targetMidi: number | null;
  /** Real cents error against the target — never clamped, never wrapped to a nearby semitone. */
  cents: number | null;
  /** The same value limited to the gauge range, for the needle's position only. */
  needleCents: number;
  state: TuneState | null;
  /** The pitch is further than the gauge range (±50 cents) from the target. */
  outOfRange: boolean;
  /** This frame is in tune and the string has been confirmed tuned. */
  locked: boolean;
  tunedIndexes: number[];
  tooQuiet: boolean;
  message: string | null;
}

const EMPTY: TunerSnapshot = {
  listening: false, frequency: null, held: false, rms: 0, noiseFloor: 0, confidence: 0, stableFrames: 0, rawFrequency: null,
  detectedNote: null, detectedMidi: null, chromaticCents: null, pitchReliable: false, targetIndex: null, targetNote: null, targetFrequency: null, targetMidi: null, cents: null, needleCents: 0,
  state: null, outOfRange: false, locked: false, tunedIndexes: [], tooQuiet: false, message: null,
};

export class TunerEngine {
  private config: EngineConfig;
  private readonly smoother = new PitchSmoother();
  private readonly floor = new NoiseFloor();
  private transient: TransientGate;
  private profile: ProfileSettings;
  private readonly hold = new HoldTracker(TUNER_CONFIG.holdMs);
  private readonly auto = new AutoStringTracker();
  private tuned = new Set<number>();
  private lastHeard = 0;
  private lastFreq: number | null = null;
  private lastConfidence = 0;
  private lastStable = 0;
  private lastRaw: number | null = null;
  private previousState: TuneState | null = null;
  private quietSince: number | null = null;
  /** Pitch is ignored (and success cleared) until this time: a reference tone is playing or has just ended. */
  private muteUntil = 0;
  private lastTarget: number | null = null;
  private readonly flats: boolean;

  constructor(config: EngineConfig, opts: { flats?: boolean } = {}) {
    this.config = config;
    this.profile = PROFILES[config.profile ?? "default"];
    this.transient = new TransientGate(this.profile.transientRatio, this.profile.transientHoldMs, this.profile.onsetRms);
    this.flats = opts.flats ?? false;
  }

  /** Change instrument/tuning/mode. Tuned ticks reset when the targets change. */
  configure(next: EngineConfig) {
    const sameTargets = next.targets.length === this.config.targets.length && next.targets.every((t, i) => t.id === this.config.targets[i].id && Math.abs(t.frequency - this.config.targets[i].frequency) < 1e-6);
    const profileChanged = (next.profile ?? "default") !== (this.config.profile ?? "default");
    this.config = next;
    if (profileChanged) {
      this.profile = PROFILES[next.profile ?? "default"];
      this.transient = new TransientGate(this.profile.transientRatio, this.profile.transientHoldMs, this.profile.onsetRms);
      this.resetSignal();
    }
    if (!sameTargets) this.resetTuned();
    if (next.mode !== "auto") this.auto.reset();
  }

  resetTuned() {
    this.tuned = new Set();
    this.hold.reset();
    this.auto.reset();
    this.lastTarget = null;
    this.previousState = null;
  }

  resetSignal() {
    this.smoother.reset();
    this.hold.reset();
    this.transient.reset();
    this.lastFreq = null;
    this.lastHeard = 0;
    this.previousState = null;
    this.quietSince = null;
  }

  /**
   * Our own reference tone is about to sound for `ms`. Pitch acceptance is suspended for that time plus a settling period,
   * and anything that looks like success (a held reading, a half-built "tuned" streak) is cleared, so the app hearing itself
   * can never count as the string being in tune.
   */
  mute(ms: number, nowMs: number) {
    this.muteUntil = Math.max(this.muteUntil, nowMs + ms + TUNER_CONFIG.toneSettleMs);
    this.resetSignal();
    this.lastRaw = null;
  }

  /** Process one frame of mono audio. */
  processFrame(buffer: Float32Array<ArrayBufferLike>, sampleRate: number, nowMs: number): TunerSnapshot {
    const { fmin, fmax, a4 } = this.config;
    const rmsValue = Math.sqrt(buffer.reduce((s, v) => s + v * v, 0) / buffer.length);
    const floor = this.floor.update(rmsValue);

    if (rmsValue < TUNER_CONFIG.quietRms) {
      if (this.quietSince === null) this.quietSince = nowMs;
    } else this.quietSince = null;

    const attack = this.transient.update(rmsValue, nowMs);
    const muted = nowMs < this.muteUntil;
    let fresh = false;
    if (!muted && !attack && rmsValue >= this.floor.threshold()) {
      const r = yinPitch(buffer, sampleRate, fmin, fmax, { rmsGate: TUNER_CONFIG.minRms, threshold: TUNER_CONFIG.yinThreshold, maxAperiodicity: TUNER_CONFIG.yinMaxAperiodicity });
      this.lastRaw = r ? r.frequency : null;
      if (r && r.confidence >= this.profile.minConfidence) {
        const s = this.smoother.push(r.frequency);
        if (!s.rejected && s.stableFrames >= 1) {
          this.lastFreq = s.frequency;
          this.lastConfidence = r.confidence;
          this.lastStable = s.stableFrames;
          this.lastHeard = nowMs;
          fresh = true;
        }
      }
    }

    const sinceHeard = nowMs - this.lastHeard;
    const hasReading = this.lastFreq !== null && sinceHeard <= this.profile.holdReadingMs;
    if (!hasReading && this.lastFreq !== null) {
      this.smoother.reset();
      this.lastFreq = null;
      this.previousState = null;
      this.hold.reset();
    }
    const held = hasReading && !fresh;
    const trusted = hasReading && this.lastStable >= this.profile.minStableFrames;
    const freq = trusted ? this.lastFreq : null;

    const snap: TunerSnapshot = {
      ...EMPTY,
      listening: true,
      rms: rmsValue,
      noiseFloor: floor,
      rawFrequency: this.lastRaw,
      confidence: hasReading ? this.lastConfidence : 0,
      stableFrames: hasReading ? this.lastStable : 0,
      tunedIndexes: [...this.tuned],
      tooQuiet: !hasReading && this.quietSince !== null && nowMs - this.quietSince > TUNER_CONFIG.quietMs,
    };

    if (freq === null) {
      this.hold.update(false, nowMs);
      return snap;
    }

    snap.frequency = freq;
    snap.held = held;
    snap.pitchReliable = true;
    // What is actually being played — always the nearest semitone, whatever the target is.
    const exact = frequencyToMidiFloat(freq, a4);
    snap.detectedMidi = exact;
    snap.detectedNote = midiToNoteName(Math.round(exact), this.flats);
    snap.chromaticCents = (exact - Math.round(exact)) * 100;

    let cents: number;
    if (this.config.mode === "chromatic" || !this.config.targets.length) {
      const n = nearestNote(freq, a4, this.flats);
      snap.targetNote = `${n.note}`;
      snap.targetFrequency = n.targetFrequency;
      snap.targetMidi = n.midi;
      cents = n.cents;
    } else {
      const idx = this.config.mode === "auto" ? (held ? this.auto.current : this.auto.update(freq, this.config.targets, this.tuned, nowMs)) : Math.min(this.config.selectedIndex, this.config.targets.length - 1);
      if (idx === null || idx === undefined) return snap;
      const t = this.config.targets[idx];
      snap.targetIndex = idx;
      snap.targetNote = t.note;
      snap.targetFrequency = t.frequency;
      snap.targetMidi = t.midi;
      // 1200·log2(f / target): an octave error stays an octave error (±1200), a semitone stays ±100.
      cents = centsBetween(freq, t.frequency);
      snap.outOfRange = Math.abs(cents) > GAUGE_RANGE_CENTS;
    }
    if (this.lastTarget !== snap.targetIndex) {
      this.hold.reset();
      this.lastTarget = snap.targetIndex;
    }

    snap.cents = cents;
    snap.needleCents = clampForNeedle(cents);
    snap.state = tuneState(cents, this.previousState);
    this.previousState = snap.state;

    const inTune = Math.abs(cents) <= IN_TUNE_CENTS;
    const confident = snap.confidence >= TUNER_CONFIG.tunedConfidence && this.lastStable >= this.profile.minStableFrames + 1;
    const confirmed = this.hold.update(inTune && confident && !held, nowMs);
    if (confirmed && snap.targetIndex !== null) this.tuned.add(snap.targetIndex);
    snap.tunedIndexes = [...this.tuned];
    snap.locked = inTune && (snap.targetIndex !== null ? this.tuned.has(snap.targetIndex) : confirmed);
    snap.message = snap.outOfRange ? null : guidance(cents, snap.targetNote ?? "");
    return snap;
  }
}
