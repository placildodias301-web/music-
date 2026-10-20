/**
 * Parses lyrics the user provides: plain text (optionally with [Verse 1] /
 * "Chorus:" headers), standard LRC ([mm:ss.xx] per line) and enhanced LRC
 * with word times (<mm:ss.xx> before each word). Lyrics are never invented:
 * if text has no timing, lines stay untimed until synced.
 */
import type { ParsedLyricLine, ParsedLyrics, ParsedLyricSection, SectionKind } from "./model";

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const META_TAG = /^\[(ti|ar|al|by|offset|length|re|ve|au|la):.*\]$/i;

const KIND_WORDS: [RegExp, SectionKind][] = [
  [/^pre[\s-]?chorus/i, "Pre-Chorus"],
  [/^chorus|^refrain|^hook/i, "Chorus"],
  [/^verse/i, "Verse"],
  [/^bridge|^middle ?8/i, "Bridge"],
  [/^intro/i, "Intro"],
  [/^outro|^ending|^coda/i, "Outro"],
  [/^solo|^instrumental|^interlude|^break/i, "Instrumental"],
];

function toSeconds(m: string, s: string, frac?: string): number {
  const f = frac ? Number(`0.${frac}`) : 0;
  return Number(m) * 60 + Number(s) + f;
}

/** "[Verse 1]", "Verse 1:", "(Chorus)" → "Verse 1"; otherwise null. */
export function sectionHeader(line: string): string | null {
  const t = line.trim();
  const m = /^[[(]\s*([^\])]+?)\s*[\])]$/.exec(t) ?? /^([A-Za-z][A-Za-z0-9 -]{1,24}):$/.exec(t);
  if (!m) return null;
  const name = m[1].trim();
  if (/^\d/.test(name)) return null;
  return KIND_WORDS.some(([re]) => re.test(name)) ? name : null;
}

export function kindOf(name: string): SectionKind {
  return KIND_WORDS.find(([re]) => re.test(name.trim()))?.[1] ?? "Section";
}

function parseLrcLine(raw: string): { starts: number[]; text: string; words?: ParsedLyricLine["words"] } | null {
  const starts: number[] = [];
  let rest = raw.trim();
  for (;;) {
    TIME_TAG.lastIndex = 0;
    const m = TIME_TAG.exec(rest);
    if (!m || m.index !== 0) break;
    starts.push(toSeconds(m[1], m[2], m[3]));
    rest = rest.slice(m[0].length).trimStart();
  }
  if (!starts.length) return null;
  // Enhanced LRC: <time>word <time>word …
  WORD_TAG.lastIndex = 0;
  const tags = [...rest.matchAll(WORD_TAG)];
  if (!tags.length) return { starts, text: rest };
  const words: NonNullable<ParsedLyricLine["words"]> = [];
  tags.forEach((tag, i) => {
    const start = toSeconds(tag[1], tag[2], tag[3]);
    const from = (tag.index ?? 0) + tag[0].length;
    const to = i + 1 < tags.length ? (tags[i + 1].index ?? rest.length) : rest.length;
    const word = rest.slice(from, to).trim();
    if (!word) return;
    const next = i + 1 < tags.length ? toSeconds(tags[i + 1][1], tags[i + 1][2], tags[i + 1][3]) : start + 0.5;
    words.push({ word, start, end: Math.max(start + 0.05, next) });
  });
  const text = words.map((w) => w.word).join(" ");
  return { starts: starts.length ? starts : [words[0]?.start ?? 0], text, words };
}

export function parseLyrics(input: string): ParsedLyrics {
  const rawLines = input.replace(/\r\n?/g, "\n").split("\n");
  const sections: ParsedLyricSection[] = [];
  let current: ParsedLyricSection = { name: null, lines: [] };
  const push = () => {
    if (current.lines.length || current.name) sections.push(current);
  };
  let anyTimed = false;
  let anyLine = false;
  let offset = 0;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    const off = /^\[offset:\s*(-?\d+)\s*\]$/i.exec(trimmed);
    if (off) {
      offset = Number(off[1]) / 1000;
      continue;
    }
    if (META_TAG.test(trimmed)) continue;
    if (!trimmed) {
      // A blank line ends a stanza; the next lines start an unnamed section.
      if (current.lines.length) {
        push();
        current = { name: null, lines: [] };
      }
      continue;
    }
    const header = sectionHeader(trimmed);
    if (header) {
      push();
      current = { name: header, lines: [] };
      continue;
    }
    const lrc = parseLrcLine(trimmed);
    if (lrc) {
      anyTimed = true;
      anyLine = true;
      // A line with several time tags is sung several times (repeats).
      for (const t of lrc.starts) {
        const shift = (x: number) => Math.max(0, x + offset);
        current.lines.push({
          text: lrc.text,
          startTime: shift(t),
          words: lrc.words?.map((w) => ({ ...w, start: shift(w.start), end: shift(w.end) })),
        });
      }
      continue;
    }
    anyLine = true;
    current.lines.push({ text: trimmed, startTime: null });
  }
  push();

  const lines = sections.flatMap((s) => s.lines);
  const timed = anyLine && lines.every((l) => l.startTime !== null);
  if (anyTimed) for (const s of sections) s.lines.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  return { sections, timed, format: anyTimed ? "lrc" : "plain" };
}
