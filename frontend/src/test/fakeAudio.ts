/**
 * Audio / microphone doubles for the browser APIs jsdom does not implement:
 * AudioContext, getUserMedia, URL.createObjectURL and media playback.
 */
import { vi } from "vitest";

export interface FakeAudioWorld {
  contexts: FakeAudioContext[];
  tracks: { stop: ReturnType<typeof vi.fn> }[];
  getUserMedia: ReturnType<typeof vi.fn>;
  analyserReads: { count: number };
}

export class FakeAudioContext {
  static world: FakeAudioWorld | null = null;
  state: "running" | "suspended" | "closed" = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  close = vi.fn(async () => {
    this.state = "closed";
  });
  resume = vi.fn(async () => {});
  constructor() {
    FakeAudioContext.world?.contexts.push(this);
  }
  private node() {
    return { connect: (n: unknown) => n ?? {}, disconnect: () => {}, start: () => {}, stop: () => {}, frequency: param(), gain: param(), type: "", buffer: null };
  }
  createGain() {
    return this.node();
  }
  createOscillator() {
    return this.node();
  }
  createBufferSource() {
    return this.node();
  }
  createBiquadFilter() {
    return this.node();
  }
  createBuffer(_c: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createMediaStreamSource() {
    return this.node();
  }
  createAnalyser() {
    const world = FakeAudioContext.world;
    return {
      fftSize: 2048,
      connect: () => {},
      // Silence: nothing is "played", so pitch detection reports no note.
      getFloatTimeDomainData: (buf: Float32Array) => {
        if (world) world.analyserReads.count += 1;
        buf.fill(0);
      },
    };
  }
}

function param() {
  return { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} };
}

/** Installs fakes; returns handles tests can assert on. */
export function installFakeAudio(): FakeAudioWorld {
  const world: FakeAudioWorld = {
    contexts: [],
    tracks: [],
    analyserReads: { count: 0 },
    getUserMedia: vi.fn(async () => {
      const track = { stop: vi.fn() };
      world.tracks.push(track);
      return { getTracks: () => [track] } as unknown as MediaStream;
    }),
  };
  FakeAudioContext.world = world;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: world.getUserMedia }, configurable: true });

  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();

  // jsdom's media elements throw "not implemented" for these.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  return world;
}
