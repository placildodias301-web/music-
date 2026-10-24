/**
 * Instrument-specific tuners: the right tuner type for each instrument, the right detector strategy, transposition, and the
 * pitch detection itself on synthetic instruments (weak fundamentals, strong harmonics, decaying drum strikes, noise).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { INSTRUMENTS_DEFINITIONS, findDefinition, tunerInstruments, type InstrumentDefinition } from "../instruments/definitions";
import { TunerEngine, type EngineConfig } from "./engine";
import { PROFILES } from "./profiles";
import { findInstrument, targetsFor, detectionRange, customToPreset, type TargetString } from "./tunings";
import { midiToFrequency, midiToNoteName, noteToMidi } from "./notes";
import { notesBetween, resolveTransposition, targetWindow, tunerProfileFor, tunerTypesOf, writtenMidi, type TunerType } from "./instrumentProfile";
import { LUG_EVEN_CENTS, TIMPANI_DRUMS, pianoReference, setPianoStretchTable, summariseLugs, timpaniNotes } from "./percussionPitch";
import { HISTORY_MIN_GAP_MS, StabilityWindow, TuningHistory, stabilityOf } from "./history";
import { MicController, MicrophoneError, microphoneErrorFrom, startMicrophone } from "./microphone";
import { TONE_RECIPES, createReferenceTone } from "./referenceTone";

const SR = 48000;
const N = 4096;
const def = (id: string) => findDefinition(id)!;
const profileOf = (id: string) => tunerProfileFor(def(id))!;

/** A synthetic instrument note: harmonic amplitudes, optional noise, per-frame phase so frames differ like a real signal. */
function tone(freq: number, opts: { harmonics?: number[]; noise?: number; seed?: number; amp?: number; phase?: number } = {}): Float32Array {
  const { harmonics = [1, 0.7, 0.5, 0.35, 0.25, 0.15], noise = 0, amp = 0.3, phase = 0 } = opts;
  let seed = opts.seed ?? 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    harmonics.forEach((a, k) => (v += a * Math.sin((2 * Math.PI * freq * (k + 1) * (i + phase)) / SR)));
    buf[i] = amp * v + noise * rand();
  }
  return buf;
}

function engine(cfg: Partial<EngineConfig> & Pick<EngineConfig, "mode">): TunerEngine {
  return new TunerEngine({ targets: [], selectedIndex: 0, a4: 440, fmin: 30, fmax: 2100, ...cfg });
}

/** Feeds ~`seconds` of frames, 33 ms apart, of a steady note and returns the last snapshot. */
function ring(e: TunerEngine, freq: number, opts: Parameters<typeof tone>[1] = {}, seconds = 1.2) {
  let snap = e.processFrame(new Float32Array(N), SR, 0);
  const frames = Math.round((seconds * 1000) / 33);
  for (let k = 1; k <= frames; k++) snap = e.processFrame(tone(freq, { ...opts, phase: k * 977, seed: k + 3 }), SR, k * 33);
  return snap;
}

const f = (note: string) => midiToFrequency(noteToMidi(note)!);
const stringEngine = (id: string, mode: "auto" | "manual" = "auto", selectedIndex = 0, variantId?: string, presetIndex = 0) => {
  const d = def(id);
  const inst = findInstrument(d.tuner!.instrumentId)!;
  const variant = inst.variants.find((v) => v.id === (variantId ?? d.tuner!.variantId)) ?? inst.variants[0];
  const preset = variant.tunings[presetIndex];
  const { fmin, fmax } = detectionRange(preset, 440);
  return engine({ mode, targets: targetsFor(preset, 440), selectedIndex, fmin, fmax, profile: profileOf(id).detection });
};

afterEach(() => {
  vi.unstubAllGlobals();
  setPianoStretchTable({});
});

/* ───────────── The right tuner for each instrument ───────────── */

