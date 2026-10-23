import { describe, expect, it } from "vitest";
import { renderStringAudioBuffer, midiToFreq } from "./KarplusStrong";
import { INSTRUMENT_PRESETS } from "./AudioPresets";

/** A minimal AudioContext: just enough for the string renderer to fill a Float32Array. */
function fakeCtx(sr = 44100) {
  return {
    sampleRate: sr,
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    },
  } as unknown as AudioContext;
}

/** Fundamental by autocorrelation with a parabolic peak, so the measurement is finer than one sample. */
function measure(data: Float32Array, sr: number, expected: number): number {
  const n = 6000;
  const start = 2000;
  const lo = Math.floor(sr / (expected * 1.4));
  const hi = Math.ceil(sr / (expected * 0.7));
  const corr: number[] = [];
  for (let lag = lo - 1; lag <= hi + 1; lag++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += data[start + i] * data[start + i + lag];
    corr.push(s);
  }
  let k = 1;
  for (let i = 1; i < corr.length - 1; i++) if (corr[i] > corr[k]) k = i;
  const a = corr[k - 1];
  const b = corr[k];
  const c = corr[k + 1];
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return sr / (lo - 1 + k + shift);
}

describe("every fret plays its own, in-tune pitch", () => {
  it("renders each fret from the low E string within 12 cents of the right note and strictly rising", () => {
    const sr = 44100;
    let last = 0;
    for (let midi = 40; midi <= 88; midi++) {
      const buf = renderStringAudioBuffer(fakeCtx(sr), { midi, fret: midi - 40, stringIndex: 0, instrument: "guitar" }, INSTRUMENT_PRESETS.guitar.strings[0]);
      const f = measure(buf.getChannelData(0), sr, midiToFreq(midi));
      const cents = 1200 * Math.log2(f / midiToFreq(midi));
      expect(Math.abs(cents), `midi ${midi}`).toBeLessThan(12);
      expect(f, `midi ${midi}`).toBeGreaterThan(last);
      last = f;
    }
  });
});
