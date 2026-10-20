/**
 * Explains the analysis' difficulty label in plain language, using the same
 * factors the backend scored (so the reasons always match the label).
 */
import type { AnalysisResult } from "../api";
import { parseChordSymbol } from "../chordTheory";

const EXTENDED = /maj7|m7|7|9|11|13|sus|dim|aug|add/;
const OPEN = new Set(["C", "D", "E", "G", "A", "Am", "Dm", "Em", "D7", "E7", "A7", "G7", "C7", "B7"]);

export interface DifficultyExplanation {
  label: AnalysisResult["difficulty"]["difficultyLabel"];
  reasons: string[];
  uniqueChords: number;
  barreChords: number;
  extendedChords: number;
  changesPerMinute: number;
}

export function explainDifficulty(analysis: AnalysisResult): DifficultyExplanation {
  const timeline = analysis.chordTimeline;
  const unique = [...new Set(timeline.map((s) => s.chord))];
  const base = (s: string) => s.replace(/\/[A-G][#b♯♭]?$/, "");
  const extended = unique.filter((c) => EXTENDED.test(parseChordSymbol(c).quality.suffix || "") && !OPEN.has(base(c))).length;
  const barre = unique.filter((c) => !OPEN.has(base(c))).length;
  const minutes = Math.max(analysis.durationSeconds / 60, 1 / 60);
  const cpm = timeline.length / minutes;

  const reasons: string[] = [];
  reasons.push(`${unique.length} different chord${unique.length === 1 ? "" : "s"} in the song${unique.length <= 4 ? " (a small set to learn)" : unique.length >= 8 ? " (a lot to keep track of)" : ""}.`);
  if (barre) reasons.push(`${barre} of them aren't open-position shapes and need a barre or a higher position.`);
  if (extended) reasons.push(`${extended} extended chord${extended === 1 ? "" : "s"} (7ths, sus, add and similar).`);
  reasons.push(`About ${Math.round(cpm)} chord changes a minute${cpm > 30 ? " — fast changes" : cpm < 12 ? " — plenty of time to change" : ""}.`);
  reasons.push(`Tempo ${Math.round(analysis.bpm)} BPM${analysis.bpm >= 130 ? " (fast)" : analysis.bpm <= 80 ? " (slow, forgiving)" : ""}.`);
  return { label: analysis.difficulty.difficultyLabel, reasons, uniqueChords: unique.length, barreChords: barre, extendedChords: extended, changesPerMinute: Math.round(cpm) };
}
