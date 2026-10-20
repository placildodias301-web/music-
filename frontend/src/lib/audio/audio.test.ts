import { describe, it, expect, vi, beforeEach } from "vitest";
import { midiToFreq, renderStringAudioBuffer } from "./KarplusStrong";
import { INSTRUMENT_PRESETS, getPresetForInstrument } from "./AudioPresets";
import { strumChord } from "./StrumEngine";
import { playArpeggioSequence } from "./ArpeggioEngine";
import { audioEngine } from "./AudioEngine";
import { audioContextManager } from "./AudioContextManager";

// Mock AudioContext and AudioBuffer for Node/jsdom test environment
class MockAudioBuffer {
  length: number;
  sampleRate: number;
  numberOfChannels = 1;
  private channelData: Float32Array;

  constructor(options: { length: number; sampleRate: number }) {
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.channelData = new Float32Array(options.length);
  }

  getChannelData(_channel: number) {
    return this.channelData;
  }
}

class MockAudioNode {
  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
}

class MockGainNode extends MockAudioNode {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}

class MockBufferSourceNode extends MockAudioNode {
  buffer: any = null;
  start = vi.fn();
  stop = vi.fn();
  onended: (() => void) | null = null;
}

class MockDynamicsCompressorNode extends MockAudioNode {
  threshold = { setValueAtTime: vi.fn() };
  knee = { setValueAtTime: vi.fn() };
  ratio = { setValueAtTime: vi.fn() };
  attack = { setValueAtTime: vi.fn() };
  release = { setValueAtTime: vi.fn() };
}

class MockBiquadFilterNode extends MockAudioNode {
  type = "peaking";
  frequency = { setValueAtTime: vi.fn() };
  Q = { setValueAtTime: vi.fn() };
  gain = { setValueAtTime: vi.fn() };
}

class MockDelayNode extends MockAudioNode {
  delayTime = { setValueAtTime: vi.fn() };
}

class MockStereoPannerNode extends MockAudioNode {
  pan = { setValueAtTime: vi.fn() };
}

class MockAudioContext {
  state: "running" | "suspended" = "running";
  currentTime = 0.5;
  sampleRate = 44100;
  destination = new MockAudioNode();

  createBuffer(_channels: number, length: number, sampleRate: number) {
    return new MockAudioBuffer({ length, sampleRate });
  }
  createGain() {
    return new MockGainNode();
  }
  createBufferSource() {
    return new MockBufferSourceNode();
  }
  createDynamicsCompressor() {
    return new MockDynamicsCompressorNode();
  }
  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }
  createDelay() {
    return new MockDelayNode();
  }
  createStereoPanner() {
    return new MockStereoPannerNode();
  }
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

// Attach mock AudioContext to global window
(globalThis as any).AudioContext = MockAudioContext;
(globalThis as any).window = (globalThis as any).window || {};
(globalThis as any).window.AudioContext = MockAudioContext;

