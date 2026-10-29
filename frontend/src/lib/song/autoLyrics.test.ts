import { describe, expect, it } from "vitest";
import type { LyricsTranscription } from "../api";
import { makeAnalysis } from "../../test/fixtures";
import { mediaIdOf, transcriptionToLrc } from "./autoLyrics";
import { parseLyrics } from "./lyrics";
import { buildSheet } from "./sheetData";

const line = (text: string, start: number, stanza = 0) => {
  const parts = text.split(" ");
  const step = 0.4;
  return {
    text,
    start,
    end: start + parts.length * step,
    stanza,
    words: parts.map((word, i) => ({ word, start: +(start + i * step).toFixed(2), end: +(start + (i + 1) * step).toFixed(2) })),
  };
};

const result = (lines: ReturnType<typeof line>[]): LyricsTranscription => ({ lines, words: lines.reduce((n, l) => n + l.words.length, 0), noVocals: false, model: "test", seconds: 1 });

describe("transcribed lyrics → the sheet's lyric format", () => {
  it("reads the media id of the analysis's server audio copy", () => {
    expect(mediaIdOf("/api/audio/abc_123")).toBe("abc_123");
    expect(mediaIdOf("blob:http://x/1")).toBeNull();
    expect(mediaIdOf(null)).toBeNull();
  });

  it("keeps every word's time, so chords land on the word sung when they change", () => {
    const lrc = transcriptionToLrc(result([line("I remember when we met", 0)]));
    expect(lrc).toBe("[00:00.00]<00:00.00>I <00:00.40>remember <00:00.80>when <00:01.20>we <00:01.60>met");
    const parsed = parseLyrics(lrc);
    expect(parsed.timed).toBe(true);
    expect(parsed.sections[0].lines[0].words?.map((w) => w.word)).toEqual(["I", "remember", "when", "we", "met"]);

    const analysis = makeAnalysis({
      durationSeconds: 4,
      chordTimeline: [
        { chord: "G", start: 0, end: 1.2, confidence: 0.9 },
        { chord: "D", start: 1.2, end: 4, confidence: 0.9 },
      ],
    });
    const [sung] = buildSheet(analysis, [], parsed).sections[0].lines;
    const text = sung.text;
    const d = sung.chords.find((c) => c.originalChord === "D")!;
    expect(text.slice(d.charIndex)).toBe("we met"); // D changes on "we", not at the start of the line
  });

  it("uses the analysis's detected sections as headers, numbering repeats", () => {
    const lrc = transcriptionToLrc(result([line("first verse line", 1), line("the chorus line", 11), line("second verse line", 21)]), [
      { label: "verse", start: 0, end: 10 },
      { label: "chorus", start: 10, end: 20 },
      { label: "verse", start: 20, end: 30 },
    ]);
    expect(parseLyrics(lrc).sections.map((s) => s.name)).toEqual(["Verse 1", "Chorus", "Verse 2"]);
  });

  it("without detected sections, splits stanzas at long silences", () => {
    const lrc = transcriptionToLrc(result([line("one", 1, 0), line("two", 3, 0), line("three", 20, 1)]));
    expect(parseLyrics(lrc).sections.map((s) => s.lines.length)).toEqual([2, 1]);
  });
});
