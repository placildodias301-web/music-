import { describe, expect, it } from "vitest";
import type { ChordSegment } from "../api";
import { makeAnalysis, seedSong, SONG_FILE } from "../../test/fixtures";
import { loadChordEdits, resolveLibrarySong, saveChordEdits, saveToLibrary, updateLibrarySongState } from "../library";
import { applyChordEdits, validateChordEdits, type ChordEdit } from "./chordEdits";
import { parseLyrics } from "./lyrics";
import { buildDetectedSections, buildSongSections } from "./sections";
import { buildSheet, sheetPath } from "./sheetData";

const TL: ChordSegment[] = [
  { chord: "G", start: 0, end: 2, confidence: 0.9 },
  { chord: "D", start: 2, end: 4, confidence: 0.3, alternative: "Bm" },
  { chord: "Em", start: 4, end: 6, confidence: 0.9 },
  { chord: "C", start: 6, end: 8, confidence: 0.9 },
];
const chords = (segs: ChordSegment[]) => segs.map((s) => `${s.chord}@${s.start}-${s.end}`);

describe("applyChordEdits: raw analysis + corrections = displayed timeline", () => {
  it("never modifies the analysed timeline", () => {
    const before = JSON.stringify(TL);
    applyChordEdits(TL, [{ op: "set", at: 2, chord: "Bm" }, { op: "remove", at: 4 }]);
    expect(JSON.stringify(TL)).toBe(before);
  });

  it("renames a chord and marks it certain and edited", () => {
    const out = applyChordEdits(TL, [{ op: "set", at: 2, chord: "Bm" }]);
    expect(out[1]).toMatchObject({ chord: "Bm", start: 2, end: 4, confidence: 1, edited: true });
    expect(out[1].alternative).toBeUndefined();
  });

  it("removing a chord lets the previous one ring on (no invented chord)", () => {
    expect(chords(applyChordEdits(TL, [{ op: "remove", at: 2 }]))).toEqual(["G@0-4", "Em@4-6", "C@6-8"]);
  });

  it("adding a chord mid-way splits the chord it lands in", () => {
    expect(chords(applyChordEdits(TL, [{ op: "add", at: 5, chord: "A7" }]))).toEqual(["G@0-2", "D@2-4", "Em@4-5", "A7@5-6", "C@6-8"]);
  });

  it("moving a chord shifts the boundary with the chord before it, never past its neighbours", () => {
    expect(chords(applyChordEdits(TL, [{ op: "move", at: 2, to: 1.5 }]))).toEqual(["G@0-1.5", "D@1.5-4", "Em@4-6", "C@6-8"]);
    const clamped = applyChordEdits(TL, [{ op: "move", at: 2, to: 9 }]);
    expect(clamped[1].start).toBeLessThan(clamped[1].end);
    expect(clamped[0].end).toBe(clamped[1].start);
  });

  it("replays edits in order and skips ones that no longer match a chord", () => {
    const edits: ChordEdit[] = [
      { op: "set", at: 2, chord: "Bm" },
      { op: "move", at: 2, to: 2.5 },
      { op: "set", at: 2, chord: "X" }, // the chord moved away: no match, ignored
    ];
    expect(chords(applyChordEdits(TL, edits))).toEqual(["G@0-2.5", "Bm@2.5-4", "Em@4-6", "C@6-8"]);
  });

  it("validates stored edit lists", () => {
    expect(validateChordEdits([{ op: "set", at: 1, chord: "F#m7" }])).toHaveLength(1);
    expect(() => validateChordEdits([{ op: "set", at: 1, chord: "hello world" }])).toThrow();
    expect(() => validateChordEdits([{ op: "move", at: -1, to: 2 }])).toThrow();
    expect(() => validateChordEdits("nope")).toThrow();
  });
});

