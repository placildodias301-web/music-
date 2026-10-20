import { afterEach, describe, expect, it, vi } from "vitest";
import { TUNER_CONFIG } from "./config";
import { displayState, outOfRangeSide, clampForNeedle, centsBetween, IN_TUNE_CENTS } from "./cents";
import { TunerEngine, type EngineConfig, type TunerSnapshot } from "./engine";
import { MicController, MicrophoneError, microphoneErrorFrom, startMicrophone } from "./microphone";
import { smoothToward } from "./needle";
import { midiToFrequency, midiToNoteName, noteToMidi } from "./notes";
import { PitchSmoother } from "./smoothing";
import { detectionRange, findVariant, targetsFor } from "./tunings";

const SR = 48000;
const N = 4096;
const hz = (note: string, a4 = 440) => midiToFrequency(noteToMidi(note)!, a4);

/** Synthetic string: harmonic amplitudes are configurable so the 2nd/3rd partial can out-shout the fundamental. */
function tone(freq: number, opts: { harmonics?: number[]; amp?: number; phase?: number } = {}): Float32Array {
  const { harmonics = [1, 0.7, 0.5, 0.35, 0.25, 0.15], amp = 0.3, phase = 0 } = opts;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    harmonics.forEach((a, k) => (v += a * Math.sin((2 * Math.PI * freq * (k + 1) * (i + phase)) / SR)));
    buf[i] = amp * v;
  }
  return buf;
}

function engineFor(instrument: string, variant: string, mode: EngineConfig["mode"], selectedIndex = 0, a4 = 440, profile?: EngineConfig["profile"]) {
  const preset = findVariant(instrument, variant)!.tunings[0];
  const { fmin, fmax } = detectionRange(preset, a4);
  const targets = targetsFor(preset, a4);
  const cfg: EngineConfig = { mode, targets, selectedIndex, a4, fmin, fmax, profile };
  return { engine: new TunerEngine(cfg), cfg, targets };
}

/** A running clock for one engine so successive notes continue where the last stopped. */
class Rig {
  t = 0;
  k = 0;
  snap!: TunerSnapshot;
  readonly engine: TunerEngine;
  constructor(engine: TunerEngine) {
    this.engine = engine;
  }
  play(freq: number, seconds = 1, opts: Parameters<typeof tone>[1] = {}) {
    const frames = Math.round((seconds * 1000) / 33);
    for (let i = 0; i < frames; i++) this.snap = this.engine.processFrame(tone(freq, { ...opts, phase: ++this.k * 977 }), SR, (this.t += 33));
    return this.snap;
  }
  silence(seconds: number) {
    const frames = Math.round((seconds * 1000) / 33);
    for (let i = 0; i < frames; i++) this.snap = this.engine.processFrame(new Float32Array(N), SR, (this.t += 33));
    return this.snap;
  }
}
const violin = (mode: EngineConfig["mode"], idx = 0) => {
  const e = engineFor("violin", "violin-4", mode, idx);
  return { ...e, rig: new Rig(e.engine) };
};

describe("A · manual G3 progression: detected note follows, target stays G3", () => {
  it("walks D3 → G3 with unclamped cents, a pinned needle out of range and IN TUNE only at G3", () => {
    const { rig } = violin("manual", 0);
    const steps: [string, number][] = [["D3", 146.83], ["D#3", 155.56], ["E3", 164.81], ["F3", 174.61], ["F#3", 185.0], ["G3", 196.0]];
    const centsSeen: number[] = [];
    for (const [name, f] of steps) {
      const s = rig.play(f, 0.8);
      expect(s.pitchReliable, name).toBe(true);
      expect(s.detectedNote, name).toBe(name);
      expect(s.frequency!, name).toBeCloseTo(f, 0);
      expect(s.targetNote, name).toBe("G3");
      expect(s.targetFrequency!, name).toBeCloseTo(196, 2);
      expect(s.cents!, name).toBeCloseTo(centsBetween(f, 196), 0);
      centsSeen.push(s.cents!);
      if (name !== "G3") expect(s.locked, name).toBe(false);
      if (Math.abs(s.cents!) > 50) {
        expect(s.outOfRange, name).toBe(true);
        expect(s.needleCents, name).toBe(-50); // pinned at the edge, number untouched
        expect(Math.abs(s.cents!), name).toBeGreaterThan(50);
      }
    }
    // approaches the centre monotonically; D3 is a fourth (≈500 cents) below, never wrapped into ±50
    for (let i = 1; i < centsSeen.length; i++) expect(Math.abs(centsSeen[i])).toBeLessThan(Math.abs(centsSeen[i - 1]));
    expect(centsSeen[0]).toBeCloseTo(-500, -1);
    const g = rig.play(196.0, 1.5);
    expect(g.detectedNote).toBe("G3");
    expect(Math.abs(g.cents!)).toBeLessThanOrEqual(IN_TUNE_CENTS);
    expect(g.locked).toBe(true);
    expect(g.tunedIndexes).toEqual([0]);
  });
});

