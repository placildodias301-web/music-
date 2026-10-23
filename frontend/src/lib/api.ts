/**
 * Client for the Wilsify AI MVP backend (Python/FastAPI, `backend/`).
 *
 * POST /api/analyze does REAL audio analysis (librosa) — the file you send
 * is genuinely decoded and analyzed, not matched against canned data.
 */

import { slugify, type LeadSheet } from "./leadSheet";
import { supabase } from "./supabase";

export const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface ChordSegment {
  chord: string;
  start: number;
  end: number;
  /** 0–1: how decisively this chord beat its runner-up. Absent on analyses saved before v2. */
  confidence?: number;
  /** The runner-up chord for this span — shown when the detection is uncertain. */
  alternative?: string;
  /** True for a short connecting chord between two longer ones (analysis v3). */
  passing?: boolean;
  /** True when this chord was held over a stretch with no new chord (never shown as "N.C."). */
  extended?: boolean;
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

/** A short connecting chord (D → F#m → Bm). */
export interface PassingChord {
  chord: string;
  start: number;
  end: number;
  from: string;
  to: string;
  beats: number;
  /** Whether the chord belongs to the detected key (diatonic) or is borrowed/chromatic. */
  inKey: boolean;
  confidence: number;
  fit?: number;
}

/** Capo estimate. A capo can't be heard directly, so this is advice with a confidence. */
export interface CapoEstimate {
  fret: number;
  detected: boolean;
  confidence: number;
  soundingKey?: string | null;
  /** Key of the shapes to play (sounding key lowered by `fret`). */
  shapeKey?: string | null;
  candidates?: { fret: number; openShare: number; possible: boolean }[];
  evidence?: string[];
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
  // ── Added in analysis v2 (optional: Library items saved earlier lack them) ──
  /** 0–1 confidence in the detected key. */
  keyConfidence?: number;
  /** Runner-up keys, best first. */
  keyAlternatives?: { key: string; score: number }[];
  /**
   * "detected" from a clear beat; "estimated" when there's no steady drum
   * pulse and the tempo comes from the rhythm and the chord cycle.
   * ("low_confidence" and bpmAlternatives only appear on older saved analyses;
   * "confirmed" when the user set it on an older version.)
   */
  bpmStatus?: "detected" | "estimated" | "low_confidence" | "confirmed";
  bpmAlternatives?: number[];
  /** Beat positions in seconds. */
  beats?: number[];
  /** Estimated bar starts in seconds (empty when the meter is unavailable). */
  downbeats?: number[];
  beatsPerBar?: number;
  timeSignatureStatus?: "estimated" | "unavailable" | "confirmed";
  /** What the analyser found, kept when the user overrides tempo or meter (for Undo). */
  detectedRhythm?: Pick<AnalysisResult, "bpm" | "bpmStatus" | "bpmAlternatives" | "beats" | "downbeats" | "beatsPerBar" | "timeSignature" | "timeSignatureStatus">;
  chordVocabulary?: string;
  lowConfidenceThreshold?: number;
  lowConfidenceSegments?: number;
  analysisVersion?: number;
  /** Added in analysis v3. */
  capo?: CapoEstimate;
  passingChords?: PassingChord[];
}

/** Backend processing stages, in the order they run. */
export type AnalysisStage =
  | "uploaded"
  | "decoding"
  | "separating"
  | "beats"
  | "chroma"
  | "chords"
  | "key"
  | "meter";

export interface AnalysisProgress {
  stage: AnalysisStage;
  /** 0–100, as reported by the server. */
  progress: number;
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

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export const ALLOWED_UPLOAD_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".flac",
  ".aac",
  ".wma",
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".avi",
  ".m4v",
] as const;

export const ALLOWED_UPLOAD_TYPES_LABEL = ALLOWED_UPLOAD_EXTENSIONS.map((ext) => ext.slice(1).toUpperCase()).join(", ");

const ALLOWED_EXTENSION_SET = new Set<string>(ALLOWED_UPLOAD_EXTENSIONS);

/**
 * Validates a candidate upload file before sending it over the network.
 * Returns null when valid, or a specific user-facing error message.
 */
export function validateUploadFile(file: Pick<File, "name" | "size"> | null | undefined): string | null {
  if (!file || typeof file.name !== "string") {
    return "Please choose an audio or video file.";
  }
  if (file.size <= 0) {
    return "File is empty.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "File is too large. Maximum size is 100 MB.";
  }
  const dotIdx = file.name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? file.name.slice(dotIdx).toLowerCase() : "";
  if (!ext || !ALLOWED_EXTENSION_SET.has(ext)) {
    return `Unsupported file type. Allowed types: ${ALLOWED_UPLOAD_TYPES_LABEL}.`;
  }
  return null;
}

export type AnalysisErrorKind = "network" | "too-large" | "unsupported" | "unreadable" | "busy" | "server" | "cancelled";

/** An analysis failure, sorted into what the user can do about it. */
export class AnalysisError extends Error {
  readonly kind: AnalysisErrorKind;
  readonly status: number;
  constructor(kind: AnalysisErrorKind, message: string, status = 0) {
    super(message);
    this.name = "AnalysisError";
    this.kind = kind;
    this.status = status;
  }
}

function classifyFailure(status: number, detail: string): AnalysisError {
  if (status === 0) return new AnalysisError("network", "The Wilsify analysis server isn't responding. Check your connection, or try again in a minute.");
  if (status === 413 || /too large|maximum size is 100 mb/i.test(detail)) return new AnalysisError("too-large", detail || "File is too large. Maximum size is 100 MB.", status || 413);
  if (status === 400 && /upload an audio or video file|unsupported file type/i.test(detail)) return new AnalysisError("unsupported", detail, status);
  if (status === 400) return new AnalysisError("unreadable", detail || "That file couldn't be analysed.", status);
  if (status === 408) return new AnalysisError("network", detail || "Upload timed out. Check your connection and try again.", status);
  if (status === 429) return new AnalysisError("busy", detail || "Too many analyses at once — wait a minute and try again.", status);
  return new AnalysisError("server", detail || "Something went wrong on the server while analysing.", status);
}

export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000;

export interface AnalyzeOptions {
  /** Bytes sent so far (real upload progress from the browser). */
  onUpload?: (loaded: number, total: number) => void;
  /** Server-side stage, as streamed by /api/analyze/stream. */
  onProgress?: (progress: AnalysisProgress) => void;
  /** Abort = Cancel: stops the upload, and the server stops analysing. */
  signal?: AbortSignal;
  /** Origin source type sent to backend telemetry. */
  sourceType?: "file" | "link" | "youtube" | "sample" | "mic";
  /** Maximum idle milliseconds between server stream events/heartbeats before timing out. */
  heartbeatTimeoutMs?: number;
}

/**
 * Uploads and analyzes an audio or video file. Real analysis — the file is
 * decoded (ffmpeg) and processed (librosa) server-side. Uses XMLHttpRequest
 * (not fetch) because only XHR reports upload progress; the response is
 * newline-delimited JSON progress events, read as they arrive, ending in
 * the result or an error.
 */
export function analyzeFile(file: File, options: AnalyzeOptions | ((progress: AnalysisProgress) => void) = {}): Promise<AnalysisResult> {
  const opts: AnalyzeOptions = typeof options === "function" ? { onProgress: options } : options;
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new AnalysisError("cancelled", "Analysis cancelled."));
      return;
    }

    const preflightError = validateUploadFile(file);
    if (preflightError) {
      const kind: AnalysisErrorKind =
        file && file.size > MAX_UPLOAD_BYTES
          ? "too-large"
          : preflightError.startsWith("Unsupported file type")
            ? "unsupported"
            : "unreadable";
      reject(new AnalysisError(kind, preflightError, kind === "too-large" ? 413 : 400));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.timeout = 180_000; // 3 minute upper bound for upload + analysis stream
    let read = 0;
    let settled = false;
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    const heartbeatTimeoutMs = opts.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;

    const clearHeartbeatTimer = () => {
      if (heartbeatTimer !== null) {
        clearTimeout(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearHeartbeatTimer();
      opts.signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const armHeartbeatTimer = () => {
      clearHeartbeatTimer();
      if (settled || heartbeatTimeoutMs <= 0) return;
      heartbeatTimer = setTimeout(() => {
        finish(() => {
          try {
            xhr.abort();
          } catch {
            // ignore
          }
          reject(
            new AnalysisError(
              "network",
              "Connection to the analysis server was lost (heartbeat timeout). Please retry.",
              408,
            ),
          );
        });
      }, heartbeatTimeoutMs);
    };

    const onAbort = () => xhr.abort();
    opts.signal?.addEventListener("abort", onAbort);

    // Parse whatever complete lines have arrived since last time.
    const drain = () => {
      armHeartbeatTimer();
      if (xhr.status !== 200) return;
      const text = xhr.responseText;
      const lastNewline = text.lastIndexOf("\n");
      if (lastNewline < read) return;
      const chunk = text.slice(read, lastNewline);
      read = lastNewline + 1;
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        let event: { type: string; stage?: AnalysisStage; progress?: number; analysis?: AnalysisResult; status?: number; detail?: string };
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "progress" && event.stage) opts.onProgress?.({ stage: event.stage, progress: event.progress ?? 0 });
        else if (event.type === "result" && event.analysis) finish(() => resolve(event.analysis as AnalysisResult));
        else if (event.type === "error") finish(() => reject(classifyFailure(event.status ?? 500, event.detail ?? "")));
      }
    };

    xhr.open("POST", `${API_URL}/api/analyze/stream`);
    if (opts.sourceType && typeof xhr.setRequestHeader === "function") {
      xhr.setRequestHeader("X-Source-Type", opts.sourceType);
    }
    if (xhr.upload) {
      xhr.upload.onprogress = (e) => {
        armHeartbeatTimer();
        if (e.lengthComputable) opts.onUpload?.(e.loaded, e.total);
      };
      xhr.upload.onload = () => {
        armHeartbeatTimer();
      };
    }
    xhr.onprogress = drain;
    xhr.onload = () => {
      if (xhr.status === 200) {
        drain();
        finish(() => reject(new AnalysisError("network", "The connection closed before analysis finished. Please try again.")));
        return;
      }
      let detail = "";
      try {
        const body = JSON.parse(xhr.responseText) as { detail?: unknown };
        detail = typeof body.detail === "string" ? body.detail : "";
      } catch {
        detail = "";
      }
      finish(() => reject(classifyFailure(xhr.status, detail)));
    };
    xhr.onerror = () => finish(() => reject(classifyFailure(0, "")));
    xhr.ontimeout = () =>
      finish(() =>
        reject(new AnalysisError("network", "The upload or analysis timed out. Check your connection and try again.", 408)),
      );
    xhr.onabort = () => finish(() => reject(new AnalysisError("cancelled", "Analysis cancelled.")));

    armHeartbeatTimer();
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export const ALLOWED_YOUTUBE_DOMAINS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
] as const;

const ALLOWED_YOUTUBE_HOST_SET = new Set<string>(ALLOWED_YOUTUBE_DOMAINS);
const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const YOUTUBE_FALLBACK_MESSAGE =
  "YouTube could not provide this video right now. Please try again later or upload the audio file directly.";

/**
 * Validates a YouTube video URL or 11-character video ID.
 * Returns null when valid, or a specific user-facing validation error message.
 */
export function validateYouTubeUrl(urlOrId: string | null | undefined): string | null {
  const raw = (urlOrId ?? "").trim();
  if (!raw) {
    return "Please enter a YouTube video link or select a video.";
  }
  if (raw.length > 2048) {
    return "Please enter a valid YouTube video link.";
  }
  if (YT_VIDEO_ID_RE.test(raw)) {
    return null;
  }

  const normalized = raw.includes("://") ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return "Please enter a valid YouTube video link.";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Please enter a valid http(s) YouTube link.";
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!ALLOWED_YOUTUBE_HOST_SET.has(host)) {
    return "Unsupported domain. Only YouTube links (youtube.com, www.youtube.com, m.youtube.com, music.youtube.com, youtu.be) are supported.";
  }

  const path = parsed.pathname || "/";
  const pathLower = path.toLowerCase();
  const segments = path.split("/").filter(Boolean);

  if (pathLower.startsWith("/playlist") || parsed.searchParams.has("list")) {
    return "YouTube playlists are not supported. Please paste a link to a single video.";
  }

  if (
    pathLower.startsWith("/@") ||
    pathLower.startsWith("/channel") ||
    pathLower.startsWith("/c/") ||
    pathLower.startsWith("/user") ||
    pathLower.startsWith("/feed") ||
    pathLower.startsWith("/results")
  ) {
    return "Channel and non-video YouTube pages are not supported. Please paste a link to a single video.";
  }

  if (
    pathLower.startsWith("/live") ||
    segments.some((s) => s.toLowerCase() === "live") ||
    parsed.searchParams.get("live") === "1"
  ) {
    return "Live streams cannot be analyzed. Please choose a finished video up to 20 minutes long.";
  }

  let candidate: string | null = null;
  if (host === "youtu.be") {
    if (segments.length === 1) {
      candidate = segments[0];
    }
  } else if (pathLower === "/watch") {
    candidate = parsed.searchParams.get("v");
  } else if (segments.length === 2 && (segments[0].toLowerCase() === "shorts" || segments[0].toLowerCase() === "embed")) {
    candidate = segments[1];
  }

  if (!candidate || !YT_VIDEO_ID_RE.test(candidate)) {
    return "Please paste a valid YouTube video link with an 11-character video ID.";
  }

  return null;
}

