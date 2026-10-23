/**
 * Strum scheduling: every sounding string becomes one voice per strand (see voicePlan.ts), all scheduled against the
 * same clock a few milliseconds apart so they overlap and ring together. Nothing here knows about a particular
 * instrument or string count — N sounding strings (or strands) give N voices.
 */

import { type ChordPlayOptions, type StrumSpeed } from "./AudioTypes";
import { playPhysicalStringNote } from "./KarplusStrong";
import { audioContextManager } from "./AudioContextManager";
import { planStrumVoices, type PlannedVoice } from "./voicePlan";

export const STRUM_DURATIONS: Record<StrumSpeed, number> = {
  fast: 0.1,
  normal: 0.22,
  slow: 0.36,
};

/** What a play call did: the exact voices scheduled and roughly how long they ring. */
export interface PlaybackResult {
  voices: PlannedVoice[];
  durationSeconds: number;
}

const RING_SECONDS = 3;

export function strumSeconds(speed: ChordPlayOptions["speed"]): number {
  if (typeof speed === "number") return Math.max(0, speed);
  return (speed && STRUM_DURATIONS[speed]) || STRUM_DURATIONS.normal;
}

export async function strumChord(options: ChordPlayOptions): Promise<PlaybackResult> {
  const ctx = await audioContextManager.getContext();
  const instrument = options.instrument ?? "guitar";

  const voices = planStrumVoices({
    frets: options.frets,
    tuningMidi: options.tuningMidi,
    courses: options.courses,
    capo: options.capo,
    direction: options.direction === "up" ? "up" : "down",
    strumSeconds: strumSeconds(options.speed),
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
