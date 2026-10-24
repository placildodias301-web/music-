/**
 * Each instrument must sound like itself. These tests check the things a listener hears that can be checked without a speaker:
 * how notes are timed (a bass chord is not played one note at a time), that every instrument has its own sound recipe with the
 * qualities that make it recognisable (rolled bowed chords, inharmonic decaying piano partials, breath noise in winds, mallet
 * bars), and that the notes really start on one shared audio context.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { chordInstruments } from "../instruments/definitions";
import { STRUM_GAP_SECONDS, strumTiming } from "./StrumEngine";
import { planStrumVoices } from "./voicePlan";
import { RECIPE_FOR_INSTRUMENT, SYNTH_RECIPES, partialDecaySeconds, planSynthNotes, recipeForInstrument } from "./synthVoices";
import { getPresetForInstrument, profileForMidi } from "./AudioPresets";
import { stringVoiceFor, usesSynthVoice } from "../chords/play";

const GUITAR = [40, 45, 50, 55, 59, 64];
const BASS = [28, 33, 38, 43];

describe("strum timing is per string, per instrument", () => {
  it("a two-note bass chord sounds together, not one note after another", () => {
    const t = strumTiming("normal", "bass", 2);
    const voices = planStrumVoices({ frets: [3, 5, null, null], tuningMidi: BASS, ...t });
    expect(voices).toHaveLength(2);
    expect(voices[1].startOffset - voices[0].startOffset).toBeLessThan(0.03); // was 0.22 s apart
  });

  it("a six-string guitar chord still sweeps, with a natural gap between strings", () => {
    const t = strumTiming("normal", "guitar", 6);
    const voices = planStrumVoices({ frets: [0, 2, 2, 1, 0, 0], tuningMidi: GUITAR, ...t });
    const gaps = voices.slice(1).map((v, i) => v.startOffset - voices[i].startOffset);
    gaps.forEach((g) => expect(g).toBeCloseTo(STRUM_GAP_SECONDS.guitar, 3));
    expect(voices[5].startOffset).toBeGreaterThan(0.12);
    expect(voices[5].startOffset).toBeLessThan(0.25);
  });

  it("speed labels scale the instrument's own gap; a number is a total sweep; long strums are capped", () => {
    expect(strumTiming("fast", "guitar", 6).gapSeconds!).toBeLessThan(strumTiming("normal", "guitar", 6).gapSeconds!);
    expect(strumTiming("slow", "guitar", 6).gapSeconds!).toBeGreaterThan(strumTiming("normal", "guitar", 6).gapSeconds!);
    expect(strumTiming(0.2, "guitar", 6)).toEqual({ strumSeconds: 0.2 });
    expect(strumTiming("slow", "guitar", 12).gapSeconds! * 11).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(STRUM_GAP_SECONDS.bass).toBeLessThan(STRUM_GAP_SECONDS.guitar);
  });
});

describe("plucked instruments have their own character", () => {
  it("mandolin and banjo are no longer the guitar: shorter, brighter strings with their own body", () => {
    const guitar = getPresetForInstrument("guitar");
    for (const id of ["mandolin", "banjo"] as const) {
      const preset = getPresetForInstrument(id);
      expect(preset.id).toBe(id);
      expect(preset.strings[0].maxSeconds, id).toBeLessThan(guitar.strings[0].maxSeconds);
      expect(preset.strings[2].brightness, id).toBeGreaterThan(guitar.strings[2].brightness);
    }
    expect(stringVoiceFor("mandolin")).toBe("mandolin");
    expect(stringVoiceFor("banjo")).toBe("banjo");
    expect(stringVoiceFor("bass")).toBe("bass");
  });

  it("the string profile follows the pitch, so a ukulele's re-entrant G gets the right string, not the first one", () => {
    const uke = getPresetForInstrument("ukulele");
    // C4 is the lowest ukulele pitch even though it is the second string; A4 the highest
    expect(profileForMidi(uke, 60)).toBe(uke.strings[1]);
    expect(profileForMidi(uke, 69)).toBe(uke.strings[3]);
  });
});

describe("every instrument has a sound of its own", () => {
  it("each chord instrument is a plucked string model or has a synth recipe", () => {
    for (const d of chordInstruments()) {
      const plucked = ["guitar", "acoustic-guitar", "electric-guitar", "guitar-7", "guitar-12", "bass", "ukulele", "cavaquinho", "mandolin", "balalaika", "banjo", "classical-guitar", "guitar-8", "double-bass", "bouzouki", "charango", "cuatro", "tres"].includes(d.id);
      expect(plucked || usesSynthVoice(d.id), `${d.id} has no sound model`).toBe(true);
      if (!plucked) expect(recipeForInstrument(d.id), d.id).toBeDefined();
    }
  });

  it("recipes are complete and sane", () => {
    for (const r of Object.values(SYNTH_RECIPES)) {
      expect(r.partials.length, r.id).toBeGreaterThan(0);
      for (const p of r.partials) {
        expect(p.ratio, r.id).toBeGreaterThan(0);
        expect(p.gain, r.id).toBeGreaterThan(0);
        expect(p.gain, r.id).toBeLessThanOrEqual(1);
      }
      expect(r.attack, r.id).toBeGreaterThan(0);
      expect(r.release, r.id).toBeGreaterThan(0);
      expect(r.hold, r.id).toBeGreaterThan(0.5);
      expect(r.level, r.id).toBeGreaterThan(0.2);
      expect(r.level, r.id).toBeLessThanOrEqual(1);
    }
    for (const target of Object.values(RECIPE_FOR_INSTRUMENT)) expect(SYNTH_RECIPES[target], target).toBeDefined();
  });

  it("bowed strings: a slow bow attack, delayed vibrato, bow hiss, body resonances; chords are rolled low to high", () => {
    for (const id of ["violin", "viola", "cello"]) {
      const r = SYNTH_RECIPES[id];
      expect(r.attack, id).toBeGreaterThanOrEqual(0.15);
      expect(r.vibrato?.delay, id).toBeGreaterThan(0.2);
      expect(r.noise?.sustained, id).toBe(true);
      expect(r.formants?.length, id).toBeGreaterThanOrEqual(3);
      expect(r.partials.every((p) => p.decay === undefined), `${id} partials are held, not decaying`).toBe(true);
      const chord = planSynthNotes(r, [67, 59, 62], "chord");
      expect(chord.map((n) => n.midi), id).toEqual([59, 62, 67]);
      expect(chord[1].startOffset - chord[0].startOffset, id).toBeGreaterThanOrEqual(0.08);
    }
    expect(SYNTH_RECIPES.cello.attack).toBeGreaterThan(SYNTH_RECIPES.violin.attack);
  });

  it("piano: inharmonic partials that die at different rates, a hammer strike, lower notes ring longer", () => {
    const piano = SYNTH_RECIPES.piano;
    piano.partials.forEach((p, i) => {
      if (i > 0) expect(p.ratio, `partial ${i + 1} is sharp of a whole multiple`).toBeGreaterThan(i + 1);
      expect(p.decay).toBeDefined();
    });
    const decays = piano.partials.map((p) => p.decay!);
    expect([...decays].sort((a, b) => b - a)).toEqual(decays); // higher partials die sooner
    expect(piano.noise?.sustained).toBe(false);
    const fundamental = piano.partials[0];
    expect(partialDecaySeconds(piano, fundamental, 40)).toBeGreaterThan(partialDecaySeconds(piano, fundamental, 84));
    expect(piano.attack).toBeLessThan(0.01);
  });

  it("mallets are struck bars with the bars' own overtones; xylophone is shorter than marimba; harp is plucked and swept", () => {
    const marimba = SYNTH_RECIPES.marimba;
    expect(marimba.partials.map((p) => p.ratio)).toEqual([1, 3.98, 9.9]);
    expect(SYNTH_RECIPES.xylophone.partials[0].decay!).toBeLessThan(marimba.partials[0].decay!);
    expect(SYNTH_RECIPES.harp.roll).toBeGreaterThanOrEqual(0.05);
    expect(SYNTH_RECIPES.harp.partials.every((p) => p.decay !== undefined)).toBe(true);
  });

  it("winds have breath, characteristic spectra and delayed vibrato; clarinet is odd-harmonic, brass swells open", () => {
    for (const id of ["flute", "oboe", "clarinet", "bassoon", "sax", "trumpet", "trombone", "horn", "tuba", "harmonica", "bansuri", "recorder"]) {
      expect(SYNTH_RECIPES[id].noise, `${id} breath`).toBeDefined();
    }
    const clarinet = SYNTH_RECIPES.clarinet.partials;
    const odd = clarinet.filter((p) => p.ratio % 2 === 1).reduce((s, p) => s + p.gain, 0);
    const even = clarinet.filter((p) => p.ratio % 2 === 0).reduce((s, p) => s + p.gain, 0);
    expect(odd).toBeGreaterThan(even * 5);
    expect(SYNTH_RECIPES.trumpet.swell).toBeGreaterThan(SYNTH_RECIPES.trumpet.cutoff);
    expect(SYNTH_RECIPES.oboe.formants?.some((f) => f.freq > 1000 && f.freq < 1600)).toBe(true);
    // all recognisably different spectra
    const sig = (id: string) => SYNTH_RECIPES[id].partials.map((p) => p.gain.toFixed(2)).join(",");
    const ids = ["violin", "flute", "clarinet", "oboe", "trumpet", "horn", "piano", "organ", "accordion"];
    expect(new Set(ids.map(sig)).size).toBe(ids.length);
  });

  it("winds sound their chord notes together (lightly rolled), and one by one on request", () => {
    const flute = SYNTH_RECIPES.flute;
    const together = planSynthNotes(flute, [60, 64, 67], "chord");
    expect(together[2].startOffset).toBeLessThan(0.1);
    const oneByOne = planSynthNotes(flute, [60, 64, 67], "arpeggio", 0.5);
    expect(oneByOne.map((n) => n.startOffset)).toEqual([0, 0.5, 1]);
    // held instruments play each arpeggio note for about a gap; struck instruments ring on
    expect(oneByOne[0].duration).toBeCloseTo(0.525, 3);
    expect(planSynthNotes(SYNTH_RECIPES.piano, [60, 64], "arpeggio", 0.3)[0].duration).toBe(SYNTH_RECIPES.piano.hold);
  });

  it("more notes at once never get louder: the level is balanced per note", () => {
    const one = planSynthNotes(SYNTH_RECIPES.piano, [60], "chord")[0].gain;
    const six = planSynthNotes(SYNTH_RECIPES.piano, [48, 55, 60, 64, 67, 72], "chord");
    expect(six[0].gain).toBeLessThan(one);
    const power = (n: { gain: number }[]) => n.reduce((s, x) => s + x.gain * x.gain, 0);
    expect(power(six)).toBeLessThan(1);
  });

  it("duplicate and invalid notes are dropped", () => {
    expect(planSynthNotes(SYNTH_RECIPES.piano, [60, 60, Number.NaN, 64])).toHaveLength(2);
    expect(planSynthNotes(SYNTH_RECIPES.piano, [])).toEqual([]);
  });
});

/* ── The recipes reach the speakers: one shared context, every note starts ── */

