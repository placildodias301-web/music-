/**
 * User corrections to the analysed chord timeline.
 *
 * The analysis result is never modified. Corrections are kept as a list of
 * small edits replayed over it, so the sheet shows
 *   RAW ANALYSIS + USER CORRECTIONS = DISPLAYED SHEET
 * and "Reset" simply drops the list. Each edit points at a chord by its start
 * time in the timeline as it was when the edit was made (edits replay in order).
 */
import type { ChordSegment } from "../api";

export type ChordEdit =
  | { op: "set"; at: number; chord: string }
  | { op: "remove"; at: number }
  | { op: "add"; at: number; chord: string }
  | { op: "move"; at: number; to: number };

/** A timeline chord, flagged when the user changed or added it. */
export type EditedSegment = ChordSegment & { edited?: boolean };

const MATCH = 0.011; // edits store times rounded to 1/100 s
const MIN_LEN = 0.05; // a chord never shrinks below this when another is added or moved next to it
const MAX_EDITS = 2000;
const CHORD_RE = /^[A-G][#b♯♭]?[^\s]{0,15}$|^N\.?C\.?$/;

export const roundTime = (t: number) => Math.round(t * 100) / 100;

export function isValidChordName(name: string): boolean {
  return CHORD_RE.test(name.trim());
}

/** Throws on anything that isn't a well-formed edit list (used when reading storage / cloud data). */
export function validateChordEdits(value: unknown): ChordEdit[] {
  if (!Array.isArray(value) || value.length > MAX_EDITS) throw new Error("Invalid chord edits.");
  const time = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0;
  for (const e of value as Record<string, unknown>[]) {
    if (!e || typeof e !== "object" || !time(e.at)) throw new Error("Invalid chord edit.");
    if ((e.op === "set" || e.op === "add") && typeof e.chord === "string" && isValidChordName(e.chord)) continue;
    if (e.op === "remove") continue;
    if (e.op === "move" && time(e.to)) continue;
    throw new Error("Invalid chord edit.");
  }
  return value as ChordEdit[];
}

const findAt = (segs: EditedSegment[], at: number) => segs.findIndex((s) => Math.abs(s.start - at) < MATCH);

/** Replays `edits` over a copy of `timeline`. Edits that no longer match a chord are skipped. */
export function applyChordEdits(timeline: ChordSegment[], edits: ChordEdit[] | null | undefined, durationSeconds = 0): EditedSegment[] {
  const segs: EditedSegment[] = timeline.map((s) => ({ ...s }));
  if (!edits?.length) return segs;
  const songEnd = Math.max(durationSeconds, segs[segs.length - 1]?.end ?? 0);
  // An edited chord is the user's word: certain, with no runner-up.
  const mark = (s: EditedSegment, chord: string): EditedSegment => ({ ...s, chord: chord.trim(), confidence: 1, alternative: undefined, edited: true });

  for (const e of edits) {
    if (e.op === "add") {
      const t = roundTime(e.at);
      const j = segs.findIndex((s) => t >= s.start && t < s.end);
      if (j >= 0 && t - segs[j].start < MIN_LEN) {
        segs[j] = mark(segs[j], e.chord);
      } else if (j >= 0) {
        const tail = mark({ ...segs[j], start: t }, e.chord);
        segs[j] = { ...segs[j], end: t };
        segs.splice(j + 1, 0, tail);
      } else if (t < songEnd) {
        const next = segs.findIndex((s) => s.start > t);
        const end = next >= 0 ? segs[next].start : songEnd;
        segs.splice(next >= 0 ? next : segs.length, 0, mark({ chord: e.chord, start: t, end }, e.chord));
      }
      continue;
    }
    const i = findAt(segs, e.at);
    if (i < 0) continue;
    if (e.op === "set") {
      segs[i] = mark(segs[i], e.chord);
    } else if (e.op === "remove") {
      if (segs.length <= 1) continue;
      const [gone] = segs.splice(i, 1);
      // The chord before it rings on until the next one (no invented chord fills the hole).
      if (i > 0) segs[i - 1] = { ...segs[i - 1], end: gone.end };
    } else if (e.op === "move") {
      const lo = i > 0 ? segs[i - 1].start + MIN_LEN : 0;
      const hi = segs[i].end - MIN_LEN;
      if (hi <= lo) continue;
      const to = Math.min(Math.max(roundTime(e.to), lo), hi);
      segs[i] = { ...segs[i], start: to, edited: true };
      if (i > 0) segs[i - 1] = { ...segs[i - 1], end: to };
    }
  }
  return segs;
}
