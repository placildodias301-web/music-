import { describe, it, expect } from "vitest";
import { clampA4, frequencyToMidiFloat, midiToFrequency, midiToNoteName, nearestNote, noteToMidi } from "./notes";
import { centsBetween, guidance, tuneState } from "./cents";
import { INSTRUMENTS, targetsFor, tuningUnits, findVariant, detectionRange, customToPreset } from "./tunings";
import { median, PitchSmoother, HoldTracker, NoiseFloor, TransientGate } from "./smoothing";
import { AutoStringTracker, nearestString } from "./autoString";
import { validateCustomTuning } from "./customTunings";
import { TunerEngine, type EngineConfig } from "./engine";
import { yinPitch } from "./pitch";
import type { CustomTuning } from "./types";

const SR = 48000;
const N = 4096;

describe("notes", () => {
  it("equal temperament at A4 = 440", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(57)).toBeCloseTo(220, 6); // A3
    expect(midiToFrequency(81)).toBeCloseTo(880, 6); // A5
  });
  it("standard guitar frequencies", () => {
    const f = (n: string) => midiToFrequency(noteToMidi(n)!);
    expect(f("E2")).toBeCloseTo(82.41, 2);
    expect(f("A2")).toBeCloseTo(110, 2);
    expect(f("D3")).toBeCloseTo(146.83, 2);
    expect(f("G3")).toBeCloseTo(196, 2);
    expect(f("B3")).toBeCloseTo(246.94, 2);
    expect(f("E4")).toBeCloseTo(329.63, 2);
  });
  it("parses sharps, flats and rejects junk", () => {
    expect(noteToMidi("Eb2")).toBe(noteToMidi("D#2"));
    expect(noteToMidi("C-1")).toBe(0);
    expect(noteToMidi("H2")).toBeNull();
    expect(noteToMidi("E")).toBeNull();
  });
  it("closest note and alternate A4 calibration", () => {
    const n = nearestNote(439.2);
    expect(n.note).toBe("A4");
    expect(n.targetFrequency).toBeCloseTo(440, 6);
    expect(n.cents).toBeCloseTo(-3.15, 1);
    // At A4 = 432, 432 Hz is dead on A4 and 440 is ~31.8 cents sharp.
    expect(nearestNote(432, 432).cents).toBeCloseTo(0, 6);
    expect(nearestNote(440, 432).cents).toBeCloseTo(31.77, 1);
    expect(midiToFrequency(69, 415)).toBe(415);
    expect(frequencyToMidiFloat(466, 466)).toBeCloseTo(69, 9);
  });
  it("all 12 pitch classes get names", () => {
    expect(Array.from({ length: 12 }, (_, i) => midiToNoteName(60 + i, true))).toEqual(["C4", "Db4", "D4", "Eb4", "E4", "F4", "Gb4", "G4", "Ab4", "A4", "Bb4", "B4"]);
  });
  it("clamps calibration to 415–466 Hz", () => {
    expect(clampA4(300)).toBe(415);
    expect(clampA4(500)).toBe(466);
    expect(clampA4(442)).toBe(442);
    expect(clampA4(NaN)).toBe(440);
  });
});

describe("cents and states", () => {
  it("cents formula", () => {
    expect(centsBetween(110, 110)).toBe(0);
    expect(centsBetween(110 * 2 ** (1 / 12), 110)).toBeCloseTo(100, 6);
    expect(centsBetween(220, 110)).toBeCloseTo(1200, 6);
    expect(centsBetween(55, 110)).toBeCloseTo(-1200, 6);
  });
  it("bands", () => {
    expect(tuneState(0)).toBe("in-tune");
    expect(tuneState(-4.9)).toBe("in-tune");
    expect(tuneState(9)).toBe("slightly-sharp");
    expect(tuneState(-20)).toBe("flat");
    expect(tuneState(-45)).toBe("very-flat");
    expect(tuneState(31)).toBe("very-sharp");
  });
  it("does not flicker at a band edge (hysteresis)", () => {
    let s = tuneState(0);
    const seq = [4.8, 5.2, 4.9, 5.3, 4.6, 5.1];
    const states = seq.map((c) => (s = tuneState(c, s)));
    expect(new Set(states).size).toBe(1);
    expect(states[0]).toBe("in-tune");
    // and leaves in-tune once clearly past the edge
    expect(tuneState(8, "in-tune")).toBe("slightly-sharp");
  });
  it("guidance text is deterministic", () => {
    expect(guidance(-18, "E2")).toContain("18 cents flat");
    expect(guidance(24, "E2")).toContain("24 cents sharp");
    expect(guidance(-10, "E2")).toContain("very close");
    expect(guidance(1, "E2")).toBe("Perfect — E2 is in tune.");
  });
});

