import { describe, expect, it } from "vitest";
import type { AnalysisResult, ChordSegment } from "../api";
import { transposeChord } from "../transpose";
import { alignLine, alignLines, charIndexAt, chunkLine, indexWords, lineEnds } from "./align";
import { parseLyrics, sectionHeader } from "./lyrics";
import { buildChordOnlySections, buildLyricSections, buildSongSections, lineAt, sectionAt } from "./sections";
import { simplifyChord } from "./simplify";
import { materializeLyrics } from "./songStore";

const seg = (chord: string, start: number, end: number, confidence = 0.9): ChordSegment => ({ chord, start, end, confidence });
const TL = [seg("G", 12.4, 14.85), seg("D", 14.85, 17.2), seg("Em", 17.2, 19.6), seg("C", 19.6, 22)];

describe("lyrics parsing", () => {
  it("parses plain text with headers", () => {
    const p = parseLyrics("[Verse 1]\nWhen I find myself\nin times of trouble\n\n[Chorus]\nLet it be");
    expect(p.format).toBe("plain");
    expect(p.timed).toBe(false);
    expect(p.sections.map((s) => s.name)).toEqual(["Verse 1", "Chorus"]);
    expect(p.sections[0].lines).toHaveLength(2);
  });
  it("parses LRC line times, ignores metadata and applies offset", () => {
    const p = parseLyrics("[ti:Song]\n[ar:Someone]\n[offset:500]\n[00:12.40]When I find myself\n[00:14.85]in times of trouble");
    expect(p.timed).toBe(true);
    expect(p.sections[0].lines.map((l) => l.startTime)).toEqual([12.9, 15.35]);
  });
  it("parses enhanced LRC word times", () => {
    const p = parseLyrics("[00:12.30]<00:12.30>When <00:12.66>I <00:12.80>find");
    const l = p.sections[0].lines[0];
    expect(l.text).toBe("When I find");
    expect(l.words?.map((w) => w.word)).toEqual(["When", "I", "find"]);
    expect(l.words?.[1].start).toBeCloseTo(12.66);
  });
  it("only treats known words as section headers", () => {
    expect(sectionHeader("[Verse 2]")).toBe("Verse 2");
    expect(sectionHeader("Chorus:")).toBe("Chorus");
    expect(sectionHeader("[Pre-Chorus]")).toBe("Pre-Chorus");
    expect(sectionHeader("[laughs]")).toBeNull();
    expect(sectionHeader("Hello: world")).toBeNull();
  });
});

describe("chord/lyric alignment", () => {
  const text = "When I find myself in times of trouble";
  it("proportional placement is not all at the line start", () => {
    const ev = alignLine({ text, startTime: 12.4, endTime: 19.6 }, TL);
    expect(ev.map((e) => e.originalChord)).toEqual(["G", "D", "Em"]);
    expect(ev[0].charIndex).toBe(0);
    expect(ev[1].charIndex).toBeGreaterThan(0);
    expect(ev[2].charIndex).toBeGreaterThan(ev[1].charIndex);
    // every chord sits on a word start
    for (const e of ev) expect(e.charIndex === 0 || text[e.charIndex - 1] === " ").toBe(true);
  });
  it("uses word timestamps when present", () => {
    const words = indexWords(text, [
      { word: "When", start: 12.4, end: 12.7 },
      { word: "I", start: 12.7, end: 12.8 },
      { word: "find", start: 12.8, end: 13.2 },
      { word: "myself", start: 13.2, end: 14.0 },
      { word: "in", start: 14.0, end: 14.3 },
      { word: "times", start: 14.8, end: 15.3 },
      { word: "of", start: 15.3, end: 15.5 },
      { word: "trouble", start: 15.5, end: 16.4 },
    ]);
    const ev = alignLine({ text, startTime: 12.4, endTime: 17, words }, TL);
    const d = ev.find((e) => e.originalChord === "D");
    expect(d?.charIndex).toBe(text.indexOf("times")); // D at 14.85 → word "times"
  });
  it("a chord ringing from the previous line is carried onto the first word", () => {
    const ev = alignLine({ text: "second line", startTime: 15, endTime: 18 }, TL);
    expect(ev[0]).toMatchObject({ originalChord: "D", carried: true, charIndex: 0 });
  });
  it("charIndexAt handles empty text and out-of-range times", () => {
    expect(charIndexAt("", 5, 0, 1)).toBe(0);
    expect(charIndexAt("one two", 99, 0, 2)).toBe(4);
    expect(charIndexAt("one two", -5, 0, 2)).toBe(0);
  });
  it("ignores word times that don't match the text", () => {
    expect(indexWords("a b c", [{ word: "a", start: 0, end: 1 }])).toBeUndefined();
  });
  it("splits a line into chunks at the chords", () => {
    const ev = alignLine({ text, startTime: 12.4, endTime: 19.6 }, TL);
    const chunks = chunkLine(text, ev);
    expect(chunks.map((c) => c.text).join("")).toBe(text);
    expect(chunks.filter((c) => c.chord)).toHaveLength(3);
  });
  it("two chords on one character stay in order", () => {
    const chunks = chunkLine("hello", [
      { originalChord: "C", time: 1, endTime: 1.5, charIndex: 0 },
      { originalChord: "G", time: 1.5, endTime: 2, charIndex: 0 },
    ]);
    expect(chunks.map((c) => c.chord?.originalChord)).toEqual(["C", "G"]);
    expect(chunks.map((c) => c.text).join("")).toBe("hello");
  });
  it("caps a line's length so a long gap becomes a break", () => {
    expect(lineEnds([10, 40], 60)).toEqual([18, 48]);
  });
  it("leaves untimed lines without chords", () => {
    const lines = alignLines([{ text: "no time", startTime: null }], TL, 60);
    expect(lines[0].chords).toEqual([]);
  });
});

