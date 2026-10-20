/**
 * Builds the sheet's sections: from lyrics the user supplied (timed → chords
 * aligned to words; untimed → lyrics only), or, with no lyrics at all, a
 * chords-only sheet straight from the analysis. Section names the user wrote
 * are kept; otherwise they are inferred from repetition and marked as such.
 */
import type { AnalysisResult, ChordSegment } from "../api";
import { alignLines, chordsForInterval, lineEnds } from "./align";
import { kindOf } from "./lyrics";
import type { ChordEvent, LyricLine, ParsedLyrics, ParsedLyricSection, SectionKind, SongSection } from "./model";

const MAX_LINE_SECONDS = 8;
const GAP_FOR_BREAK = 6; // silence in the lyrics longer than this (with chords) becomes an instrumental section

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

function section(id: string, name: string, kind: SectionKind, source: SongSection["nameSource"], lines: LyricLine[]): SongSection {
  const timed = lines.filter((l) => l.startTime !== null);
  return {
    id,
    name,
    kind,
    nameSource: source,
    lines,
    startTime: timed.length ? Math.min(...timed.map((l) => l.startTime as number)) : null,
    endTime: timed.length ? Math.max(...timed.map((l) => (l.endTime ?? l.startTime) as number)) : null,
  };
}

/** Chord-only lines for [from, to): up to `perLine` chord changes per line, no lyric text. */
export function instrumentalLines(timeline: ChordSegment[], from: number, to: number, idPrefix: string, perLine = 4): LyricLine[] {
  const segs = chordsForInterval(timeline, from, to);
  const lines: LyricLine[] = [];
  for (let i = 0; i < segs.length; i += perLine) {
    const group = segs.slice(i, i + perLine);
    const start = Math.max(from, group[0].seg.start);
    const end = Math.min(to, group[group.length - 1].seg.end);
    const chords: ChordEvent[] = group.map(({ seg }) => ({
      originalChord: seg.chord,
      time: seg.start,
      endTime: Math.min(seg.end, to),
      charIndex: 0,
      confidence: seg.confidence,
    }));
    lines.push({ id: `${idPrefix}${lines.length}`, text: "", startTime: start, endTime: end, instrumental: true, chords });
  }
  return lines;
}

function nameStanzas(parsed: ParsedLyricSection[]): { name: string; kind: SectionKind; source: SongSection["nameSource"] }[] {
  const sig = parsed.map((s) => s.lines.map((l) => norm(l.text)).join("|"));
  const count = new Map<string, number>();
  sig.forEach((k) => k && count.set(k, (count.get(k) ?? 0) + 1));
  const counters: Partial<Record<SectionKind, number>> = {};
  return parsed.map((s, i) => {
    if (s.name) {
      const kind = kindOf(s.name);
      return { name: s.name, kind, source: "user" as const };
    }
    const repeated = (count.get(sig[i]) ?? 0) >= 2 && s.lines.length >= 2;
    const kind: SectionKind = repeated ? "Chorus" : "Verse";
    counters[kind] = (counters[kind] ?? 0) + 1;
    return { name: kind === "Chorus" ? "Chorus" : `Verse ${counters[kind]}`, kind, source: "inferred" as const };
  });
}

/** Lyrics-aware sections. Untimed lines are kept as plain lyrics (no chords can be placed on them). */
export function buildLyricSections(analysis: AnalysisResult, lyrics: ParsedLyrics): SongSection[] {
  const names = nameStanzas(lyrics.sections);
  const timeline = analysis.chordTimeline;
  const out: SongSection[] = [];
  const duration = analysis.durationSeconds;

  // Ends are computed over the whole song so a section's last line stops where the next section begins.
  const allEnds = lineEnds(lyrics.sections.flatMap((ps) => ps.lines.map((l) => l.startTime)), duration, MAX_LINE_SECONDS);
  let offset = 0;
  lyrics.sections.forEach((ps, i) => {
    const ends = allEnds.slice(offset, offset + ps.lines.length);
    offset += ps.lines.length;
    const lines = alignLines(ps.lines, timeline, duration, `s${i}l`, { maxLineSeconds: MAX_LINE_SECONDS, ends });
    out.push(section(`s${i}`, names[i].name, names[i].kind, names[i].source, lines));
  });

  if (!lyrics.timed) return out;
  // Instrumental material between / around the sung sections.
  const withTime = out.filter((s) => s.startTime !== null).sort((a, b) => (a.startTime as number) - (b.startTime as number));
  const result: SongSection[] = [];
  const firstStart = withTime[0]?.startTime ?? 0;
  const firstChord = timeline[0]?.start ?? 0;
  if (firstStart - firstChord >= GAP_FOR_BREAK / 2 && timeline.length) {
    result.push(section("intro", "Intro", "Intro", "inferred", instrumentalLines(timeline, firstChord, firstStart, "intro")));
  }
  withTime.forEach((sec, i) => {
    result.push(sec);
    const next = withTime[i + 1];
    const gapEnd = next ? (next.startTime as number) : duration;
    const gapStart = sec.endTime as number;
    if (gapEnd - gapStart >= GAP_FOR_BREAK) {
      const lines = instrumentalLines(timeline, gapStart, gapEnd, `gap${i}`);
      if (lines.length) {
        const last = !next;
        result.push(section(`gap${i}`, last ? "Outro" : "Instrumental", last ? "Outro" : "Instrumental", "inferred", lines));
      }
    }
  });
  // Untimed sections (mixed input) are appended at the end, unchanged.
  return [...result, ...out.filter((s) => s.startTime === null)];
}

