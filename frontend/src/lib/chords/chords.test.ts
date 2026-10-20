import { describe, it, expect } from "vitest";
import { parseChordSymbol, spellChord, chordMidiNotes, type ParsedChord } from "../chordTheory";
import { chordFormula, clampInversion, invertedMidi, invertedNames, inversionCount, formulaText } from "./theory";
import { buildChordModel, chordTunings, findChordTuning, stradellaFor, modelMidi, type ChordModel } from "./model";
import { guitar7Shapes, stringShapes, bassDyads, bassArpeggio } from "./stringShapes";
import { INSTRUMENTS_DEFINITIONS, chordInstruments, findDefinition, rendererFor, tunerInstruments, groupByCategory, matchesInstrument } from "../instruments/definitions";
import { resolveDefinition, selectionForDefinition } from "../instruments/tunerLink";
import { findInstrument } from "../tuner/tunings";

const ch = (s: string) => parseChordSymbol(s);
const def = (id: string) => findDefinition(id)!;
const model = (symbol: string, id: string, tuningId?: string, inversion = 0): ChordModel => buildChordModel(ch(symbol), def(id), { tuningId, inversion })!;
const pcSet = (c: ParsedChord) => new Set(chordMidiNotes(c).map((m) => m % 12));

describe("shared chord theory", () => {
  it("spells the basic chords", () => {
    expect(spellChord(ch("C"))).toEqual(["C", "E", "G"]);
    expect(spellChord(ch("Cm"))).toEqual(["C", "E♭", "G"]);
    expect(spellChord(ch("C7"))).toEqual(["C", "E", "G", "B♭"]);
    expect(spellChord(ch("Cmaj7"))).toEqual(["C", "E", "G", "B"]);
  });
  it("formulas against the major scale", () => {
    expect(chordFormula(ch("C"))).toEqual(["1", "3", "5"]);
    expect(formulaText(ch("Cm7"))).toBe("1 ♭3 5 ♭7");
    expect(formulaText(ch("Cmaj7"))).toBe("1 3 5 7");
    expect(formulaText(ch("Cdim"))).toBe("1 ♭3 ♭5");
  });
  it("inversions keep the same notes, move the bass note and clamp", () => {
    expect(invertedNames(ch("C"), 0)).toEqual(["C", "E", "G"]);
    expect(invertedNames(ch("C"), 1)).toEqual(["E", "G", "C"]);
    expect(invertedNames(ch("C"), 2)).toEqual(["G", "C", "E"]);
    expect(invertedMidi(ch("C"), 1)).toEqual([64, 67, 72]);
    expect(inversionCount(ch("C"))).toBe(3);
    expect(clampInversion(ch("C"), 9)).toBe(2);
    expect(new Set(invertedMidi(ch("C7"), 3).map((m) => m % 12))).toEqual(pcSet(ch("C7")));
  });
});