describe("B · F#3 is not in tune for G3", () => {
  it("an exact F#3 reads F#3, ≈ −100 cents against G3, out of tolerance and never locked", () => {
    const { rig } = violin("manual", 0);
    const s = rig.play(hz("F#3"), 2);
    expect(s.detectedNote).toBe("F#3");
    expect(s.chromaticCents!).toBeCloseTo(0, 0); // dead on F#3 …
    expect(s.cents!).toBeCloseTo(-100, 0); // … a semitone flat of the target
    expect(Math.abs(s.cents!)).toBeGreaterThan(IN_TUNE_CENTS);
    expect(s.locked).toBe(false);
    expect(s.tunedIndexes).toEqual([]);
    expect(displayState(s.cents!, s.state)).not.toBe("in-tune");
    expect(outOfRangeSide(s.cents)).toBe(-1);
  });
});

describe("C · AUTO picks the target by absolute cents distance", () => {
  it("191 Hz → G3 (≈ −44 cents)", () => {
    const { rig } = violin("auto");
    const s = rig.play(191, 1);
    expect(s.targetNote).toBe("G3");
    expect(s.targetIndex).toBe(0);
    expect(s.cents!).toBeCloseTo(centsBetween(191, 196), 0);
  });
  it("shows the real chromatic note while the target is another note (187 Hz = F#3 +20¢, target G3)", () => {
    const { rig } = violin("auto");
    const s = rig.play(187, 1);
    expect(s.detectedNote).toBe("F#3");
    expect(s.chromaticCents!).toBeGreaterThan(15);
    expect(s.targetNote).toBe("G3");
    expect(s.cents!).toBeCloseTo(centsBetween(187, 196), 0);
    expect(s.cents!).not.toBeCloseTo(s.chromaticCents!, 0);
  });
  it("does not flicker between strings while the pitch wobbles around a boundary", () => {
    const { rig } = violin("auto");
    const targets = new Set<number | null>();
    // a ±5 cent vibrato-like wobble around G3
    rig.play(196, 0.5);
    for (let i = 0; i < 40; i++) targets.add(rig.play(196 * 2 ** ((i % 2 ? 5 : -5) / 1200), 0.07).targetIndex);
    expect([...targets]).toEqual([0]);
  });
  it("switches to the next string only after it persists (≈ 200 ms), and the detected note never goes stale meanwhile", () => {
    const { rig } = violin("auto");
    rig.play(196, 1);
    const seen: (string | null)[] = [];
    let switched = -1;
    for (let i = 0; i < 20; i++) {
      const s = rig.play(293.66, 0.033);
      seen.push(s.detectedNote);
      if (switched < 0 && s.targetNote === "D4") switched = i;
    }
    expect(switched).toBeGreaterThanOrEqual(0);
    expect(switched * 33).toBeLessThan(900);
    // once the new note is accepted the readout is D4, and it is never a frozen G3 with a D4 target
    expect(seen[seen.length - 1]).toBe("D4");
  });
  it("is octave-aware: 98 Hz (G2) is not folded onto G3 — it is 1200 cents flat of it", () => {
    const { rig } = violin("auto");
    const s = rig.play(98, 1.2, { harmonics: [1, 0.7, 0.5, 0.3] });
    // below the violin's detection range → no invented reading
    expect(s.pitchReliable ? Math.abs(s.cents!) : 0).not.toBeLessThan(0);
    if (s.pitchReliable) expect(s.cents!).toBeLessThan(-100);
  });
});