describe("each instrument gets the tuner that makes musical sense", () => {
  const EXPECTED: [string, TunerType][] = [
    ["guitar", "string"], ["classical-guitar", "string"], ["guitar-7", "string"], ["guitar-8", "string"], ["guitar-12", "string"], ["bass", "string"],
    ["ukulele", "string"], ["violin", "string"], ["viola", "string"], ["cello", "string"], ["double-bass", "string"], ["mandolin", "string"], ["bouzouki", "string"], ["sitar", "string"], ["oud", "string"],
    ["chromatic", "chromatic"], ["sarod", "chromatic"], ["veena", "chromatic"], ["santoor", "chromatic"], ["sarangi", "chromatic"],
    ["flute", "wind"], ["clarinet", "wind"], ["oboe", "wind"], ["alto-sax", "wind"], ["bansuri", "wind"], ["shakuhachi", "wind"], ["dizi", "wind"],
    ["trumpet", "brass"], ["trombone", "brass"], ["french-horn", "brass"], ["tuba", "brass"], ["euphonium", "brass"], ["cornet", "brass"],
    ["tabla", "percussion-pitch"], ["bayan", "percussion-pitch"], ["mridangam", "percussion-pitch"], ["pakhawaj", "percussion-pitch"], ["marimba", "percussion-pitch"], ["vibraphone", "percussion-pitch"],
    ["dholak", "drum-head"], ["tunable-drum", "drum-head"], ["timpani", "timpani"], ["piano", "keyboard"], ["tanpura", "drone"],
  ];
  it.each(EXPECTED)("%s → %s tuner", (id, type) => {
    expect(profileOf(id).tunerType).toBe(type);
  });

  it("instruments that are not tuned have no tuner at all", () => {
    for (const id of ["keyboard", "organ", "synthesizer", "accordion"]) expect(tunerProfileFor(def(id)), id).toBeNull();
  });

  it("every instrument the Tuner lists has a complete profile", () => {
    for (const d of tunerInstruments()) {
      const p = tunerProfileFor(d);
      expect(p, d.id).not.toBeNull();
      expect(p!.ui.headline.length, d.id).toBeGreaterThan(5);
      expect(PROFILES[p!.detection], `${d.id} ${p!.detection}`).toBeDefined();
      expect(p!.supportsReferenceTone && TONE_RECIPES[p!.referenceTone], d.id).toBeTruthy();
    }
    const byType = tunerTypesOf(INSTRUMENTS_DEFINITIONS);
    for (const t of ["string", "chromatic", "wind", "brass", "percussion-pitch", "drum-head", "timpani", "keyboard", "drone"] as TunerType[]) expect(byType[t]?.length, t).toBeGreaterThan(0);
  });

  it("irrelevant controls are hidden: no strings on winds, drums and pianos; no string tuner on timpani or tabla", () => {
    for (const id of ["flute", "trumpet", "piano", "timpani", "tabla", "marimba", "dholak"]) {
      const p = profileOf(id);
      expect(p.ui.showStrings, id).toBe(false);
      expect(p.supportsAutomaticDetection, id).toBe(false);
      expect(p.supportsManualSelection, id).toBe(false);
    }
    for (const id of ["guitar", "violin", "ukulele", "mandolin", "bass"]) {
      expect(profileOf(id).ui.showStrings, id).toBe(true);
      expect(profileOf(id).supportsAutomaticDetection, id).toBe(true);
    }
    expect(profileOf("timpani").ui.showTargetPicker).toBe(true);
    expect(profileOf("piano").ui.showTargetPicker).toBe(true);
    expect(profileOf("dholak").ui.showLugs).toBe(true);
    expect(profileOf("tanpura").ui.showRelations).toBe(true);
    expect(profileOf("trumpet").ui.showWrittenPitch).toBe(true);
    expect(profileOf("guitar").ui.showWrittenPitch).toBe(false);
  });

  it("the words match the instrument: string, course, drum, note, bar", () => {
    expect(profileOf("guitar").ui.terminology.unit).toBe("string");
    expect(profileOf("mandolin").ui.terminology.unit).toBe("course");
    expect(profileOf("bouzouki").ui.terminology.unit).toBe("course");
    expect(profileOf("timpani").ui.terminology.unit).toBe("drum");
    expect(profileOf("flute").ui.terminology.unit).toBe("note");
    expect(profileOf("marimba").ui.terminology.unit).toBe("bar");
  });

  it("detector strategies follow how the instrument sounds", () => {
    for (const id of ["violin", "viola", "cello", "double-bass"]) {
      expect(profileOf(id).detection, id).toBe("bowed");
      expect(profileOf(id).harmonicHandling, id).toBe("weak-fundamental");
    }
    expect(profileOf("trumpet").detection).toBe("brass");
    expect(profileOf("trumpet").harmonicHandling).toBe("strong-upper-harmonics");
    expect(profileOf("flute").detection).toBe("wind");
    for (const id of ["tabla", "timpani", "dholak", "mridangam", "bayan"]) expect(profileOf(id).detection, id).toBe("drum");
    expect(profileOf("piano").detection).toBe("keys");
    expect(profileOf("piano").harmonicHandling).toBe("inharmonic");
    expect(profileOf("marimba").detection).toBe("mallet");
    expect(profileOf("guitar").detection).toBe("default");
    expect(PROFILES.bowed.octaveGuard).toBe("lower");
    expect(PROFILES.drum.onsetRms).toBeLessThan(Infinity); // the strike is skipped
  });

  it("reference tones are coloured for the instrument", () => {
    expect(profileOf("guitar").referenceTone).toBe("pluck");
    expect(profileOf("violin").referenceTone).toBe("bowed");
    expect(profileOf("flute").referenceTone).toBe("wind");
    expect(profileOf("trumpet").referenceTone).toBe("brass");
    expect(profileOf("piano").referenceTone).toBe("piano");
    expect(profileOf("tabla").referenceTone).toBe("drum");
    expect(profileOf("marimba").referenceTone).toBe("mallet");
  });
});

