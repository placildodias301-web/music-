/**
 * User tempo corrections. The analyser's original values are kept in
 * `detectedRhythm` the first time the user changes the tempo, so "Reset to
 * detected" can always restore them.
 */

import type { AnalysisResult } from "./api";

export function resetRhythm(analysis: AnalysisResult): AnalysisResult {
  if (!analysis.detectedRhythm) return analysis;
  const { detectedRhythm, ...rest } = analysis;
  return { ...rest, ...detectedRhythm };
}

export const MIN_BPM = 30;
export const MAX_BPM = 300;

/**
 * Sets the tempo by hand and rebuilds an even beat grid at it, anchored on
 * the first detected downbeat (or beat), so the chord timeline, metronome and
 * lead sheet stay in step with the new tempo.
 */
export function withTempo(analysis: AnalysisResult, bpm: number): AnalysisResult {
  const clamped = Math.min(MAX_BPM, Math.max(MIN_BPM, bpm));
  const detectedRhythm = analysis.detectedRhythm ?? {
    bpm: analysis.bpm,
    bpmStatus: analysis.bpmStatus,
    bpmAlternatives: analysis.bpmAlternatives,
    beats: analysis.beats,
    downbeats: analysis.downbeats,
    beatsPerBar: analysis.beatsPerBar,
    timeSignature: analysis.timeSignature,
    timeSignatureStatus: analysis.timeSignatureStatus,
  };

  const period = 60 / clamped;
  const end = analysis.durationSeconds ?? analysis.beats?.at(-1) ?? 0;
  const anchor = analysis.downbeats?.[0] ?? analysis.beats?.[0] ?? 0;
  const first = anchor - Math.floor(anchor / period) * period;
  const beats: number[] = [];
  for (let t = first; t <= end + 1e-6; t += period) beats.push(Math.round(t * 1000) / 1000);

  const perBar = analysis.beatsPerBar ?? 4;
  const anchorIndex = Math.round((anchor - first) / period);
  const downbeats = beats.filter((_, i) => (i - anchorIndex) % perBar === 0);

  return {
    ...analysis,
    detectedRhythm,
    bpm: Math.round(clamped * 10) / 10,
    bpmStatus: "confirmed",
    bpmAlternatives: undefined,
    beats,
    downbeats,
  };
}

/** Taps further apart than this start a new measurement. */
export const TAP_RESET_MS = 2000;
/** Taps needed before a tempo is shown. */
export const MIN_TAPS = 4;

/**
 * BPM from tap times (ms, oldest first): the median of the last 8 gaps, so
 * one early or late tap doesn't skew it. null until there are enough taps.
 */
export function tapTempo(times: number[]): number | null {
  if (times.length < MIN_TAPS) return null;
  const recent = times.slice(-9);
  const sorted = recent.slice(1).map((t, i) => t - recent[i]).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (median <= 0) return null;
  const bpm = 60000 / median;
  return bpm >= MIN_BPM && bpm <= MAX_BPM ? Math.round(bpm * 10) / 10 : null;
}
