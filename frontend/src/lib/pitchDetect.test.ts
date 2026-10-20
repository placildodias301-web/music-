import { describe, it, expect } from "vitest";
import { detectPitch, INSTRUMENT_RANGES } from "./pitchDetect";

const SR = 48000;
const N = 4096; // the Tuner's analyser size
const range = (id: string) => INSTRUMENT_RANGES.find((r) => r.id === id)!;
const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

/** A string-like tone: fundamental plus decaying harmonics, optional room noise. */
function tone(freq: number, harmonics = [1, 0.8, 0.6, 0.4, 0.3, 0.2], noise = 0, phase = 0, seed = 7): Float32Array {
  const buf = new Float32Array(N);
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let i = 0; i < N; i++) {
    let v = 0;
    harmonics.forEach((amp, k) => (v += amp * Math.sin((2 * Math.PI * freq * (k + 1) * (i + phase)) / SR)));
    buf[i] = 0.3 * v + noise * rand();
  }
  return buf;
}

describe("detectPitch (YIN)", () => {
  // Every open string of every tuning the Settings page offers, plus bass.
  const cases: [string, string, number][] = [
    ["guitar", "E2", 82.41], ["guitar", "A2", 110], ["guitar", "D3", 146.83],
    ["guitar", "G3", 196], ["guitar", "B3", 246.94], ["guitar", "E4", 329.63],
    ["guitar", "D2 (Drop D / DADGAD / Open G)", 73.42], ["guitar", "D#2 (half-step down)", 77.78],
    ["guitar", "C2 (Drop C)", 65.41],
    ["bass", "E1", 41.2], ["bass", "A1", 55], ["bass", "D2", 73.42], ["bass", "G2", 98],
    ["violin", "G3", 196], ["violin", "E5", 659.26],
  ];

  it.each(cases)("%s %s reads within 1 cent", (id, _name, freq) => {
    const result = detectPitch(tone(freq), SR, range(id));
    expect(result).not.toBeNull();
    expect(Math.abs(cents(result!.frequency, freq))).toBeLessThan(1);
  });

  it("measures a detuned string exactly (so 'in tune' means in tune)", () => {
    for (const offset of [-20, -4, 4, 20]) {
      const f = 110 * 2 ** (offset / 1200);
      const result = detectPitch(tone(f, undefined, 0, 137), SR, range("guitar"))!;
      expect(Math.abs(cents(result.frequency, 110) - offset)).toBeLessThan(1);
    }
  });

  it("reads a pure sine (tone generator / tuning fork) on low strings", () => {
    for (const f of [82.41, 110]) {
      const result = detectPitch(tone(f, [1]), SR, range("guitar"));
      expect(result).not.toBeNull();
      expect(Math.abs(cents(result!.frequency, f))).toBeLessThan(1);
    }
  });

  it("doesn't jump an octave when the 2nd harmonic is louder than the fundamental", () => {
    const result = detectPitch(tone(82.41, [0.4, 1, 0.5, 0.3]), SR, range("guitar"))!;
    expect(Math.abs(cents(result.frequency, 82.41))).toBeLessThan(1);
  });

  it("stays within 3 cents in loud room noise once the Tuner's 5-frame median is applied", () => {
    // ~10 dB SNR. Single frames wobble a few cents; the Tuner shows the median of 5.
    const readings = [0, 211, 397, 613, 829].map((phase) => {
      const r = detectPitch(tone(82.41, undefined, 0.3, phase, phase + 1), SR, range("guitar"))!; // fresh noise each frame
      return cents(r.frequency, 82.41);
    });
    const median = readings.sort((a, b) => a - b)[2];
    expect(Math.abs(median)).toBeLessThan(3);
  });

  it("ignores silence and pure noise", () => {
    expect(detectPitch(new Float32Array(N), SR, range("guitar"))).toBeNull();
    const noise = tone(0, [], 0.4);
    expect(detectPitch(noise, SR, range("guitar"))).toBeNull();
  });

  it("works at 44.1 kHz too", () => {
    const sr = 44100;
    const buf = new Float32Array(N).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 82.41 * i) / sr) + 0.2 * Math.sin((2 * Math.PI * 164.82 * i) / sr));
    const result = detectPitch(buf, sr, range("guitar"))!;
    expect(Math.abs(cents(result.frequency, 82.41))).toBeLessThan(1);
  });
});
