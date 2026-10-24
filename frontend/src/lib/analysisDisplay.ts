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

/** True when the analysis has a tempo to show (the pipeline reports none for music without a clear pulse). */
export function hasTempo(analysis: Pick<AnalysisResult, "bpm" | "bpmStatus">): boolean {
  return analysis.bpmStatus !== "unavailable" && analysis.bpm > 0;
}

/** The BPM as shown in cards and lists: "—" when there is no tempo. */
export function formatBpm(analysis: Pick<AnalysisResult, "bpm" | "bpmStatus">): string {
  return hasTempo(analysis) ? `${Math.round(analysis.bpm)}` : "—";
}

/** Line under the BPM: how the tempo was found (never a list of guesses). */
export function tempoNote(analysis: AnalysisResult): string {
  if (analysis.bpmStatus === "confirmed") return "Set by you";
  if (!hasTempo(analysis)) return "No clear beat detected";
  // No steady drum pulse: the analyser worked it out from the rhythm and the chord cycle.
  if (analysis.bpmStatus === "estimated" || analysis.bpmStatus === "low_confidence") return "Estimated from rhythm and chord changes";
  return analysis.beats?.length ? `${analysis.beats.length} beats tracked` : "Auto beat tracking";
}

/** "4/4", "3/4", "5/4", "6/8", ... as detected; "—" when the pipeline found no confident meter. */
export function timeSignatureValue(analysis: AnalysisResult): string {
  if (!analysis.timeSignature && analysis.timeSignatureStatus === "unavailable") return "—";
  return analysis.timeSignature || "4/4";
}

export function timeSignatureNote(analysis: AnalysisResult): string {
  if (analysis.timeSignatureStatus === "confirmed") return "Set by you";
  if (!analysis.timeSignature && analysis.timeSignatureStatus === "unavailable") return "No confident meter detected";
  return "Estimated from beat accents";
}
