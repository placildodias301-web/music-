/**
 * Data model for the Lyrics + Chords song view.
 *
 * Chords are never stored as padded spaces: every chord carries the time it
 * changes (`time`) and the character it sits above (`charIndex`), so the
 * renderer can attach it to its lyric position at any width, font size or zoom.
 */

export interface ChordEvent {
  /** Chord exactly as analysed ("Bbmaj7", "C/E"). Never altered by transpose/simplify. */
  originalChord: string;
  /** Seconds into the audio when this chord starts. Never altered by transpose. */
  time: number;
  /** End of this chord (next change or end of line). */
  endTime: number;
  /** Index into the line's text of the character the chord sits above. */
  charIndex: number;
  /** 0–1, carried from the analysis when available. */
  confidence?: number;
  /** True when this chord started before the line and is only held into it. */
  carried?: boolean;
}

export interface LyricWord {
  word: string;
  start: number;
  end: number;
  /** Offset of the word inside the line text. */
  charStart: number;
}

export interface LyricLine {
  id: string;
  text: string;
  /** null while the line has no timing yet (plain pasted lyrics). */
  startTime: number | null;
  endTime: number | null;
  /** Word-level timing when the lyric source has it. */
  words?: LyricWord[];
  /** Chords with no lyric (intro/solo/instrumental bars). */
  instrumental?: boolean;
  chords: ChordEvent[];
}

export type SectionKind = "Intro" | "Verse" | "Pre-Chorus" | "Chorus" | "Bridge" | "Solo" | "Outro" | "Instrumental" | "Section";

export interface SongSection {
  id: string;
  /** "Verse 1", "Chorus", "Section A" … */
  name: string;
  kind: SectionKind;
  /** How the name was decided: written by the user, or inferred (repetition). */
  nameSource: "user" | "inferred";
  lines: LyricLine[];
  startTime: number | null;
  endTime: number | null;
}

export interface ParsedLyricLine {
  text: string;
  startTime: number | null;
  words?: { word: string; start: number; end: number }[];
}

export interface ParsedLyricSection {
  name: string | null;
  lines: ParsedLyricLine[];
}

export interface ParsedLyrics {
  sections: ParsedLyricSection[];
  /** true when every lyric line has a start time (LRC or tap-synced). */
  timed: boolean;
  format: "lrc" | "plain";
}
