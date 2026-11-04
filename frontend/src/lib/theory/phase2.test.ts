import { describe, expect, it } from "vitest";
import {
  createNote,
  formatNoteSpelling,
  getEnharmonicSpellings,
  parseNoteSpelling,
  spellDiatonicOffset,
} from "./notes";
import {
  intervalBetween,
  invertInterval,
  transposeNote,
} from "./intervals";
import {
  findScale,
  registerScale,
  spellScaleTheoretically,
  type ScaleDefinition,
} from "./scales";
import {
  CIRCLE_OF_FIFTHS_MAJOR,
  getAdjacentKeys,
  getKeyDefinition,
} from "./keys";

describe("Phase 2 — Note, Interval, Scale & Key Engine", () => {
  describe("Subphase 2.1 — Pitch & Note Engine", () => {
    it("parses and formats Scientific Pitch Notation with double accidentals", () => {
      const notes = [
        { str: "C4", letter: "C", alt: 0, oct: 4 },
        { str: "F#3", letter: "F", alt: 1, oct: 3 },
        { str: "Bb5", letter: "B", alt: -1, oct: 5 },
        { str: "G##2", letter: "G", alt: 2, oct: 2 },
        { str: "Dbb1", letter: "D", alt: -2, oct: 1 },
      ];

      for (const n of notes) {
        const parsed = parseNoteSpelling(n.str);
        expect(parsed.letter).toBe(n.letter);
        expect(parsed.alteration).toBe(n.alt);
        expect(parsed.octave).toBe(n.oct);
        expect(formatNoteSpelling(parsed, false)).toBe(n.str);
      }
    });

    it("calculates exact MIDI and frequency according to A4 reference", () => {
      // A4 = MIDI 69 = 440 Hz
      const a4 = createNote("A4", 440);
      expect(a4.pitch.midi).toBe(69);
      expect(Math.round(a4.pitch.frequencyHz)).toBe(440);

      // C4 (Middle C) = MIDI 60 ≈ 261.63 Hz
      const c4 = createNote("C4", 440);
      expect(c4.pitch.midi).toBe(60);
      expect(c4.pitchClass).toBe(0);
      expect(Math.round(c4.pitch.frequencyHz * 100) / 100).toBe(261.63);

      // Custom reference A4 = 442 Hz
      const a4_442 = createNote("A4", 442);
      expect(Math.round(a4_442.pitch.frequencyHz)).toBe(442);
    });

    it("finds all valid enharmonic spellings preserving pitch class", () => {
      const cSharpSpellings = getEnharmonicSpellings("C#4");
      expect(cSharpSpellings).toContain("C#4");
      expect(cSharpSpellings).toContain("Db4");
      expect(cSharpSpellings).toContain("B##3");

      const fDoubleSharp = getEnharmonicSpellings("F##4");
      expect(fDoubleSharp).toContain("G4");
      expect(fDoubleSharp).toContain("Abb4");
    });

    it("preserves theoretical musical spelling during diatonic offsets", () => {
      const c4 = parseNoteSpelling("C4");
      // 3rd with 4 semitones must be E, not Fb
      const e4 = spellDiatonicOffset(c4, 3, 4);
      expect(e4.letter).toBe("E");
      expect(e4.alteration).toBe(0);

      // Augmented 4th with 6 semitones must be F#, not Gb
      const aug4 = spellDiatonicOffset(c4, 4, 6);
      expect(aug4.letter).toBe("F");
      expect(aug4.alteration).toBe(1);

      // Diminished 5th with 6 semitones must be Gb, not F#
      const dim5 = spellDiatonicOffset(c4, 5, 6);
      expect(dim5.letter).toBe("G");
      expect(dim5.alteration).toBe(-1);
    });
  });

  describe("Subphase 2.2 — Universal Interval Engine", () => {
    it("distinguishes enharmonic intervals strictly by theoretical spelling", () => {
      // C4 to F#4 is Augmented 4th (degree 4)
      const a4 = intervalBetween("C4", "F#4");
      expect(a4.degree).toBe(4);
      expect(a4.quality).toBe("augmented");
      expect(a4.shortName).toBe("A4");
      expect(a4.semitones).toBe(6);

      // C4 to Gb4 is Diminished 5th (degree 5)
      const d5 = intervalBetween("C4", "Gb4");
      expect(d5.degree).toBe(5);
      expect(d5.quality).toBe("diminished");
      expect(d5.shortName).toBe("d5");
      expect(d5.semitones).toBe(6);
    });

    it("handles compound and unusual intervals", () => {
      // Major 9th: C4 to D5 (degree 9, 14 semitones)
      const m9 = intervalBetween("C4", "D5");
      expect(m9.degree).toBe(9);
      expect(m9.quality).toBe("major");
      expect(m9.isCompound).toBe(true);
      expect(m9.shortName).toBe("M9");
      expect(m9.semitones).toBe(14);

      // Augmented 6th: C4 to A#4 (degree 6, 10 semitones)
      const a6 = intervalBetween("C4", "A#4");
      expect(a6.degree).toBe(6);
      expect(a6.quality).toBe("augmented");
      expect(a6.shortName).toBe("A6");

      // Doubly Augmented 4th: C4 to F##4
      const aa4 = intervalBetween("C4", "F##4");
      expect(aa4.quality).toBe("doubly_augmented");
      expect(aa4.shortName).toBe("AA4");
    });

    it("inverts intervals correctly", () => {
      const p5 = intervalBetween("C4", "G4");
      const invP5 = invertInterval(p5);
      expect(invP5.degree).toBe(4);
      expect(invP5.quality).toBe("perfect");

      const m3 = intervalBetween("C4", "Eb4");
      const invM3 = invertInterval(m3);
      expect(invM3.degree).toBe(6);
      expect(invM3.quality).toBe("major");

      const a4 = intervalBetween("C4", "F#4");
      const invA4 = invertInterval(a4);
      expect(invA4.degree).toBe(5);
      expect(invA4.quality).toBe("diminished");
    });

    it("transposes notes by interval symbols accurately", () => {
      expect(formatNoteSpelling(transposeNote("C4", "P5"))).toBe("G4");
      expect(formatNoteSpelling(transposeNote("C4", "A4"))).toBe("F#4");
      expect(formatNoteSpelling(transposeNote("C4", "d5"))).toBe("Gb4");
      expect(formatNoteSpelling(transposeNote("Eb4", "M3"))).toBe("G4");
      expect(formatNoteSpelling(transposeNote("F#4", "m3"))).toBe("A4");
      expect(formatNoteSpelling(transposeNote("C4", "M9"))).toBe("D5");
    });
  });

  describe("Subphase 2.3 — Scale Engine", () => {
    it("spells 7-note diatonic scales using every letter A-G exactly once", () => {
      const major = findScale("major")!;
      // F# Major must have E# (not F natural)
      const fSharpMajor = spellScaleTheoretically("F#", major);
      expect(fSharpMajor).toEqual(["F♯", "G♯", "A♯", "B", "C♯", "D♯", "E♯"]);

      // Gb Major must have Cb (not B natural)
      const gFlatMajor = spellScaleTheoretically("Gb", major);
      expect(gFlatMajor).toEqual(["G♭", "A♭", "B♭", "C♭", "D♭", "E♭", "F"]);

      // C# Major must have all 7 sharps
      const cSharpMajor = spellScaleTheoretically("C#", major);
      expect(cSharpMajor).toEqual(["C♯", "D♯", "E♯", "F♯", "G♯", "A♯", "B♯"]);
    });

    it("supports modes and specialized/exotic scales", () => {
      const dorian = findScale("dorian")!;
      expect(spellScaleTheoretically("D", dorian)).toEqual(["D", "E", "F", "G", "A", "B", "C"]);

      const phrygianDom = findScale("phrygian_dominant")!;
      expect(spellScaleTheoretically("E", phrygianDom)).toEqual(["E", "F", "G♯", "A", "B", "C", "D"]);

      const altered = findScale("altered")!;
      expect(altered).toBeDefined();

      const doubleHarmonic = findScale("double_harmonic")!;
      expect(doubleHarmonic).toBeDefined();
    });

    it("allows dynamic registration of new scales without modifying engine", () => {
      const customScale: ScaleDefinition = {
        id: "hirajoshi",
        name: "Hirajoshi",
        category: "world",
        intervals: [0, 2, 3, 7, 8],
        formula: ["1", "2", "b3", "5", "b6"],
        description: "Traditional Japanese pentatonic scale",
      };
      registerScale(customScale);
      expect(findScale("hirajoshi")).toEqual(customScale);
    });
  });

  describe("Subphase 2.4 — Key Engine", () => {
    it("provides complete metadata for major keys", () => {
      const dMajor = getKeyDefinition("D", "major");
      expect(dMajor).toBeDefined();
      expect(dMajor!.accidentals.count).toBe(2);
      expect(dMajor!.accidentals.type).toBe("♯");
      expect(dMajor!.accidentals.alteredNotes).toEqual(["F♯", "C♯"]);
      expect(dMajor!.relativeKey).toBe("Bm");
      expect(dMajor!.parallelKey).toBe("Dm");
      expect(dMajor!.diatonicTriads.map((t) => t.romanNumeral)).toEqual(["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
      expect(dMajor!.diatonicTriads.map((t) => t.chordSymbol)).toEqual(["D", "Em", "F♯m", "G", "A", "Bm", "C♯dim"]);
    });

    it("provides complete metadata for minor keys", () => {
      const cMinor = getKeyDefinition("C", "minor");
      expect(cMinor).toBeDefined();
      expect(cMinor!.accidentals.count).toBe(3);
      expect(cMinor!.accidentals.type).toBe("♭");
      expect(cMinor!.relativeKey).toBe("E♭");
      expect(cMinor!.parallelKey).toBe("C Major");
      expect(cMinor!.diatonicTriads.map((t) => t.romanNumeral)).toEqual(["i", "ii°", "III", "iv", "v", "VI", "VII"]);
    });

    it("navigates the Circle of Fifths accurately", () => {
      expect(CIRCLE_OF_FIFTHS_MAJOR).toHaveLength(12);
      const adjG = getAdjacentKeys("G");
      expect(adjG).toBeDefined();
      expect(adjG!.dominantKey).toBe("D"); // 5th above G
      expect(adjG!.subdominantKey).toBe("C"); // 4th above / 5th below G
    });
  });
});
