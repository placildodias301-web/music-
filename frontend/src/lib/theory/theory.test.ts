import { describe, it, expect } from "vitest";
import { getIntervalInfo, getSemitonesForDegree } from "./intervals";
import { midiToFrequency } from "./notes";
import { getScaleNotes, findCompatibleScales, SCALE_DEFINITIONS } from "./scales";
import { assignFingers } from "../chords/fingering";
import { analyzeChord, analyzePlayedStrings } from "../chords/analysis";
import { parseChordSymbol } from "../chordTheory";

describe("Interval Engine", () => {
  it("resolves basic diatonic intervals correctly", () => {
    const root = getIntervalInfo(0);
    expect(root.shortName).toBe("1");
    expect(root.name).toBe("Perfect Unison / Root");

    const minorThird = getIntervalInfo(3);
    expect(minorThird.shortName).toBe("♭3");
    expect(minorThird.quality).toBe("minor");

    const majorThird = getIntervalInfo(4);
    expect(majorThird.shortName).toBe("3");
    expect(majorThird.quality).toBe("major");

    const fifth = getIntervalInfo(7);
    expect(fifth.shortName).toBe("5");
    expect(fifth.quality).toBe("perfect");

    const flatSeven = getIntervalInfo(10);
    expect(flatSeven.shortName).toBe("♭7");

    const majorSeven = getIntervalInfo(11);
    expect(majorSeven.shortName).toBe("7");
  });

  it("handles compound extensions (9th, 11th, 13th)", () => {
    const ninth = getIntervalInfo(14, 9);
    expect(ninth.shortName).toBe("9");
    expect(ninth.degree).toBe(9);

    const sharpEleven = getIntervalInfo(18, 11);
    expect(sharpEleven.shortName).toBe("♯11");

    const thirteenth = getIntervalInfo(21, 13);
    expect(thirteenth.shortName).toBe("13");
  });

  it("returns correct semitones for degrees", () => {
    expect(getSemitonesForDegree(1)).toBe(0);
    expect(getSemitonesForDegree(3)).toBe(4);
    expect(getSemitonesForDegree(3, "minor")).toBe(3);
    expect(getSemitonesForDegree(5)).toBe(7);
    expect(getSemitonesForDegree(7, "minor")).toBe(10);
    expect(getSemitonesForDegree(9)).toBe(14);
  });
});

describe("Notes Physics Engine", () => {
  it("calculates exact frequency in Hz from MIDI", () => {
    // A4 = MIDI 69 = 440 Hz
    expect(Math.round(midiToFrequency(69))).toBe(440);
    // A3 = MIDI 57 = 220 Hz
    expect(Math.round(midiToFrequency(57))).toBe(220);
    // C4 (Middle C) = MIDI 60 ≈ 261.6 Hz
    expect(Math.round(midiToFrequency(60) * 10) / 10).toBe(261.6);
  });
});

describe("Scales Engine", () => {
  it("spells scale notes correctly", () => {
    const majorDef = SCALE_DEFINITIONS.find((s) => s.id === "major")!;
    // C Major: C D E F G A B
    const cMajorNotes = getScaleNotes(0, majorDef);
    expect(cMajorNotes).toEqual(["C", "D", "E", "F", "G", "A", "B"]);

    const pentatonicMinor = SCALE_DEFINITIONS.find((s) => s.id === "minor_pentatonic")!;
    // A Minor Pentatonic (root A = 9): A C D E G
    const aMinorPent = getScaleNotes(9, pentatonicMinor);
    expect(aMinorPent).toEqual(["A", "C", "D", "E", "G"]);
  });

  it("finds compatible scales for chords", () => {
    // Major triad (0, 4, 7)
    const scales = findCompatibleScales(0, [0, 4, 7]);
    const ids = scales.map((s) => s.id);
    expect(ids).toContain("major");
    expect(ids).toContain("major_pentatonic");
    expect(ids).toContain("lydian");
    expect(ids).toContain("mixolydian");
  });
});