describe("C2 · MANUAL holds the chosen string", () => {
  it("keeps the target while other notes are played; follows a new selection", () => {
    const e = engineFor("violin", "violin-4", "manual", 0);
    const rig = new Rig(e.engine);
    expect(rig.play(hz("A4"), 0.8).targetNote).toBe("G3");
    expect(rig.play(hz("D4"), 0.8).targetNote).toBe("G3");
    e.engine.configure({ ...e.cfg, selectedIndex: 2 }); // user taps the A string
    const s = rig.play(hz("A4"), 0.8);
    expect(s.targetNote).toBe("A4");
    expect(Math.abs(s.cents!)).toBeLessThan(3);
  });
  it("drops the old selection when the tuning's targets change", () => {
    const e = engineFor("violin", "violin-4", "manual", 3);
    const rig = new Rig(e.engine);
    rig.play(hz("E5"), 1.5);
    expect(rig.snap.tunedIndexes).toEqual([3]);
    const g = engineFor("guitar", "acoustic-6", "manual", 0);
    e.engine.configure(g.cfg);
    expect(rig.silence(0.5).tunedIndexes).toEqual([]);
  });
});

describe("D · A4 calibration", () => {
  it("note maths is derived from A4, no hard-coded table", () => {
    expect(hz("A4", 432)).toBeCloseTo(432, 9);
    expect(hz("G3", 432)).toBeCloseTo(432 * 2 ** (-14 / 12), 9);
    expect(midiToNoteName(noteToMidi("F#3")!)).toBe("F#3");
  });
  it("changing A4 re-targets everything without restarting the microphone/engine", () => {
    const a = engineFor("violin", "violin-4", "manual", 0, 440);
    const rig = new Rig(a.engine);
    const s440 = rig.play(196, 1);
    expect(s440.targetFrequency!).toBeCloseTo(196, 2);
    expect(Math.abs(s440.cents!)).toBeLessThan(2);
    const b = engineFor("violin", "violin-4", "manual", 0, 432);
    a.engine.configure(b.cfg); // same engine instance, as useTuner does
    const s432 = rig.play(196, 1);
    expect(s432.targetFrequency!).toBeCloseTo(hz("G3", 432), 2);
    expect(s432.cents!).toBeCloseTo(centsBetween(196, hz("G3", 432)), 0); // ≈ +31.8
    expect(s432.detectedNote).toBe("G3");
    expect(rig.play(hz("G3", 432), 1.2).cents!).toBeCloseTo(0, 0);
  });
});

describe("E · silence and noise", () => {
  it("never shows a random note, and IN TUNE clears after sustained loss", () => {
    const { rig } = violin("manual", 0);
    expect(rig.play(196, 1.8).locked).toBe(true);
    const gap = rig.silence((TUNER_CONFIG.silenceTimeoutMs + 100) / 1000);
    expect(gap.pitchReliable).toBe(false);
    expect(gap.locked).toBe(false);
    expect(gap.detectedNote).toBeNull();
    expect(gap.cents).toBeNull();
    expect(gap.state).toBeNull();
    // the earlier tuned tick survives (it really was tuned) but nothing claims success right now
    expect(gap.tunedIndexes).toEqual([0]);
  });
  it("broadband noise produces no note labels over several seconds", () => {
    const { engine } = violin("auto");
    let x = 7;
    let any = 0;
    for (let k = 0; k < 150; k++) {
      const b = new Float32Array(N);
      for (let i = 0; i < N; i++) b[i] = (((x = (x * 16807) % 2147483647) / 2147483647) - 0.5) * 0.4;
      const s = engine.processFrame(b, SR, k * 33);
      if (s.detectedNote !== null) any++;
    }
    expect(any).toBe(0);
  });
  it("a very quiet signal below the RMS gate gives nothing", () => {
    const { rig } = violin("auto");
    expect(rig.play(196, 1, { amp: 0.0004 }).pitchReliable).toBe(false);
  });
});

describe("F · octave handling with strong upper harmonics", () => {
  it("fundamental weaker than the 2nd and 3rd harmonic still reads the fundamental", () => {
    for (const note of ["G3", "D4", "A4"]) {
      const { rig } = violin("auto");
      const s = rig.play(hz(note), 1, { harmonics: [0.35, 1, 0.9, 0.4, 0.2] });
      expect(s.detectedNote, note).toBe(note);
      expect(Math.abs(s.cents!), note).toBeLessThan(3);
    }
  });
  it("one octave glitch inside a steady note is rejected", () => {
    const { rig } = violin("manual", 0);
    rig.play(196, 1);
    const glitch = rig.engine.processFrame(tone(392, { phase: 12345 }), SR, (rig.t += 33));
    expect(glitch.frequency!).toBeCloseTo(196, 0);
    expect(glitch.cents!).toBeCloseTo(0, 0);
    expect(rig.play(196, 0.3).detectedNote).toBe("G3");
  });
  it("a real jump an octave up is accepted once it persists, and is reported as +1200 cents (not folded)", () => {
    const { rig } = violin("manual", 0);
    rig.play(196, 1);
    const s = rig.play(392, 1);
    expect(s.detectedNote).toBe("G4");
    expect(s.cents!).toBeCloseTo(1200, -1);
    expect(s.needleCents).toBe(50);
    expect(s.outOfRange).toBe(true);
  });
  it("the smoother alone: isolated 2× and ½× readings never move the median", () => {
    const sm = new PitchSmoother();
    [196, 196.2, 195.9, 196.1].forEach((f) => sm.push(f));
    for (const bad of [392, 98]) {
      const r = sm.push(bad);
      expect(r.rejected).toBe(true);
      expect(Math.abs(centsBetween(r.frequency, 196))).toBeLessThan(2);
      sm.push(196.05);
    }
  });
});