/* ───────────── Transposition ───────────── */

describe("transposing instruments keep concert and written pitch apart", () => {
  it("B♭ clarinet: written C4 sounds B♭3", () => {
    const clarinet = profileOf("clarinet");
    const bb = clarinet.transposition!;
    expect(bb).toEqual({ semitones: 2, label: "B♭" });
    expect(writtenMidi(noteToMidi("Bb3")!, bb)).toBe(noteToMidi("C4"));
    expect(midiToNoteName(writtenMidi(noteToMidi("A3")!, resolveTransposition(clarinet, "A")))).toBe("A#3".replace("A#3", "C4")); // A clarinet: concert A3 is written C4
  });

  it("the transposition is configurable where the instrument comes in several keys", () => {
    expect(profileOf("clarinet").transpositionOptions.map((o) => o.label)).toEqual(["B♭", "A", "C"]);
    expect(profileOf("trumpet").transpositionOptions.map((o) => o.label)).toEqual(expect.arrayContaining(["B♭", "C", "E♭"]));
    expect(resolveTransposition(profileOf("clarinet"), "A")?.semitones).toBe(3);
    expect(resolveTransposition(profileOf("clarinet"), "not-a-key")?.label).toBe("B♭"); // falls back to the default
    expect(resolveTransposition(profileOf("flute"), null)).toBeNull(); // sounds as written
    expect(resolveTransposition(profileOf("trumpet"), "C")?.semitones).toBe(0);
  });

  it("saxophones are compared at concert pitch and shown at written pitch", () => {
    const alto = profileOf("alto-sax").transposition!;
    expect(alto).toEqual({ semitones: 9, label: "E♭" });
    // an alto sax reading written C5 sounds E♭4: the microphone hears E♭4, so the tuner must call it E♭4 and show C5
    const e = engine({ mode: "chromatic", fmin: 100, fmax: 1500, profile: profileOf("alto-sax").detection });
    const s = ring(e, f("Eb4"), { harmonics: [1, 0.8, 0.6, 0.4] });
    expect(s.detectedNote).toBe("D#4");
    expect(midiToNoteName(writtenMidi(Math.round(s.detectedMidi!), alto))).toBe("C5");
    for (const id of ["soprano-sax", "tenor-sax", "baritone-sax"]) expect(profileOf(id).transposition, id).not.toBeNull();
    expect(profileOf("tenor-sax").transposition!.semitones).toBe(2);
  });
});

/* ───────────── Pitch detection per instrument ───────────── */