/** No lyrics: a chords-only sheet. Bars come from the tracked downbeats when available. */
export function buildChordOnlySections(analysis: AnalysisResult, barsPerLine = 4, linesPerSection = 2): SongSection[] {
  const timeline = analysis.chordTimeline;
  if (!timeline.length) return [];
  const end = analysis.durationSeconds || timeline[timeline.length - 1].end;
  const downbeats = analysis.downbeats ?? [];
  let bounds: number[];
  if (downbeats.length > 1) {
    bounds = [timeline[0].start, ...downbeats.filter((d) => d > timeline[0].start + 0.2)];
    bounds.push(end);
  } else {
    const perBar = (60 / Math.max(analysis.bpm, 1)) * (analysis.beatsPerBar ?? 4);
    bounds = [];
    for (let t = timeline[0].start; t < end; t += perBar) bounds.push(t);
    bounds.push(end);
  }
  const lineBounds: [number, number][] = [];
  for (let i = 0; i + 1 < bounds.length; i += barsPerLine) lineBounds.push([bounds[i], bounds[Math.min(i + barsPerLine, bounds.length - 1)]]);

  const lines: LyricLine[] = lineBounds.map(([a, b], i) => {
    const segs = chordsForInterval(timeline, a, b);
    const chords: ChordEvent[] = segs.map(({ seg, carried }) => ({
      originalChord: seg.chord,
      time: seg.start,
      endTime: Math.min(seg.end, b),
      charIndex: 0,
      confidence: seg.confidence,
      carried,
    }));
    return { id: `c${i}`, text: "", startTime: a, endTime: b, instrumental: true, chords };
  });

  const secs: SongSection[] = [];
  for (let i = 0; i < lines.length; i += linesPerSection) {
    const group = lines.slice(i, i + linesPerSection);
    secs.push(section(`c${secs.length}`, "", "Section", "inferred", group));
  }
  // Name repeats alike: identical chord sequences share a letter.
  const sig = secs.map((s) => s.lines.map((l) => l.chords.map((c) => c.originalChord).join(" ")).join("|"));
  const letters = new Map<string, string>();
  secs.forEach((s, i) => {
    if (!letters.has(sig[i])) letters.set(sig[i], String.fromCharCode(65 + (letters.size % 26)));
    s.name = `Section ${letters.get(sig[i])}`;
  });
  return secs;
}

export function buildSongSections(analysis: AnalysisResult, lyrics: ParsedLyrics | null): SongSection[] {
  if (lyrics && lyrics.sections.some((s) => s.lines.length)) return buildLyricSections(analysis, lyrics);
  return buildChordOnlySections(analysis);
}

/** Section whose time span contains t (null while between sections or untimed). */
export function sectionAt(sections: SongSection[], t: number): SongSection | null {
  return sections.find((s) => s.startTime !== null && s.endTime !== null && t >= s.startTime && t < s.endTime) ?? null;
}

/** The line being sung/played at t. */
export function lineAt(sections: SongSection[], t: number): { section: SongSection; line: LyricLine } | null {
  for (const section of sections) {
    for (const line of section.lines) {
      if (line.startTime !== null && line.endTime !== null && t >= line.startTime && t < line.endTime) return { section, line };
    }
  }
  return null;
}
