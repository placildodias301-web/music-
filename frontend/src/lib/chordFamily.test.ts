import { describe, it, expect } from "vitest";
import { capoOptions, chordFamily, triadCounts, MAJOR_TONICS, MINOR_TONICS, type FamilyChord } from "./chordFamily";
import { getGuitarVoicings, parseChordSymbol, qualityForSuffix } from "./chordTheory";

const names = (chords: FamilyChord[]) => chords.map((c) => c.name);
const numerals = (chords: FamilyChord[]) => chords.map((c) => c.numeral);
const split = (s: string) => s.split(" ");

// Known-correct tables (written out by hand, not generated).
interface MajorRow {
  triads: string;
  sevenths: string;
  relative: string;
  sharps?: string;
  flats?: string;
  borrowed: string; // bVII bVI iv
  secondary: string; // V/ii V/iii V/IV V/V V/vi
  capo: [string, number][];
}

const MAJOR: Record<string, MajorRow> = {
  C: {
    triads: "C Dm Em F G Am Bdim",
    sevenths: "Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5",
    relative: "A minor",
    borrowed: "Bb Ab Fm",
    secondary: "A7 B7 C7 D7 E7",
    capo: [["C", 0], ["A", 3], ["G", 5]], // E shapes would need capo 8
  },
  G: {
    triads: "G Am Bm C D Em F#dim",
    sevenths: "Gmaj7 Am7 Bm7 Cmaj7 D7 Em7 F#m7b5",
    relative: "E minor",
    sharps: "F#",
    borrowed: "F Eb Cm",
    secondary: "E7 F#7 G7 A7 B7",
    capo: [["G", 0], ["E", 3], ["D", 5], ["C", 7]],
  },
  D: {
    triads: "D Em F#m G A Bm C#dim",
    sevenths: "Dmaj7 Em7 F#m7 Gmaj7 A7 Bm7 C#m7b5",
    relative: "B minor",
    sharps: "F# C#",
    borrowed: "C Bb Gm",
    secondary: "B7 C#7 D7 E7 F#7",
    capo: [["D", 0], ["C", 2], ["A", 5], ["G", 7]],
  },
  A: {
    triads: "A Bm C#m D E F#m G#dim",
    sevenths: "Amaj7 Bm7 C#m7 Dmaj7 E7 F#m7 G#m7b5",
    relative: "F# minor",
    sharps: "F# C# G#",
    borrowed: "G F Dm",
    secondary: "F#7 G#7 A7 B7 C#7",
    capo: [["A", 0], ["G", 2], ["E", 5], ["D", 7]],
  },
  E: {
    triads: "E F#m G#m A B C#m D#dim",
    sevenths: "Emaj7 F#m7 G#m7 Amaj7 B7 C#m7 D#m7b5",
    relative: "C# minor",
    sharps: "F# C# G# D#",
    borrowed: "D C Am",
    secondary: "C#7 D#7 E7 F#7 G#7",
    capo: [["E", 0], ["D", 2], ["C", 4], ["A", 7]],
  },
  F: {
    triads: "F Gm Am Bb C Dm Edim",
    sevenths: "Fmaj7 Gm7 Am7 Bbmaj7 C7 Dm7 Em7b5",
    relative: "D minor",
    flats: "Bb",
    borrowed: "Eb Db Bbm",
    secondary: "D7 E7 F7 G7 A7",
    capo: [["E", 1], ["D", 3], ["C", 5]],
  },
  Bb: {
    triads: "Bb Cm Dm Eb F Gm Adim",
    sevenths: "Bbmaj7 Cm7 Dm7 Ebmaj7 F7 Gm7 Am7b5",
    relative: "G minor",
    flats: "Bb Eb",
    borrowed: "Ab Gb Ebm",
    secondary: "G7 A7 Bb7 C7 D7",
    capo: [["A", 1], ["G", 3], ["E", 6]],
  },
};