describe("instrument registry", () => {
  const required = ["guitar", "electric-guitar", "acoustic-guitar", "guitar-7", "guitar-12", "bass", "ukulele", "piano", "keyboard", "organ", "synthesizer", "mandolin", "banjo", "cavaquinho", "balalaika", "harp", "accordion", "marimba", "xylophone", "violin", "viola", "cello"];
  it("has every requested instrument, with unique ids", () => {
    for (const id of required) expect(findDefinition(id), id).toBeDefined();
    expect(new Set(INSTRUMENTS_DEFINITIONS.map((d) => d.id)).size).toBe(INSTRUMENTS_DEFINITIONS.length);
  });
  it("picks the right chord renderer", () => {
    const r = (id: string) => rendererFor(def(id));
    expect([r("guitar"), r("electric-guitar"), r("acoustic-guitar")]).toEqual(["guitar", "guitar", "guitar"]);
    expect(r("guitar-7")).toBe("guitar7");
    expect(r("guitar-12")).toBe("guitar12");
    expect(r("bass")).toBe("bass");
    expect([r("piano"), r("keyboard"), r("organ"), r("synthesizer")]).toEqual(["keyboard", "keyboard", "keyboard", "keyboard"]);
    expect(r("harp")).toBe("harp");
    expect(r("accordion")).toBe("accordion");
    expect([r("marimba"), r("xylophone")]).toEqual(["mallet", "mallet"]);
    expect(r("ukulele")).toBe("ukulele");
  });
  it("violin, viola and cello stay in the Tuner only", () => {
    for (const id of ["violin", "viola", "cello"]) {
      expect(rendererFor(def(id))).toBeUndefined();
      expect(chordInstruments().some((d) => d.id === id)).toBe(false);
      expect(tunerInstruments().some((d) => d.id === id)).toBe(true);
    }
  });
  it("tuner modes: stringed, coursed, harp, chromatic, mallet, reed", () => {
    expect(new Set(INSTRUMENTS_DEFINITIONS.map((d) => d.tunerMode))).toEqual(new Set(["stringed", "coursed", "harp", "chromatic", "mallet", "reed"]));
    expect(def("guitar-12").tunerMode).toBe("coursed");
    expect(def("mandolin").tunerMode).toBe("coursed");
    expect(def("accordion").tunerMode).toBe("reed");
    expect(def("marimba").tunerMode).toBe("mallet");
  });
  it("keys, accordion, mallets and organ never get string pegs", () => {
    for (const id of ["piano", "keyboard", "organ", "synthesizer", "accordion", "marimba", "xylophone"]) {
      expect(def(id).tuner, id).toBeUndefined();
      expect(selectionForDefinition(def(id)).instrumentId).toBe("chromatic");
    }
  });
  it("every linked tuner instrument exists, and a saved selection finds its list entry", () => {
    for (const d of INSTRUMENTS_DEFINITIONS) if (d.tuner) expect(findInstrument(d.tuner.instrumentId), d.id).toBeDefined();
    for (const id of ["guitar", "electric-guitar", "guitar-7", "guitar-12", "bass", "banjo", "harp", "chromatic"]) expect(resolveDefinition(selectionForDefinition(def(id))).id).toBe(id);
  });
  it("the Tuner lists only string instruments, plus Chromatic", () => {
    const ids = tunerInstruments().map((d) => d.id);
    for (const id of ["piano", "keyboard", "organ", "synthesizer", "accordion", "marimba", "xylophone"]) expect(ids, id).not.toContain(id);
    for (const id of ["guitar", "bass", "ukulele", "mandolin", "banjo", "harp", "violin", "cello", "chromatic"]) expect(ids, id).toContain(id);
    expect(new Set(tunerInstruments().map((d) => d.category))).toEqual(new Set(["guitars", "bass", "folk", "orchestral", "chromatic"]));
  });
  it("a saved keys or mallet selection reopens the Tuner on Chromatic", () => {
    for (const id of ["piano", "organ", "accordion", "marimba"]) expect(resolveDefinition(selectionForDefinition(def(id))).id, id).toBe("chromatic");
  });
  it("grouping and search", () => {
    expect(groupByCategory(INSTRUMENTS_DEFINITIONS).map((g) => g.label.toLowerCase())).toEqual(expect.arrayContaining(["guitars", "bass"]));
    expect(INSTRUMENTS_DEFINITIONS.filter((d) => matchesInstrument(d, "ukul")).map((d) => d.id)).toEqual(["ukulele"]);
    expect(INSTRUMENTS_DEFINITIONS.filter((d) => matchesInstrument(d, "marim")).map((d) => d.id)).toEqual(["marimba"]);
  });
});

