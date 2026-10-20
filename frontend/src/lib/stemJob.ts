/**
 * Stem-separation job client + pure helpers.
 *
 * The backend analyses an upload and returns a *dynamic* list of detected stems
 * (any number, each with a confidence), then separates the ones the user picks.
 * Endpoints (all under `/api/stems`, so they never clash with `/api/analyze`):
 *   POST /api/stems/analyze          multipart "file"   -> StemAnalysis
 *   POST /api/stems/separate         JSON SeparateRequest -> { job_id, estimated_seconds? }
 *   GET  /api/stems/job/{id}         -> JobStatus
 *   GET  /api/stems/job/{id}/stems   -> StemResults
 *
 * The backend separates with Demucs (vocals / drums / bass / other). Set
 * `VITE_STEMS_MOCK=true` to use a built-in browser mock instead (no server).
 */
import { API_URL } from "./api";
import { mockAnalyse, mockApi } from "./stemJobMock";

export type StemConfidence = "high" | "medium" | "low" | "mixed" | "not detected";
export type SeparationMode = "auto" | "two_stems" | "standard4" | "six_stems" | "extended6" | "custom";
export type JobStage = "uploading" | "analyzing" | "separating" | "exporting" | "complete";

export interface DetectedStem {
  id: string;
  label: string;
  confidence: StemConfidence;
  available: boolean;
}

/** A stem in the UI: detected ones plus user-added custom ones. */
export interface StemChoice extends DetectedStem {
  checked: boolean;
  custom?: boolean;
}

export interface StemAnalysis {
  upload_id?: string;
  track?: string;
  duration_seconds?: number;
  estimated_seconds?: number;
  detected_stems: DetectedStem[];
}

export interface SeparateRequest {
  upload_id: string | null;
  track: string;
  mode: SeparationMode;
  stems: string[];
  custom_stems: string[];
  format: "wav" | "flac";
  quality: "fast" | "balanced" | "best";
  split_vocals: boolean;
  split_drums: boolean;
}

export interface JobStatus {
  status: "queued" | JobStage | "failed";
  progress: number;
  message?: string;
  error?: string;
}

export interface StemFile {
  id: string;
  label: string;
  confidence: StemConfidence;
  size_bytes: number;
  url: string;
  filename: string;
  warning: string;
}

export interface StemResults {
  stems: StemFile[];
  original_url: string | null;
  zip_url: string | null;
  /** Optional message from the backend (e.g. "preview mode") shown above the results. */
  notice: string;
}

export const USE_MOCK = import.meta.env.VITE_STEMS_MOCK === "true";
export const POLL_MS = 1500;
export const MAX_FILE_MB = 100; // matches the backend upload cap
/** Audio files, plus common video containers (the backend extracts the audio track with FFmpeg). */
export const ALLOWED_EXT = ["mp3", "wav", "flac", "aac", "m4a", "ogg", "mp4", "m4v", "mov", "mkv", "webm"] as const;
export const ACCEPT_ATTR = [...ALLOWED_EXT.map((e) => `.${e}`), "audio/*", "video/*"].join(",");

/** Which stem ids the preset modes select. The backend merges the rest into "other". */
export const PRESETS: Record<"two_stems" | "standard4" | "six_stems" | "extended6", string[]> = {
  two_stems: ["vocals", "music"], // "music" = everything but vocals, summed by the backend
  standard4: ["vocals", "drums", "bass", "other"],
  // Demucs 6-stem model; a guitar or piano it isn't sure about stays inside "other".
  six_stems: ["vocals", "drums", "bass", "guitar", "piano", "other"],
  extended6: ["lead_vocal", "drums", "bass", "guitar", "piano_keys", "residual_other"],
};

const CONFIDENCES: StemConfidence[] = ["high", "medium", "low", "mixed", "not detected"];

/* ------------------------------ pure helpers ------------------------------ */

export function validateAudioFile(file: { name: string; size: number }): string | null {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
    return `".${ext}" is not supported. Use ${ALLOWED_EXT.map((e) => e.toUpperCase()).join(", ")}.`;
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `File is larger than ${MAX_FILE_MB} MB.`;
  return null;
}

/** Validate an analysis response; tolerate missing optional fields, drop duplicates. */
export function normaliseAnalysis(raw: unknown): StemAnalysis {
  const d = raw as Partial<StemAnalysis> | null;
  if (!d || !Array.isArray(d.detected_stems)) throw new Error("Analysis response is missing 'detected_stems'.");
  const seen = new Set<string>();
  const stems: DetectedStem[] = [];
  for (const s of d.detected_stems) {
    if (!s || !s.id || !s.label || seen.has(String(s.id))) continue;
    seen.add(String(s.id));
    const confidence = CONFIDENCES.includes(s.confidence as StemConfidence) ? (s.confidence as StemConfidence) : "low";
    stems.push({ id: String(s.id), label: String(s.label), confidence, available: s.available !== false && confidence !== "not detected" });
  }
  if (!stems.length) throw new Error("The analysis did not find any stems.");
  return { ...d, detected_stems: stems };
}

