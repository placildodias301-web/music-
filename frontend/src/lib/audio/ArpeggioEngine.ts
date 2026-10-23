/**
 * Arpeggio scheduling: the sounding strings one after another, each string's strands together (a mandolin course is
 * two voices at each step). Built from the same voice plan as the strum.
 */

import { type ArpeggioPlayOptions, type StrumSpeed } from "./AudioTypes";
import { playPhysicalStringNote } from "./KarplusStrong";
import { audioContextManager } from "./AudioContextManager";
import { planArpeggioVoices } from "./voicePlan";
import { type PlaybackResult } from "./StrumEngine";

export const ARPEGGIO_GAPS: Record<StrumSpeed, number> = {
  slow: 0.32,
  normal: 0.18,
  fast: 0.09,
};

const RING_SECONDS = 3;

export async function playArpeggioSequence(options: ArpeggioPlayOptions): Promise<PlaybackResult> {
  const ctx = await audioContextManager.getContext();
  const instrument = options.instrument ?? "guitar";

  const voices = planArpeggioVoices({
    frets: options.frets,
    tuningMidi: options.tuningMidi,
    courses: options.courses,
    direction: options.direction,
    gapSeconds: ARPEGGIO_GAPS[options.speed ?? "normal"],
    velocity: options.velocity,
    humanize: options.humanize ?? true,
  });

  if (!voices.length) return { voices, durationSeconds: 0 };
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
  const durationSeconds = last + RING_SECONDS;
  if (options.onEnded) {
    window.setTimeout(() => options.onEnded?.(), durationSeconds * 1000);
  }
  return { voices, durationSeconds };
}