describe("buildSheet: one sheet for the preview and the full page", () => {
  it("applies corrections, counts uncorrected low-confidence chords and reports missing lyrics", () => {
    const analysis = makeAnalysis({ chordTimeline: TL, durationSeconds: 8 });
    const raw = buildSheet(analysis, [], null);
    expect(raw.uncertainCount).toBe(1);
    expect(raw.hasLyrics).toBe(false);
    const fixed = buildSheet(analysis, [{ op: "set", at: 2, chord: "D" }], null);
    expect(fixed.uncertainCount).toBe(0);
    expect(fixed.analysis.chordTimeline[1].edited).toBe(true);
    expect(analysis.chordTimeline[1].confidence).toBe(0.3);
  });

  it("places corrected chords over the lyric words they are sung on", () => {
    const analysis = makeAnalysis({ chordTimeline: TL, durationSeconds: 8 });
    const lyrics = parseLyrics("[Verse 1]\n[00:00.00]I remember when we first met\n[00:04.00]You were standing by the door");
    const sheet = buildSheet(analysis, [{ op: "set", at: 2, chord: "Bm" }], lyrics);
    expect(sheet.hasLyrics).toBe(true);
    const [first] = sheet.sections[0].lines;
    expect(first.chords.map((c) => c.originalChord)).toEqual(["G", "Bm"]);
    // Bm starts halfway through the line, so it sits over a later word than G.
    expect(first.chords[1].charIndex).toBeGreaterThan(first.chords[0].charIndex);
  });

  it("links to the saved song's sheet, or the session's current one", () => {
    expect(sheetPath("abc-1")).toBe("/song/abc-1");
    expect(sheetPath(null)).toBe("/song/current");
    expect(sheetPath("abc-1", 12.34)).toBe("/song/abc-1?t=12.3");
  });
});

describe("detected sections on a chords-only sheet", () => {
  const analysis = makeAnalysis({
    chordTimeline: TL,
    durationSeconds: 8,
    bpm: 120,
    sections: [
      { label: "intro", start: 0, end: 2 },
      { label: "verse", start: 2, end: 4 },
      { label: "chorus", start: 4, end: 6 },
      { label: "verse", start: 6, end: 8 },
    ],
  });

  it("uses the analysis's own section labels, numbering repeats", () => {
    expect(buildDetectedSections(analysis).map((s) => s.name)).toEqual(["Intro", "Verse 1", "Chorus", "Verse 2"]);
    expect(buildSongSections(analysis, null).map((s) => s.name)).toEqual(["Intro", "Verse 1", "Chorus", "Verse 2"]);
  });

  it("falls back to repetition naming when the analysis found fewer than two sections", () => {
    const none = makeAnalysis({ chordTimeline: TL, durationSeconds: 8, sections: [{ label: "verse", start: 0, end: 8 }] });
    expect(buildDetectedSections(none)).toEqual([]);
    expect(buildSongSections(none, null)[0].name).toMatch(/^Section [A-Z]$/);
  });
});

describe("chord corrections are stored with the song, apart from its analysis", () => {
  it("a saved song keeps its corrections on the Library record (synced) and its analysis untouched", () => {
    const saved = seedSong();
    saveChordEdits(saved.id, saved.fileName, [{ op: "set", at: 2, chord: "Em" }]);
    const reread = resolveLibrarySong(saved.id)!;
    expect(reread.chordEdits).toEqual([{ op: "set", at: 2, chord: "Em" }]);
    expect(reread.analysis.chordTimeline[1].chord).toBe("G");
    expect(loadChordEdits(saved.id, saved.fileName)).toHaveLength(1);
  });

  it("corrections made before saving come along when the song is saved", () => {
    saveChordEdits(`file:${SONG_FILE}`, SONG_FILE, [{ op: "remove", at: 4 }]);
    expect(loadChordEdits(`file:${SONG_FILE}`, SONG_FILE)).toHaveLength(1);
    const saved = saveToLibrary(SONG_FILE, makeAnalysis());
    expect(saved.chordEdits).toEqual([{ op: "remove", at: 4 }]);
  });

  it("accepts capo up to 12 for the sheet's capo control", () => {
    const saved = seedSong();
    expect(updateLibrarySongState(saved.id, { capo: 12 })?.capo).toBe(12);
  });
});
