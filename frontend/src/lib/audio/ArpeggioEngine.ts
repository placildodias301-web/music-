/**
 * Arpeggio Engine
 * Sequences chord notes as individually plucked strings with natural timing.
 */

import { type ArpeggioPlayOptions, type StrumSpeed } from "./AudioTypes";
import { playPhysicalStringNote } from "./KarplusStrong";
import { audioContextManager } from "./AudioContextManager";

const ARPEGGIO_GAPS: Record<StrumSpeed, number> = {
  slow: 0.32,
  normal: 0.18,
  fast: 0.09,
};

export async function playArpeggioSequence(options: ArpeggioPlayOptions): Promise<void> {
  const ctx = await audioContextManager.getContext();
  const numStrings = options.frets.length;
  const speed = options.speed ?? "normal";
  const gap = ARPEGGIO_GAPS[speed];
  const instrument = options.instrument ?? "guitar";
  const baseVelocity = options.velocity ?? 0.8;
  const humanize = options.humanize ?? true;

  // Extract sounded strings (exclude muted)
  const sounded: { stringIndex: number; fret: number; midi: number }[] = [];
  for (let s = 0; s < numStrings; s++) {
    const rawFret = options.frets[s];
    if (rawFret !== null && rawFret >= 0) {
      const openMidi = options.tuningMidi[s] ?? (40 + s * 5);
      sounded.push({
        stringIndex: s,
        fret: rawFret,
        midi: openMidi + rawFret,
      });
    }
  }

  if (sounded.length === 0) return;

  // Ordering based on direction
  let sequence = [...sounded];
  if (options.direction === "down") {
    sequence.reverse();
  } else if (options.direction === "up-down" && sounded.length > 2) {
    const middleDown = sounded.slice(1, -1).reverse();
    sequence = [...sounded, ...middleDown];
  }

  if (options.onStart) options.onStart();

  const startTime = ctx.currentTime + 0.02;

  sequence.forEach((item, idx) => {
    const jitter = humanize ? (Math.random() - 0.5) * 0.008 : 0;
    const noteTime = startTime + idx * gap + jitter;
    const velocityJitter = humanize ? (Math.random() - 0.5) * 0.08 : 0;
    const velocity = Math.min(1.0, Math.max(0.3, baseVelocity + velocityJitter));
    const pan = ((item.stringIndex / Math.max(1, numStrings - 1)) - 0.5) * 0.28;

    playPhysicalStringNote({
      midi: item.midi,
      stringIndex: item.stringIndex,
      totalStrings: numStrings,
      fret: item.fret,
      isOpen: item.fret === 0,
      velocity,
      instrument,
      startTime: noteTime,
      pan,
      pluckStyle: options.pluckStyle,
    });
  });

  if (options.onEnded) {
    const totalTime = sequence.length * gap + 2.0;
    window.setTimeout(() => {
      if (options.onEnded) options.onEnded();
    }, totalTime * 1000);
  }
}