describe("instrument and tuning data", () => {
  const allPresets = INSTRUMENTS.flatMap((i) => i.variants.flatMap((v) => v.tunings.map((t) => ({ i, v, t }))));

  it("every preset has the variant's string count and valid, in-range MIDI", () => {
    for (const { v, t } of allPresets) {
      expect(t.strings.length, `${v.id}/${t.id}`).toBe(v.stringCount);
      for (const s of t.strings) {
        expect(noteToMidi(s.note)).toBe(s.midi);
        expect(s.midi).toBeGreaterThanOrEqual(12);
        // Harps reach G7 (and C♯7 when raised); everything else stays below C7.
        expect(s.midi).toBeLessThanOrEqual(v.layout === "harp" ? 108 : 96);
      }
      expect(new Set(t.strings.map((s) => s.id)).size).toBe(t.strings.length);
      expect(tuningUnits(t).length, `${v.id}/${t.id} courses`).toBe(v.courseCount);
    }
  });
  it("includes every required guitar preset", () => {
    const ids = findVariant("guitar", "acoustic-6")!.tunings.map((t) => t.id);
    for (const id of ["standard", "drop-d", "double-drop-d", "dadgad", "drop-c-sharp", "drop-c", "drop-b", "drop-a", "open-c", "open-d", "open-dm", "open-e", "open-em", "open-f", "open-g", "open-a", "open-am", "half-step-down", "whole-step-down", "half-step-up", "whole-step-up", "all-fourths", "new-standard"])
      expect(ids).toContain(id);
  });
  it("selected tuning targets follow the A4 calibration", () => {
    const std = findVariant("guitar", "acoustic-6")!.tunings[0];
    expect(targetsFor(std, 440)[1].frequency).toBeCloseTo(110, 6);
    expect(targetsFor(std, 442)[1].frequency).toBeCloseTo(110 * 442 / 440, 6);
  });
  it("ukulele is re-entrant and banjo has a high drone first", () => {
    const uke = findVariant("ukulele", "ukulele-4")!.tunings[0].strings.map((s) => s.note);
    expect(uke).toEqual(["G4", "C4", "E4", "A4"]);
    const banjo = findVariant("banjo", "banjo-5")!.tunings[0].strings;
    expect(banjo.map((s) => s.note)).toEqual(["G4", "D3", "G3", "B3", "D4"]);
    expect(banjo[0].midi).toBeGreaterThan(banjo[1].midi);
    // fmin must cover the lowest string wherever it sits in the order
    const range = detectionRange(findVariant("banjo", "banjo-5")!.tunings[0], 440);
    expect(range.fmin).toBeLessThan(146.83);
  });
  it("12-string: six courses, octave pairs for E A D G and unisons for B E", () => {
    const t = findVariant("guitar", "guitar-12")!.tunings[0];
    expect(t.strings).toHaveLength(12);
    const units = tuningUnits(t);
    expect(units).toHaveLength(6);
    expect(units[0].stringIndexes.map((i) => t.strings[i].note)).toEqual(["E2", "E3"]);
    expect(units[3].stringIndexes.map((i) => t.strings[i].note)).toEqual(["G3", "G4"]);
    expect(units[4].stringIndexes.map((i) => t.strings[i].note)).toEqual(["B3", "B3"]);
    expect(t.strings[0].pairRelation).toBe("octave");
    expect(t.strings[8].pairRelation).toBe("unison");
    expect(t.strings[0].pairId).toBe(t.strings[1].pairId);
  });
  it("custom tunings keep a variant's course pairing", () => {
    const c: CustomTuning = { id: "x", name: "My 12", instrumentId: "guitar", variantId: "guitar-12", notes: findVariant("guitar", "guitar-12")!.tunings[0].strings.map((s) => s.note) };
    expect(tuningUnits(customToPreset(c))).toHaveLength(6);
  });
});

