/**
 * StrumEngine & Humanization Scheduler
 *
 * Simulates the physical motion of a pick or fingers sweeping across strings:
 * - Downstroke / Upstroke string ordering
 * - Micro-timing delays between strings
 * - Velocity curve and humanized dynamic variance
 * - Realistic spatial stereo spread across strings
 * - Tactile chuck on muted strings
 */

import { type ChordPlayOptions, type StrumSpeed } from "./AudioTypes";
import { playPhysicalStringNote } from "./KarplusStrong";
import { audioContextManager } from "./AudioContextManager";

const STRUM_DURATIONS: Record<StrumSpeed, number> = {
  fast: 0.018,
  normal: 0.034,
  slow: 0.068,
};

export async function strumChord(options: ChordPlayOptions): Promise<void> {
  const ctx = await audioContextManager.getContext();
  const numStrings = options.frets.length;
  const direction = options.direction ?? "down";
  const instrument = options.instrument ?? "guitar";
  const capo = options.capo ?? 0;

  // Determine base strum duration
  let totalStrumDuration = 0.034;
  if (typeof options.speed === "number") {
    totalStrumDuration = options.speed;
  } else if (options.speed && STRUM_DURATIONS[options.speed]) {
    totalStrumDuration = STRUM_DURATIONS[options.speed];
  }

  // Find played string indices
  const stringIndices: number[] = [];
  for (let s = 0; s < numStrings; s++) {
    stringIndices.push(s);
  }

  // Reverse if upstroke
  if (direction === "up") {
    stringIndices.reverse();
  }

  const baseVelocity = options.velocity ?? 0.82;
  const humanize = options.humanize ?? true;
  const timeStep = totalStrumDuration / Math.max(1, numStrings - 1);

  if (options.onStart) options.onStart();

  const startTime = ctx.currentTime + 0.01;
  let maxDuration = 2.5;

  stringIndices.forEach((sIdx, orderIdx) => {
    const rawFret = options.frets[sIdx];
    const isMuted = rawFret === null || rawFret < 0;
    const fret = isMuted ? 0 : rawFret + capo;
    const openMidi = options.tuningMidi[sIdx] ?? (40 + sIdx * 5);
    const midi = openMidi + fret;

    // Micro-timing delay with subtle human jitter
    const jitter = humanize ? (Math.random() - 0.5) * 0.005 : 0;
    const noteTime = startTime + orderIdx * timeStep + jitter;

    // Velocity dynamics across stroke
    // Downstroke: stronger attack on low strings, lighter on highs
    let velocityProfile = 1.0;
    if (direction === "down") {
      velocityProfile = 1.05 - (orderIdx / numStrings) * 0.15;
    } else {
      velocityProfile = 0.9 + (orderIdx / numStrings) * 0.18;
    }
    const velocityJitter = humanize ? (Math.random() - 0.5) * 0.06 : 0;
    const velocity = Math.min(1.0, Math.max(0.2, baseVelocity * velocityProfile + velocityJitter));

    // Pan across stereo image (-0.14 to +0.14)
    const pan = ((sIdx / Math.max(1, numStrings - 1)) - 0.5) * 0.28;

    playPhysicalStringNote({
      midi,
      stringIndex: sIdx,
      totalStrings: numStrings,
      fret: isMuted ? null : fret,
      isMuted,
      isOpen: !isMuted && fret === 0,
      velocity,
      instrument,
      startTime: noteTime,
      pan,
      pluckStyle: options.pluckStyle,
    });
  });

  if (options.onEnded) {
    window.setTimeout(() => {
      if (options.onEnded) options.onEnded();
    }, (totalStrumDuration + maxDuration) * 1000);
  }
}