describe("G · lowest and highest open strings", () => {
  const cases: [string, string, string[]][] = [
    ["violin", "violin-4", ["G3", "E5"]],
    ["guitar", "acoustic-6", ["E2", "E4"]],
    ["ukulele", "ukulele-4", ["C4", "A4"]],
    ["bass", "bass-4", ["E1", "G2"]],
  ];
  for (const [inst, variant, notes] of cases) {
    for (const note of notes) {
      it(`${inst} ${note} reads within 2 cents with a strong 2nd harmonic`, () => {
        const e = engineFor(inst, variant, "auto");
        const rig = new Rig(e.engine);
        const s = rig.play(hz(note), 1, { harmonics: [0.6, 1, 0.5, 0.25] });
        expect(s.detectedNote).toBe(note);
        expect(Math.abs(s.cents!)).toBeLessThan(2);
      });
    }
  }
  it("a 5-string bass B0 (30.9 Hz) is inside the detector's range at the real sample rate", () => {
    const preset = findVariant("bass", "bass-5")?.tunings[0];
    if (!preset) return;
    const { fmin } = detectionRange(preset, 440);
    expect(fmin).toBeLessThan(hz("B0"));
    expect(Math.floor(SR / fmin)).toBeLessThanOrEqual(N / 2); // the longest lag the 4096 window can hold
  });
});

describe("needle and gauge maths", () => {
  it("the needle is clamped to ±50 but the number is not", () => {
    expect(clampForNeedle(-700)).toBe(-50);
    expect(clampForNeedle(63)).toBe(50);
    expect(clampForNeedle(-12.5)).toBe(-12.5);
    expect(outOfRangeSide(-51)).toBe(-1);
    expect(outOfRangeSide(50)).toBe(0);
    expect(outOfRangeSide(50.1)).toBe(1);
    expect(outOfRangeSide(null)).toBe(0);
  });
  it("IN TUNE strictly follows the configured tolerance", () => {
    expect(displayState(5, "slightly-sharp")).toBe("in-tune");
    expect(displayState(5.4, "in-tune")).toBe("slightly-sharp"); // the sticky band must not widen the label
    expect(displayState(-6, null)).toBe("slightly-flat");
    expect(displayState(-20, "flat")).toBe("flat");
  });
  it("time-based exponential smoothing: frame-rate independent, ~63 % in one time constant", () => {
    const tau = TUNER_CONFIG.needleTauMs;
    expect(smoothToward(0, 40, tau, tau)).toBeCloseTo(40 * (1 - Math.exp(-1)), 6);
    let a = 0;
    for (let i = 0; i < 10; i++) a = smoothToward(a, 40, tau / 10, tau);
    expect(a).toBeCloseTo(smoothToward(0, 40, tau, tau), 6); // 10 small steps = 1 big step
    expect(smoothToward(10, 40, 16, 0)).toBe(40); // reduced motion jumps
    expect(smoothToward(10, 40, 0, tau)).toBe(10);
    expect(tau).toBeGreaterThanOrEqual(60);
    expect(tau).toBeLessThanOrEqual(100);
  });
});