describe("pitch detection on instrument-like signals", () => {
  it("guitar E2 and A2: right note, octave, frequency and cents", () => {
    const e2 = ring(stringEngine("guitar", "manual", 0), f("E2"));
    expect(e2.targetNote).toBe("E2");
    expect(e2.frequency!).toBeCloseTo(82.41, 0);
    expect(Math.abs(e2.cents!)).toBeLessThan(2);
    const a2 = ring(stringEngine("guitar", "auto"), 110 * 2 ** (-12 / 1200));
    expect(a2.targetNote).toBe("A2");
    expect(a2.cents!).toBeGreaterThan(-14);
    expect(a2.cents!).toBeLessThan(-10);
    expect(a2.message).toMatch(/higher|tune|close|up/i);
  });

  it("a string that is too low or too high is called so, and a different string is not mistaken for the target (D♯2 vs E2)", () => {
    const low = ring(stringEngine("guitar", "manual", 0), f("D#2"));
    expect(low.detectedNote).toBe("D#2");
    expect(low.targetNote).toBe("E2");
    expect(low.cents!).toBeLessThan(-80);
    const high = ring(stringEngine("guitar", "manual", 0), f("F2"));
    expect(high.cents!).toBeGreaterThan(80);
  });

  it("violin G3 with a WEAK fundamental is still G3 (the octave guard), not G4", () => {
    const weak = { harmonics: [0.12, 1, 0.9, 0.6, 0.4, 0.25] };
    const violin = ring(stringEngine("violin", "manual", 0), f("G3"), weak);
    expect(violin.pitchReliable).toBe(true);
    expect(violin.detectedNote).toBe("G3");
    expect(Math.abs(violin.cents!)).toBeLessThan(3);
    // viola and cello strings the same way
    expect(ring(stringEngine("viola", "manual", 1), f("G3"), weak).detectedNote).toBe("G3");
    expect(ring(stringEngine("cello", "manual", 0), f("C2"), { harmonics: [0.15, 1, 0.9, 0.7, 0.5, 0.3] }).detectedNote).toBe("C2");
  });

  it("violin A4 and cello C2 in normal tone", () => {
    const a4 = ring(stringEngine("violin", "auto"), 440 * 2 ** (6 / 1200), { harmonics: [1, 0.6, 0.4, 0.3] });
    expect(a4.targetNote).toBe("A4");
    expect(a4.cents!).toBeGreaterThan(4);
    expect(a4.cents!).toBeLessThan(8);
    const c2 = ring(stringEngine("cello", "auto"), f("C2"), { harmonics: [1, 0.8, 0.6, 0.4] });
    expect(c2.targetNote).toBe("C2");
    expect(Math.abs(c2.cents!)).toBeLessThan(3);
  });

  it("ukulele G4 (re-entrant: not the lowest string)", () => {
    const s = ring(stringEngine("ukulele", "auto"), f("G4"));
    expect(s.targetNote).toBe("G4");
    expect(Math.abs(s.cents!)).toBeLessThan(2);
  });

  it("trumpet A4: strong upper harmonics do not turn it into A5 or E5 (brass profile, chromatic intonation)", () => {
    const e = engine({ mode: "chromatic", fmin: 100, fmax: 1500, profile: profileOf("trumpet").detection });
    const s = ring(e, 440 * 2 ** (14 / 1200), { harmonics: [0.5, 1, 0.9, 0.7, 0.5, 0.3] });
    expect(s.detectedNote).toBe("A4");
    expect(s.chromaticCents!).toBeGreaterThan(11);
    expect(s.chromaticCents!).toBeLessThan(17);
    expect(s.state).toMatch(/sharp/);
  });

  it("low brass with a weak fundamental keeps its true pitch", () => {
    const e = engine({ mode: "chromatic", fmin: 30, fmax: 1000, profile: profileOf("tuba").detection });
    const s = ring(e, f("F2"), { harmonics: [0.1, 1, 0.8, 0.5, 0.3] });
    expect(s.detectedNote).toBe("F2");
  });

  it("flute C5 in intonation mode", () => {
    const e = engine({ mode: "chromatic", fmin: 200, fmax: 2200, profile: profileOf("flute").detection });
    const s = ring(e, f("C5"), { harmonics: [1, 0.2, 0.05] });
    expect(s.detectedNote).toBe("C5");
    expect(Math.abs(s.chromaticCents!)).toBeLessThan(2);
  });

  it("tabla dayan tuned to Sa = C♯: reads the ring-out of a struck head, not the strike", () => {
    const d = def("tabla");
    const preset = findInstrument("tabla")!.variants[0].tunings.find((t) => t.name.includes("Sa = C#"))!;
    const target = targetsFor(preset, 440)[0];
    expect(target.note).toBe("C#3");
    const e = engine({ mode: "manual", targets: [target], fmin: targetWindow(target.frequency).fmin, fmax: targetWindow(target.frequency).fmax, profile: profileOf(d.id).detection });
    // a loud broadband strike, then a decaying tone 12 cents flat with inharmonic-ish partials
    let snap = e.processFrame(new Float32Array(N), SR, 0);
    const flat = target.frequency * 2 ** (-12 / 1200);
    for (let k = 1; k <= 60; k++) {
      const strike = k <= 3;
      const buf = strike ? tone(997 * k, { amp: 0.8, harmonics: [1, 0.9, 0.8], noise: 0.5, seed: k }) : tone(flat, { amp: 0.4 * Math.exp(-k / 70), harmonics: [1, 0.35, 0.18], phase: k * 977, seed: k });
      snap = e.processFrame(buf, SR, k * 33);
    }
    expect(snap.pitchReliable).toBe(true);
    expect(snap.targetNote).toBe("C#3");
    expect(snap.cents!).toBeGreaterThan(-16);
    expect(snap.cents!).toBeLessThan(-8);
  });

  it("timpani target D2: C♯2 is 100 cents flat; 18 cents flat reads −18 and TOO LOW direction", () => {
    const drum = TIMPANI_DRUMS[0];
    const notes = timpaniNotes(drum);
    expect(notes[0].note).toBe("D2");
    expect(notes[notes.length - 1].note).toBe("A2");
    const target: TargetString = { id: "picked", displayNumber: 1, note: "D2", octave: 2, midi: noteToMidi("D2")!, course: 1, frequency: f("D2") };
    const w = targetWindow(target.frequency);
    const e = engine({ mode: "manual", targets: [target], fmin: w.fmin, fmax: w.fmax, profile: profileOf("timpani").detection });
    const s = ring(e, target.frequency * 2 ** (-18 / 1200), { harmonics: [1, 0.5, 0.25] }, 1.5);
    expect(s.targetNote).toBe("D2");
    expect(s.cents!).toBeGreaterThan(-20);
    expect(s.cents!).toBeLessThan(-16);
    expect(s.state).toMatch(/flat/);
    expect(s.message).toMatch(/flat|low|up/i);
  });

  it("piano A4 at a 442 Hz reference: 440 Hz reads about −8 cents, and the target is 442", () => {
    const ref = pianoReference(69, 442);
    expect(ref.frequency).toBeCloseTo(442, 6);
    const target: TargetString = { id: "picked", displayNumber: 1, note: "A4", octave: 4, midi: 69, course: 1, frequency: ref.frequency };
    const w = targetWindow(ref.frequency);
    const e = engine({ mode: "manual", targets: [target], a4: 442, fmin: w.fmin, fmax: w.fmax, profile: profileOf("piano").detection });
    const s = ring(e, 440, { harmonics: [1, 0.6, 0.4, 0.2] });
    expect(s.cents!).toBeCloseTo(-7.85, 0);
  });
});