/**
 * Validates a link to a single video or track on any site (Instagram, TikTok, Facebook, X,
 * SoundCloud, Vimeo, ...). YouTube links get the strict YouTube rules; anything else only needs
 * to be a public-looking http(s) link. The backend decides whether the site is actually supported.
 * Returns null when valid, or a user-facing error message.
 */
export function validateMediaLink(link: string | null | undefined): string | null {
  const raw = (link ?? "").trim();
  if (!raw) {
    return "Please paste a link to a video or song.";
  }
  if (raw.length > 2048) {
    return "Please paste a valid link.";
  }
  if (YT_VIDEO_ID_RE.test(raw)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return "Please paste a valid link.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Please paste a valid http(s) link.";
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (ALLOWED_YOUTUBE_HOST_SET.has(host)) {
    return validateYouTubeUrl(raw);
  }
  if (!host.includes(".")) {
    return "Please paste a valid link.";
  }
  const segments = parsed.pathname.toLowerCase().split("/").filter(Boolean);
  if (segments.includes("playlist") || segments.includes("sets") || parsed.searchParams.has("list")) {
    return "Playlists are not supported. Please paste a link to a single video or track.";
  }
  if (segments.includes("live")) {
    return "Live streams cannot be analyzed. Please choose a finished video up to 20 minutes long.";
  }
  return null;
}

/**
 * Extracts the 11-character YouTube video ID from a valid YouTube URL or ID,
 * or returns null if invalid.
 */
export function extractYouTubeVideoId(urlOrId: string | null | undefined): string | null {
  if (validateYouTubeUrl(urlOrId) !== null) {
    return null;
  }
  const raw = (urlOrId ?? "").trim();
  if (YT_VIDEO_ID_RE.test(raw)) {
    return raw;
  }
  const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") {
    return segments[0] ?? null;
  }
  if (parsed.pathname.toLowerCase() === "/watch") {
    return parsed.searchParams.get("v");
  }
  return segments[1] ?? null;
}

