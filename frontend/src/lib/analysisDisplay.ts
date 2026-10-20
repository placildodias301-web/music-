/**
 * Wording and colours for the Analysis page's summary (badges + stat
 * cards), shared with the PDF lead sheet so both always say the same thing.
 */

import type { AnalysisResult } from "./api";

export const DIFFICULTY_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  Beginner: { bg: "rgba(98, 214, 167, 0.12)", text: "#62D6A7", border: "rgba(98, 214, 167, 0.3)" },
  Intermediate: { bg: "rgba(244, 184, 74, 0.12)", text: "#F4B84A", border: "rgba(244, 184, 74, 0.3)" },
  Advanced: { bg: "rgba(255, 101, 120, 0.12)", text: "#FF6578", border: "rgba(255, 101, 120, 0.3)" },
};

export const DEFAULT_DIFFICULTY_BADGE = {
  bg: "rgba(77, 163, 255, 0.12)",
  text: "var(--color-ns-blue)",
  border: "rgba(77, 163, 255, 0.3)",
};

/** Turns the key confidence (0–1) into a label; null for analyses saved before v2. */
export function describeKeyConfidence(analysis: AnalysisResult) {
  if (analysis.keyConfidence === undefined) return null;
  const c = analysis.keyConfidence;
  if (c >= 0.75) return { label: "High confidence", className: "text-[var(--color-ns-mint)]", alternative: null };
  const alternative = analysis.keyAlternatives?.[0]?.key ?? null;
  if (c >= 0.45) return { label: "Moderate confidence", className: "text-[var(--color-ns-muted)]", alternative };
  return { label: "Low confidence", className: "text-[var(--color-ns-amber)]", alternative };
}

/** Line under the BPM: how the tempo was found (never a list of guesses). */
export function tempoNote(analysis: AnalysisResult): string {
  if (analysis.bpmStatus === "confirmed") return "Set by you";
  // No steady drum pulse: the analyser worked it out from the rhythm and the chord cycle.
  if (analysis.bpmStatus === "estimated" || analysis.bpmStatus === "low_confidence") return "Estimated from rhythm and chord changes";
  return analysis.beats?.length ? `${analysis.beats.length} beats tracked` : "Auto beat tracking";
}

export function timeSignatureValue(analysis: AnalysisResult): string {
  return analysis.timeSignature || "4/4";
}

export function timeSignatureNote(analysis: AnalysisResult): string {
  if (analysis.timeSignatureStatus === "confirmed") return "Set by you";
  return "Estimated from beat accents";
}