/* ───────────── Stability, noise, range ───────────── */

describe("the readout stays calm and refuses to guess", () => {
  it("a steady A4 never flips between harmonics (A4 stays A4)", () => {
    const e = engine({ mode: "chromatic", fmin: 100, fmax: 1500 });
    const seen = new Set<string>();
    let snap = e.processFrame(new Float32Array(N), SR, 0);
    for (let k = 1; k <= 60; k++) {
      snap = e.processFrame(tone(440, { harmonics: [0.4, 1, 0.9, 0.5], phase: k * 977, seed: k }), SR, k * 33);
      if (snap.pitchReliable) seen.add(snap.detectedNote!);
    }
    expect([...seen]).toEqual(["A4"]);
  });

  it("white noise gives no reading", () => {
    const e = engine({ mode: "chromatic", fmin: 60, fmax: 1500 });
    let seed = 7;
    let snap = e.processFrame(new Float32Array(N), SR, 0);
    for (let k = 1; k <= 40; k++) {
      const buf = new Float32Array(N).map(() => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.4);
      snap = e.processFrame(buf, SR, k * 33);
      expect(snap.pitchReliable, `frame ${k}`).toBe(false);
    }
    expect(snap.frequency).toBeNull();
  });

  it("a note buried in noise still reads, while the noise alone does not", () => {
    const e = engine({ mode: "chromatic", fmin: 60, fmax: 1500 });
    const s = ring(e, 220, { harmonics: [1, 0.5, 0.25], noise: 0.12, amp: 0.4 });
    expect(s.detectedNote).toBe("A3");
  });

  it("a signal that is too quiet is not read, and the player is told", () => {
    const e = engine({ mode: "chromatic", fmin: 60, fmax: 1500 });
    let snap = e.processFrame(new Float32Array(N), SR, 0);
    for (let k = 1; k <= 130; k++) snap = e.processFrame(tone(220, { amp: 0.0004, phase: k * 977 }), SR, k * 33);
    expect(snap.pitchReliable).toBe(false);
    expect(snap.tooQuiet).toBe(true);
  });

  it("silence is not a pitch", () => {
    const e = engine({ mode: "chromatic", fmin: 60, fmax: 1500 });
    let snap = e.processFrame(new Float32Array(N), SR, 0);
    for (let k = 1; k <= 30; k++) snap = e.processFrame(new Float32Array(N), SR, k * 33);
    expect(snap.pitchReliable).toBe(false);
    expect(snap.detectedNote).toBeNull();
  });

  it("a note outside the instrument's range is not read as one of its strings", () => {
    const e = stringEngine("guitar", "auto");
    const s = ring(e, 3300, { harmonics: [1, 0.2] });
    expect(s.pitchReliable).toBe(false);
  });

  it("two notes at once (two instruments) do not produce a confident wrong reading", () => {
    const e = engine({ mode: "chromatic", fmin: 60, fmax: 1500 });
    let snap = e.processFrame(new Float32Array(N), SR, 0);
    for (let k = 1; k <= 40; k++) {
      const a = tone(f("C4") * 1.0, { harmonics: [1, 0.4], phase: k * 977, seed: k });
      const b = tone(f("F#4"), { harmonics: [1, 0.4], phase: k * 551, seed: k + 100 });
      snap = e.processFrame(a.map((v, i) => v + b[i]), SR, k * 33);
    }
    // either no reading, or a low-confidence one: never a confident single note
    expect(!snap.pitchReliable || snap.confidence < 0.9).toBe(true);
  });

  it("paired strings: slightly detuned unison strings (a mandolin course) read as one steady note", () => {
    const e = stringEngine("mandolin", "auto");
    const seen = new Set<string>();
    let snap = e.processFrame(new Float32Array(N), SR, 0);
    for (let k = 1; k <= 60; k++) {
      const a = tone(f("G3"), { harmonics: [1, 0.5, 0.3], phase: k * 977, seed: k });
      const b = tone(f("G3") * 2 ** (9 / 1200), { harmonics: [1, 0.5, 0.3], phase: k * 977, seed: k + 50 });
      snap = e.processFrame(a.map((v, i) => v + b[i]), SR, k * 33);
      if (snap.pitchReliable) seen.add(snap.targetNote!);
    }
    expect([...seen]).toEqual(["G3"]);
    expect(Math.abs(snap.cents!)).toBeLessThan(10);
  });

  it("paired strings an octave apart (a 12-string course) read as that course, not as a wrong string", () => {
    const e = stringEngine("guitar-12", "auto", 0, "guitar-12");
    let snap = e.processFrame(new Float32Array(N), SR, 0);
    const seen = new Set<string>();
    for (let k = 1; k <= 60; k++) {
      const a = tone(f("E2"), { harmonics: [1, 0.5, 0.3], phase: k * 977, seed: k });
      const b = tone(f("E3"), { harmonics: [0.8, 0.4], phase: k * 977, seed: k + 9 });
      snap = e.processFrame(a.map((v, i) => v + b[i]), SR, k * 33);
      if (snap.pitchReliable) seen.add(snap.targetNote!);
    }
    for (const n of seen) expect(["E2", "E3"]).toContain(n);
  });

  it("switching instrument or tuning clears what was 'tuned' and starts over", () => {
    const d = def("guitar");
    const inst = findInstrument("guitar")!;
    const standard = inst.variants[0].tunings[0];
    const dropD = inst.variants[0].tunings.find((t) => t.id === "drop-d")!;
    const e = engine({ mode: "auto", targets: targetsFor(standard, 440), fmin: detectionRange(standard, 440).fmin, fmax: detectionRange(standard, 440).fmax });
    const tuned = ring(e, f("E2"), {}, 2);
    expect(tuned.tunedIndexes).toContain(0);
    e.configure({ mode: "auto", targets: targetsFor(dropD, 440), selectedIndex: 0, a4: 440, fmin: detectionRange(dropD, 440).fmin, fmax: detectionRange(dropD, 440).fmax });
    const afterSwitch = e.processFrame(new Float32Array(N), SR, 5000);
    expect(afterSwitch.tunedIndexes).toEqual([]);
    expect(d.id).toBe("guitar");
  });

  it("a custom tuning is a real target set", () => {
    const custom = customToPreset({ id: "x", name: "My D", instrumentId: "guitar", variantId: "acoustic-6", notes: ["D2", "A2", "D3", "F#3", "A3", "D4"] });
    const e = engine({ mode: "auto", targets: targetsFor(custom, 440), fmin: detectionRange(custom, 440).fmin, fmax: detectionRange(custom, 440).fmax });
    const s = ring(e, f("F#3"));
    expect(s.targetNote).toBe("F#3");
    expect(Math.abs(s.cents!)).toBeLessThan(2);
  });
});