describe("synth voices start on the shared audio context (fake AudioContext)", () => {
  type Rec = { kind: string; started: number[]; stopped: number[]; freq?: number; wave?: boolean };
  const created: Rec[] = [];
  let contexts = 0;
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const node = (extra: Record<string, unknown> = {}) => ({ connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), ...extra });

  class FakeContext {
    state = "running";
    currentTime = 1;
    sampleRate = 22050;
    destination = node();
    constructor() {
      contexts++;
    }
    createBuffer(_c: number, length: number) {
      const data = new Float32Array(length);
      return { length, sampleRate: 22050, getChannelData: () => data };
    }
    createBufferSource() {
      const rec: Rec = { kind: "noise", started: [], stopped: [] };
      created.push(rec);
      return node({ buffer: null, loop: false, start: (t: number) => rec.started.push(t), stop: (t: number) => rec.stopped.push(t) });
    }
    createOscillator() {
      const rec: Rec = { kind: "osc", started: [], stopped: [] };
      created.push(rec);
      const frequency = param();
      const o = node({
        type: "sine",
        frequency,
        detune: param(),
        setPeriodicWave: () => (rec.wave = true),
        start: (t: number) => rec.started.push(t),
        stop: (t: number) => rec.stopped.push(t),
      });
      Object.defineProperty(frequency, "value", { get: () => rec.freq ?? 0, set: (v: number) => (rec.freq = v) });
      return o;
    }
    createPeriodicWave() { return {}; }
    createGain() { return node({ gain: param() }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBiquadFilter() { return node({ type: "", frequency: param(), Q: param(), gain: param() }); }
    createDelay() { return node({ delayTime: param() }); }
    createStereoPanner() { return node({ pan: param() }); }
    resume = vi.fn().mockResolvedValue(undefined);
  }

  beforeAll(() => {
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
  });
  afterEach(async () => {
    const { audioEngine } = await import("./index");
    audioEngine.stop();
    created.length = 0;
  });

  it("a violin chord rolls its notes: later notes start later, every note has bow noise and a vibrato oscillator", async () => {
    const { playSynth } = await import("./synthVoices");
    const result = await playSynth("violin", [55, 62, 69], "chord");
    expect(result.notes).toEqual([55, 62, 69]);
    const oscs = created.filter((c) => c.kind === "osc");
    // per note: a pair of detuned wave-table oscillators + one vibrato LFO
    expect(oscs.length).toBe(3 * 3);
    expect(created.filter((c) => c.kind === "noise")).toHaveLength(3);
    const waves = oscs.filter((o) => o.wave);
    expect(waves).toHaveLength(6);
    const starts = [...new Set(waves.map((w) => w.started[0]))].sort((a, b) => a - b);
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeCloseTo(SYNTH_RECIPES.violin.roll, 3);
    expect(result.durationSeconds).toBeGreaterThan(2.5);
  });

  it("a piano chord is one oscillator per partial (struck, decaying), with a hammer burst", async () => {
    const { playSynth } = await import("./synthVoices");
    await playSynth("piano", [60, 64, 67], "chord");
    const sines = created.filter((c) => c.kind === "osc" && !c.wave);
    expect(sines.length).toBe(3 * SYNTH_RECIPES.piano.partials.length * 2); // two slightly detuned strings per partial
    // the partials are inharmonic: no oscillator sits on an exact multiple of the note's pitch
    const c4 = 440 * Math.pow(2, (60 - 69) / 12);
    const freqs = sines.map((s) => s.freq!).filter((f) => f > c4 * 1.5 && f < c4 * 2.5);
    expect(freqs.some((f) => Math.abs(f / c4 - 2) > 0.0005)).toBe(true);
    expect(created.filter((c) => c.kind === "noise").length).toBe(3);
  });

  it("uses one AudioContext however often it plays, and a new sound fades the old one out", async () => {
    const { playSynth } = await import("./synthVoices");
    const { audioContextManager } = await import("./index");
    const before = contexts;
    for (let i = 0; i < 10; i++) await playSynth("flute", [72, 76, 79], "chord");
    expect(contexts - before).toBeLessThanOrEqual(1);
    expect(audioContextManager.activeVoiceCount()).toBeLessThan(40); // earlier notes were released, not stacked forever
    expect(created.slice(0, 10).every((c) => c.stopped.length >= 1)).toBe(true);
  });

  it("an unknown instrument or no notes make no sound and do not throw", async () => {
    const { playSynth } = await import("./synthVoices");
    expect((await playSynth("kazoo", [60])).notes).toEqual([]);
    expect((await playSynth("piano", [])).notes).toEqual([]);
    expect(created).toHaveLength(0);
  });
});