describe("string shapes respect the tuning", () => {
  const soundedPcs = (tuning: number[], frets: (number | null)[]) => frets.flatMap((f, i) => (f === null ? [] : [(tuning[i] + f) % 12]));
  const chords = ["C", "Am", "G", "E7", "Dm"];

  it("every shape on every default tuning only sounds chord tones", () => {
    const ids = ["guitar", "electric-guitar", "acoustic-guitar", "guitar-12", "ukulele", "mandolin", "banjo", "cavaquinho", "balalaika", "bass"];
    for (const id of ids) {
      const d = def(id);
      const t = chordTunings(d)[0];
      for (const sym of chords) {
        const m = model(sym, id) as Exclude<ChordModel, { kind: "keyboard" }>;
        const shapes = m.kind === "bass" ? [...m.dyads.map((x) => x.shape), ...m.shapes.map((s) => ({ name: s.name, frets: s.frets }))] : m.kind === "fretted" ? m.shapes : [];
        expect(shapes.length, `${id} ${sym}`).toBeGreaterThan(0);
        for (const s of shapes) {
          expect(s.frets.length, `${id} ${sym}`).toBe(t.midi.length);
          // A drone string keeps ringing open whatever the chord is.
          const pcs = soundedPcs(t.midi, s.frets.map((f, i) => (i === t.drone ? null : f)));
          for (const pc of pcs) expect(pcSet(ch(sym)).has(pc), `${id} ${sym} ${s.frets}`).toBe(true);
        }
      }
    }
  });
  it("a different tuning gives different frets that still spell the chord (DADGAD C)", () => {
    const std = stringShapes(ch("C"), [40, 45, 50, 55, 59, 64], { bassIsRoot: true })[0];
    const dadgad = stringShapes(ch("C"), [38, 45, 50, 55, 57, 62], { bassIsRoot: true })[0];
    expect(dadgad.frets).not.toEqual(std.frets);
    expect(soundedPcs([38, 45, 50, 55, 57, 62], dadgad.frets).every((pc) => pcSet(ch("C")).has(pc))).toBe(true);
  });
  it("ukulele: Low G shares the GCEA shapes; baritone uses its own", () => {
    const low = findChordTuning(def("ukulele"), "ukulele-4:low-g")!;
    expect(low.midi[0]).toBe(55);
    const m = model("C", "ukulele", "ukulele-4:low-g");
    expect(m.kind === "fretted" && m.shapes[0].frets).toEqual([0, 0, 0, 3]);
  });
  it("5-string banjo: the drone string is open in every shape", () => {
    const m = model("G", "banjo");
    expect(m.kind === "fretted" && m.shapes.every((s) => s.frets[0] === 0)).toBe(true);
  });
  it("12-string draws six courses and sounds twelve strings", () => {
    const m = model("G", "guitar-12");
    expect(m.kind === "fretted" && m.stringNames).toHaveLength(6);
    expect(modelMidi(m, 0).length).toBeGreaterThan(6);
  });
  it("mandolin has four courses and sounds each pair", () => {
    const m = model("G", "mandolin");
    expect(m.kind === "fretted" && m.stringNames).toHaveLength(4);
    expect(modelMidi(m, 0).length % 2).toBe(0);
  });
  it("7-string adds a low string to the six-string shape", () => {
    const t = findChordTuning(def("guitar-7"), undefined)!;
    expect(t.midi).toHaveLength(7);
    for (const s of guitar7Shapes(ch("E"), t.midi)) expect(s.frets).toHaveLength(7);
  });
});

describe("bass: chord shape vs arpeggio", () => {
  const bassMidi = [28, 33, 38, 43];
  it("dyads are root + chord tone and the root stays lowest", () => {
    for (const d of bassDyads(ch("C"), bassMidi)) {
      const notes = d.shape.frets.flatMap((f, i) => (f === null ? [] : [bassMidi[i] + f]));
      expect(notes).toHaveLength(2);
      expect(notes[0] % 12).toBe(0);
      expect(notes[1]).toBeGreaterThan(notes[0]);
      expect(pcSet(ch("C")).has(notes[1] % 12)).toBe(true);
    }
    expect(bassDyads(ch("C"), bassMidi).length).toBeGreaterThanOrEqual(2);
  });
  it("arpeggio walks up the chord tones to the octave, one note per step", () => {
    const a = bassArpeggio(ch("Am7"), bassMidi);
    expect(a.map((x) => x.note)).toEqual(["A", "C", "E", "G", "A"]);
    const midis = a.map((x) => bassMidi[x.string] + x.fret);
    expect([...midis].sort((x, y) => x - y)).toEqual(midis);
    expect(a.map((x) => x.order)).toEqual([1, 2, 3, 4, 5]);
  });
  it("the model keeps both views", () => {
    const m = model("C", "bass");
    expect(m.kind).toBe("bass");
    if (m.kind === "bass") {
      expect(m.arpeggio.length).toBeGreaterThan(2);
      expect(m.dyads.length).toBeGreaterThan(0);
    }
    expect(chordTunings(def("bass")).map((t) => t.id)).toEqual(expect.arrayContaining(["bass-4:standard", "bass-5:standard"]));
  });
});

