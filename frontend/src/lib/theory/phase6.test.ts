import { describe, it, expect } from "vitest";
import {
  getDiatonicHarmonies,
  analyzeRomanNumeral,
  identifyAdvancedHarmony,
  findPivotChords,
  identifyCadence,
  getChordScaleGuide,
} from "./harmony";
import { parseChordSymbol } from "../chordTheory";
import { analyzeChord } from "../chords/analysis";

describe("Phase 6: Music Theory, Harmony & Analysis Layer", () => {
  describe("Subphase 6.1 — Diatonic Harmony", () => {
    it("generates correct diatonic triads for C Major", () => {
      const harmonies = getDiatonicHarmonies("C", "major", "triad");
      expect(harmonies).toHaveLength(7);
      expect(harmonies.map((h) => h.chordSymbol)).toEqual(["C", "Dm", "Em", "F", "G", "Am", "Bdim"]);
      expect(harmonies.map((h) => h.romanNumeral)).toEqual(["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
    });

    it("generates correct diatonic 7th chords for C Major", () => {
      const harmonies = getDiatonicHarmonies("C", "major", "seventh");
      expect(harmonies).toHaveLength(7);
      expect(harmonies.map((h) => h.chordSymbol)).toEqual(["Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7", "Bm7b5"]);
      expect(harmonies.map((h) => h.romanNumeral)).toEqual(["IM7", "ii7", "iii7", "IVM7", "V7", "vi7", "viiø7"]);
    });

    it("generates correct diatonic chords for A Harmonic Minor", () => {
      const harmonies = getDiatonicHarmonies("A", "harmonic-minor", "triad");
      expect(harmonies).toHaveLength(7);
      // Degrees in A Harmonic Minor: A, B, C, D, E, F, G# -> Am, Bdim, Caug, Dm, E, F, G#dim
      expect(harmonies[0].chordSymbol).toBe("Am");
      expect(harmonies[2].chordSymbol).toBe("Caug");
      expect(harmonies[4].chordSymbol).toBe("E"); // Major V
      expect(harmonies[4].romanNumeral).toBe("V");
    });
  });

  describe("Subphase 6.2 & 6.3 — Roman Numeral & Harmonic Function Classification", () => {
    it("classifies diatonic tonic, subdominant, and dominant chords in C Major", () => {
      const tonic = analyzeRomanNumeral("C", "C", "major");
      expect(tonic.isDiatonic).toBe(true);
      expect(tonic.romanNumeral).toBe("I");
      expect(tonic.harmonicFunction).toBe("Tonic");

      const subdominant = analyzeRomanNumeral("F", "C", "major");
      expect(subdominant.isDiatonic).toBe(true);
      expect(subdominant.romanNumeral).toBe("IV");
      expect(subdominant.harmonicFunction).toBe("Subdominant");

      const dominant = analyzeRomanNumeral("G7", "C", "major");
      expect(dominant.isDiatonic).toBe(true);
      expect(dominant.romanNumeral).toBe("V7");
      expect(dominant.harmonicFunction).toBe("Dominant");
    });

    it("identifies inversion and figured bass in Roman numeral analysis", () => {
      const firstInv = analyzeRomanNumeral("G7", "C", "major", 1);
      expect(firstInv.romanNumeral).toContain("6/5");
      expect(firstInv.figuredBass).toBe("6/5");

      const secondInvTriad = analyzeRomanNumeral("C", "C", "major", 2);
      expect(secondInvTriad.figuredBass).toBe("6/4");
    });
  });

  describe("Subphase 6.4 — Advanced Harmony (Secondary Dominants, Borrowed, Neapolitan, Pivots)", () => {
    it("identifies secondary dominants (V/V, V/ii, V/vi)", () => {
      const d7 = parseChordSymbol("D7");
      const vOfV = identifyAdvancedHarmony(d7, 0, "major"); // In C Major (0), D7 is V7/V
      expect(vOfV.romanNumeral).toBe("V7/V");
      expect(vOfV.category).toBe("Secondary Dominant");
      expect(vOfV.harmonicFunction).toBe("Dominant");

      const a7 = parseChordSymbol("A7");
      const vOfii = identifyAdvancedHarmony(a7, 0, "major"); // In C Major (0), A7 is V7/ii
      expect(vOfii.romanNumeral).toBe("V7/ii");

      const e7 = parseChordSymbol("E7");
      const vOfvi = identifyAdvancedHarmony(e7, 0, "major"); // In C Major (0), E7 is V7/vi
      expect(vOfvi.romanNumeral).toBe("V7/vi");
    });

    it("identifies Neapolitan chord (bII / N6)", () => {
      const db = parseChordSymbol("Db");
      const neapolitan = identifyAdvancedHarmony(db, 0, "major");
      expect(neapolitan.romanNumeral).toContain("♭II");
      expect(neapolitan.category).toBe("Neapolitan Chord");
      expect(neapolitan.harmonicFunction).toBe("Subdominant");
    });

    it("identifies modal interchange / borrowed chords in Major", () => {
      const fm = parseChordSymbol("Fm"); // iv borrowed from C minor
      const borrowedIv = identifyAdvancedHarmony(fm, 0, "major");
      expect(borrowedIv.romanNumeral).toBe("iv");
      expect(borrowedIv.category).toContain("Modal Interchange");

      const ab = parseChordSymbol("Ab"); // bVI borrowed from C minor
      const borrowedBVI = identifyAdvancedHarmony(ab, 0, "major");
      expect(borrowedBVI.romanNumeral).toBe("♭VI");

      const bb = parseChordSymbol("Bb"); // bVII borrowed
      const borrowedBVII = identifyAdvancedHarmony(bb, 0, "major");
      expect(borrowedBVII.romanNumeral).toBe("♭VII");
    });

    it("calculates pivot chords between closely related keys", () => {
      // C Major and G Major
      const pivots = findPivotChords("C", "major", "G", "major");
      expect(pivots.length).toBeGreaterThanOrEqual(4);
      const symbols = pivots.map((p) => p.chordSymbol);
      expect(symbols).toContain("C"); // I in C, IV in G
      expect(symbols).toContain("Am"); // vi in C, ii in G
      expect(symbols).toContain("Em"); // iii in C, vi in G
      expect(symbols).toContain("G"); // V in C, I in G
    });
  });

  describe("Subphase 6.5 — Cadence Engine", () => {
    it("identifies Perfect Authentic Cadence (PAC) and Imperfect Authentic Cadence (IAC)", () => {
      const pac = identifyCadence("G", "C", "C", "major", { chord1Inversion: 0, chord2Inversion: 0, sopranoIsRoot: true });
      expect(pac.type).toBe("PAC");

      const iac = identifyCadence("G", "C", "C", "major", { chord1Inversion: 1, chord2Inversion: 0 });
      expect(iac.type).toBe("IAC");
    });

    it("identifies Plagal, Half, and Deceptive Cadences", () => {
      const plagal = identifyCadence("F", "C", "C", "major");
      expect(plagal.type).toBe("Plagal");

      const half = identifyCadence("C", "G", "C", "major");
      expect(half.type).toBe("Half");

      const deceptive = identifyCadence("G", "Am", "C", "major");
      expect(deceptive.type).toBe("Deceptive");

      const phrygian = identifyCadence("Dm", "E", "A", "minor", { chord1Inversion: 1 });
      expect(phrygian.type).toBe("Phrygian");
    });
  });

  describe("Subphase 6.6 — Chord-Scale Relationships & Analysis Integration", () => {
    it("provides scale recommendations and avoid notes for Major, Minor, and Dominant chords", () => {
      const majGuide = getChordScaleGuide("Cmaj7");
      expect(majGuide.recommendedScales.some((s) => s.scaleName.includes("Ionian"))).toBe(true);
      expect(majGuide.recommendedScales.some((s) => s.scaleName.includes("Lydian"))).toBe(true);

      const mGuide = getChordScaleGuide("Am7");
      expect(mGuide.recommendedScales.some((s) => s.scaleName.includes("Dorian"))).toBe(true);

      const domGuide = getChordScaleGuide("G7");
      expect(domGuide.recommendedScales.some((s) => s.scaleName.includes("Mixolydian"))).toBe(true);
      expect(domGuide.recommendedScales.some((s) => s.scaleName.includes("Altered"))).toBe(true);
    });

    it("integrates chord-scale guides into full ChordAnalysis", () => {
      const parsed = parseChordSymbol("Cmaj7");
      const analysis = analyzeChord(parsed);
      expect(analysis.scaleGuide).toBeDefined();
      expect(analysis.scaleGuide.recommendedScales.length).toBeGreaterThan(0);
      expect(analysis.scaleGuide.improvisationGuidelines.length).toBeGreaterThan(0);
    });
  });
});