/**
 * Downloads the audio behind a validated media link (YouTube, Instagram, TikTok, ...) via the backend and
 * returns it as a File, ready for `analyzeFile` and local playback.
 */
export async function fetchMediaFromLink(url: string, signal?: AbortSignal): Promise<File> {
  const validationError = validateMediaLink(url);
  if (validationError) {
    throw new Error(validationError);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/fetch-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(YOUTUBE_FALLBACK_MESSAGE);
  }
  if (!res.ok) {
    await parseJsonOrThrow(res);
  }

  const blob = await res.blob();
  const header = res.headers.get("X-Media-Name");
  const name = header ? decodeURIComponent(header) : "Linked track.mp3";
  return new File([blob], name, { type: blob.type || "audio/mpeg" });
}

export interface YouTubeVideo {
  id: string;
  title: string;
  channel: string;
  durationSeconds: number | null;
  views: number | null;
  thumbnail: string;
  url: string;
  isLive: boolean;
  tooLong: boolean;
}

/** Searches YouTube through the backend (metadata only, nothing downloaded). */
export async function searchYouTube(query: string, limit = 12, signal?: AbortSignal): Promise<YouTubeVideo[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/youtube/search?${params}`, { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(YOUTUBE_FALLBACK_MESSAGE);
  }
  if (res.status === 404) {
    throw new Error("YouTube search isn't available yet — restart the backend server to enable it.");
  }
  const body = (await parseJsonOrThrow(res)) as { results: YouTubeVideo[] };
  return body.results;
}

/**
 * Asks the AI Assistant a question. When `context` is provided, the
 * assistant grounds its answer in the actual detected song data (its
 * chords, key, tempo, and the user's logged weak chords) instead of
 * answering generically — Section 4.4 of the spec.
 */
export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** Earlier turns sent with each question so follow-ups work (the AI API itself is stateless). */
const MAX_HISTORY_TURNS = 10;

export async function askAssistant(
  question: string,
  context?: SongContext | null,
  history: ChatTurn[] = []
): Promise<AssistantResult> {
  // The AI tutor costs Gemini quota, so the backend only answers signed-in users.
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${API_URL}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({
      question,
      context: context ?? null,
      history: history.slice(-MAX_HISTORY_TURNS).map(({ role, text }) => ({ role, text: text.slice(0, 4000) })),
    }),
  });

  return parseJsonOrThrow(res) as Promise<AssistantResult>;
}

/**
 * Returns the song at `sourceUrl` pitch-shifted by `semitones` (tempo
 * unchanged, so it stays in sync with the chord timeline), as an audio Blob.
 */
export async function pitchShiftAudio(sourceUrl: string, semitones: number, signal?: AbortSignal): Promise<Blob> {
  const source = await fetch(sourceUrl, { signal }).then((r) => r.blob());
  const ext = source.type.includes("wav") ? "wav" : source.type.includes("mp4") ? "m4a" : source.type.includes("video") ? "mp4" : "mp3";
  const form = new FormData();
  form.append("file", source, `song.${ext}`);
  const res = await fetch(`${API_URL}/api/pitch-shift?semitones=${semitones}`, { method: "POST", body: form, signal });
  if (res.status === 404) throw new Error("Audio transpose isn't available yet — restart the backend server to enable it.");
  if (!res.ok) await parseJsonOrThrow(res);
  return res.blob();
}

/**
 * Downloads the detected chord progression as a real, playable .mid file.
 * Pass `chordTimeline` so each chord starts and ends at its detected time;
 * without it the server falls back to one 4-beat bar per chord.
 */
export async function exportMidi(
  chordProgression: string[],
  bpm: number,
  fileName: string,
  chordTimeline?: Pick<ChordSegment, "chord" | "start" | "end">[]
): Promise<void> {
  const res = await fetch(`${API_URL}/api/export/midi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chordProgression,
      bpm,
      ...(chordTimeline?.length
        ? { chordTimeline: chordTimeline.map(({ chord, start, end }) => ({ chord, start, end })) }
        : {}),
    }),
  });
  if (!res.ok) throw new Error("MIDI export failed.");
  const blob = await res.blob();
  triggerDownload(blob, `${fileName.replace(/\.[^.]+$/, "")}.mid`);
}

/**
 * Downloads the chord-chart PDF (lead sheet). The sheet is built from the
 * page's own data (lib/leadSheet.ts); the backend renders it.
 */
export async function exportPdf(sheet: LeadSheet): Promise<void> {
  const res = await fetch(`${API_URL}/api/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sheet),
  });
  if (!res.ok) throw new Error("PDF export failed.");
  const blob = await res.blob();
  triggerDownload(blob, `${slugify(sheet.title)}_wilsify_lead_sheet.pdf`);
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
