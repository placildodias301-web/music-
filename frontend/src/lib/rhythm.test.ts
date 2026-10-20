import { describe, it, expect } from "vitest";
import { resetRhythm, tapTempo, withTempo } from "./rhythm";
import type { AnalysisResult } from "./api";

const taps = (bpm: number, n: number, jitterMs: number[] = []) =>
  Array.from({ length: n }, (_, i) => i * (60000 / bpm) + (jitterMs[i] ?? 0));

describe("tapTempo", () => {
  it("needs 4 taps", () => {
    expect(tapTempo(taps(90, 3))).toBeNull();
    expect(tapTempo(taps(90, 4))).toBe(90);
  });

  it("shrugs off one sloppy tap (median, not mean)", () => {
    expect(tapTempo(taps(86, 8, [0, 0, 0, 180, 0, 0, 0, 0]))).toBeCloseTo(86, 0);
  });

  it("follows the latest taps when the user speeds up", () => {
    const slow = taps(60, 6);
    const fast = taps(120, 10).map((t) => t + slow[slow.length - 1] + 500);
    expect(tapTempo([...slow, ...fast])).toBe(120);
  });

  it("rejects tempos no song has", () => {
    expect(tapTempo(taps(400, 6))).toBeNull();
  });
});

function song(): AnalysisResult {
  return {
    bpm: 154.8,
    bpmStatus: "estimated",
    durationSeconds: 10,
    beatsPerBar: 4,
    beats: [0.5, 0.888, 1.275, 1.663, 2.05],
    downbeats: [0.5, 2.05],
  } as AnalysisResult;
}

describe("withTempo", () => {
  it("halving rebuilds an even grid on the first downbeat and keeps the original to reset to", () => {
    const next = withTempo(song(), 77.4);
    expect(next.bpm).toBe(77.4);
    expect(next.bpmStatus).toBe("confirmed");
    const gap = 60 / 77.4;
    expect(next.beats![1] - next.beats![0]).toBeCloseTo(gap, 2);
    expect(next.beats).toContain(0.5); // anchored on the detected downbeat
    expect(next.downbeats![1] - next.downbeats![0]).toBeCloseTo(4 * gap, 2);
    expect(next.beats![next.beats!.length - 1]).toBeLessThanOrEqual(10);

    const reset = resetRhythm(next);
    expect(reset.bpm).toBe(154.8);
    expect(reset.bpmStatus).toBe("estimated");
    expect(reset.beats).toEqual(song().beats);
  });

  it("a second correction still resets to the analyser's value, not the first correction", () => {
    const twice = withTempo(withTempo(song(), 77.4), 80);
    expect(resetRhythm(twice).bpm).toBe(154.8);
  });
});