describe("Fingering & Barre Solver", () => {
  it("assigns canonical open C major fingering", () => {
    // C major: x 3 2 0 1 0
    const result = assignFingers([null, 3, 2, 0, 1, 0]);
    expect(result.fingers).toEqual([null, 3, 2, null, 1, null]);
    expect(result.difficulty).toBe("Beginner");
    expect(result.barres).toHaveLength(0);
  });

  it("detects F major barre chord", () => {
    // F major barre: 1 3 3 2 1 1
    const result = assignFingers([1, 3, 3, 2, 1, 1]);
    expect(result.barres).toHaveLength(1);
    expect(result.barres[0].fret).toBe(1);
    expect(result.barres[0].finger).toBe(1);
    expect(result.difficulty).toBe("Intermediate");
  });

  it("assigns open G major fingering", () => {
    // G major: 3 2 0 0 0 3
    const result = assignFingers([3, 2, 0, 0, 0, 3]);
    expect(result.difficulty).toBe("Beginner");
    expect(result.fingers[0]).toBe(2);
    expect(result.fingers[1]).toBe(1);
    expect(result.fingers[5]).toBe(3);
  });
});

describe("Chord Analysis Engine", () => {
  it("analyzes C major chord with diatonic keys and intervals", () => {
    const parsed = parseChordSymbol("C");
    const analysis = analyzeChord(parsed);

    expect(analysis.rootName).toBe("C");
    expect(analysis.formula).toBe("1 - 3 - 5");
    expect(analysis.notes).toEqual(["C", "E", "G"]);
    // the explanation is derived from the intervals: a major third → bright and stable
    expect(analysis.whyItWorks).toContain("major third");
    expect(analysis.whyItWorks).toContain("bright");
    expect(analysis.description.kind).toBe("major");

    // Diatonic keys should include C Major (I), F Major (V), G Major (IV), A Minor (III)
    const romanInKeys = analysis.diatonicKeys.map((dk) => `${dk.keyRoot} ${dk.mode} (${dk.romanNumeral})`);
    expect(romanInKeys).toContain("C major (I)");
    expect(romanInKeys).toContain("F major (V)");
    expect(romanInKeys).toContain("G major (IV)");
    expect(romanInKeys).toContain("A minor (III)");
  });

  it("analyzes played strings in a guitar voicing", () => {
    const guitarTuning = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
    const cFrets = [null, 3, 2, 0, 1, 0];
    const strings = analyzePlayedStrings(cFrets, guitarTuning, 0);

    expect(strings).toHaveLength(6);
    // Low E is muted
    expect(strings[0].action).toBe("muted");
    expect(strings[0].noteName).toBeNull();

    // A string, fret 3 = C3 (MIDI 48) -> Root
    expect(strings[1].action).toBe("fretted");
    expect(strings[1].noteName).toBe("C");
    expect(strings[1].isRoot).toBe(true);
    expect(strings[1].midi).toBe(48);

    // D string, fret 2 = E3 (MIDI 52) -> Major 3rd
    expect(strings[2].action).toBe("fretted");
    expect(strings[2].noteName).toBe("E");
    expect(strings[2].isRoot).toBe(false);

    // G string, fret 0 = G3 (MIDI 55) -> Open, Perfect 5th
    expect(strings[3].action).toBe("open");
    expect(strings[3].noteName).toBe("G");

    // B string, fret 1 = C4 (MIDI 60) -> Root octave
    expect(strings[4].action).toBe("fretted");
    expect(strings[4].noteName).toBe("C");
    expect(strings[4].isRoot).toBe(true);

    // High E string, fret 0 = E4 (MIDI 64) -> Open, Major 3rd
    expect(strings[5].action).toBe("open");
    expect(strings[5].noteName).toBe("E");
  });
});
