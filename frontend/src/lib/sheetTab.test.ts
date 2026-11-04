/**
 * The backend's guitar MusicXML (fixture written by backend/services/guitar_tab.py)
 * through alphaTab's real importer: six-string tuning, every note on the string and
 * fret the solver chose, and standard notation shown above the TAB.
 */
import { describe, expect, it } from "vitest";
import { importer, Settings } from "@coderline/alphatab";
import xml from "./__fixtures__/guitarTab.musicxml?raw";
import { prepareGuitarTabScore } from "./sheetTab";

const STANDARD_TUNING = [64, 59, 55, 50, 45, 40]; // alphaTab order: string 1 (high e) first

function load() {
  return importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(xml), new Settings());
}

function allNotes(score: ReturnType<typeof load>) {
  const staff = score.tracks[0].staves[0];
  return staff.bars.flatMap((bar) => bar.voices.flatMap((v) => v.beats.flatMap((b) => b.notes)));
}

describe("generated guitar MusicXML in alphaTab", () => {
  it("imports one guitar track with standard tuning", () => {
    const score = load();
    expect(score.tracks).toHaveLength(1);
    const staff = score.tracks[0].staves[0];
    expect(staff.stringTuning.tunings).toEqual(STANDARD_TUNING);
  });

  it("places every note on the string and fret the solver chose", () => {
    const score = load();
    const notes = allNotes(score);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.isStringed).toBe(true);
      // alphaTab numbers strings from the low E (1) up; the open pitch + fret is the note.
      const open = STANDARD_TUNING[STANDARD_TUNING.length - n.string];
      expect(open + n.fret).toBe(n.realValue);
    }
  });

  it("restores hammer-ons / pull-offs and guitar fingering after import", () => {
    const score = load();
    const notes = allNotes(score);
    expect(notes.some((n) => n.isHammerPullOrigin)).toBe(false); // the importer's limitation
    const fingersBefore = notes.map((n) => n.leftHandFinger);
    prepareGuitarTabScore(score);

    const origins = notes.filter((n) => n.isHammerPullOrigin);
    expect(origins).toHaveLength(1);
    const [origin] = origins;
    expect(origin.hammerPullDestination?.string).toBe(origin.string);
    expect(origin.hammerPullDestination?.hammerPullOrigin).toBe(origin);
    expect(origin.slurDestination).toBeNull();

    // A4 at fret 5 is played with finger 2 in its box: MusicXML "2", alphaTab Middle (2).
    notes.forEach((n, i) => {
      expect(n.leftHandFinger).toBe(fingersBefore[i] >= 0 ? fingersBefore[i] + 1 : fingersBefore[i]);
    });
    expect(notes.filter((n) => n.fret === 0).every((n) => n.leftHandFinger < 0)).toBe(true);
    expect(notes.filter((n) => n.fret > 0).every((n) => n.leftHandFinger >= 1 && n.leftHandFinger <= 4)).toBe(true);

    // The beat lookup alphaTab uses for effects now finds notes by their real string.
    for (const n of notes) expect(n.beat.getNoteOnString(n.string)).toBe(n);
  });

  it("keeps the thumb bass and the melody as two voices", () => {
    const bar = load().tracks[0].staves[0].bars[0];
    const sounding = bar.voices.filter((v) => v.beats.some((b) => b.notes.length > 0));
    expect(sounding.length).toBe(2);
  });

  it("shows standard notation above the TAB", () => {
    const score = load();
    const staff = score.tracks[0].staves[0];
    expect(staff.showTablature).toBe(true);
    expect(staff.showStandardNotation).toBe(false); // what MusicXML import alone gives
    expect(prepareGuitarTabScore(score)).toBe(true);
    expect(staff.showStandardNotation).toBe(true);
    expect(staff.showTablature).toBe(true);
    expect(staff.standardNotationLineCount).toBe(5);
  });

  it("leaves scores without a TAB staff alone", () => {
    const score = { tracks: [{ staves: [{ stringTuning: { tunings: [] }, showStandardNotation: true, showTablature: false }] }] };
    expect(prepareGuitarTabScore(score)).toBe(false);
    expect(score.tracks[0].staves[0].showTablature).toBe(false);
  });
});
