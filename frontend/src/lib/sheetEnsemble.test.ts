/**
 * A multi-instrument score from backend/services/instrument_engines.py (fixture:
 * trumpet, piano grand staff, violin, bass TAB) through alphaTab's real importer.
 */
import { describe, expect, it } from "vitest";
import { importer, Settings } from "@coderline/alphatab";
import xml from "./__fixtures__/ensemble.musicxml?raw";
import { prepareGuitarTabScore } from "./sheetTab";

function load() {
  return importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(xml), new Settings());
}

const notesOf = (staff: { bars: { voices: { beats: { notes: unknown[] }[] }[] }[] }) =>
  staff.bars.flatMap((b) => b.voices.flatMap((v) => v.beats.flatMap((beat) => beat.notes))) as any[];

describe("ensemble score in alphaTab", () => {
  it("imports one track per instrument, in score order, with its own sound", () => {
    const score = load();
    expect(score.tracks.map((t) => t.name)).toEqual(["Trumpet", "Piano", "Violin", "Bass"]);
    // MusicXML programs are 1-based, alphaTab's 0-based: trumpet 57, piano 1, violin 41, bass 34.
    expect(score.tracks.map((t) => t.playbackInfo.program)).toEqual([56, 0, 40, 33]);
  });

  it("lays the piano out as a grand staff with melody and bass voices", () => {
    const piano = load().tracks[1];
    expect(piano.staves).toHaveLength(2);
    const rh = notesOf(piano.staves[0]);
    const lh = notesOf(piano.staves[1]);
    expect(rh.length).toBeGreaterThan(0);
    expect(lh.length).toBeGreaterThan(0);
    expect(Math.min(...rh.map((n) => n.realValue))).toBeGreaterThan(Math.max(...lh.map((n) => n.realValue)));
  });

  it("keeps piano fingering and shifts string-player fingering", () => {
    const score = load();
    const pianoBefore = notesOf(score.tracks[1].staves[0]).map((n) => n.leftHandFinger);
    const violinBefore = notesOf(score.tracks[2].staves[0]).map((n) => n.leftHandFinger);
    expect(pianoBefore.every((f) => f >= 0)).toBe(true); // every piano note is fingered 1-5
    prepareGuitarTabScore(score);
    expect(notesOf(score.tracks[1].staves[0]).map((n) => n.leftHandFinger)).toEqual(pianoBefore);
    expect(notesOf(score.tracks[2].staves[0]).map((n) => n.leftHandFinger)).toEqual(
      violinBefore.map((f) => (f >= 0 ? f + 1 : f)),
    );
  });

  it("shows the bass as notation over 4-string TAB on its real strings", () => {
    const score = load();
    const bass = score.tracks[3].staves[0];
    expect(bass.stringTuning.tunings).toEqual([43, 38, 33, 28]);
    expect(prepareGuitarTabScore(score)).toBe(true);
    expect(bass.showStandardNotation && bass.showTablature).toBe(true);
    for (const n of notesOf(bass)) {
      expect(bass.stringTuning.tunings[bass.stringTuning.tunings.length - n.string] + n.fret).toBe(n.realValue);
    }
    // The violin has no tuning in the file: notation only.
    expect(score.tracks[2].staves[0].showTablature).toBe(false);
  });

  it("reads the bowing marks", () => {
    const violinBeats = load().tracks[2].staves[0].bars.flatMap((b) => b.voices.flatMap((v) => v.beats));
    expect(violinBeats.some((b) => b.pickStroke !== 0)).toBe(true);
  });
});
