import { describe, it, expect } from "vitest";
import { midiToFrequency, noteToMidi } from "./notes";
import { centsBetween } from "./cents";
import { INSTRUMENTS, customToPreset, findVariant, findInstrument, defaultTuningId, targetsFor, tuningUnits } from "./tunings";
import { TunerEngine } from "./engine";
import { PROFILES } from "./profiles";
import {
  CUSTOM_POSITIONS_ID,
  HARP_STATES,
  LEVER_HARP_RANGE,
  NATURAL_STATE,
  PEDAL_HARP_RANGE,
  harpNeedsForNotes,
  harpPreset,
  harpStrings,
  keyAccidentals,
  resolveHarpPreset,
  validateHarpRange,
} from "./harp";
import type { CustomTuning } from "./types";

const f = (n: string) => midiToFrequency(noteToMidi(n)!);
const SR = 48000;
const N = 4096;
const variantOf = (inst: string, v: string) => findVariant(inst, v)!;
const notesOf = (inst: string, v: string, preset: string) => variantOf(inst, v).tunings.find((t) => t.id === preset)!.strings.map((s) => s.note);

describe("target frequencies", () => {
  it("A3/A4/A5 and the cents formula", () => {
    expect(f("A3")).toBeCloseTo(220, 6);
    expect(f("A4")).toBeCloseTo(440, 6);
    expect(f("A5")).toBeCloseTo(880, 6);
    expect(centsBetween(f("A4") * 2 ** (1 / 12), f("A4"))).toBeCloseTo(100, 6);
  });
  it("guitar E2…E4, bass E1 and ukulele G4 C4 E4 A4", () => {
    expect(f("E2")).toBeCloseTo(82.41, 2);
    expect(f("E4")).toBeCloseTo(329.63, 2);
    expect(f("E1")).toBeCloseTo(41.2, 2);
    expect([f("G4"), f("C4"), f("E4"), f("A4")].map((x) => Math.round(x * 100) / 100)).toEqual([392, 261.63, 329.63, 440]);
  });
  it("calibration moves every target", () => {
    expect(midiToFrequency(noteToMidi("A4")!, 415)).toBe(415);
    expect(midiToFrequency(noteToMidi("A4")!, 466)).toBe(466);
    const preset = variantOf("ukulele", "ukulele-4").tunings[0];
    expect(targetsFor(preset, 432)[3].frequency).toBeCloseTo(432, 6);
  });
});

describe("added tunings (verified against the instrument's usual tuning)", () => {
  it("7-string: standard B-standard and Drop A", () => {
    expect(notesOf("guitar", "guitar-7", "standard")).toEqual(["B1", "E2", "A2", "D3", "G3", "B3", "E4"]);
    expect(notesOf("guitar", "guitar-7", "drop-a")[0]).toBe("A1");
  });
  it("bass 4 and 5 string", () => {
    expect(notesOf("bass", "bass-4", "standard")).toEqual(["E1", "A1", "D2", "G2"]);
    expect(notesOf("bass", "bass-5", "standard")).toEqual(["B0", "E1", "A1", "D2", "G2"]);
  });
  it("ukulele High G, Low G and baritone", () => {
    const u = variantOf("ukulele", "ukulele-4").tunings;
    expect(u.find((t) => t.id === "standard")!.strings.map((s) => s.note)).toEqual(["G4", "C4", "E4", "A4"]);
    expect(u.find((t) => t.id === "low-g")!.strings[0].note).toBe("G3");
    expect(u.some((t) => /baritone/i.test(t.name))).toBe(true);
  });
  it("mandolin G D A E in paired courses", () => {
    const v = variantOf("mandolin", "mandolin-8");
    expect(v.courseCount).toBe(4);
    expect(tuningUnits(v.tunings[0]).map((u) => v.tunings[0].strings[u.stringIndexes[0]].note)).toEqual(["G3", "D4", "A4", "E5"]);
  });
  it("banjo: high drone G first, then D G B D", () => {
    expect(notesOf("banjo", "banjo-5", "open-g")).toEqual(["G4", "D3", "G3", "B3", "D4"]);
  });
  it("cavaquinho: Brazilian D G B D, with the Portuguese variants kept separate and labelled", () => {
    const v = variantOf("cavaquinho", "cavaquinho-4");
    expect(v.tunings[0].strings.map((s) => s.note.replace(/\d/, ""))).toEqual(["D", "G", "B", "D"]);
    expect(v.tunings.filter((t) => /portuguese/i.test(t.name)).every((t) => !!t.note)).toBe(true);
  });
  it("balalaika: prima E E A plus the other sizes", () => {
    expect(notesOf("balalaika", "balalaika-3", "prima")).toEqual(["E4", "E4", "A4"]);
    expect(findInstrument("balalaika")!.variants.map((v) => v.id)).toEqual(expect.arrayContaining(["balalaika-secunda", "balalaika-alto", "balalaika-bass", "balalaika-contrabass", "balalaika-piccolo"]));
  });
  it("violin, viola and cello are still there", () => {
    for (const id of ["violin", "viola", "cello"]) expect(findInstrument(id)).toBeDefined();
  });
  it("every preset resolves from its default id and custom tunings convert", () => {
    for (const inst of INSTRUMENTS) for (const v of inst.variants) expect(v.tunings.some((t) => t.id === defaultTuningId(v))).toBe(true);
    const c: CustomTuning = { id: "c1", name: "Mine", instrumentId: "ukulele", variantId: "ukulele-4", notes: ["A4", "D4", "F#4", "B4"] };
    expect(customToPreset(c).strings.map((s) => s.note)).toEqual(c.notes);
  });
});