describe("custom tuning validation", () => {
  const ok = { name: "My Drop C", instrumentId: "guitar", variantId: "acoustic-6", notes: ["C2", "G2", "C3", "F3", "A3", "D4"] };
  it("accepts a good tuning and normalises case", () => {
    const r = validateCustomTuning({ ...ok, notes: ["c2", "g2", "c3", "f3", "a3", "d4"] });
    expect(r.ok).toBe(true);
    expect(r.notes).toEqual(["C2", "G2", "C3", "F3", "A3", "D4"]);
  });
  it("rejects wrong count, bad notes, empty/long/duplicate names, out-of-range", () => {
    expect(validateCustomTuning({ ...ok, notes: ["C2", "G2"] }).ok).toBe(false);
    expect(validateCustomTuning({ ...ok, notes: ["C2", "G2", "C3", "F3", "A3", "X4"] }).ok).toBe(false);
    expect(validateCustomTuning({ ...ok, name: "  " }).ok).toBe(false);
    expect(validateCustomTuning({ ...ok, name: "x".repeat(40) }).ok).toBe(false);
    expect(validateCustomTuning({ ...ok, notes: ["C-1", "G2", "C3", "F3", "A3", "D4"] }).ok).toBe(false);
    const saved: CustomTuning[] = [{ id: "1", name: "my drop c", instrumentId: "guitar", variantId: "acoustic-6", notes: ok.notes }];
    expect(validateCustomTuning(ok, saved).ok).toBe(false);
    expect(validateCustomTuning(ok, saved, "1").ok).toBe(true);
  });
  it("allows re-entrant tunings (ukulele)", () => {
    expect(validateCustomTuning({ name: "Uke", instrumentId: "ukulele", variantId: "ukulele-4", notes: ["G4", "C4", "E4", "A4"] }).ok).toBe(true);
  });
});

describe("smoothing and outlier rejection", () => {
  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  it("an isolated octave error never moves the tuner (spec example)", () => {
    const s = new PitchSmoother();
    const out = [110.0, 110.2, 109.9, 110.1, 220.1, 110.1].map((f) => s.push(f));
    expect(out[4].rejected).toBe(true);
    for (const o of out) expect(Math.abs(centsBetween(o.frequency, 110))).toBeLessThan(5);
  });
  it("the literal spec sequence (outlier in the 4th frame) also holds", () => {
    const s = new PitchSmoother();
    const outs = [110.0, 110.2, 109.9, 220.1, 110.1].map((f) => s.push(f));
    for (const o of outs) expect(Math.abs(centsBetween(o.frequency, 110))).toBeLessThan(5);
  });
  it("accepts a real change after consecutive agreeing frames", () => {
    const s = new PitchSmoother();
    [110, 110.1, 109.9, 110, 110.1].forEach((f) => s.push(f));
    let last = s.push(146.8);
    for (let i = 0; i < 5; i++) last = s.push(146.9);
    expect(centsBetween(last.frequency, 146.9)).toBeLessThan(5);
  });
  it("noise floor rises slowly, drops at once; transient gate skips pick attacks", () => {
    const nf = new NoiseFloor();
    for (let i = 0; i < 50; i++) nf.update(0.05);
    expect(nf.floor).toBeLessThan(0.02);
    nf.update(0.004);
    expect(nf.floor).toBeCloseTo(0.004, 6);
    const g = new TransientGate();
    expect(g.update(0.02, 0)).toBe(false);
    expect(g.update(0.2, 33)).toBe(true); // attack
    expect(g.update(0.15, 66)).toBe(true);
    expect(g.update(0.14, 200)).toBe(false);
  });
  it("hold tracker needs continuous time", () => {
    const h = new HoldTracker(400);
    expect(h.update(true, 0)).toBe(false);
    expect(h.update(true, 300)).toBe(false);
    expect(h.update(false, 350)).toBe(false); // broken
    expect(h.update(true, 400)).toBe(false);
    expect(h.update(true, 850)).toBe(true);
  });
});

