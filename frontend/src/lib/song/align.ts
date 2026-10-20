/**
 * Chord + lyric alignment engine.
 *
 * Inputs: timed lyric lines (optionally with word times) and the analysed
 * chord timeline. For every line it finds the chord changes that happen
 * during the line and attaches each one to the lyric position being sung at
 * that moment: with word times, the word active at the chord's timestamp;
 * without, the word at the same fraction of the line's duration (snapped to
 * a word start). Chords are never all dumped at the start of the line.
 */
import type { ChordSegment } from "../api";
import type { ChordEvent, LyricLine, LyricWord, ParsedLyricLine } from "./model";

const EPS = 0.05; // a chord starting this close before a line still counts as "at the start"
/** A chord's time can sit before a word's start by this much and still belong to it. */
const WORD_LEAD = 0.18;

export function wordsOf(text: string): { word: string; charStart: number }[] {
  const out: { word: string; charStart: number }[] = [];
  const re = /\S+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ word: m[0], charStart: m.index });
  return out;
}

/** Word timings: given ones, or none. Returns words with charStart filled in. */
export function indexWords(text: string, given?: ParsedLyricLine["words"]): LyricWord[] | undefined {
  if (!given?.length) return undefined;
  const spans = wordsOf(text);
  if (spans.length !== given.length) {
    // Text and timings disagree (user edited the text): don't trust the word times.
    return undefined;
  }
  return given.map((g, i) => ({ word: g.word, start: g.start, end: g.end, charStart: spans[i].charStart }));
}

/** charIndex for a chord at time `t` inside [start, end) of a line. */
export function charIndexAt(text: string, t: number, start: number, end: number, words?: LyricWord[]): number {
  const spans = wordsOf(text);
  if (!spans.length) return 0;
  if (words?.length) {
    // The word sounding at t; a chord landing in a gap between words belongs to the next word.
    for (const w of words) if (t >= w.start - WORD_LEAD && t < w.end) return w.charStart;
    const next = words.find((w) => w.start >= t);
    if (next) return next.charStart;
    return words[words.length - 1].charStart;
  }
  const span = Math.max(end - start, 0.001);
  const frac = Math.min(Math.max((t - start) / span, 0), 0.999);
  const target = frac * text.length;
  // Nearest word start to the proportional character position.
  let best = spans[0].charStart;
  let bestDist = Infinity;
  for (const s of spans) {
    const d = Math.abs(s.charStart - target);
    if (d < bestDist) {
      bestDist = d;
      best = s.charStart;
    }
  }
  return best;
}

/** Chords sounding between `start` and `end`, with the chord already ringing at `start` first. */
export function chordsForInterval(timeline: ChordSegment[], start: number, end: number): { seg: ChordSegment; carried: boolean }[] {
  const out: { seg: ChordSegment; carried: boolean }[] = [];
  for (const seg of timeline) {
    if (seg.end <= start + EPS) continue;
    if (seg.start >= end - EPS) break;
    out.push({ seg, carried: seg.start < start - EPS });
  }
  return out;
}

export interface AlignOptions {
  /** Line ends computed across the whole song (so a section's last line stops where the next section starts). */
  ends?: (number | null)[];
  /** Longest a last line is assumed to run when no end is known (seconds). */
  maxLineSeconds?: number;
}

/** Builds the chord events for one timed line. */
export function alignLine(
  line: { text: string; startTime: number; endTime: number; words?: LyricWord[] },
  timeline: ChordSegment[]
): ChordEvent[] {
  const events: ChordEvent[] = [];
  const inLine = chordsForInterval(timeline, line.startTime, line.endTime);
  for (const { seg, carried } of inLine) {
    const time = carried ? line.startTime : seg.start;
    const idx = carried ? firstWordStart(line.text) : charIndexAt(line.text, time, line.startTime, line.endTime, line.words);
    events.push({
      originalChord: seg.chord,
      time: seg.start,
      endTime: Math.min(seg.end, line.endTime),
      charIndex: idx,
      confidence: seg.confidence,
      carried,
    });
  }
  // Keep chords in time order; two chords on one character stay in order (rendered side by side).
  events.sort((a, b) => a.time - b.time);
  return events;
}

function firstWordStart(text: string): number {
  return wordsOf(text)[0]?.charStart ?? 0;
}

/** Line end = next line's start, else start + the line's own length estimate. */
export function lineEnds(starts: (number | null)[], durationSeconds: number, maxLineSeconds = 8): (number | null)[] {
  return starts.map((s, i) => {
    if (s === null) return null;
    const next = starts.slice(i + 1).find((x): x is number => x !== null);
    const hard = next ?? durationSeconds;
    // A line never claims more than maxLineSeconds: a longer gap is an instrumental break.
    return Math.min(hard, s + maxLineSeconds);
  });
}

/** Builds LyricLines (with chords) from parsed lines in order. Untimed lines get no chords. */
export function alignLines(
  parsed: ParsedLyricLine[],
  timeline: ChordSegment[],
  durationSeconds: number,
  idPrefix = "l",
  options: AlignOptions = {}
): LyricLine[] {
  const ends = options.ends ?? lineEnds(parsed.map((p) => p.startTime), durationSeconds, options.maxLineSeconds);
  return parsed.map((p, i) => {
    const words = indexWords(p.text, p.words);
    const start = p.startTime;
    const end = ends[i];
    const base: LyricLine = { id: `${idPrefix}${i}`, text: p.text, startTime: start, endTime: end, words, chords: [] };
    if (start === null || end === null || end <= start) return base;
    return { ...base, chords: alignLine({ text: p.text, startTime: start, endTime: end, words }, timeline) };
  });
}

/** Splits a line's text at its chords' character indexes → renderable chunks. */
export interface LineChunk {
  text: string;
  chord: ChordEvent | null;
}
export function chunkLine(text: string, chords: ChordEvent[]): LineChunk[] {
  if (!chords.length) return [{ text, chord: null }];
  const sorted = [...chords].sort((a, b) => a.charIndex - b.charIndex || a.time - b.time);
  const chunks: LineChunk[] = [];
  const first = sorted[0].charIndex;
  if (first > 0) chunks.push({ text: text.slice(0, first), chord: null });
  sorted.forEach((c, i) => {
    const from = c.charIndex;
    const to = i + 1 < sorted.length ? sorted[i + 1].charIndex : text.length;
    chunks.push({ text: text.slice(from, Math.max(from, to)), chord: c });
  });
  return chunks;
}
