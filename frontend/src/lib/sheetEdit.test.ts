import { describe, expect, it } from "vitest";
import {
  addNote,
  chordAt,
  deleteNote,
  isChordName,
  noteAt,
  noteName,
  isFlatKey,
  pitchNear,
  positionOf,
  setChord,
  setLength,
  shiftPitch,
} from "./sheetEdit";
import type { SheetModel } from "./sheetEdit";

const model = (): SheetModel => ({
  title: "T",
  bpm: 100,
  beatsPerBar: 4,
  key: "G Major",
  notes: [
    { start: 0, end: 1, midi: 67 }, // G4
    { start: 1, end: 2, midi: 69 }, // A4
    { start: 2, end: 4, midi: 71 }, // B4
  ],
  chords: [{ start: 0, end: 4, name: "G" }],
});

describe("finding what was clicked", () => {
  it("turns a beat (bar + ticks) into a position", () => {
    expect(positionOf(0, 0, 4)).toBe(0);
    expect(positionOf(2, 1440, 4)).toBe(9.5); // bar 3, halfway through beat 2
    expect(positionOf(1, 960, 3)).toBe(4); // 3/4 time
  });
  it("finds the note under a position, including later beats of a held note", () => {
    expect(noteAt(model(), 2)).toBe(2);
    expect(noteAt(model(), 3)).toBe(2);
    expect(noteAt(model(), 4)).toBe(-1); // rest after the last note
  });
  it("names notes the way the key writes them", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(70)).toBe("A#4");
    expect(noteName(68, true)).toBe("Ab4");
    expect(isFlatKey("Eb Major")).toBe(true);
    expect(isFlatKey("G# Minor")).toBe(false);
    expect(isFlatKey("Eb Major", 2)).toBe(true); // F major
    expect(isFlatKey("Eb Major", 1)).toBe(false); // E major
    expect(isFlatKey("")).toBe(false);
  });
});

describe("editing notes", () => {
  it("moves a pitch and keeps it on the piano", () => {
    expect(shiftPitch(model(), 0, 1).notes[0].midi).toBe(68);
    expect(shiftPitch(model(), 0, 12).notes[0].midi).toBe(79);
    expect(shiftPitch({ ...model(), notes: [{ start: 0, end: 1, midi: 107 }] }, 0, 12).notes[0].midi).toBe(108);
  });
  it("lengthening a note overwrites the notes it runs into", () => {
    const m = setLength(model(), 0, 2); // G4 now covers A4
    expect(m.notes).toEqual([
      { start: 0, end: 2, midi: 67 },
      { start: 2, end: 4, midi: 71 },
    ]);
  });
  it("shortening leaves a rest", () => {
    expect(setLength(model(), 2, 1).notes[2]).toEqual({ start: 2, end: 3, midi: 71 });
  });
  it("deletes and adds notes; an added note stops at the next one", () => {
    const m = deleteNote(model(), 1);
    expect(m.notes.map((n) => n.midi)).toEqual([67, 71]);
    const back = addNote(m, 1, pitchNear(m, 1), 4);
    expect(back.notes[1]).toEqual({ start: 1, end: 2, midi: 67 });
  });
});

describe("editing chords", () => {
  it("accepts real chord names only", () => {
    expect(["C", "F#m", "Bb7", "Ebmaj7", "Bm7b5", "Gsus4"].every(isChordName)).toBe(true);
    expect(["H", "Cmaj9x", "<b>", ""].some(isChordName)).toBe(false);
  });
  it("renames, splits in a new chord, and removes", () => {
    const renamed = setChord(model(), 0, "Em");
    expect(renamed.chords).toEqual([{ start: 0, end: 4, name: "Em" }]);
    const split = setChord(model(), 2, "D");
    expect(split.chords).toEqual([
      { start: 0, end: 2, name: "G" },
      { start: 2, end: 4, name: "D" },
    ]);
    expect(chordAt(split, 3)?.name).toBe("D");
    expect(setChord(split, 2, "").chords).toEqual([{ start: 0, end: 2, name: "G" }]);
  });
});