describe("automatic string matching", () => {
  const std = findVariant("guitar", "acoustic-6")!.tunings[0];
  const targets = targetsFor(std, 440);
  it("109.7 Hz is A2 (string 5)", () => {
    const m = nearestString(109.7, targets)!;
    expect(targets[m.index].note).toBe("A2");
    expect(targets[m.index].displayNumber).toBe(5);
  });
  it("does not hop strings on one noisy frame, but follows a real change", () => {
    const t = new AutoStringTracker();
    expect(targets[t.update(109.7, targets, new Set(), 0)!].note).toBe("A2");
    expect(targets[t.update(140, targets, new Set(), 33)!].note).toBe("A2"); // one noisy frame, 140 Hz is closest to D3
    expect(targets[t.update(110, targets, new Set(), 66)!].note).toBe("A2");
    // a real move to D3 must persist (200 ms by default), not just appear for a frame
    let now = 100;
    const step = (f: number) => targets[t.update(f, targets, new Set(), (now += 33))!].note;
    expect(step(146.8)).toBe("A2");
    for (let k = 0; k < 4; k++) step(146.9);
    expect(step(146.9)).toBe("A2"); // ~165 ms in: still holding
    for (let k = 0; k < 2; k++) step(146.9);
    expect(step(146.9)).toBe("D3");
  });
  it("keeps a detuned string selected while you tune it", () => {
    const t = new AutoStringTracker();
    t.update(110, targets);
    for (const f of [101, 103, 106, 109]) expect(targets[t.update(f, targets)!].note).toBe("A2");
  });
  it("unison strings: the next untuned one is picked", () => {
    const m = findVariant("mandolin", "mandolin-8")!.tunings[0];
    const tg = targetsFor(m, 440);
    expect(nearestString(196, tg)!.index).toBe(0);
    expect(nearestString(196, tg, new Set([0]))!.index).toBe(1);
  });
  it("banjo's high drone is found even though it is listed first", () => {
    const b = targetsFor(findVariant("banjo", "banjo-5")!.tunings[0], 440);
    expect(b[nearestString(392, b)!.index].note).toBe("G4");
    expect(b[nearestString(146.8, b)!.index].note).toBe("D3");
  });
});

/* ── Signal level: the whole chain on synthetic strings ── */

function tone(freq: number, opts: { harmonics?: number[]; noise?: number; seed?: number; amp?: number; phase?: number } = {}): Float32Array {
  const { harmonics = [1, 0.7, 0.5, 0.35, 0.25, 0.15], noise = 0, amp = 0.3, phase = 0 } = opts;
  let seed = opts.seed ?? 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    harmonics.forEach((a, k) => (v += a * Math.sin((2 * Math.PI * freq * (k + 1) * (i + phase)) / SR)));
    buf[i] = amp * v + noise * rand();
  }
  return buf;
}

function engineFor(mode: EngineConfig["mode"], variantId = "acoustic-6", selectedIndex = 0, instrumentId = "guitar"): TunerEngine {
  const preset = findVariant(instrumentId, variantId)!.tunings[0];
  const { fmin, fmax } = detectionRange(preset, 440);
  return new TunerEngine({ mode, targets: targetsFor(preset, 440), selectedIndex, a4: 440, fmin, fmax });
}

/** Feeds ~1 s of frames (33 ms apart) of a steady note and returns the last snapshot. */
function ring(engine: TunerEngine, freq: number, opts: Parameters<typeof tone>[1] = {}, seconds = 1.2, startMs = 0) {
  let snap = engine.processFrame(new Float32Array(N), SR, startMs);
  const frames = Math.round((seconds * 1000) / 33);
  for (let k = 1; k <= frames; k++) snap = engine.processFrame(tone(freq, { ...opts, phase: k * 977, seed: k + 3 }), SR, startMs + k * 33);
  return snap;
}

