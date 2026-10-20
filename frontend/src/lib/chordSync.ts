/**
 * Pure helpers that line the analysis results up with the playback clock:
 * which chord is sounding at time t, where we are in the bar, which part of
 * the song repeats. No React here — the Analysis page components call these
 * on every animation frame, so they stay allocation-light (binary searches
 * over the sorted timeline/beat arrays).
 */

import type { AnalysisResult, ChordSegment } from "./api";

/** Index of the segment sounding at `t`, or -1 when `t` falls in a gap (no chord). */
export function findSegmentIndex(timeline: ChordSegment[], t: number): number {
  let lo = 0;
  let hi = timeline.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = timeline[mid];
    if (t < seg.start) hi = mid - 1;
    else if (t >= seg.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/**
 * Like findSegmentIndex, but a chord never disappears: in a gap (or before the first chord, or
 * after the last one) the chord that was ringing stays current. -1 only for an empty timeline.
 * Older saved analyses can still contain gaps; new ones are gap-free.
 */
export function findHeldSegmentIndex(timeline: ChordSegment[], t: number): number {
  if (!timeline.length) return -1;
  const exact = findSegmentIndex(timeline, t);
  if (exact >= 0) return exact;
  const next = findNextSegmentIndex(timeline, t);
  return Math.max(0, next - 1);
}

/** Index of the first segment starting after `t` (timeline.length if none). */
export function findNextSegmentIndex(timeline: ChordSegment[], t: number): number {
  let lo = 0;
  let hi = timeline.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].start <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the last beat at or before `t` (-1 before the first beat). */
export function findBeatIndex(beats: number[], t: number): number {
  let lo = 0;
  let hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * Position within the bar (0-based beat number) at time `t`, using the
 * estimated downbeats. null when the meter is unavailable or `t` is outside
 * the tracked beats.
 */
export function beatInBar(analysis: AnalysisResult, t: number): number | null {
  const beats = analysis.beats;
  const downbeats = analysis.downbeats;
  const perBar = analysis.beatsPerBar ?? 4;
  if (!beats?.length || !downbeats?.length || analysis.timeSignatureStatus === "unavailable") return null;
  const beatIdx = findBeatIndex(beats, t);
  if (beatIdx < 0) return null;
  const firstDownbeatIdx = findBeatIndex(beats, downbeats[0] + 1e-3);
  return (((beatIdx - firstDownbeatIdx) % perBar) + perBar) % perBar;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "G#m" → "G♯m" for display (stored symbols keep ASCII "#" for parsing/export). */
export function displayChord(symbol: string): string {
  return symbol.replace(/^([A-G])#/, "$1♯").replace(/^([A-G])b/, "$1♭");
}

/** "G# Minor" → "G♯ minor". */
export function displayKey(key: string): string {
  const [root, mode] = key.split(" ");
  return `${displayChord(root ?? key)}${mode ? ` ${mode.toLowerCase()}` : ""}`;
}

/** "G# Aeolian (Natural Minor)" → "Natural minor"; "C Ionian (Major)" → "Major". */
export function scaleName(analysis: Pick<AnalysisResult, "mode" | "scale">): string {
  const inParens = /\(([^)]+)\)/.exec(analysis.scale)?.[1];
  const name = inParens ?? (analysis.mode === "minor" ? "Natural minor" : "Major");
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export const DEFAULT_LOW_CONFIDENCE = 0.45;

export function isUncertain(seg: ChordSegment, threshold = DEFAULT_LOW_CONFIDENCE): boolean {
  return seg.confidence !== undefined && seg.confidence < threshold;
}

/** True when a symbol is something the chord-shape code can genuinely voice. */
export function isVoiceableChord(symbol: string): boolean {
  return /^[A-G][#b♯♭]?/.test(symbol.trim());
}

/* ─── Repetition ─── */

export interface ChordLoop {
  chords: string[];
  /** Index (into the timeline) where each occurrence starts. */
  occurrences: number[];
}

/**
 * Finds the progression the song keeps coming back to — the 2–8 chord
 * pattern that covers the most of the timeline. Overlapping occurrences
 * are not double-counted. Returns null when nothing repeats at least twice.
 */
export function findMainLoop(timeline: ChordSegment[]): ChordLoop | null {
  const symbols = timeline.map((s) => s.chord);
  let best: ChordLoop | null = null;
  let bestCoverage = 0;

  for (let len = 2; len <= 8; len++) {
    const starts = new Map<string, number[]>();
    for (let i = 0; i + len <= symbols.length; i++) {
      const window = symbols.slice(i, i + len);
      // A "loop" of one repeated chord (C C C) isn't a progression.
      if (new Set(window).size < 2) continue;
      const key = window.join(" ");
      const list = starts.get(key);
      if (!list) starts.set(key, [i]);
      else if (i >= list[list.length - 1] + len) list.push(i);
    }
    for (const [key, occ] of starts) {
      if (occ.length < 2) continue;
      // Prefer patterns that cover more of the song; ties go to the shorter one.
      const coverage = occ.length * len;
      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        best = { chords: key.split(" "), occurrences: occ };
      }
    }
  }
  return best;
}

/* ─── Colour ─── */

// Circle-of-fifths order so harmonically close chords get neighbouring hues.
const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const ROOT_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * A stable hue per chord symbol, so the same chord always looks the same on
 * the timeline and repeated progressions read as repeated colour patterns.
 * Hues are confined to the violet → cyan → blue arc of the Wilsify palette
 * plus warm accents, rather than a full rainbow.
 */
export function chordHue(symbol: string): number {
  const m = /^([A-G])([#b♯♭]?)/.exec(symbol);
  if (!m) return 250;
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0;
  const pc = (ROOT_PC[m[1]] + acc + 12) % 12;
  const step = FIFTHS.indexOf(pc);
  return (200 + step * 30) % 360;
}

export function chordColors(symbol: string) {
  const hue = chordHue(symbol);
  const minor = /^[A-G][#b♯♭]?m(?!aj)/.test(symbol);
  const light = minor ? 62 : 70;
  // light-dark() follows the app theme (color-scheme on <html>): same hue,
  // a deeper shade on white so chord names stay readable.
  return {
    fg: `light-dark(hsl(${hue} 75% ${minor ? 32 : 36}%), hsl(${hue} 85% ${light}%))`,
    bg: `light-dark(hsl(${hue} 70% 55% / 0.16), hsl(${hue} 70% 55% / 0.13))`,
    border: `light-dark(hsl(${hue} 65% 45% / 0.45), hsl(${hue} 70% 60% / 0.35))`,
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * The same chord colours as `chordColors`, as hex + alpha for renderers
 * that don't speak CSS (the PDF lead sheet). `fgOnLight` is the same hue,
 * darkened so chord names stay readable on a white page.
 */
export function chordColorsHex(symbol: string) {
  const hue = chordHue(symbol);
  const minor = /^[A-G][#b♯♭]?m(?!aj)/.test(symbol);
  return {
    fg: hslToHex(hue, 85, minor ? 62 : 70),
    fgOnLight: hslToHex(hue, 75, minor ? 32 : 36),
    fill: hslToHex(hue, 70, 55),
    fillAlpha: 0.13,
    border: hslToHex(hue, 70, 60),
    borderAlpha: 0.35,
  };
}
