import { describe, expect, it } from "vitest";
import { TARGET_PEAK, renderStringAudioBuffer } from "./KarplusStrong";
import { INSTRUMENT_PRESETS, getPresetForInstrument, profileForMidi } from "./AudioPresets";

type Plucked = "guitar" | "bass" | "ukulele" | "mandolin" | "banjo";

function fakeCtx(sr = 44100) {
  return {
    sampleRate: sr,
    createBuffer: (_c: number, len: number) => {
      const d = new Float32Array(len);
      return { length: len, getChannelData: () => d };
    },
  } as unknown as AudioContext;
}

const render = (id: Plucked, midi: number, velocity = 0.8, fret = 0) => {
  const preset = getPresetForInstrument(id);
  return renderStringAudioBuffer(fakeCtx(), { midi, fret, isOpen: fret === 0, velocity, instrument: id }, profileForMidi(preset, midi)).getChannelData(0);
};
const peak = (d: Float32Array) => d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe("strings are loud and bright enough", () => {
  it("every string on every plucked instrument is rendered at the same strong peak level (nothing quiet)", () => {
    const cases: [Plucked, number[]][] = [
      ["guitar", [40, 45, 50, 55, 59, 64, 67, 76]],
      ["bass", [28, 33, 38, 43]],
      ["ukulele", [60, 64, 67, 69]],
      ["mandolin", [55, 62, 69, 76]],
      ["banjo", [50, 55, 59, 62, 67]],
    ];
    for (const [id, midis] of cases) for (const midi of midis) expect(peak(render(id, midi)), `${id} ${midi}`).toBeCloseTo(TARGET_PEAK, 2);
    // a soft touch and a hard one reach the same peak in the buffer; the difference is carried by the voice gain
    expect(peak(render("guitar", 55, 0.3))).toBeCloseTo(peak(render("guitar", 55, 1)), 2);
  });

  it("the guitar keeps its highs: a bright pick attack and plenty of high-frequency energy", () => {
    const d = render("guitar", 64); // the high E string
    const n = 4410; // first 100 ms
    let energy = 0;
    let highEnergy = 0;
    for (let i = 1; i < n; i++) {
      energy += d[i] * d[i];
      const diff = d[i] - d[i - 1];
      highEnergy += diff * diff;
    }
    // first-difference energy over total energy grows with high-frequency content; a dull tone sits well below this
    expect(highEnergy / energy).toBeGreaterThan(0.1);
    let attack = 0;
    for (let i = 0; i < 530; i++) attack = Math.max(attack, Math.abs(d[i]));
    expect(attack).toBeGreaterThan(0.4);
  });

  it("notes ring for a natural time: an open guitar string lasts several seconds and a fretted one is shorter", () => {
    const open = render("guitar", 40, 0.8, 0);
    const fretted = render("guitar", 52, 0.8, 12);
    expect(open.length / 44100).toBeGreaterThan(3.5);
    expect(fretted.length).toBeLessThan(open.length);
  });

  it("the guitar body resonates in the lows and the highs: a deep body boost and pick presence", () => {
    const body = INSTRUMENT_PRESETS.guitar.bodyResonanceFreqs;
    expect(body.some((f) => f.freq < 120 && f.gainDb >= 4)).toBe(true);
    expect(body.some((f) => f.freq > 3000 && f.gainDb >= 2.5)).toBe(true);
  });
});