/* ───────────── Octave guard (the harmonic-aware part) ───────────── */

describe("harmonic-aware detection", () => {
  it("without the guard a weak-fundamental tone can be taken an octave high; with it, the true pitch wins", () => {
    const e = engine({ mode: "chromatic", fmin: 80, fmax: 1500, profile: "bowed" });
    const weak = ring(e, 220, { harmonics: [0.05, 1, 0.9, 0.7] }, 1.5);
    expect(weak.detectedNote).toBe("A3");
    // a normal tone is never pushed down an octave by the guard
    const normal = ring(engine({ mode: "chromatic", fmin: 80, fmax: 1500, profile: "bowed" }), 220, { harmonics: [1, 0.6, 0.4] });
    expect(normal.detectedNote).toBe("A3");
    const pure = ring(engine({ mode: "chromatic", fmin: 80, fmax: 1500, profile: "brass" }), 440, { harmonics: [1] });
    expect(pure.detectedNote).toBe("A4");
  });
});

/* ───────────── Target pickers, range, history, lugs, piano ───────────── */

describe("pitched percussion and piano logic", () => {
  it("timpani drums cover the standard orchestral ranges, each with a note list", () => {
    expect(TIMPANI_DRUMS.map((d) => `${d.low}–${d.high}`)).toEqual(["D2–A2", "F2–C3", "Bb2–F3", "D3–A3"]);
    for (const drum of TIMPANI_DRUMS) {
      const notes = timpaniNotes(drum);
      expect(notes.length).toBeGreaterThanOrEqual(8);
      expect(notes[0].midi).toBe(noteToMidi(drum.low));
    }
  });

  it("note lists for target pickers", () => {
    const n = notesBetween({ low: "C4", high: "C5" });
    expect(n.map((x) => x.note)[0]).toBe("C4");
    expect(n).toHaveLength(13);
    expect(notesBetween({ low: "C5", high: "C4" })).toEqual([]);
    expect(notesBetween({ low: "Bb2", high: "B2" }, true).map((x) => x.note)).toEqual(["B♭2", "B2"]);
  });

  it("drum-head lugs: even, slightly uneven and uneven heads, from relative pitch only", () => {
    const even = summariseLugs([100, 100.4, 99.8, 100.2].map((frequency) => ({ frequency })));
    expect(even.evenness).toBe("even");
    expect(even.spreadCents!).toBeLessThan(LUG_EVEN_CENTS);
    const slight = summariseLugs([100, 101.5, 100, 100].map((frequency) => ({ frequency })));
    expect(slight.evenness).toBe("slightly-uneven");
    const uneven = summariseLugs([100, 108, 100, 95].map((frequency) => ({ frequency })));
    expect(uneven.evenness).toBe("uneven");
    expect(uneven.deviations[1]!).toBeGreaterThan(0);
    // nothing claimed from fewer than two lugs
    expect(summariseLugs([{ frequency: 100 }, { frequency: null }]).evenness).toBe("unknown");
    expect(summariseLugs([{ frequency: null }, { frequency: null }]).evenness).toBe("unknown");
  });

  it("piano reference: equal temperament at the chosen A4, octaves to compare, and an empty stretch table by default", () => {
    const a4 = pianoReference(69, 440);
    expect(a4.frequency).toBeCloseTo(440, 6);
    expect(a4.stretchCents).toBe(0);
    expect(a4.octaves.map((o) => o.note)).toEqual(["A3", "A5"]);
    expect(a4.octaves[0].frequency).toBeCloseTo(220, 6);
    expect(pianoReference(21, 440).octaves.map((o) => o.note)).toEqual(["A1"]); // no octave below the lowest key
    // a supplied stretch table is honoured; nothing is shipped
    setPianoStretchTable({ 96: 25 });
    expect(pianoReference(96, 440).frequency).toBeCloseTo(midiToFrequency(96, 440) * 2 ** (25 / 1200), 6);
    setPianoStretchTable({});
    expect(pianoReference(96, 440).stretchCents).toBe(0);
  });

  it("tuning history logs readings with a trend and in-tune flag, and starts a new run when the target changes", () => {
    const h = new TuningHistory();
    const row = (time: number, cents: number, target = "E2") => h.push({ time, target, detected: "E2", frequency: 82, cents });
    expect(row(0, -12)?.trend).toBe("first");
    expect(row(100, -9)).toBeNull(); // too soon after the last row
    expect(row(HISTORY_MIN_GAP_MS + 10, -4)?.trend).toBe("improving");
    expect(row(2 * HISTORY_MIN_GAP_MS + 20, 1)?.inTune).toBe(true);
    expect(row(3 * HISTORY_MIN_GAP_MS + 30, 9)?.trend).toBe("worse");
    expect(row(4 * HISTORY_MIN_GAP_MS + 40, 9.5)?.trend).toBe("steady");
    expect(row(5 * HISTORY_MIN_GAP_MS + 50, -3, "A2")?.trend).toBe("first");
    expect(h.rows()[0].target).toBe("A2"); // newest first
    for (let i = 0; i < 20; i++) row(10_000 + i * 600, i);
    expect(h.rows().length).toBeLessThanOrEqual(8);
    h.clear();
    expect(h.rows()).toEqual([]);
  });

  it("pitch stability: stable, settling, unsteady, and nothing claimed from too few readings", () => {
    expect(stabilityOf([0.1, -0.2, 0.15, 0, 0.05]).verdict).toBe("stable");
    expect(stabilityOf([-6, 4, -3, 5, -4]).verdict).toBe("settling");
    expect(stabilityOf([-30, 25, -20, 30, -25]).verdict).toBe("unsteady");
    expect(stabilityOf([1, 2]).verdict).toBe("unknown");
    const w = new StabilityWindow(1000);
    [0, 0.1, -0.1, 0.05].forEach((c, i) => w.push(i * 100, c));
    expect(w.result().verdict).toBe("stable");
    w.push(5000, 40); // the old readings fall out of the window
    expect(w.result().verdict).toBe("unknown");
  });
});

