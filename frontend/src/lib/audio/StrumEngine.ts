/**
 * Strum scheduling: every sounding string becomes one voice per strand (see voicePlan.ts), all scheduled against the
 * same clock a few milliseconds apart so they overlap and ring together. Nothing here knows about a particular
 * instrument or string count — N sounding strings (or strands) give N voices.
 */

import { type ChordPlayOptions, type StrumSpeed } from "./AudioTypes";
import { playPhysicalStringNote } from "./KarplusStrong";
import { audioContextManager } from "./AudioContextManager";
import { planStrumVoices, type PlannedVoice } from "./voicePlan";

/**
 * Seconds between one string and the next in a normal strum, per instrument: a guitar pick sweeps at ~32 ms a string, a fingerstyle
 * bass or a mandolin plectrum is much tighter. Fixed gaps (not a fixed total) mean a two-note bass chord sounds together, while
 * a six-string guitar chord still spreads.
 */
export const STRUM_GAP_SECONDS: Record<string, number> = {
  guitar: 0.032,
  "acoustic-guitar": 0.032,
  "electric-guitar": 0.028,
  ukulele: 0.028,
  bass: 0.014,
  mandolin: 0.012,
  banjo: 0.01,
};
const SPEED_SCALE: Record<StrumSpeed, number> = { fast: 0.45, normal: 1, slow: 1.8 };
const MAX_STRUM_SECONDS = 0.5;

/** Strum timing for a speed setting: a label scales the instrument's own gap; a number is a total sweep in seconds. */
export function strumTiming(speed: ChordPlayOptions["speed"], instrument: string, stringCount: number): { strumSeconds?: number; gapSeconds?: number } {
  if (typeof speed === "number") return { strumSeconds: Math.max(0, speed) };
  const scale = SPEED_SCALE[speed ?? "normal"] ?? 1;
  const gap = Math.min((STRUM_GAP_SECONDS[instrument] ?? 0.03) * scale, MAX_STRUM_SECONDS / Math.max(1, stringCount - 1));
  return { gapSeconds: gap };
}

/** What a play call did: the exact voices scheduled and roughly how long they ring. */
export interface PlaybackResult {
  voices: PlannedVoice[];
  durationSeconds: number;
}

const RING_SECONDS = 3;

export async function strumChord(options: ChordPlayOptions): Promise<PlaybackResult> {
  const ctx = await audioContextManager.getContext();
  const instrument = options.instrument ?? "guitar";

  const voices = planStrumVoices({
    frets: options.frets,
    tuningMidi: options.tuningMidi,
    courses: options.courses,
    capo: options.capo,
    direction: options.direction === "up" ? "up" : "down",
    ...strumTiming(options.speed, instrument, options.frets.filter((f) => f !== null).length),
    velocity: options.velocity,
    humanize: options.humanize ?? true,
  });

  if (options.exclusive !== false) audioContextManager.stopAll();
  if (options.onStart) options.onStart();

  const startTime = ctx.currentTime + 0.02;
  for (const v of voices) {
    void playPhysicalStringNote({
      midi: v.midi,
      frequency: v.frequency,
      stringIndex: v.stringIndex,
      totalStrings: options.tuningMidi.length,
      fret: v.fret,
      isOpen: v.isOpen,
      velocity: v.velocity,
      gain: v.gain,
      instrument,
      startTime: startTime + v.startOffset,
      pan: v.pan,
      pluckStyle: options.pluckStyle,
    });
  }

  const last = voices.reduce((m, v) => Math.max(m, v.startOffset), 0);
  const durationSeconds = voices.length ? last + RING_SECONDS : 0;
  if (options.onEnded) {
    window.setTimeout(() => options.onEnded?.(), durationSeconds * 1000);
  }
  return { voices, durationSeconds };
}