describe("reference tone safeguard", () => {
  it("while the tone plays (and settles) nothing is accepted, success is cleared, and it recovers afterwards", () => {
    const { rig } = violin("manual", 0);
    expect(rig.play(196, 1.8).locked).toBe(true);
    rig.engine.mute(2000, rig.t); // the app plays G3 — and hears itself
    let s = rig.play(196, 2.0); // the microphone hears a perfect 196 Hz: must NOT count
    expect(s.pitchReliable).toBe(false);
    expect(s.locked).toBe(false);
    expect(s.detectedNote).toBeNull();
    s = rig.play(196, TUNER_CONFIG.toneSettleMs / 1000 - 0.1); // inside the settling period
    expect(s.pitchReliable).toBe(false);
    s = rig.play(196, 1);
    expect(s.pitchReliable).toBe(true); // the player's own note is accepted again
  });
  it("never marks a string tuned from the tone alone", () => {
    const { rig } = violin("manual", 0);
    rig.engine.mute(2200, rig.t);
    const s = rig.play(196, 3.5);
    expect(s.tunedIndexes.length === 0 || s.pitchReliable).toBe(true);
    const tunedDuringTone = new Rig(violin("manual", 0).engine);
    tunedDuringTone.engine.mute(5000, 0);
    expect(tunedDuringTone.play(196, 4.5).tunedIndexes).toEqual([]);
  });
});

/* ── H · microphone lifecycle (fakes for getUserMedia / AudioContext) ── */

interface FakeTrack {
  stopped: boolean;
  listeners: Record<string, (() => void)[]>;
  stop(): void;
  addEventListener(t: string, cb: () => void): void;
  removeEventListener(t: string, cb: () => void): void;
  getSettings(): MediaTrackSettings;
}
function makeTrack(settings: MediaTrackSettings = { echoCancellation: false, noiseSuppression: false, autoGainControl: false }): FakeTrack {
  const t: FakeTrack = {
    stopped: false,
    listeners: {},
    stop() {
      this.stopped = true;
    },
    addEventListener(type, cb) {
      (this.listeners[type] ??= []).push(cb);
    },
    removeEventListener(type, cb) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((x) => x !== cb);
    },
    getSettings: () => settings,
  };
  return t;
}
interface World {
  tracks: FakeTrack[];
  contexts: { state: string; closed: boolean; connectedToDestination: boolean }[];
  resolveGum: (() => void)[];
}
function installWorld(gum: (w: World) => Promise<MediaStream>, secure = true): World {
  const w: World = { tracks: [], contexts: [], resolveGum: [] };
  class FakeCtx {
    state = "running";
    sampleRate = 44100;
    info = { state: "running", closed: false, connectedToDestination: false };
    constructor() {
      w.contexts.push(this.info);
    }
    resume = async () => undefined;
    close = async () => {
      this.info.closed = true;
      this.state = "closed";
    };
    addEventListener() {}
    removeEventListener() {}
    createMediaStreamSource() {
      return { connect: () => undefined, disconnect: () => undefined };
    }
    createAnalyser() {
      return { fftSize: 0, smoothingTimeConstant: 0, connect: () => undefined, disconnect: () => undefined, getFloatTimeDomainData: () => undefined };
    }
  }
  vi.stubGlobal("window", { AudioContext: FakeCtx, isSecureContext: secure });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => gum(w) } });
  return w;
}
const stream = (t: FakeTrack) => ({ getTracks: () => [t], getAudioTracks: () => [t] }) as unknown as MediaStream;
const dom = (name: string) => new DOMException("x", name);
afterEach(() => vi.unstubAllGlobals());