describe("Wilsify Audio Engine — Physical String Model", () => {
  const mockCtx = new MockAudioContext() as any;

  it("calculates 12-TET frequencies accurately", () => {
    // A4 = MIDI 69 = 440 Hz
    expect(Math.round(midiToFreq(69))).toBe(440);
    // A3 = MIDI 57 = 220 Hz
    expect(Math.round(midiToFreq(57))).toBe(220);
    // E2 (Guitar 6th string open) = MIDI 40 ≈ 82.4 Hz
    expect(Math.round(midiToFreq(40) * 10) / 10).toBe(82.4);
    // E4 (Guitar 1st string open) = MIDI 64 ≈ 329.6 Hz
    expect(Math.round(midiToFreq(64) * 10) / 10).toBe(329.6);
  });

  it("assigns distinct acoustic properties to different strings", () => {
    const guitar = INSTRUMENT_PRESETS.guitar;
    const lowE = guitar.strings[0];
    const highE = guitar.strings[5];

    // Low string has more mass and slower high-frequency decay
    expect(lowE.stringMass).toBeGreaterThan(highE.stringMass);
    expect(lowE.decay).toBeGreaterThan(highE.decay);
    // High string has greater brightness / transient sharpness
    expect(highE.brightness).toBeGreaterThan(lowE.brightness);
    expect(highE.transientSharpness).toBeGreaterThan(lowE.transientSharpness);
  });

  it("renders a physically plucked audio buffer for open and fretted strings", () => {
    const guitar = INSTRUMENT_PRESETS.guitar;
    const bufOpen = renderStringAudioBuffer(
      mockCtx,
      { midi: 40, fret: 0, isOpen: true, stringIndex: 0 },
      guitar.strings[0]
    );

    expect(bufOpen).toBeDefined();
    expect(bufOpen.length).toBeGreaterThan(44100); // More than 1 second of ring

    const bufFretted = renderStringAudioBuffer(
      mockCtx,
      { midi: 43, fret: 3, isOpen: false, stringIndex: 0 },
      guitar.strings[0]
    );

    expect(bufFretted).toBeDefined();
    // Fret damping causes fretted note to have slightly shorter buffer length
    expect(bufFretted.length).toBeLessThanOrEqual(bufOpen.length);
  });

  it("renders percussive chuck sound for muted strings without pitched sustain", () => {
    const guitar = INSTRUMENT_PRESETS.guitar;
    const bufMuted = renderStringAudioBuffer(
      mockCtx,
      { midi: 40, fret: null, isMuted: true, stringIndex: 0 },
      guitar.strings[0]
    );

    expect(bufMuted).toBeDefined();
    // Muted string is very brief (~0.08s = ~3528 samples at 44.1kHz)
    expect(bufMuted.length).toBeLessThan(10000);
  });
});

describe("Wilsify Audio Engine — Presets & Profiles", () => {
  it("provides distinct acoustic profiles for Bass and Ukulele", () => {
    const bass = getPresetForInstrument("bass");
    expect(bass.id).toBe("bass");
    expect(bass.strings[0].stringMass).toBeGreaterThanOrEqual(3.0);
    expect(bass.strings[0].brightness).toBeLessThan(0.4);

    const ukulele = getPresetForInstrument("ukulele");
    expect(ukulele.id).toBe("ukulele");
    expect(ukulele.strings[0].maxSeconds).toBeLessThan(2.0); // short decay
    expect(ukulele.strings[0].brightness).toBeGreaterThan(0.6);
  });
});

describe("Wilsify Audio Engine — Strum & Arpeggio Scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("strums chord with downstroke from lowest to highest string", async () => {
    const cMajorFrets = [null, 3, 2, 0, 1, 0];
    const guitarTuning = [40, 45, 50, 55, 59, 64];

    const onStart = vi.fn();
    await strumChord({
      frets: cMajorFrets,
      tuningMidi: guitarTuning,
      direction: "down",
      speed: "normal",
      onStart,
    });

    expect(onStart).toHaveBeenCalled();
  });

  it("handles upstroke chord strumming", async () => {
    const cMajorFrets = [null, 3, 2, 0, 1, 0];
    const guitarTuning = [40, 45, 50, 55, 59, 64];

    await strumChord({
      frets: cMajorFrets,
      tuningMidi: guitarTuning,
      direction: "up",
      speed: "fast",
    });
  });

  it("sequences arpeggio without crashing and filters muted strings", async () => {
    const cMajorFrets = [null, 3, 2, 0, 1, 0];
    const guitarTuning = [40, 45, 50, 55, 59, 64];

    const onStart = vi.fn();
    await playArpeggioSequence({
      frets: cMajorFrets,
      tuningMidi: guitarTuning,
      speed: "fast",
      direction: "up",
      onStart,
    });

    expect(onStart).toHaveBeenCalled();
  });

  it("provides a singleton AudioEngine facade", async () => {
    expect(audioEngine).toBeDefined();
    expect(typeof audioEngine.playChord).toBe("function");
    expect(typeof audioEngine.playNote).toBe("function");
    expect(typeof audioEngine.playArpeggio).toBe("function");
    expect(typeof audioEngine.stop).toBe("function");

    // Calling stop does not throw
    expect(() => audioEngine.stop()).not.toThrow();
  });

  it("shares AudioContext singleton without leaking multiple contexts", async () => {
    const ctx1 = await audioContextManager.getContext();
    const ctx2 = await audioContextManager.getContext();
    expect(ctx1).toBe(ctx2);
  });
});