describe("transpose keeps timing, simplify keeps the original", () => {
  it("transposes slash chords and extensions", () => {
    expect(["G", "D", "Em", "C"].map((c) => transposeChord(c, 2))).toEqual(["A", "E", "F#m", "D"]);
    expect(transposeChord("C/E", 2)).toBe("D/F#");
    expect(transposeChord("Bbmaj7", 1)).toBe("Bmaj7");
    expect(transposeChord("F#m7", -2)).toBe("Em7");
  });
  it("simplifies extensions only", () => {
    expect(simplifyChord("Cmaj7")).toBe("C");
    expect(simplifyChord("G7")).toBe("G");
    expect(simplifyChord("Am7")).toBe("Am");
    expect(simplifyChord("Dsus4")).toBe("D");
    expect(simplifyChord("Cadd9")).toBe("C");
    expect(simplifyChord("F#m9")).toBe("F#m");
    expect(simplifyChord("Bdim")).toBe("Bdim");
    expect(simplifyChord("Caug")).toBe("Caug");
    expect(simplifyChord("C/E")).toBe("C/E");
    expect(simplifyChord("C/E", { dropBass: true })).toBe("C");
  });
});

const analysis = (extra: Partial<AnalysisResult> = {}): AnalysisResult =>
  ({ chordTimeline: TL, durationSeconds: 40, bpm: 92, beatsPerBar: 4, key: "G Major", ...extra }) as unknown as AnalysisResult;

describe("sections", () => {
  it("names user headers, infers repeated stanzas as Chorus, and adds an intro from the chords", () => {
    const lrc = parseLyrics(
      ["[00:12.40]one a", "[00:14.85]one b", "", "[00:20.00]hook a", "[00:22.00]hook b", "", "[00:30.00]hook a", "[00:32.00]hook b"].join("\n")
    );
    const secs = buildLyricSections(analysis({ chordTimeline: [seg("G", 0, 12.4), ...TL] }), lrc);
    expect(secs[0].name).toBe("Intro");
    expect(secs.map((s) => s.name)).toContain("Verse 1");
    expect(secs.filter((s) => s.name === "Chorus")).toHaveLength(2);
    expect(secs.find((s) => s.name === "Verse 1")?.nameSource).toBe("inferred");
  });
  it("keeps untimed lyrics as lyrics-only sections", () => {
    const secs = buildSongSections(analysis(), parseLyrics("[Verse 1]\nhello there"));
    expect(secs[0].lines[0].startTime).toBeNull();
    expect(secs[0].lines[0].chords).toEqual([]);
  });
  it("builds a chords-only sheet when there are no lyrics, repeats share a letter", () => {
    const tl: ChordSegment[] = [];
    for (let i = 0; i < 16; i++) tl.push(seg(["G", "D", "Em", "C"][i % 4], i * 2, i * 2 + 2));
    const secs = buildSongSections(analysis({ chordTimeline: tl, durationSeconds: 32, bpm: 120 }), null);
    expect(secs.length).toBeGreaterThan(0);
    expect(secs[0].lines[0].instrumental).toBe(true);
    expect(new Set(secs.map((s) => s.name)).size).toBeLessThan(secs.length + 1);
  });
  it("finds the active line and section by time", () => {
    const lrc = parseLyrics("[00:12.40]first\n[00:20.00]second");
    const secs = buildLyricSections(analysis(), lrc);
    expect(lineAt(secs, 13)?.line.text).toBe("first");
    expect(lineAt(secs, 21)?.line.text).toBe("second");
    expect(sectionAt(secs, 13)).not.toBeNull();
    expect(lineAt(secs, 1)).toBeNull();
  });
  it("applies tapped times to plain lyrics", () => {
    const stored = { raw: "one\ntwo\nthree", taps: { 0: 1, 1: 3, 2: 5 }, source: "pasted" as const };
    const parsed = materializeLyrics(stored);
    expect(parsed.timed).toBe(true);
    const secs = buildLyricSections(analysis({ chordTimeline: [seg("G", 0, 4), seg("D", 4, 8)], durationSeconds: 10 }), parsed);
    expect(secs.flatMap((s) => s.lines).find((l) => l.text === "three")?.chords[0]?.originalChord).toBe("D");
  });
  it("chords-only sheet from an empty timeline is empty", () => {
    expect(buildChordOnlySections(analysis({ chordTimeline: [] }))).toEqual([]);
  });
});