describe("engine on synthetic signals", () => {
  it("auto mode finds A2 and reports cents + state", () => {
    const e = engineFor("auto");
    const s = ring(e, 110 * 2 ** (-18 / 1200));
    expect(s.targetNote).toBe("A2");
    expect(s.cents!).toBeGreaterThan(-20);
    expect(s.cents!).toBeLessThan(-16);
    expect(s.state).toBe("flat");
    expect(s.message).toContain("flat");
    expect(s.locked).toBe(false);
  });
  it("a quiet real string is accepted", () => {
    const e = engineFor("auto");
    const s = ring(e, 82.41, { amp: 0.01, harmonics: [1, 0.5, 0.3] });
    expect(s.targetNote).toBe("E2");
    expect(Math.abs(s.cents!)).toBeLessThan(3);
  });
  it("in tune and held marks the string tuned; one brief frame does not", () => {
    const e = engineFor("auto");
    let s = ring(e, 110, {}, 0.15);
    expect(s.tunedIndexes).toEqual([]);
    s = ring(e, 110, {}, 1.5, 200);
    expect(s.tunedIndexes).toEqual([1]);
    expect(s.locked).toBe(true);
    expect(s.state).toBe("in-tune");
  });
  it("manual mode compares against the selected string (low E); an octave error is reported, never folded away", () => {
    const e = engineFor("manual", "acoustic-6", 0);
    const s = ring(e, 82.41 * 2 ** (12 / 1200));
    expect(s.targetNote).toBe("E2");
    expect(s.cents!).toBeGreaterThan(8);
    expect(s.state).toBe("slightly-sharp");
    const off = ring(engineFor("manual", "acoustic-6", 0), 110);
    expect(off.outOfRange).toBe(true);
    expect(off.cents!).toBeGreaterThan(400); // 110 Hz vs E2 ≈ +500 cents, not wrapped to a nearby semitone
  });
  it("chromatic mode names any note", () => {
    const e = engineFor("chromatic");
    const s = ring(e, 439.2 * 1.0);
    expect(s.targetNote).toBe("A4");
    expect(s.targetFrequency).toBeCloseTo(440, 6);
    expect(s.cents!).toBeCloseTo(-3.15, 0);
  });
  it("silence and broadband noise never produce a note", () => {
    const e = engineFor("auto");
    let s = ring(e, 110, { amp: 0, harmonics: [1] }, 1.5);
    expect(s.frequency).toBeNull();
    // loud white-ish noise
    const noise = (seed: number) => {
      const b = new Float32Array(N);
      let x = seed;
      for (let i = 0; i < N; i++) b[i] = (((x = (x * 16807) % 2147483647) / 2147483647) - 0.5) * 0.5;
      return b;
    };
    for (let k = 0; k < 60; k++) s = e.processFrame(noise(k + 1), SR, 5000 + k * 33);
    expect(s.frequency).toBeNull();
    expect(s.targetNote).toBeNull();
  });
  it("hum-like low drone below the instrument range is ignored", () => {
    const e = engineFor("auto", "acoustic-6");
    const s = ring(e, 50, { harmonics: [1, 0.3] }, 1.5);
    expect(s.frequency).toBeNull();
  });
  it("a harmonic-heavy string does not read an octave high", () => {
    const e = engineFor("auto");
    const s = ring(e, 82.41, { harmonics: [0.4, 1, 0.6, 0.3] });
    expect(s.targetNote).toBe("E2");
    expect(Math.abs(s.cents!)).toBeLessThan(3);
  });
  it("every instrument's open strings read within 2 cents (auto mode)", () => {
    for (const inst of INSTRUMENTS) {
      for (const v of inst.variants) {
        const preset = v.tunings[0];
        const targets = targetsFor(preset, 440);
        targets.forEach((t, i) => {
          if (targets.findIndex((x) => x.midi === t.midi) !== i) return; // unison twin
          const e = engineFor("auto", v.id, 0, inst.id);
          const s = ring(e, t.frequency, { harmonics: [1, 0.6, 0.4, 0.25] }, 0.5);
          expect(s.targetNote, `${v.id} ${t.note}`).toBe(t.note);
          // Above ~2 kHz a period is only ~15 samples, so the synthetic reading is allowed 3 cents there (harp's top strings).
          expect(Math.abs(s.cents!), `${v.id} ${t.note}`).toBeLessThan(t.frequency > 2000 ? 3 : 2);
        });
      }
    }
  }, 60000);
  it("alternate A4 recalculates the targets", () => {
    const preset = findVariant("guitar", "acoustic-6")!.tunings[0];
    const { fmin, fmax } = detectionRange(preset, 432);
    const e = new TunerEngine({ mode: "auto", targets: targetsFor(preset, 432), selectedIndex: 0, a4: 432, fmin, fmax });
    const s = ring(e, 108);
    expect(s.targetNote).toBe("A2");
    expect(Math.abs(s.cents!)).toBeLessThan(2);
  });
  it("yin gives low confidence on noisy-but-periodic frames and none on pure noise", () => {
    const clean = yinPitch(tone(110), SR, 50, 1500)!;
    expect(clean.confidence).toBeGreaterThan(0.9);
    expect(yinPitch(tone(110, { noise: 3, amp: 0.05 }), SR, 50, 1500, { rmsGate: 0.001 })?.confidence ?? 0).toBeLessThan(0.7);
  });
});
