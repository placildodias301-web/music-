/**
 * One instrument database for the Chords page, the Tuner and the audio engine.
 * These tests check the database itself, that each page only lists the instruments that make sense for it, and that choosing a
 * tuning really changes the chords, the notes and the sound.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InstrumentRegistry, INSTRUMENTS_DEFINITIONS, chordInstruments, findDefinition, tunerInstruments, type InstrumentDefinition } from "./definitions";
import { chordSettingsFromTuner, tunerSelectionFromChords } from "./activeInstrument";
import { resolveDefinition, selectionForDefinition } from "./tunerLink";
import { INSTRUMENTS, targetsFor, tuningUnits, findInstrument } from "../tuner/tunings";
import { localStorageStore } from "../tuner/customTunings";
import { noteToMidi } from "../tuner/notes";
import { buildChordModel, chordTunings, tuningChoices, type ChordModel } from "../chords/model";
import { analyzePlayedStrings } from "../chords/analysis";
import { parseChordSymbol, spellChord } from "../chordTheory";
import { midiToFreq, getReferencePitch, setReferencePitch } from "../audio/pitch";
import { planStrumVoices, soundedMidi } from "../audio/voicePlan";
import { midiToFrequency } from "../theory/notes";

const def = (id: string) => findDefinition(id)!;
const ch = (s: string) => parseChordSymbol(s);
const model = (symbol: string, id: string, tuningId?: string, inversion = 0): ChordModel => buildChordModel(ch(symbol), def(id), { tuningId, inversion })!;

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  setReferencePitch(440);
});

describe("the master database", () => {
  it("has unique ids and complete metadata on every instrument", () => {
    const ids = INSTRUMENTS_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of INSTRUMENTS_DEFINITIONS) {
      expect(d.region, d.id).toBeTruthy();
      expect(["strings", "percussion", "wind", "drone", "electronic", "fixed_pitch"], d.id).toContain(d.tuningType);
      expect(["equal", "traditional"], d.id).toContain(d.temperament);
      expect(typeof d.requiresTuning, d.id).toBe("boolean");
      for (const k of ["chordSupport", "tunerSupport", "fretboardSupport"] as const) expect(["full", "limited", "specialized", "none"], `${d.id} ${k}`).toContain(d[k]);
      // the booleans the pages use are exactly the support levels
      expect(d.chordSupported, d.id).toBe(d.chordSupport !== "none");
      expect(d.tunerSupported, d.id).toBe(d.tunerSupport !== "none");
      expect(d.fretboardSupported, d.id).toBe(d.fretboardSupport !== "none");
    }
  });

  it("is reachable by InstrumentRegistry.get and the lists come from it", () => {
    expect(InstrumentRegistry.get("guitar")).toBe(def("guitar"));
    expect(InstrumentRegistry.all()).toBe(INSTRUMENTS_DEFINITIONS);
    expect(InstrumentRegistry.forChords().map((d) => d.id)).toEqual(chordInstruments().map((d) => d.id));
    expect(InstrumentRegistry.forTuner().map((d) => d.id)).toEqual(tunerInstruments().map((d) => d.id));
    expect(InstrumentRegistry.byRegion("South Asia").map((d) => d.id)).toEqual(expect.arrayContaining(["sitar", "tanpura", "tabla", "bansuri"]));
  });

  const FLAGS: [string, Partial<InstrumentDefinition>][] = [
    ["guitar", { chordSupported: true, tunerSupported: true, fretboardSupported: true, requiresTuning: true, tuningType: "strings" }],
    ["piano", { chordSupported: true, tunerSupport: "specialized", fretboardSupported: false, requiresTuning: false, tuningType: "fixed_pitch" }], // reference assistance, not a string tuner
    ["violin", { chordSupported: true, tunerSupported: true, fretboardSupport: "specialized", requiresTuning: true }],
    ["cello", { chordSupported: true, tunerSupported: true, fretboardSupport: "specialized", requiresTuning: true }],
    ["tabla", { chordSupported: false, tunerSupport: "specialized", fretboardSupported: false, tuningType: "percussion", requiresTuning: true }],
    ["sitar", { chordSupport: "specialized", tunerSupported: true, fretboardSupport: "specialized", requiresTuning: true, temperament: "traditional" }],
    ["timpani", { chordSupported: false, tunerSupported: true, fretboardSupported: false, tuningType: "percussion", requiresTuning: true }],
    ["synthesizer", { tunerSupported: false, tuningType: "electronic" }],
    ["tanpura", { chordSupported: false, tunerSupported: true, tuningType: "drone", temperament: "traditional" }],
    ["flute", { tunerSupport: "specialized", tuningType: "wind", chordSupport: "limited" }],
  ];
  it.each(FLAGS)("%s has the support flags that make musical sense", (id, expected) => {
    expect(def(id)).toMatchObject(expected);
  });

  it("the Chords page lists only instruments that can show chords; the Tuner only those that can be tuned", () => {
    const chordIds = chordInstruments().map((d) => d.id);
    const tunerIds = tunerInstruments().map((d) => d.id);
    for (const id of ["tabla", "timpani", "tanpura", "erhu"]) expect(chordIds, id).not.toContain(id);
    for (const id of ["keyboard", "organ", "synthesizer", "accordion"]) expect(tunerIds, id).not.toContain(id);
    expect(tunerIds).toContain("piano"); // as a pitch/reference mode
    for (const id of ["sitar", "oud", "classical-guitar", "guitar-8", "double-bass", "bouzouki", "charango", "cuatro", "tres", "vibraphone"]) expect(chordIds, id).toContain(id);
    for (const id of ["sitar", "oud", "classical-guitar", "guitar-8", "double-bass", "bouzouki", "charango", "cuatro", "tres", "tanpura", "tabla", "erhu", "timpani", "vibraphone"]) expect(tunerIds, id).toContain(id);
  });

  it("instruments with tuning data point at real tuner instruments and variants", () => {
    for (const d of INSTRUMENTS_DEFINITIONS.filter((x) => x.tuner)) {
      const inst = findInstrument(d.tuner!.instrumentId);
      expect(inst, d.id).toBeDefined();
      if (d.tuner!.variantId) expect(inst!.variants.some((v) => v.id === d.tuner!.variantId), `${d.id} variant`).toBe(true);
    }
  });

  it("every Tuner instrument opens the Tuner on itself and comes back as itself", () => {
    for (const d of tunerInstruments()) {
      const sel = selectionForDefinition(d);
      expect(resolveDefinition(sel).id, d.id).toBe(d.id);
    }
  });
});

describe("tuning data", () => {
  it("every preset of every instrument is well-formed: right string count, valid notes, one peg per course", () => {
    let presets = 0;
    for (const inst of INSTRUMENTS) {
      for (const v of inst.variants) {
        if (v.layout === "harp") continue;
        for (const t of v.tunings) {
          presets++;
          expect(t.strings, `${inst.id} ${v.id} ${t.id}`).toHaveLength(v.stringCount);
          for (const s of t.strings) {
            expect(noteToMidi(s.note), `${inst.id} ${t.id} ${s.note}`).toBe(s.midi);
            expect(s.midi).toBeGreaterThanOrEqual(12);
            expect(s.midi).toBeLessThanOrEqual(96);
          }
          expect(tuningUnits(t), `${inst.id} ${v.id} ${t.id} pegs`).toHaveLength(v.courseCount);
        }
      }
    }
    expect(presets).toBeGreaterThan(120);
  });

  it("the standard tunings are the real ones", () => {
    const notes = (id: string, variant?: string) => {
      const d = def(id);
      const t = chordTunings(d).find((x) => (variant ? x.id.startsWith(`${variant}:`) : true))!;
      return t.midi;
    };
    const names = (midis: number[]) => midis.map((m) => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][m % 12]).join(" ");
    expect(names(notes("guitar"))).toBe("E A D G B E");
    expect(names(notes("classical-guitar"))).toBe("E A D G B E");
    expect(names(notes("guitar-8"))).toBe("F# B E A D G B E");
    expect(names(notes("ukulele"))).toBe("G C E A");
    expect(names(notes("mandolin"))).toBe("G D A E");
    expect(names(notes("violin"))).toBe("G D A E");
    expect(names(notes("viola"))).toBe("C G D A");
    expect(names(notes("cello"))).toBe("C G D A");
    expect(names(notes("double-bass", "db-4"))).toBe("E A D G");
    expect(names(notes("bass", "bass-4"))).toBe("E A D G");
    expect(names(notes("banjo", "banjo-5"))).toBe("G D G B D");
    expect(names(notes("bouzouki"))).toBe("C F A D");
    expect(names(notes("charango"))).toBe("G C E A E");
    expect(names(notes("cuatro"))).toBe("A D F# B");
    expect(names(notes("tres"))).toBe("G C E");
  });

  it("paired courses have both strings: mandolin 8, 12-string 12, bouzouki 8, charango 10, tres 6, oud 11", () => {
    const strings = (id: string) => chordTunings(def(id))[0].allMidi.length;
    expect(strings("mandolin")).toBe(8);
    expect(strings("guitar-12")).toBe(12);
    expect(strings("bouzouki")).toBe(8);
    expect(strings("charango")).toBe(10);
    expect(strings("tres")).toBe(6);
    expect(strings("oud")).toBe(11);
    expect(strings("sitar")).toBe(7);
  });

  it("Indian instruments are tuned to Sa: one preset per key, derived from Sa", () => {
    const sitar = findInstrument("sitar")!.variants[0].tunings;
    expect(sitar).toHaveLength(12);
    const tanpura = findInstrument("tanpura")!;
    for (const v of tanpura.variants) expect(v.tunings).toHaveLength(12);
    const d = tanpura.variants[0].tunings.find((t) => t.name.includes("Sa = D"))!;
    // Pa below Sa, Sa, Sa, and Sa an octave lower — in the key of D
    expect(d.strings.map((s) => s.note)).toEqual(["A2", "D3", "D3", "D2"]);
    const ma = tanpura.variants[1].tunings.find((t) => t.name.includes("Sa = D"))!;
    expect(ma.strings[0].note).toBe("G2");
    const dayan = findInstrument("tabla")!.variants[0].tunings.find((t) => t.name.includes("Sa = C#"))!;
    expect(dayan.strings.map((s) => s.note)).toEqual(["C#3"]);
    expect(sitar[0].note).toMatch(/Octaves assumed/);
    expect(def("sitar").temperament).toBe("traditional");
  });

  it("every frequency follows the selected reference pitch (A4 = 440, 441, 442, 443, 444, custom)", () => {
    const guitar = findInstrument("guitar")!.variants[0].tunings[0];
    for (const a4 of [440, 441, 442, 443, 444, 432]) {
      const targets = targetsFor(guitar, a4);
      const a2 = targets.find((t) => t.note === "A2")!;
      expect(a2.frequency).toBeCloseTo((a4 / 440) * 110, 6);
    }
  });
});

describe("the tuning you choose changes the chords", () => {
  const frets = (m: ChordModel) => (m.kind === "fretted" ? m.shapes.map((s) => s.frets.join(",")) : []);

  it("guitar: Standard, Drop D and DADGAD each build real C chords from their own strings, and Standard comes back", () => {
    const names = (id: string) => tuningChoices(def("guitar")).find((t) => t.name.toLowerCase().includes(id))!.id;
    const standard = model("C", "guitar");
    const drop = model("C", "guitar", names("drop d"));
    const dadgad = model("C", "guitar", names("dadgad"));
    if (standard.kind !== "fretted" || drop.kind !== "fretted" || dadgad.kind !== "fretted") throw new Error("expected fretted");

    const midi = (m: typeof standard) => m.tuning.midi.map((x) => x % 12);
    expect(midi(standard)).toEqual([4, 9, 2, 7, 11, 4]); // E A D G B E
    expect(midi(drop)).toEqual([2, 9, 2, 7, 11, 4]); //     D A D G B E
    expect(midi(dadgad)).toEqual([2, 9, 2, 7, 9, 2]); //    D A D G A D

    const cPcs = new Set([0, 4, 7]);
    for (const m of [standard, drop, dadgad]) {
      expect(m.shapes.length).toBeGreaterThan(0);
      for (const s of m.shapes) {
        const sounded = soundedMidi(s.frets, m.tuning.midi);
        expect(sounded.length).toBeGreaterThan(2);
        for (const x of sounded) expect(cPcs.has(x % 12), `${m.tuning.name} ${s.frets}`).toBe(true);
      }
    }
    // the shapes really are different: tuning is not just a label
    expect(frets(drop)).not.toEqual(frets(standard));
    expect(frets(dadgad)).not.toEqual(frets(standard));
    // and back to Standard gives exactly what it gave before
    expect(frets(model("C", "guitar", names("standard")))).toEqual(frets(standard));
  });

  it("the audio, the string table and the note names all use the chosen tuning", () => {
    const dropId = tuningChoices(def("guitar")).find((t) => t.name.toLowerCase().includes("drop d"))!.id;
    const chord = ch("D");
    const m = buildChordModel(chord, def("guitar"), { tuningId: dropId, inversion: 0 })!;
    if (m.kind !== "fretted") throw new Error();
    // open D5 shape on drop D: the lowest string is a D (open), not an E
    const open = m.shapes.find((s) => s.frets[0] === 0) ?? m.shapes[0];
    const voices = planStrumVoices({ frets: open.frets, tuningMidi: m.tuning.midi, courses: m.tuning.offsets });
    const lowest = voices.reduce((lo, v) => (v.midi < lo.midi ? v : lo));
    expect(lowest.midi % 12).toBe(2);
    const played = analyzePlayedStrings(open.frets, m.tuning.midi, chord.root, undefined, chord);
    for (const p of played) if (p.action !== "muted") expect(spellChord(chord)).toContain(p.noteName);
  });

  it("every instrument with alternate tunings builds chords in each of them", () => {
    let tunings = 0;
    for (const d of chordInstruments()) {
      const choices = tuningChoices(d);
      if (choices.length < 2 || d.id === "harp" || d.id === "harmonica") continue;
      for (const t of choices.slice(0, 6)) {
        tunings++;
        const m = buildChordModel(ch("G"), d, { tuningId: t.id, inversion: 0 });
        expect(m, `${d.id} ${t.name}`).not.toBeNull();
        if (m && (m.kind === "fretted" || m.kind === "bass")) expect(m.tuning.id).toBe(t.id);
      }
    }
    expect(tunings).toBeGreaterThan(30);
  });

  it("a custom tuning saved on the Tuner page is a chord tuning on the Chords page", () => {
    localStorageStore.save([{ id: "abc", name: "My open D", instrumentId: "guitar", variantId: "acoustic-6", notes: ["D2", "A2", "D3", "F#3", "A3", "D4"] }]);
    const choices = tuningChoices(def("guitar"));
    const mine = choices.find((c) => c.name === "My open D");
    expect(mine).toBeDefined();
    const m = buildChordModel(ch("D"), def("guitar"), { tuningId: mine!.id, inversion: 0 })!;
    if (m.kind !== "fretted") throw new Error();
    expect(m.tuning.midi.map((x) => x % 12)).toEqual([2, 9, 2, 6, 9, 2]);
    expect(m.stringNames).toEqual(["D", "A", "D", "F#", "A", "D"]);
    // an open D chord on open D tuning is simply the open strings
    expect(m.shapes.some((s) => s.frets.every((f) => f === 0 || f === null))).toBe(true);
  });
});

describe("the Tuner and the Chords page share one selection", () => {
  it("Guitar · Drop D on one page is Guitar · Drop D on the other, both ways", () => {
    const chordSettings = { definitionId: "guitar", tuningId: "acoustic-6:drop-d", inversion: 0 };
    const sel = tunerSelectionFromChords(chordSettings)!;
    expect(sel).toMatchObject({ instrumentId: "guitar", variantId: "acoustic-6", tuningId: "drop-d", definitionId: "guitar" });
    expect(chordSettingsFromTuner(sel)).toMatchObject({ definitionId: "guitar", tuningId: "acoustic-6:drop-d" });
  });

  it("works for every instrument that is on both pages", () => {
    for (const d of INSTRUMENTS_DEFINITIONS.filter((x) => x.tuner && x.chordSupported && x.tunerSupported)) {
      for (const t of tuningChoices(d).slice(0, 4)) {
        const sel = tunerSelectionFromChords({ definitionId: d.id, tuningId: t.id, inversion: 0 })!;
        expect(sel, d.id).not.toBeNull();
        const back = chordSettingsFromTuner(sel)!;
        expect(back.definitionId, d.id).toBe(d.id);
        expect(back.tuningId, `${d.id} ${t.name}`).toBe(t.id);
      }
    }
  });

  it("instruments on only one page don't leak into the other", () => {
    expect(chordSettingsFromTuner(selectionForDefinition(def("tabla")))).toBeNull();
    expect(chordSettingsFromTuner(selectionForDefinition(def("timpani")))).toBeNull();
    expect(tunerSelectionFromChords({ definitionId: "piano", inversion: 0 })).toBeNull();
    expect(tunerSelectionFromChords({ definitionId: "organ", inversion: 0 })).toBeNull();
  });
});

describe("instrument-aware chords", () => {
  it("guitar C is a real guitar voicing, string by string: x 3 2 0 1 0 sounds A→C, D→E, G→G, B→C, e→E", () => {
    const m = model("C", "guitar");
    if (m.kind !== "fretted") throw new Error();
    expect(m.shapes[0].frets).toEqual([null, 3, 2, 0, 1, 0]);
    const voices = planStrumVoices({ frets: m.shapes[0].frets, tuningMidi: m.tuning.midi, humanize: false });
    expect(voices.map((v) => v.midi)).toEqual([48, 52, 55, 60, 64]); // C3 E3 G3 C4 E4
    expect(voices.map((v) => v.stringIndex)).toEqual([1, 2, 3, 4, 5]);
    // no duplicate strings, no missing ones, no stray string
    expect(new Set(voices.map((v) => v.stringIndex)).size).toBe(5);
  });

  it("each instrument builds its own kind of chord, not a guitar chart", () => {
    const kind = (id: string) => model("C", id).kind;
    for (const id of ["guitar", "classical-guitar", "guitar-8", "ukulele", "mandolin", "banjo", "bouzouki", "charango", "cuatro", "tres", "violin", "cello"]) expect(kind(id), id).toBe("fretted");
    expect(kind("bass")).toBe("bass");
    expect(kind("double-bass")).toBe("bass");
    expect(kind("piano")).toBe("keyboard");
    expect(kind("vibraphone")).toBe("mallet");
    expect(kind("harp")).toBe("harp");
    expect(kind("accordion")).toBe("accordion");
    expect(kind("flute")).toBe("wind");
    // sitar and oud get the notes to play, one at a time — not a fretboard
    expect(kind("sitar")).toBe("wind");
    expect(kind("oud")).toBe("wind");
    // tabla and timpani have no chord at all
    expect(buildChordModel(ch("C"), def("tabla"), { inversion: 0 })).toBeNull();
    expect(buildChordModel(ch("C"), def("timpani"), { inversion: 0 })).toBeNull();
  });

  it("the shapes use that instrument's own strings", () => {
    const strings = (id: string) => {
      const m = model("C", id);
      return m.kind === "fretted" ? m.stringNames : [];
    };
    expect(strings("ukulele")).toEqual(["G", "C", "E", "A"]);
    expect(strings("mandolin")).toEqual(["G", "D", "A", "E"]);
    expect(strings("violin")).toEqual(["G", "D", "A", "E"]);
    expect(strings("cello")).toEqual(["C", "G", "D", "A"]);
    expect(strings("banjo")).toHaveLength(5);
    expect(strings("guitar-8")).toEqual(["F#", "B", "E", "A", "D", "G", "B", "E"]);
    expect(strings("bouzouki")).toEqual(["C", "F", "A", "D"]);
    expect(strings("tres")).toEqual(["G", "C", "E"]);
    const cuatro = model("C", "cuatro");
    if (cuatro.kind !== "fretted") throw new Error();
    expect(cuatro.tuning.midi).toEqual([57, 62, 66, 59]); // A3 D4 F#4 B3 (re-entrant)
  });

  it("an 8-string guitar shape sounds only chord notes, with its extra low strings used for the bass note", () => {
    const m = model("C", "guitar-8");
    if (m.kind !== "fretted") throw new Error();
    expect(m.shapes.length).toBeGreaterThan(0);
    for (const s of m.shapes) {
      expect(s.frets).toHaveLength(8);
      for (const x of soundedMidi(s.frets, m.tuning.midi)) expect([0, 4, 7]).toContain(x % 12);
    }
  });

  it("double bass chords come from its tuning and it is drawn fretless", () => {
    const m = model("G", "double-bass");
    if (m.kind !== "bass") throw new Error();
    expect(m.tuning.midi).toEqual([28, 33, 38, 43]);
    expect(def("double-bass").fretless).toBe(true);
  });

  it("note names and frequencies follow the reference pitch (A4 = 442)", () => {
    setReferencePitch(442);
    expect(getReferencePitch()).toBe(442);
    expect(midiToFreq(69)).toBeCloseTo(442, 9);
    expect(midiToFrequency(57)).toBeCloseTo(221, 6);
    const voices = planStrumVoices({ frets: [null, 0, null, null, null, null], tuningMidi: [40, 45, 50, 55, 59, 64] });
    expect(voices[0].frequency).toBeCloseTo((442 / 440) * 110, 6);
    setReferencePitch(100);
    expect(getReferencePitch()).toBe(415); // clamped to the supported range
    setReferencePitch(440);
    expect(midiToFreq(69)).toBe(440);
  });
});