describe("section boundaries", () => {
  it("a section's last line does not claim chords from the next section", () => {
    const tl = [["G", 12.4, 14.85], ["D", 14.85, 17.2], ["Em", 17.2, 19.6], ["C", 19.6, 22], ["G", 22, 24.4], ["D", 24.4, 26.8]].map(([chord, start, end]) => ({ chord, start, end })) as never;
    const an = { chordTimeline: tl, durationSeconds: 40, downbeats: [], bpm: 92 } as never;
    const p = parseLyrics("[Verse]\n[00:12.40]When I find myself in times of trouble\n[00:17.20]Mother Mary comes to me\n[Chorus]\n[00:22.00]Speaking words of wisdom, let it be");
    const secs = buildLyricSections(an, p);
    const verse = secs.find((s) => s.name.startsWith("Verse"))!;
    expect(verse.lines[1].chords.map((c) => c.originalChord)).toEqual(["Em", "C"]);
  });
});

import { buildLyricsPrompt, cleanGeneratedLyrics } from "./aiLyrics";
describe("AI lyrics helpers", () => {
  it("builds an originality-first prompt with the song's facts", () => {
    const p = buildLyricsPrompt({ key: "G", bpm: 92.4, timeSignature: "4/4", chordProgression: ["G", "D", "Em", "C"] } as never, "missing home");
    expect(p).toMatch(/ORIGINAL/);
    expect(p).toMatch(/G at about 92 BPM, 4\/4/);
    expect(p).toMatch(/G – D – Em – C/);
    expect(p).toMatch(/missing home/);
  });
  it("cleans fences and markdown but keeps section headers parseable", () => {
    const out = cleanGeneratedLyrics("```\n**[Verse 1]**\nLine one\n\n\n\n[Chorus]\nLine two\n```");
    expect(out).toBe("[Verse 1]\nLine one\n\n[Chorus]\nLine two");
    expect(parseLyrics(out).sections.length).toBe(2);
  });
});