/* ───────────── Reference tone ───────────── */

describe("reference tone", () => {
  it("plays the exact target frequency in a timbre that depends on the instrument", () => {
    const freqs: number[] = [];
    const waves: number[][] = [];
    class FakeContext {
      state = "running";
      currentTime = 0;
      destination = {};
      createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {} }; }
      createPeriodicWave(_r: Float32Array, imag: Float32Array) { waves.push([...imag]); return {}; }
      createOscillator() { return { setPeriodicWave() {}, frequency: { setValueAtTime: (v: number) => freqs.push(v) }, connect() {}, start() {}, stop() {} }; }
      close = () => Promise.resolve();
      resume = () => Promise.resolve();
    }
    vi.stubGlobal("AudioContext", FakeContext);
    const tone = createReferenceTone();
    for (const kind of Object.keys(TONE_RECIPES) as (keyof typeof TONE_RECIPES)[]) {
      expect(tone.play(196, kind)).toBeGreaterThan(1000);
    }
    expect(new Set(freqs)).toEqual(new Set([196])); // every colour is the same pitch
    expect(new Set(waves.map((w) => w.join(","))).size).toBe(Object.keys(TONE_RECIPES).length); // and each colour differs
    expect(tone.play(Number.NaN)).toBe(0);
    expect(tone.play(-5)).toBe(0);
    tone.dispose();
  });
});

