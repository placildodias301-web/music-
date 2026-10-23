/**
 * Chord shapes for fretted instruments other than a standard 6-string guitar: other guitar tunings, 7-string,
 * ukulele tunings, mandolin, banjo, cavaquinho, balalaika and bass. They all use the same fretboard search the
 * guitar uses (lib/chordTheory.ts → searchShapes), run against the tuning you picked — so a shape is only ever
 * returned if its notes really are the chord's notes on THAT tuning. Nothing is copied from the guitar tables.
 */

import {
  chordIntervals,
  getGuitarVoicings,
  getUkuleleShape,
  GUITAR_TUNING,
  pickSpread,
  searchShapes,
  spellChord,
  UKULELE_TUNING,
  voicingName,
  type GuitarVoicing,
  type ParsedChord,
} from "../chordTheory";

export interface StringShape {
  name: string;
  /** One entry per string in the tuning's order: null = muted, 0 = open, n = fret n. */
  frets: (number | null)[];
}

const pcs = (midi: number[]) => midi.map((m) => ((m % 12) + 12) % 12);
const samePitchClasses = (a: number[], b: number[]) => a.length === b.length && pcs(a).every((p, i) => p === pcs(b)[i]);

export interface ShapeOptions {
  /** Index of a drone string (5-string banjo): it always rings open and is not part of the search. */
  drone?: number;
  /** The lowest sounding note must be the root (guitar family). */
  bassIsRoot?: boolean;
  /** How many alternate shapes to return. */
  count?: number;
  /** Largest starting fret to look at. */
  maxPosition?: number;
}

/**
 * Playable shapes of `chord` on `tuning` (MIDI of each open string, in the instrument's string order).
 * Few-string instruments fall back the way printed charts do: first every string sounds, then the root may be
 * left out, then a string may be muted.
 */
export function stringShapes(chord: ParsedChord, tuning: number[], opts: ShapeOptions = {}): StringShape[] {
  const droneAt = opts.drone ?? -1;
  const played = tuning.filter((_, i) => i !== droneAt);
  const count = opts.count ?? 3;
  const maxPosition = opts.maxPosition ?? (played.length <= 4 ? 10 : 12);
  const attempts: { allStrings: boolean; rootOptional?: boolean }[] =
    played.length <= 4 ? [{ allStrings: true }, { allStrings: true, rootOptional: true }, { allStrings: false }] : [{ allStrings: false }];

  for (const attempt of attempts) {
    // A slash chord must have its bass note lowest, whatever the instrument.
    const bassIsRoot = !!opts.bassIsRoot || chord.slashBass !== undefined;
    const found = pickSpread(searchShapes(chord, played, { bassIsRoot, maxPosition, ...attempt }), count);
    if (found.length) {
      return found.map((c) => {
        const frets = [...c.frets];
        // The drone string rings open only when its note is part of the chord (or the slash bass); otherwise it is left out,
        // so the notes heard are exactly the chord's notes.
        if (droneAt >= 0) {
          const dronePc = tuning[droneAt] % 12;
          const chordPcs = new Set(chordIntervals(chord).map((o) => (chord.root + o) % 12));
          if (chord.slashBass !== undefined) chordPcs.add(chord.slashBass);
          frets.splice(droneAt, 0, chordPcs.has(dronePc) ? 0 : null);
        }
        return { name: voicingName(c.frets), frets };
      });
    }
  }
  return [];
}

/* ─── Guitar family ─── */

/** Guitar shapes in any 6-string tuning: the hand-checked tables for standard, a tuning-aware search otherwise. */
export function guitarShapesFor(chord: ParsedChord, tuning: number[]): GuitarVoicing[] {
  if (tuning.length === GUITAR_TUNING.length && tuning.every((m, i) => m === GUITAR_TUNING[i])) return getGuitarVoicings(chord);
  return stringShapes(chord, tuning, { bassIsRoot: true });
}

/**
 * 7-string guitar: the six upper strings use the 6-string shapes (the same notes sound there), and the low string
 * adds the chord's bass note when it can reach it below everything else, otherwise it stays muted.
 */
export function guitar7Shapes(chord: ParsedChord, tuning7: number[]): StringShape[] {
  const upper = tuning7.slice(1);
  return guitarShapesFor(chord, upper).map((v) => {
    const sounded = v.frets.flatMap((f, i) => (f === null ? [] : [upper[i] + f]));
    const lowest = sounded.length ? Math.min(...sounded) : 999;
    const bassPc = lowest % 12;
    let low: number | null = null;
    for (let f = 0; f <= 5; f++) {
      if ((tuning7[0] + f) % 12 === bassPc && tuning7[0] + f < lowest) {
        low = f;
        break;
      }
    }
    return { name: v.name, frets: [low, ...v.frets] };
  });
}