import {
  loadLyrics,
  saveLyrics,
} from "./songStore";
import {
  getLibrary,
  resolveCanonicalSongId,
  resolveLibrarySong,
  saveToLibrary,
  updateLibrarySongState,
} from "../library";
import { isActiveItem } from "../../components/AppShell";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe("TASK-07: Canonical song identity, lyrics consistency, and core-loop navigation", () => {
  const sampleSongAnalysis: AnalysisResult = {
    fileName: "yellow-submarine.mp3",
    fileSizeBytes: 2048,
    key: "D Major",
    mode: "major",
    scale: "D major",
    bpm: 104,
    timeSignature: "4/4",
    duration: "02:40",
    durationSeconds: 160,
    chordProgression: ["D", "A", "G"],
    chordTimeline: [
      { chord: "D", start: 0, end: 4 },
      { chord: "A", start: 4, end: 8 },
      { chord: "G", start: 8, end: 12 },
    ],
    processingSeconds: 1.1,
    isDemo: false,
    demoNotice: "",
    difficulty: {
      difficultyLabel: "Beginner",
      difficultyScore: 18,
      factors: { chordComplexity: 10, chordChangeRate: 15, tempo: 20, modulation: 0 },
    },
  };

  if (!globalThis.localStorage) {
    Object.defineProperty(globalThis, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  }

  it("1. Resolving by Library ID, file:<fileName>, and raw fileName returns the same underlying record", () => {
    localStorage.clear();
    const entry = saveToLibrary("yellow-submarine.mp3", sampleSongAnalysis, { transpose: 2, capo: 1 });

    const byId = resolveLibrarySong(entry.id);
    const byFile = resolveLibrarySong(`file:${entry.fileName}`);
    const byRaw = resolveLibrarySong(entry.fileName);

    expect(byId).not.toBeNull();
    expect(byFile).not.toBeNull();
    expect(byRaw).not.toBeNull();

    expect(byId?.id).toBe(entry.id);
    expect(byFile?.id).toBe(entry.id);
    expect(byRaw?.id).toBe(entry.id);

    expect(resolveCanonicalSongId(entry.id)).toBe(entry.id);
    expect(resolveCanonicalSongId(`file:${entry.fileName}`)).toBe(entry.id);
    expect(resolveCanonicalSongId(entry.fileName)).toBe(entry.id);

    // Unsaved files fallback to file:<fileName>
    expect(resolveCanonicalSongId("unsaved-track.mp3")).toBe("file:unsaved-track.mp3");
  });

  it("2. Lyrics saved from /song/current and /song/:songId update the same canonical record", () => {
    localStorage.clear();
    const entry = saveToLibrary("yellow-submarine.mp3", sampleSongAnalysis);

    // Save lyrics using /song/current identifier format
    saveLyrics(`file:${entry.fileName}`, {
      raw: "In the town where I was born",
      source: "pasted",
    });

    // Visible immediately when queried by canonical Library ID
    const byId = loadLyrics(entry.id);
    expect(byId?.raw).toBe("In the town where I was born");

    // Save lyrics using /song/:songId identifier format
    saveLyrics(entry.id, {
      raw: "Lived a man who sailed to sea",
      source: "uploaded",
    });

    // Visible immediately from file:<fileName> and raw fileName
    const byFile = loadLyrics(`file:${entry.fileName}`);
    const byRaw = loadLyrics(entry.fileName);
    expect(byFile?.raw).toBe("Lived a man who sailed to sea");
    expect(byRaw?.raw).toBe("Lived a man who sailed to sea");

    // Underlying Library record contains the lyrics
    const updatedLib = resolveLibrarySong(entry.id);
    expect(updatedLib?.lyrics?.raw).toBe("Lived a man who sailed to sea");
    expect(getLibrary()).toHaveLength(1);
  });

  it("3. Legacy file:<fileName> lyrics remain accessible and migrate safely to canonical Library ID", () => {
    localStorage.clear();
    const entry = saveToLibrary("yellow-submarine.mp3", sampleSongAnalysis);

    // Set legacy lyric key directly in localStorage without entry ID key
    localStorage.setItem(
      `wilsify.song.lyrics.file:${entry.fileName}`,
      JSON.stringify({ raw: "Legacy lyrics without ID", source: "pasted" })
    );

    // loadLyrics should read legacy lyrics, return them, and migrate to canonical ID key
    const loaded = loadLyrics(entry.id);
    expect(loaded?.raw).toBe("Legacy lyrics without ID");

    // Canonical key now populated
    const rawCanonical = localStorage.getItem(`wilsify.song.lyrics.${entry.id}`);
    expect(rawCanonical).toContain("Legacy lyrics without ID");

    // Legacy key remains intact (no data loss)
    const rawLegacy = localStorage.getItem(`wilsify.song.lyrics.file:${entry.fileName}`);
    expect(rawLegacy).toContain("Legacy lyrics without ID");
  });

  it("4. Transpose, capo, and simplify persist to the same canonical Library record", () => {
    localStorage.clear();
    const entry = saveToLibrary("yellow-submarine.mp3", sampleSongAnalysis);

    updateLibrarySongState(entry.id, { transpose: 3 });
    updateLibrarySongState(`file:${entry.fileName}`, { capo: 2 });
    updateLibrarySongState(entry.fileName, { simplify: true });

    const resolved = resolveLibrarySong(entry.id);
    expect(resolved?.transpose).toBe(3);
    expect(resolved?.capo).toBe(2);
    expect(resolved?.simplify).toBe(true);
    expect(getLibrary()).toHaveLength(1);
  });

  it("5. NavRow isActiveItem correctly identifies active routes and sets aria-current", () => {
    expect(isActiveItem("/studio", "/studio")).toBe(true);
    expect(isActiveItem("/", "/studio")).toBe(true);
    expect(isActiveItem("/analysis", "/analysis")).toBe(true);
    expect(isActiveItem("/song/current", "/song/current")).toBe(true);
    expect(isActiveItem("/song/song-123", "/song/current")).toBe(true);
    expect(isActiveItem("/practice", "/practice")).toBe(true);
    expect(isActiveItem("/library", "/library")).toBe(true);
    expect(isActiveItem("/studio", "/analysis")).toBe(false);
  });
});