/* ───────────── Microphone: permission denied, unavailable ───────────── */

describe("the microphone fails gracefully", () => {
  it("maps browser errors to plain messages", () => {
    expect(microphoneErrorFrom(new DOMException("x", "NotAllowedError")).kind).toBe("denied");
    expect(microphoneErrorFrom(new DOMException("x", "NotFoundError")).kind).toBe("no-device");
    expect(microphoneErrorFrom(new DOMException("x", "NotReadableError")).kind).toBe("busy");
    expect(microphoneErrorFrom(new Error("weird")).kind).toBe("unknown");
    expect(microphoneErrorFrom(new DOMException("x", "NotAllowedError")).message).toMatch(/blocked/i);
  });

  it("permission denied: Start rejects with a 'denied' error and nothing is left running", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")) } });
    await expect(startMicrophone()).rejects.toMatchObject({ kind: "denied" });
    const mics = new MicController();
    await expect(mics.open(() => {})).rejects.toBeInstanceOf(MicrophoneError);
    expect(mics.mic).toBeNull();
    mics.close(); // safe to call after a failure
  });

  it("no microphone / no media support: a clear 'no-device' or 'unsupported' error", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("none", "NotFoundError")) } });
    await expect(startMicrophone()).rejects.toMatchObject({ kind: "no-device" });
    vi.stubGlobal("navigator", {});
    await expect(startMicrophone()).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("an insecure page says so instead of failing silently", async () => {
    vi.stubGlobal("isSecureContext", false);
    await expect(startMicrophone()).rejects.toMatchObject({ kind: "insecure" });
  });
});

/* ───────────── Whole-database guarantees ───────────── */

describe("the whole instrument database", () => {
  it("every tuner instrument that offers strings or drums has targets the detector can actually read", () => {
    let checked = 0;
    for (const d of tunerInstruments() as InstrumentDefinition[]) {
      if (!d.tuner) continue;
      const inst = findInstrument(d.tuner.instrumentId)!;
      const variant = inst.variants.find((v) => v.id === d.tuner!.variantId) ?? inst.variants[0];
      if (variant.layout === "harp") continue;
      const preset = variant.tunings[0];
      const { fmin, fmax } = detectionRange(preset, 440);
      for (const t of targetsFor(preset, 440)) {
        checked++;
        expect(t.frequency, `${d.id} ${t.note}`).toBeGreaterThanOrEqual(fmin);
        expect(t.frequency, `${d.id} ${t.note}`).toBeLessThanOrEqual(fmax);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
