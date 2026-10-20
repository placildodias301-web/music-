import { describe, expect, it } from "vitest";
import { detectLanes, laneGain, peaksOf, rmsDb } from "./stemMixer";

describe("stem mixer maths", () => {
  it("measures RMS in dBFS", () => {
    expect(rmsDb(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(0, 5);
    expect(rmsDb(new Float32Array([0.5, 0.5]))).toBeCloseTo(-6.02, 1);
    expect(rmsDb(new Float32Array(10))).toBe(-Infinity);
  });
  it("only reports a layer as present when it is audible and not buried", () => {
    // vocals loud, bass present, highs buried (-60 dB below), sides silent
    expect(detectLanes([-15, -22, -75, -Infinity])).toEqual([true, true, false, false]);
    // everything very quiet: nothing is "audible" even relative to itself
    expect(detectLanes([-70, -72, -80, -90])).toEqual([false, false, false, false]);
    // a mono file: identical mid, no sides
    expect(detectLanes([-20, -30, -45, -Infinity]).filter(Boolean).length).toBe(3);
  });
  it("applies mute / solo / volume to the gain", () => {
    expect(laneGain(80, false, false, false)).toBe(1);
    expect(laneGain(40, false, false, false)).toBe(0.5);
    expect(laneGain(100, false, false, false)).toBeCloseTo(1.25);
    expect(laneGain(80, true, false, false)).toBe(0);
    expect(laneGain(80, false, false, true)).toBe(0); // someone else is soloed
    expect(laneGain(80, false, true, true)).toBe(1);
  });
  it("normalises waveform peaks", () => {
    const p = peaksOf(new Float32Array([0, 0.5, 0, 1, 0, 0.25, 0, 0]), 4);
    expect(Math.max(...p)).toBe(1);
    expect(p).toHaveLength(4);
  });
});
