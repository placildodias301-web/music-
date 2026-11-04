/**
 * The one way a chord & lyric sheet is built, shared by the full sheet
 * (/song/:id) and the preview on the Analysis page:
 *   saved analysis + user chord corrections + the song's lyrics → sections.
 * Nothing here re-analyses audio.
 */
import type { AnalysisResult } from "../api";
import { DEFAULT_LOW_CONFIDENCE } from "../chordSync";
import { applyChordEdits, type ChordEdit, type EditedSegment } from "./chordEdits";
import type { ParsedLyrics, SongSection } from "./model";
import { buildSongSections } from "./sections";

export interface SheetData {
  /** The analysis with corrections applied to its chord timeline (the stored analysis is untouched). */
  analysis: Omit<AnalysisResult, "chordTimeline"> & { chordTimeline: EditedSegment[] };
  sections: SongSection[];
  hasLyrics: boolean;
  /** Detected chords below the low-confidence threshold that the user hasn't corrected. */
  uncertainCount: number;
}

export function buildSheet(analysis: AnalysisResult, edits: ChordEdit[], lyrics: ParsedLyrics | null): SheetData {
  const chordTimeline = applyChordEdits(analysis.chordTimeline, edits, analysis.durationSeconds);
  const edited = { ...analysis, chordTimeline };
  const threshold = analysis.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE;
  return {
    analysis: edited,
    sections: buildSongSections(edited, lyrics),
    hasLyrics: Boolean(lyrics?.sections.some((s) => s.lines.some((l) => l.text.trim()))),
    uncertainCount: chordTimeline.filter((s) => !s.edited && (s.confidence ?? 1) < threshold).length,
  };
}

/** Where the full sheet for a song lives: its Library id when saved, else the session's current song. */
export function sheetPath(libraryId: string | null | undefined, seconds?: number | null): string {
  const base = libraryId ? `/song/${encodeURIComponent(libraryId)}` : "/song/current";
  return typeof seconds === "number" && Number.isFinite(seconds) ? `${base}?t=${Math.max(0, Math.round(seconds * 10) / 10)}` : base;
}