/* ─── Ukulele ─── */

/** The GCEA hand-checked table is valid for every tuning with the same pitch classes (High G and Low G); others use the search. */
export function ukuleleShapesFor(chord: ParsedChord, tuning: number[]): StringShape[] {
  if (chord.slashBass === undefined && samePitchClasses(tuning, UKULELE_TUNING)) return [{ name: "Open position", frets: getUkuleleShape(chord) }];
  return stringShapes(chord, tuning, { count: 2 });
}

/* ─── Bass ─── */

export interface BassDyad {
  name: string;
  /** What the second note is, e.g. "5th". */
  interval: string;
  shape: StringShape;
}

export interface ArpeggioStep {
  string: number;
  fret: number;
  note: string;
  /** 1-based order the notes are played in. */
  order: number;
}

const DEGREE_NAME: Record<number, string> = { 3: "3rd", 5: "5th", 7: "7th" };

/**
 * Two notes played together: the root on a lower string with the 5th, 3rd or 7th on the next string up.
 * Chord tones only — never a note the chord does not contain.
 */
export function bassDyads(chord: ParsedChord, tuning: number[]): BassDyad[] {
  const root = chord.slashBass ?? chord.root;
  const out: BassDyad[] = [];
  for (const degree of [5, 3, 7]) {
    const tone = chord.quality.tones.find(([, d]) => d === degree);
    if (!tone) continue;
    const targetPc = (chord.root + tone[0]) % 12;
    if (targetPc === root) continue;
    let best: { low: number; rootFret: number; upFret: number; score: number } | null = null;
    for (let s = 0; s < tuning.length - 1; s++) {
      for (let r = 0; r <= 7; r++) {
        if ((tuning[s] + r) % 12 !== root) continue;
        for (let f = 0; f <= r + 4; f++) {
          if ((tuning[s + 1] + f) % 12 !== targetPc) continue;
          if (tuning[s + 1] + f <= tuning[s] + r) continue; // keep the root lowest
          const score = r + f + s * 0.5;
          if (!best || score < best.score) best = { low: s, rootFret: r, upFret: f, score };
        }
      }
    }
    if (best) {
      const frets: (number | null)[] = tuning.map(() => null);
      frets[best.low] = best.rootFret;
      frets[best.low + 1] = best.upFret;
      out.push({ name: `Root + ${DEGREE_NAME[degree]}`, interval: DEGREE_NAME[degree], shape: { name: `Root + ${DEGREE_NAME[degree]}`, frets } });
    }
  }
  return out;
}

/** Three or four chord tones sounded together — only returned when a comfortable shape exists. */
export function bassChordShapes(chord: ParsedChord, tuning: number[]): StringShape[] {
  return pickSpread(searchShapes(chord, tuning, { bassIsRoot: true, allStrings: false, maxPosition: 9 }), 2).map((c) => ({ name: voicingName(c.frets), frets: [...c.frets] }));
}

/** The chord's tones one after another, from the lowest root up to the octave: an ARPEGGIO, not a chord shape. */
export function bassArpeggio(chord: ParsedChord, tuning: number[]): ArpeggioStep[] {
  const lowOpen = tuning[0];
  // Root: first occurrence at or above the lowest open string.
  let rootMidi = lowOpen;
  while (((rootMidi % 12) + 12) % 12 !== (chord.slashBass ?? chord.root)) rootMidi++;
  const steps = [...new Set(chordIntervals(chord).filter((s) => s < 12))].sort((a, b) => a - b);
  const targets = [...steps, 12].map((s) => rootMidi + s);
  const names = spellChord(chord);
  const noteOf = (i: number) => (i < steps.length ? names[chordIntervals(chord).indexOf(steps[i])] ?? "" : names[0]);

  const out: ArpeggioStep[] = [];
  let prevFret = 0;
  let prevMidi = -1;
  targets.forEach((m, i) => {
    let best: { s: number; f: number; score: number } | null = null;
    tuning.forEach((open, s) => {
      const f = m - open;
      if (f < 0 || f > 12 || m <= prevMidi) return;
      const score = Math.abs(f - prevFret) * 2 + f * 0.2 + (i === 0 ? s * 0.5 : 0);
      if (!best || score < best.score) best = { s, f, score };
    });
    if (best) {
      const { s, f } = best as { s: number; f: number };
      out.push({ string: s, fret: f, note: noteOf(i), order: out.length + 1 });
      prevFret = f;
      prevMidi = m;
    }
  });
  return out;
}