describe("keys, mallet, harp and accordion models", () => {
  it("piano, organ, synth and keyboard share the keyboard model", () => {
    for (const id of ["piano", "keyboard", "organ", "synthesizer"]) expect(model("C", id).kind).toBe("keyboard");
    const m = model("C", "piano", undefined, 1);
    expect(m.kind === "keyboard" && m.keys.map((k) => k.name)).toEqual(["E", "G", "C"]);
    expect(m.kind === "keyboard" && m.keys.map((k) => k.midi)).toEqual([64, 67, 72]);
    expect(m.inversionLabel).toBe("1st inversion");
  });
  it("marimba and xylophone get bars, not keys or strings", () => {
    expect(model("Am", "marimba").kind).toBe("mallet");
    expect(model("Am", "xylophone").kind).toBe("mallet");
  });
  it("harp highlights strings of the chord's letters and has no frets", () => {
    const m = model("D", "harp", "pedal");
    expect(m.kind).toBe("harp");
    if (m.kind === "harp") {
      expect(m.strings).toHaveLength(47);
      expect(new Set(m.strings.filter((s) => s.inChord).map((s) => s.letter))).toEqual(new Set(["D", "F", "A"]));
      expect(m.strings.filter((s) => s.letter === "F" && s.inChord).every((s) => s.note.startsWith("F#"))).toBe(true);
      expect(m.needs).toContainEqual({ letter: "F", accidental: 1 });
      expect(m.conflict).toBeNull();
    }
    const lever = model("C", "harp", "lever");
    expect(lever.kind === "harp" && lever.strings).toHaveLength(34);
  });
  it("accordion: right-hand notes plus a Stradella button when one exists", () => {
    expect(stradellaFor(ch("C"))).toEqual({ column: "C", row: "Major" });
    expect(stradellaFor(ch("Am"))).toEqual({ column: "A", row: "Minor" });
    expect(stradellaFor(ch("G7"))).toEqual({ column: "G", row: "Seventh" });
    expect(stradellaFor(ch("Cmaj9"))).toBeNull();
    const m = model("C", "accordion");
    expect(m.kind === "accordion" && m.keys).toHaveLength(3);
  });
  it("orchestral strings and Chromatic have no chord model", () => {
    expect(buildChordModel(ch("C"), def("violin"), { inversion: 0 })).toBeNull();
    expect(buildChordModel(ch("C"), def("chromatic"), { inversion: 0 })).toBeNull();
  });
});

describe("wind instruments", () => {
  const WIND_IDS = ["flute", "piccolo", "recorder", "tin-whistle", "bansuri", "oboe", "clarinet", "bassoon", "soprano-sax", "alto-sax", "tenor-sax", "baritone-sax", "trumpet", "french-horn", "trombone", "tuba", "harmonica"];

  it("every wind instrument is on the Chords page, in a Wind group, and not in the Tuner", () => {
    const chordIds = chordInstruments().map((d) => d.id);
    const tunerIds = tunerInstruments().map((d) => d.id);
    for (const id of WIND_IDS) {
      expect(chordIds, id).toContain(id);
      expect(tunerIds, id).not.toContain(id);
      expect(def(id).category).toBe("wind");
    }
    expect(groupByCategory(chordInstruments()).some((g) => g.category === "wind")).toBe(true);
  });

  it("wind instruments get the wind renderer and harmonica its own", () => {
    for (const id of WIND_IDS.filter((i) => i !== "harmonica")) expect(rendererFor(def(id)), id).toBe("wind");
    expect(rendererFor(def("harmonica"))).toBe("harmonica");
  });

  it("sounding notes are the chord's notes and stay inside the instrument's range", () => {
    for (const id of WIND_IDS.filter((i) => i !== "harmonica")) {
      const m = model("Cmaj7", id);
      expect(m.kind).toBe("wind");
      if (m.kind !== "wind") continue;
      const pcs = new Set(modelMidi(m).map((x) => x % 12));
      for (const x of pcs) expect(pcSet(ch("Cmaj7")).has(x), id).toBe(true);
      expect(m.sounding.length, id).toBeGreaterThan(1);
    }
  });

  it("a B♭ clarinet reads C major as D major, and an E♭ alto sax reads it as A major", () => {
    const cl = model("C", "clarinet");
    const alto = model("C", "alto-sax");
    expect(cl.kind === "wind" && cl.written?.label).toBe("D");
    expect(cl.kind === "wind" && cl.written?.notes).toEqual(["D", "F♯", "A"]);
    expect(alto.kind === "wind" && alto.written?.label).toBe("A");
    expect(model("C", "flute").kind === "wind" && (model("C", "flute") as { written: unknown }).written).toBeNull();
  });

  it("harmonica: C major is blow 1-3 on a C harp, and every lit hole is a chord tone", () => {
    const m = model("C", "harmonica", "C");
    expect(m.kind).toBe("harmonica");
    if (m.kind !== "harmonica") return;
    const top = m.groups[0];
    expect(top.direction).toBe("blow");
    expect(top.from).toBe(1);
    expect(top.notes.map((n) => n.name).slice(0, 3)).toEqual(["C", "E", "G"]);
    const pcs = pcSet(ch("C"));
    for (const g of m.groups) for (const n of g.notes) expect(pcs.has(n.midi % 12)).toBe(true);
    expect(modelMidi(m).length).toBeGreaterThan(1);
  });
});