interface MinorRow {
  natural: [string, string];
  harmonic: [string, string];
  melodic: [string, string];
  relative: string;
  sharps?: string;
  borrowed: string; // I IV bII
  secondary: string; // V/III V/iv V/V V/VI V/VII
  progressions: string[];
  capo: [string, number][];
}

const MINOR: Record<string, MinorRow> = {
  A: {
    natural: ["Am Bdim C Dm Em F G", "Am7 Bm7b5 Cmaj7 Dm7 Em7 Fmaj7 G7"],
    harmonic: ["Am Bdim Caug Dm E F G#dim", "AmMaj7 Bm7b5 Cmaj7#5 Dm7 E7 Fmaj7 G#dim7"],
    melodic: ["Am Bm Caug D E F#dim G#dim", "AmMaj7 Bm7 Cmaj7#5 D7 E7 F#m7b5 G#m7b5"],
    relative: "C major",
    borrowed: "A D Bb",
    secondary: "G7 A7 B7 C7 D7",
    progressions: ["Am F C G", "Bm7b5 E7 Am", "Am Dm E", "Am7 Am7 Am7 Am7 Dm7 Dm7 Am7 Am7 E7 Dm7 Am7 E7"],
    capo: [["Am", 0], ["Em", 5], ["Dm", 7]],
  },
  E: {
    natural: ["Em F#dim G Am Bm C D", "Em7 F#m7b5 Gmaj7 Am7 Bm7 Cmaj7 D7"],
    harmonic: ["Em F#dim Gaug Am B C D#dim", "EmMaj7 F#m7b5 Gmaj7#5 Am7 B7 Cmaj7 D#dim7"],
    melodic: ["Em F#m Gaug A B C#dim D#dim", "EmMaj7 F#m7 Gmaj7#5 A7 B7 C#m7b5 D#m7b5"],
    relative: "G major",
    sharps: "F#",
    borrowed: "E A F",
    secondary: "D7 E7 F#7 G7 A7",
    progressions: ["Em C G D", "F#m7b5 B7 Em", "Em Am B", "Em7 Em7 Em7 Em7 Am7 Am7 Em7 Em7 B7 Am7 Em7 B7"],
    capo: [["Em", 0], ["Dm", 2], ["Am", 7]],
  },
};