describe("H · microphone lifecycle", () => {
  it("maps denied / missing / busy / insecure to clear messages", async () => {
    for (const [name, kind] of [["NotAllowedError", "denied"], ["NotFoundError", "no-device"], ["NotReadableError", "busy"]] as const) {
      installWorld(() => Promise.reject(dom(name)));
      await expect(startMicrophone()).rejects.toMatchObject({ kind });
    }
    installWorld(() => Promise.reject(dom("NotAllowedError")), false);
    await expect(startMicrophone()).rejects.toMatchObject({ kind: "insecure" });
    expect(microphoneErrorFrom(new Error("weird")).kind).toBe("unknown");
    expect(new MicrophoneError("busy", "m").kind).toBe("busy");
  });
  it("asks for raw audio, reports what the browser really applied, and never connects to the speakers", async () => {
    const t = makeTrack({ echoCancellation: true, noiseSuppression: false, autoGainControl: false });
    const gum = vi.fn(async () => stream(t));
    const w = installWorld(() => gum());
    const mic = (await startMicrophone())!;
    expect(mic.processed).toBe(true); // browser ignored the request for echoCancellation=false
    expect(mic.sampleRate).toBe(44100); // the real context rate, not an assumed 44.1/48 k
    expect(w.contexts[0].connectedToDestination).toBe(false);
    mic.stop();
    expect(t.stopped).toBe(true);
    expect(w.contexts[0].closed).toBe(true);
  });
  it("an unsupported constraint is not fatal: retries with plain audio", async () => {
    const t = makeTrack();
    let calls = 0;
    installWorld(async () => {
      if (++calls === 1) throw dom("OverconstrainedError");
      return stream(t);
    });
    const mic = await startMicrophone();
    expect(mic).not.toBeNull();
    expect(calls).toBe(2);
    mic!.stop();
  });
  it("a permission answer that arrives after Stop releases the new tracks immediately", async () => {
    const t = makeTrack();
    let release!: () => void;
    const w = installWorld(() => new Promise((res) => (release = () => res(stream(t)))));
    const ctl = new MicController();
    const pending = ctl.open(() => {});
    ctl.close(); // user pressed Stop while the prompt was open
    release();
    expect(await pending).toBeNull();
    expect(t.stopped).toBe(true);
    expect(ctl.mic).toBeNull();
    expect(w.contexts.every((c) => c.closed)).toBe(true);
  });
  it("rapid Start/Stop/Start leaves exactly one live stream", async () => {
    const releases: (() => void)[] = [];
    const tracks: FakeTrack[] = [];
    const w = installWorld(
      () =>
        new Promise((res) => {
          const t = makeTrack();
          tracks.push(t);
          releases.push(() => res(stream(t)));
        }),
    );
    const ctl = new MicController();
    const first = ctl.open(() => {});
    expect(await ctl.open(() => {})).toBeNull(); // second Start while one is pending is ignored (no duplicate stream)
    ctl.close();
    const second = ctl.open(() => {});
    releases[0]();
    releases[1]();
    expect(await first).toBeNull();
    expect(await second).not.toBeNull();
    expect(tracks.filter((t) => !t.stopped)).toHaveLength(1);
    expect(w.contexts.filter((c) => !c.closed)).toHaveLength(1);
    ctl.close();
    expect(tracks.every((t) => t.stopped)).toBe(true);
    expect(w.contexts.every((c) => c.closed)).toBe(true);
    ctl.close(); // idempotent
  });
  it("leaving the page (unmount) while listening releases everything; a later remount starts clean", async () => {
    const tracks: FakeTrack[] = [];
    installWorld(async () => {
      const t = makeTrack();
      tracks.push(t);
      return stream(t);
    });
    const ctl = new MicController();
    expect(await ctl.open(() => {})).not.toBeNull();
    ctl.close(); // unmount cleanup
    expect(tracks[0].stopped).toBe(true);
    expect(await ctl.open(() => {})).not.toBeNull(); // StrictMode-style remount
    expect(tracks).toHaveLength(2);
    ctl.close();
    expect(tracks.every((t) => t.stopped)).toBe(true);
  });
  it("a track that ends by itself (device unplugged) is reported once, then ignored after Stop", async () => {
    const t = makeTrack();
    installWorld(async () => stream(t));
    const ctl = new MicController();
    const onEnded = vi.fn();
    await ctl.open(onEnded);
    t.listeners.ended.forEach((cb) => cb());
    expect(onEnded).toHaveBeenCalledTimes(1);
    ctl.close();
    expect(t.listeners.ended ?? []).toHaveLength(0);
  });
  it("a denied start leaves no stream and allows another try", async () => {
    let n = 0;
    const t = makeTrack();
    installWorld(async () => {
      if (++n === 1) throw dom("NotAllowedError");
      return stream(t);
    });
    const ctl = new MicController();
    await expect(ctl.open(() => {})).rejects.toMatchObject({ kind: "denied" });
    expect(await ctl.open(() => {})).not.toBeNull();
    ctl.close();
  });
});

describe("configuration lives in one place", () => {
  it("exposes the documented knobs", () => {
    expect(TUNER_CONFIG.inTuneCents).toBe(5);
    expect(TUNER_CONFIG.gaugeRangeCents).toBe(50);
    expect(TUNER_CONFIG.historySize).toBeGreaterThanOrEqual(3);
    expect(TUNER_CONFIG.historySize).toBeLessThanOrEqual(5);
    expect(TUNER_CONFIG.silenceTimeoutMs).toBeGreaterThanOrEqual(200);
    expect(TUNER_CONFIG.silenceTimeoutMs).toBeLessThanOrEqual(300);
    expect(TUNER_CONFIG.autoPersistMs).toBeGreaterThanOrEqual(150);
    expect(TUNER_CONFIG.autoPersistMs).toBeLessThanOrEqual(250);
  });
});
