import type { AnalysisResult } from "../lib/api";
import { saveToLibrary, type SavedAnalysis } from "../lib/library";

export const SONG_FILE = "core_loop_test.mp3";

export function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    fileName: SONG_FILE,
    chordProgression: ["C", "G", "Am", "F"],
    key: "C",
    mode: "major",
    scale: "Major",
    demoNotice: null,
    fileSizeBytes: 2048,
    processingSeconds: 1.2,
    difficulty: {
      difficultyLabel: "Beginner",
      difficultyScore: 20,
      factors: { chordComplexity: 10, chordChangeRate: 20, tempo: 30, modulation: 0 },
    },
    bpm: 120,
    timeSignature: "4/4",
    duration: "0:08",
    durationSeconds: 8,
    isDemo: false,
    chordTimeline: [
      { chord: "C", start: 0, end: 2, confidence: 0.95 },
      { chord: "G", start: 2, end: 4, confidence: 0.92 },
      { chord: "Am", start: 4, end: 6, confidence: 0.88 },
      { chord: "F", start: 6, end: 8, confidence: 0.94 },
    ],
    ...overrides,
  };
}

/** Puts a finished analysis in the Library exactly as a successful upload would. */
export function seedSong(fileName = SONG_FILE, overrides: Partial<AnalysisResult> = {}): SavedAnalysis {
  return saveToLibrary(fileName, makeAnalysis({ fileName, ...overrides }));
}

export function audioFile(name = SONG_FILE, bytes = 2048, type = "audio/mpeg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}