describe("chordFamily — major keys", () => {
  for (const [tonic, row] of Object.entries(MAJOR)) {
    describe(`${tonic} major`, () => {
      const f = chordFamily(tonic, "major");

      it("diatonic triads and numerals", () => {
        expect(names(f.triads)).toEqual(split(row.triads));
        expect(numerals(f.triads)).toEqual(["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
        expect(f.counts).toEqual({ major: 3, minor: 3, diminished: 1, augmented: 0 });
      });

      it("diatonic sevenths", () => {
        expect(names(f.sevenths)).toEqual(split(row.sevenths));
        expect(numerals(f.sevenths)).toEqual(["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"]);
      });

      it("functions", () => {
        expect(f.triads.map((c) => c.function)).toEqual(["tonic", "subdominant", "tonic", "subdominant", "dominant", "tonic", "dominant"]);
      });

      it("relative, parallel and key signature", () => {
        expect(f.relative.name).toBe(row.relative);
        expect(f.parallel.name).toBe(`${tonic} minor`);
        expect(f.signature).toEqual({ sharps: row.sharps ? split(row.sharps) : [], flats: row.flats ? split(row.flats) : [] });
      });

      it("borrowed chords and secondary dominants", () => {
        expect(numerals(f.borrowed)).toEqual(["bVII", "bVI", "iv"]);
        expect(names(f.borrowed)).toEqual(split(row.borrowed));
        expect(numerals(f.secondaryDominants)).toEqual(["V/ii", "V/iii", "V/IV", "V/V", "V/vi"]);
        expect(names(f.secondaryDominants)).toEqual(split(row.secondary));
      });

      it("capo helper", () => {
        expect(f.capo.map((o) => [o.shapes, o.capo])).toEqual(row.capo);
        expect(f.capo.every((o) => o.sounds === `${tonic} major`)).toBe(true);
      });
    });
  }

  it("common progressions in G", () => {
    const f = chordFamily("G", "major");
    expect(f.progressions.map((p) => [p.name, names(p.chords).join(" ")])).toEqual([
      ["I–V–vi–IV", "G D Em C"],
      ["ii–V–I", "Am7 D7 Gmaj7"],
      ["I–vi–IV–V", "G Em C D"],
      ["12-bar blues", "G7 G7 G7 G7 C7 C7 G7 G7 D7 C7 G7 D7"],
    ]);
    expect(numerals(f.progressions[3].chords).slice(0, 5)).toEqual(["I7", "I7", "I7", "I7", "IV7"]);
  });

  it("common progressions in Bb are spelled with flats", () => {
    const f = chordFamily("Bb", "major");
    expect(names(f.progressions[0].chords)).toEqual(["Bb", "F", "Gm", "Eb"]);
    expect(names(f.progressions[1].chords)).toEqual(["Cm7", "F7", "Bbmaj7"]);
  });
});

describe("chordFamily — passing chords", () => {
  const first = (tonic: string, mode: "major" | "minor") => names(chordFamily(tonic, mode).passing[0].chords);

  it("I → iii → vi reads D F#m Bm in D and C Em Am in C", () => {
    expect(first("D", "major")).toEqual(["D", "F#m", "Bm"]);
    expect(first("C", "major")).toEqual(["C", "Em", "Am"]);
  });

  it("is spelled with flats in flat keys", () => {
    expect(first("Bb", "major")).toEqual(["Bb", "Dm", "Gm"]);
  });

  it("has the other connecting patterns, chromatic and seventh chords included", () => {
    const f = chordFamily("C", "major");
    const byName = Object.fromEntries(f.passing.map((p) => [p.name, names(p.chords).join(" ")]));
    expect(byName["I → ii → iii → IV"]).toBe("C Dm Em F");
    expect(byName["I → I7 → IV"]).toBe("C C7 F");
    expect(byName["I → #i° → ii"]).toBe("C C#dim Dm");
    expect(byName["IV → #iv° → V"]).toBe("F F#dim G");
  });

  it("follows the chosen minor scale", () => {
    const f = chordFamily("A", "minor");
    const [natural, harmonic, melodic] = f.minorSets!;
    const down = (set: typeof natural) => names(set.passing.find((p) => p.name.startsWith("i → vii") || p.name.startsWith("i → VII"))!.chords);
    expect(down(natural)).toEqual(["Am", "G", "F"]);
    expect(down(harmonic)).toEqual(["Am", "G#dim", "F"]);
    expect(down(melodic)).toEqual(["Am", "G#dim", "F#dim"]);
    for (const set of f.minorSets!) expect(set.passing.length).toBeGreaterThanOrEqual(5);
  });

  it("every key and mode has passing chords", () => {
    for (const t of MAJOR_TONICS) expect(chordFamily(t, "major").passing.length).toBeGreaterThanOrEqual(8);
    for (const t of MINOR_TONICS) expect(chordFamily(t, "minor").minorSets!.every((m) => m.passing.length > 0)).toBe(true);
  });

  it("minor keys have their own patterns", () => {
    const f = chordFamily("A", "minor");
    expect(names(f.passing[0].chords)).toEqual(["Am", "C", "Em"]);
    expect(f.passing.length).toBeGreaterThanOrEqual(5);
  });
});

describe("chordFamily — minor keys", () => {
  for (const [tonic, row] of Object.entries(MINOR)) {
    describe(`${tonic} minor`, () => {
      const f = chordFamily(tonic, "minor");
      const [natural, harmonic, melodic] = f.minorSets!;

      it("main set is natural minor", () => {
        expect(names(f.triads)).toEqual(split(row.natural[0]));
        expect(numerals(f.triads)).toEqual(["i", "ii°", "III", "iv", "v", "VI", "VII"]);
        expect(numerals(f.sevenths)).toEqual(["i7", "iiø7", "IIImaj7", "iv7", "v7", "VImaj7", "VII7"]);
        expect(f.counts).toEqual({ major: 3, minor: 3, diminished: 1, augmented: 0 });
      });

      it("natural, harmonic and melodic minor sets", () => {
        expect([natural.name, harmonic.name, melodic.name]).toEqual(["Natural minor", "Harmonic minor", "Melodic minor"]);
        expect([names(natural.triads), names(natural.sevenths)]).toEqual(row.natural.map(split));
        expect([names(harmonic.triads), names(harmonic.sevenths)]).toEqual(row.harmonic.map(split));
        expect([names(melodic.triads), names(melodic.sevenths)]).toEqual(row.melodic.map(split));
        expect(numerals(harmonic.triads)).toEqual(["i", "ii°", "III+", "iv", "V", "VI", "vii°"]);
        expect(numerals(harmonic.sevenths)).toEqual(["i(maj7)", "iiø7", "III+maj7", "iv7", "V7", "VImaj7", "vii°7"]);
        expect(numerals(melodic.triads)).toEqual(["i", "ii", "III+", "IV", "V", "vi°", "vii°"]);
        expect(triadCounts(harmonic.triads)).toEqual({ major: 2, minor: 2, diminished: 2, augmented: 1 });
        expect(triadCounts(melodic.triads)).toEqual({ major: 2, minor: 2, diminished: 2, augmented: 1 });
      });

      it("functions", () => {
        expect(f.triads.map((c) => c.function)).toEqual(["tonic", "subdominant", "tonic", "subdominant", "dominant", "tonic", "dominant"]);
      });

      it("relative, parallel and key signature", () => {
        expect(f.relative.name).toBe(row.relative);
        expect(f.parallel.name).toBe(`${tonic} major`);
        expect(f.signature).toEqual({ sharps: row.sharps ? split(row.sharps) : [], flats: [] });
      });

      it("borrowed chords and secondary dominants", () => {
        expect(numerals(f.borrowed)).toEqual(["I", "IV", "bII"]);
        expect(names(f.borrowed)).toEqual(split(row.borrowed));
        expect(numerals(f.secondaryDominants)).toEqual(["V/III", "V/iv", "V/V", "V/VI", "V/VII"]);
        expect(names(f.secondaryDominants)).toEqual(split(row.secondary));
      });

      it("common progressions", () => {
        expect(f.progressions.map((p) => names(p.chords).join(" "))).toEqual(row.progressions);
      });

      it("capo helper", () => {
        expect(f.capo.map((o) => [o.shapes, o.capo])).toEqual(row.capo);
      });
    });
  }
});

describe("chordFamily — every key", () => {
  const all = [
    ...MAJOR_TONICS.map((t) => chordFamily(t, "major")),
    ...MINOR_TONICS.map((t) => chordFamily(t, "minor")),
  ];

  it("every chord has a Chord Library quality and a guitar chart", () => {
    for (const f of all) {
      const chords = [
        ...f.triads,
        ...f.sevenths,
        ...f.borrowed,
        ...f.secondaryDominants,
        ...(f.minorSets ?? []).flatMap((s) => [...s.triads, ...s.sevenths]),
      ];
      for (const c of chords) {
        expect(qualityForSuffix(c.suffix), `${f.key.name}: ${c.name}`).toBeDefined();
        const parsed = parseChordSymbol(c.name);
        expect([parsed.root, parsed.quality.suffix], `${f.key.name}: ${c.name}`).toEqual([c.root, c.suffix]);
        expect(getGuitarVoicings(parsed).length, `${f.key.name}: ${c.name}`).toBeGreaterThan(0);
      }
    }
  });

  it("scales use each letter once (no A# in a flat key)", () => {
    for (const f of all) expect(new Set(f.scale.map((n) => n[0])).size, f.key.name).toBe(7);
  });

  it("capo options are sorted, playable and never above fret 7", () => {
    expect(capoOptions("F#", "major")).toEqual([
      { shapes: "E", capo: 2, sounds: "F# major" },
      { shapes: "D", capo: 4, sounds: "F# major" },
      { shapes: "C", capo: 6, sounds: "F# major" },
    ]);
  });
});
