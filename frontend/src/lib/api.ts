/**
 * Client for the Wilsify AI MVP backend (Python/FastAPI, `backend/`).
 *
 * POST /api/analyze does REAL audio analysis (librosa) — the file you send
 * is genuinely decoded and analyzed, not matched against canned data.
 */

export const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface ChordSegment {
  chord: string;
  start: number;
  end: number;
}

export interface DifficultyResult {
  difficultyLabel: "Beginner" | "Intermediate" | "Advanced";
  difficultyScore: number;
  factors: {
    chordComplexity: number;
    chordChangeRate: number;
    tempo: number;
    modulation: number;
  };
}

export interface AnalysisResult {
  isDemo: boolean;
  demoNotice: string | null;
  fileName: string;
  fileSizeBytes: number;
  processingSeconds: number;
  key: string;
  mode: string;
  scale: string;
  bpm: number;
  timeSignature: string;
  durationSeconds: number;
  duration: string;
  chordProgression: string[];
  chordTimeline: ChordSegment[];
  difficulty: DifficultyResult;
}

export interface AssistantResult {
  answer: string;
  isDemo: boolean;
  matchedTopic: string | null;
}

export interface SongContext {
  fileName: string;
  key: string;
  bpm: number;
  timeSignature: string;
  chordProgression: string[];
  difficultyLabel?: string;
  weakChords?: string[];
}

async function parseJsonOrThrow(res: Response) {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore — body wasn't JSON
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return body;
}

/**
 * Uploads and analyzes an audio or video file in one call. Real analysis —
 * the file is decoded (ffmpeg) and processed (librosa) server-side.
 */
export async function analyzeFile(file: File): Promise<AnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/api/analyze`, {
    method: "POST",
    body: formData,
  });

  return parseJsonOrThrow(res) as Promise<AnalysisResult>;
}

/**
 * Asks the AI Assistant a question. When `context` is provided, the
 * assistant grounds its answer in the actual detected song data (its
 * chords, key, tempo, and the user's logged weak chords) instead of
 * answering generically — Section 4.4 of the spec.
 */
export async function askAssistant(question: string, context?: SongContext | null): Promise<AssistantResult> {
  const res = await fetch(`${API_URL}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, context: context ?? null }),
  });

  return parseJsonOrThrow(res) as Promise<AssistantResult>;
}

/** Downloads the detected chord progression as a real, playable .mid file. */
export async function exportMidi(
  chordProgression: string[],
  bpm: number,
  fileName: string
): Promise<void> {
  const res = await fetch(`${API_URL}/api/export/midi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chordProgression, bpm }),
  });
  if (!res.ok) throw new Error("MIDI export failed.");
  const blob = await res.blob();
  triggerDownload(blob, `${fileName.replace(/\.[^.]+$/, "")}.mid`);
}

/** Downloads a generated chord-chart PDF (lead sheet) for the song. */
export async function exportPdf(analysis: AnalysisResult, fileName: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      songTitle: fileName,
      key: analysis.key,
      scale: analysis.scale,
      bpm: analysis.bpm,
      timeSignature: analysis.timeSignature,
      chordProgression: analysis.chordProgression,
    }),
  });
  if (!res.ok) throw new Error("PDF export failed.");
  const blob = await res.blob();
  triggerDownload(blob, `${fileName.replace(/\.[^.]+$/, "")}-chords.pdf`);
}

/** Logs the mandatory rights attestation with a server-side timestamp (Section 6.1). */
export async function logRightsAttestation(fileName: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/rights-attestation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName }),
    });
  } catch {
    // Non-fatal for the demo flow — the checkbox itself remains mandatory client-side.
  }
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