export function normaliseResults(raw: unknown, fallbackFormat: string, originalUrl: string | null): StemResults {
  const r = raw as { stems?: Partial<StemFile>[]; original_url?: string; zip_url?: string; notice?: string } | null;
  if (!r || !Array.isArray(r.stems)) throw new Error("Stems response is missing 'stems'.");
  const stems: StemFile[] = r.stems
    .filter((s) => s && s.id && s.url)
    .map((s) => ({
      id: String(s.id),
      label: s.label ?? String(s.id),
      confidence: CONFIDENCES.includes(s.confidence as StemConfidence) ? (s.confidence as StemConfidence) : "low",
      size_bytes: Number(s.size_bytes),
      url: String(s.url),
      filename: s.filename ?? `${s.id}.${fallbackFormat}`,
      warning: s.warning ?? "",
    }));
  if (!stems.length) throw new Error("The server finished but returned no stem files.");
  return { stems, original_url: r.original_url ?? originalUrl, zip_url: r.zip_url ?? null, notice: r.notice ?? "" };
}

/** Apply a preset mode to the stem choices (custom stems and "custom" mode are left alone). */
export function applyPreset(stems: StemChoice[], mode: SeparationMode): StemChoice[] {
  if (mode === "auto") return stems.map((s) => (s.custom ? s : { ...s, checked: s.available }));
  if (mode !== "custom") {
    const ids = PRESETS[mode];
    return stems.map((s) => (s.custom ? { ...s, checked: false } : { ...s, checked: s.available && ids.includes(s.id) }));
  }
  return stems;
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Add a user-defined stem. Rejects empty names and duplicates (case-insensitive). */
export function addCustomStem(stems: StemChoice[], name: string): { stems: StemChoice[]; error: string | null } {
  const raw = name.trim();
  if (!raw) return { stems, error: "Type a stem name first." };
  const key = slug(raw);
  if (!key) return { stems, error: "Use letters or numbers in the name." };
  if (stems.some((s) => s.id === `custom_${key}` || slug(s.label) === key)) {
    return { stems, error: `"${raw}" is already in the list.` };
  }
  return {
    stems: [...stems, { id: `custom_${key}`, label: raw, confidence: "low", available: true, custom: true, checked: true }],
    error: null,
  };
}

export function buildRequest(
  analysis: StemAnalysis,
  fileName: string,
  mode: SeparationMode,
  stems: StemChoice[],
  opts: Pick<SeparateRequest, "format" | "quality" | "split_vocals" | "split_drums">,
): SeparateRequest {
  const chosen = stems.filter((s) => s.checked && s.available);
  return {
    upload_id: analysis.upload_id ?? null,
    track: analysis.track ?? fileName,
    mode,
    stems: chosen.filter((s) => !s.custom).map((s) => s.id),
    custom_stems: chosen.filter((s) => s.custom).map((s) => s.label),
    format: opts.format,
    quality: opts.quality,
    split_vocals: opts.split_vocals,
    split_drums: opts.split_drums,
  };
}

/** Stems that may contain bleed get a visible warning. */
export function bleedWarning(f: Pick<StemFile, "confidence" | "warning">): string {
  if (f.warning) return f.warning;
  return f.confidence === "medium" || f.confidence === "low" || f.confidence === "mixed"
    ? "Possible bleed: parts of other instruments may be audible in this stem."
    : "";
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "—";
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

/* ------------------------------- ZIP writer ------------------------------- */

let crcTable: number[] | null = null;
function crc32(buf: Uint8Array): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal uncompressed ZIP (audio is already compressed or lossless, so "store" is fine). */
export function buildZip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    parts.push(lh.buffer, name as BlobPart, f.data as BlobPart);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name as BlobPart);
    offset += 30 + name.length + size;
    centralSize += 46 + name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}

/* ------------------------------- API client ------------------------------- */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCK) return mockApi(path, init) as Promise<T>;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("The server returned something that is not valid JSON.");
  }
  if (!res.ok) {
    const e = data as { detail?: string; error?: string; message?: string } | null;
    throw new Error(e?.detail ?? e?.error ?? e?.message ?? `Server error (${res.status}).`);
  }
  return data as T;
}

/** Upload + analyse. XHR (not fetch) because fetch cannot report upload progress. */
export function analyseUpload(file: File, onProgress: (pct: number) => void): Promise<StemAnalysis> {
  if (USE_MOCK) return mockAnalyse(file, onProgress).then(normaliseAnalysis);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);
    xhr.open("POST", `${API_URL}/api/stems/analyze`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onerror = () => reject(new Error("Upload failed — cannot reach the server."));
    xhr.onload = () => {
      let data: unknown;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        return reject(new Error("The server returned invalid JSON."));
      }
      if (xhr.status >= 400) {
        const e = data as { detail?: string; error?: string };
        return reject(new Error(e.detail ?? e.error ?? `Server error (${xhr.status}).`));
      }
      try {
        resolve(normaliseAnalysis(data));
      } catch (err) {
        reject(err);
      }
    };
    xhr.send(fd);
  });
}

export async function startSeparation(req: SeparateRequest): Promise<{ job_id: string; estimated_seconds?: number }> {
  const res = await request<{ job_id?: string; estimated_seconds?: number }>("/api/stems/separate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res?.job_id) throw new Error("Server did not return a job_id.");
  return { job_id: res.job_id, estimated_seconds: res.estimated_seconds };
}

export async function getJob(id: string): Promise<JobStatus> {
  const j = await request<JobStatus>(`/api/stems/job/${encodeURIComponent(id)}`);
  if (!j?.status) throw new Error("Job status response is missing 'status'.");
  return j;
}

export async function getJobStems(id: string, format: string, originalUrl: string | null): Promise<StemResults> {
  const raw = await request<unknown>(`/api/stems/job/${encodeURIComponent(id)}/stems`);
  return normaliseResults(raw, format, originalUrl);
}