describe("harp model", () => {
  it("lever harp C2–A6 has 34 strings; pedal harp C1–G7 has 47", () => {
    const lever = harpStrings(LEVER_HARP_RANGE, NATURAL_STATE, "t");
    const pedal = harpStrings(PEDAL_HARP_RANGE, NATURAL_STATE, "t");
    expect(lever).toHaveLength(34);
    expect(lever[0].note).toBe("C2");
    expect(lever.at(-1)!.note).toBe("A6");
    expect(pedal).toHaveLength(47);
    expect(pedal[0].note).toBe("C1");
    expect(pedal.at(-1)!.note).toBe("G7");
  });
  it("key settings follow the circle of fifths and the 15 named keys exist", () => {
    expect(HARP_STATES).toHaveLength(15);
    expect(keyAccidentals(0)).toEqual(NATURAL_STATE);
    expect(keyAccidentals(1).F).toBe(1); // G major: F♯
    expect(keyAccidentals(-1).B).toBe(-1); // F major: B♭
    expect(keyAccidentals(7)).toEqual({ C: 1, D: 1, E: 1, F: 1, G: 1, A: 1, B: 1 });
  });
  it("accidentals apply to every octave of that letter, except the pedal harp's fixed strings", () => {
    const g = harpStrings(PEDAL_HARP_RANGE, keyAccidentals(7), "t");
    expect(g.filter((s) => s.note.startsWith("F#")).length).toBe(7);
    expect(g[0].note).toBe("C1"); // fixed natural
    expect(g.at(-1)!.note).toBe("G7"); // fixed natural
  });
  it("custom positions preset is hand-set per letter", () => {
    const p = resolveHarpPreset(LEVER_HARP_RANGE, CUSTOM_POSITIONS_ID, { ...NATURAL_STATE, F: 1, B: -1 });
    expect(p.strings.find((s) => s.note.startsWith("F"))!.note).toMatch(/^F#/);
    expect(harpPreset("x", "x", LEVER_HARP_RANGE, NATURAL_STATE).strings).toHaveLength(34);
  });
  it("custom range is validated", () => {
    expect(validateHarpRange("C3", 22).ok).toBe(true);
    expect(validateHarpRange("H3", 22).ok).toBe(false);
    expect(validateHarpRange("C3", 0).ok).toBe(false);
    expect(validateHarpRange("C7", 40).ok).toBe(false);
  });
  it("chord needs: Cmaj7 is all natural, Dmaj needs F♯ and C♯, a letter needed twice is a conflict", () => {
    expect(harpNeedsForNotes(["C", "E", "G", "B"]).needs.every((n) => n.accidental === 0)).toBe(true);
    const d = harpNeedsForNotes(["D", "F#", "A"]);
    expect(d.needs.find((n) => n.letter === "F")!.accidental).toBe(1);
    expect(harpNeedsForNotes(["C", "C#"]).conflict).toBe("C");
  });
});

describe("detection profiles", () => {
  it("mallet skips a long strike, reed needs the most agreement", () => {
    expect(PROFILES.mallet.transientHoldMs).toBeGreaterThan(PROFILES.default.transientHoldMs * 2);
    expect(PROFILES.reed.minStableFrames).toBeGreaterThan(PROFILES.default.minStableFrames);
    expect(PROFILES.reed.minConfidence).toBeGreaterThan(PROFILES.default.minConfidence);
  });

  function sine(freq: number, amp: number, seed: number, harmonics = [1, 0.15]): Float32Array {
    const b = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let v = 0;
      harmonics.forEach((a, k) => (v += a * Math.sin((2 * Math.PI * freq * (k + 1) * (i + seed * 977)) / SR)));
      b[i] = amp * v;
    }
    return b;
  }

  /** ~200 ms of a loud wrong-pitch strike followed by the bar's quieter, true ring. */
  function strikeThenRing(profile: "mallet" | "default") {
    const target = f("C5");
    const e = new TunerEngine({ mode: "chromatic", targets: [], selectedIndex: 0, a4: 440, fmin: 60, fmax: 4200, profile });
    const seen: (string | null)[] = [];
    let t = 0;
    e.processFrame(new Float32Array(N), SR, t);
    for (let k = 1; k <= 5; k++) seen.push(e.processFrame(sine(f("A4") * 1.5, 0.8, k, [1, 0.9]), SR, (t += 33)).frequency === null ? null : "read");
    let last = e.processFrame(sine(target, 0.12, 9), SR, (t += 33));
    for (let k = 10; k < 40; k++) last = e.processFrame(sine(target, 0.12, k), SR, (t += 33));
    return { strike: seen, last };
  }
  it("default profile would have read the strike (so the mallet profile is doing the work)", () => {
    expect(strikeThenRing("default").strike.some((n) => n !== null)).toBe(true);
  });
  it("mallet profile ignores the strike and reads the ring-out", () => {
    const { strike, last } = strikeThenRing("mallet");
    expect(strike.every((n) => n === null)).toBe(true);
    expect(last.detectedNote).toBe("C5");
    expect(Math.abs(last.cents!)).toBeLessThan(3);
  });
});
