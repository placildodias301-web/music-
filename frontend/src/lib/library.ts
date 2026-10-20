/**
 * Library — Section "05 Desktop / Library" of the Figma board.
 *
 * A saved analysis is real data the user already got back from /api/analyze,
 * kept in localStorage and synced to the account (cloudSync) so it can be
 * reopened on any device. Only the analysis fields are kept — not the
 * original audio file, which is disclosed wherever a saved song is reopened
 * without audio.
 */
import type { AnalysisResult } from "./api";
import { SYNCED_KEYS, syncList } from "./cloudSync";
import { loadLyrics, saveLyrics, validateLyrics, type StoredLyrics } from "./song/songStore";
import type { PracticePreferences } from "./practicePreferences";

const STORAGE_KEY = SYNCED_KEYS.library;

export interface SavedAnalysis {
  id: string;
  fileName: string;
  savedAt: string; // ISO timestamp
  analysis: AnalysisResult;
  favorite?: boolean;
  lastPracticed?: string;
  /** Optional synced song-sheet lyrics (backward-compatible with legacy records). */
  lyrics?: StoredLyrics | null;
  /** Optional saved semitone transpose (-12 to +12). */
  transpose?: number;
  /** Optional saved capo fret (0 to 7). */
  capo?: number;
  /** Optional chord simplification state for the synced chord sheet. */
  simplify?: boolean;
  /** Optional persisted practice preferences (speed, loop, metronome, mode). */
  practicePreferences?: PracticePreferences;
  /** ISO timestamp of the latest song-state edit (lyrics/transpose/capo/simplify). */
  stateUpdatedAt?: string;
}

export interface LibrarySongStatePatch {
  lyrics?: StoredLyrics | null;
  transpose?: number;
  capo?: number;
  simplify?: boolean;
  practicePreferences?: PracticePreferences;
}

export function validateTranspose(value: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -12 || value > 12) {
    throw new RangeError("Transpose must be an integer between -12 and +12.");
  }
  return value;
}

export function validateCapo(value: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 7) {
    throw new RangeError("Capo must be an integer between 0 and 7.");
  }
  return value;
}

export const ACTIVE_SONG_SESSION_KEY = "wilsify:active-song";

export interface ActiveSongReference {
  libraryId: string | null;
  fileKey: string;
  fileName: string;
}

export function isValidAnalysisResult(raw: unknown): raw is AnalysisResult {
  if (!raw || typeof raw !== "object") return false;
  const a = raw as Partial<AnalysisResult>;
  if (typeof a.key !== "string" || !a.key.trim()) return false;
  if (typeof a.bpm !== "number" || !Number.isFinite(a.bpm) || a.bpm <= 0) return false;
  if (!Array.isArray(a.chordProgression) || a.chordProgression.length === 0) return false;
  if (!Array.isArray(a.chordTimeline) || a.chordTimeline.length === 0) return false;
  return true;
}

function normalizeEntry(rawItem: unknown): SavedAnalysis | null {
  if (!rawItem || typeof rawItem !== "object") return null;
  const item = rawItem as SavedAnalysis;
  if (typeof item.id !== "string" || typeof item.fileName !== "string" || !isValidAnalysisResult(item.analysis)) {
    return null;
  }
  const normalized: SavedAnalysis = { ...item };
  if (normalized.transpose !== undefined) {
    try {
      normalized.transpose = validateTranspose(normalized.transpose);
    } catch {
      delete normalized.transpose;
    }
  }
  if (normalized.capo !== undefined) {
    try {
      normalized.capo = validateCapo(normalized.capo);
    } catch {
      delete normalized.capo;
    }
  }
  if (normalized.simplify !== undefined && typeof normalized.simplify !== "boolean") {
    delete normalized.simplify;
  }
  if (normalized.lyrics !== undefined) {
    try {
      normalized.lyrics = validateLyrics(normalized.lyrics);
    } catch {
      delete normalized.lyrics;
    }
  }
  if (normalized.practicePreferences !== undefined && (typeof normalized.practicePreferences !== "object" || normalized.practicePreferences === null)) {
    delete normalized.practicePreferences;
  }
  return normalized;
}

function readAll(): SavedAnalysis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter((x): x is SavedAnalysis => x !== null);
  } catch {
    return [];
  }
}

function writeAll(items: SavedAnalysis[]) {
  const before = readAll();
  // Offline-first: write localStorage BEFORE attempting cloud sync.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage full/unavailable — non-fatal
  }
  syncList("library", before, items);
}

export function getLibrary(): SavedAnalysis[] {
  return readAll().sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

/**
 * Single canonical song resolver accepting any of:
 * - Library ID (`1729...-abc`)
 * - `file:<fileName>` (`file:song.mp3`)
 * - raw `fileName` (`song.mp3`)
 * Returns the same underlying SavedAnalysis record.
 */
export function resolveLibrarySong(fileNameOrId: string): SavedAnalysis | null {
  if (!fileNameOrId || typeof fileNameOrId !== "string") return null;
  const trimmed = fileNameOrId.trim();
  if (!trimmed) return null;
  const stripped = trimmed.startsWith("file:") ? trimmed.slice(5) : trimmed;
  const items = readAll();
  return (
    items.find(
      (item) =>
        item.id === trimmed ||
        item.id === stripped ||
        item.fileName === stripped ||
        item.fileName === trimmed ||
        `file:${item.fileName}` === trimmed
    ) ?? null
  );
}

/**
 * Resolves the canonical song identifier for any song reference (`libraryId`, `file:<fileName>`, or `fileName`).
 * Prefers the Library ID when a saved record exists, falling back to `file:<fileName>` for backward compatibility.
 */
export function resolveCanonicalSongId(fileNameOrId: string): string {
  if (!fileNameOrId || typeof fileNameOrId !== "string") return "";
  const trimmed = fileNameOrId.trim();
  if (!trimmed) return "";
  const resolved = resolveLibrarySong(trimmed);
  if (resolved) return resolved.id;
  const stripped = trimmed.startsWith("file:") ? trimmed.slice(5) : trimmed;
  return `file:${stripped}`;
}

export function isSaved(fileName: string): boolean {
  return resolveLibrarySong(fileName) !== null;
}

export function saveToLibrary(
  fileName: string,
  analysis: AnalysisResult,
  statePatch?: LibrarySongStatePatch,
): SavedAnalysis {
  if (!fileName || typeof fileName !== "string" || !fileName.trim()) {
    throw new Error("Cannot save analysis without a valid file name.");
  }
  if (!isValidAnalysisResult(analysis)) {
    throw new Error("Cannot save an incomplete or invalid analysis result to the Library.");
  }

  const items = readAll();
  const trimmed = fileName.trim();
  const stripped = trimmed.startsWith("file:") ? trimmed.slice(5) : trimmed;
  const existing = items.find(
    (item) =>
      item.id === trimmed ||
      item.id === stripped ||
      item.fileName === stripped ||
      item.fileName === trimmed ||
      (analysis.fileName && item.fileName === analysis.fileName)
  );
  const existingLocalLyrics = loadLyrics(`file:${stripped}`) ?? (existing ? loadLyrics(existing.id) : null);

  const patchTranspose = statePatch?.transpose !== undefined ? validateTranspose(statePatch.transpose) : undefined;
  const patchCapo = statePatch?.capo !== undefined ? validateCapo(statePatch.capo) : undefined;
  const patchSimplify = typeof statePatch?.simplify === "boolean" ? statePatch.simplify : undefined;
  const patchLyrics = statePatch?.lyrics !== undefined ? validateLyrics(statePatch.lyrics) : undefined;

  const detectedDefaultCapo =
    analysis.capo?.detected && analysis.capo.fret > 0 && analysis.capo.confidence >= 0.4
      ? Math.min(7, Math.max(0, Math.round(analysis.capo.fret)))
      : undefined;

  if (existing) {
    existing.analysis = analysis;
    existing.savedAt = new Date().toISOString();
    if (patchLyrics !== undefined) {
      existing.lyrics = patchLyrics;
    } else if (existingLocalLyrics && !existing.lyrics) {
      existing.lyrics = existingLocalLyrics;
    }
    if (patchTranspose !== undefined) {
      existing.transpose = patchTranspose;
    }
    if (patchCapo !== undefined) {
      existing.capo = patchCapo;
    } else if (existing.capo === undefined && detectedDefaultCapo !== undefined) {
      existing.capo = detectedDefaultCapo;
    }
    if (patchSimplify !== undefined) {
      existing.simplify = patchSimplify;
    }
    writeAll(items);
    if (existing.lyrics) {
      saveLyrics(existing.id, existing.lyrics, { skipLibrarySync: true });
      saveLyrics(`file:${existing.fileName}`, existing.lyrics, { skipLibrarySync: true });
    }
    return existing;
  }

  const effectiveLyrics = patchLyrics !== undefined ? patchLyrics : existingLocalLyrics;
  const effectiveCapo = patchCapo !== undefined ? patchCapo : detectedDefaultCapo;
  const nowIso = new Date().toISOString();
  const entry: SavedAnalysis = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: stripped,
    savedAt: nowIso,
    analysis,
    ...(patchTranspose !== undefined ? { transpose: patchTranspose } : {}),
    ...(effectiveCapo !== undefined ? { capo: effectiveCapo } : {}),
    ...(patchSimplify !== undefined ? { simplify: patchSimplify } : {}),
    ...(effectiveLyrics
      ? { lyrics: effectiveLyrics, stateUpdatedAt: effectiveLyrics.updatedAt ?? nowIso }
      : { stateUpdatedAt: nowIso }),
  };
  writeAll([entry, ...items]);
  if (effectiveLyrics) {
    saveLyrics(entry.id, effectiveLyrics, { skipLibrarySync: true });
    saveLyrics(`file:${stripped}`, effectiveLyrics, { skipLibrarySync: true });
  }
  return entry;
}

export function persistActiveSongRef(input: { libraryId?: string | null; fileName: string }): void {
  const stripped = input.fileName.startsWith("file:") ? input.fileName.slice(5) : input.fileName;
  if (!stripped || stripped.startsWith("blob:")) return;
  const ref: ActiveSongReference = {
    libraryId: input.libraryId && !input.libraryId.startsWith("blob:") ? input.libraryId : null,
    fileKey: `file:${stripped}`,
    fileName: stripped,
  };
  try {
    sessionStorage.setItem(ACTIVE_SONG_SESSION_KEY, JSON.stringify(ref));
  } catch {
    // sessionStorage unavailable — non-fatal
  }
}

export function clearActiveSongRef(): void {
  try {
    sessionStorage.removeItem(ACTIVE_SONG_SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Restores the active song from `sessionStorage` (`wilsify:active-song`) on app load,
 * or falls back to the most recent valid Library item when `sessionStorage` has no active song.
 * If the stored reference or Library record is corrupt or missing, clears `sessionStorage`
 * and returns null so the UI displays a clean empty state.
 */
export function restoreActiveSongFromSession(): SavedAnalysis | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(ACTIVE_SONG_SESSION_KEY);
  } catch {
    raw = null;
  }

  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        clearActiveSongRef();
        return null;
      }
      // Never accept or restore Blob URLs from sessionStorage
      for (const val of Object.values(parsed)) {
        if (typeof val === "string" && val.startsWith("blob:")) {
          clearActiveSongRef();
          return null;
        }
      }
      const libraryId = typeof parsed.libraryId === "string" ? parsed.libraryId.trim() : "";
      const fileKey = typeof parsed.fileKey === "string" ? parsed.fileKey.trim() : "";
      const fileName = typeof parsed.fileName === "string" ? parsed.fileName.trim() : "";
      if (!libraryId && !fileKey && !fileName) {
        clearActiveSongRef();
        return null;
      }

      const resolved =
        (libraryId ? resolveLibrarySong(libraryId) : null) ??
        (fileKey ? resolveLibrarySong(fileKey) : null) ??
        (fileName ? resolveLibrarySong(fileName) : null);

      if (!resolved || !isValidAnalysisResult(resolved.analysis)) {
        clearActiveSongRef();
        return null;
      }
      return resolved;
    } catch {
      clearActiveSongRef();
      return null;
    }
  }

  // Fallback when sessionStorage has no active song: use the most recent valid Library item.
  const mostRecent = getLibrary()[0] ?? null;
  if (mostRecent && isValidAnalysisResult(mostRecent.analysis)) {
    persistActiveSongRef({ libraryId: mostRecent.id, fileName: mostRecent.fileName });
    return mostRecent;
  }
  return null;
}

export function updateLibrarySongState(fileNameOrId: string, patch: LibrarySongStatePatch): SavedAnalysis | null {
  const validatedTranspose = patch.transpose !== undefined ? validateTranspose(patch.transpose) : undefined;
  const validatedCapo = patch.capo !== undefined ? validateCapo(patch.capo) : undefined;
  const validatedSimplify = typeof patch.simplify === "boolean" ? patch.simplify : undefined;
  const validatedLyrics = patch.lyrics !== undefined ? validateLyrics(patch.lyrics) : undefined;

  const items = readAll();
  const trimmed = fileNameOrId.trim();
  const stripped = trimmed.startsWith("file:") ? trimmed.slice(5) : trimmed;
  const target = items.find(
    (item) =>
      item.id === trimmed ||
      item.id === stripped ||
      item.fileName === stripped ||
      item.fileName === trimmed ||
      `file:${item.fileName}` === trimmed
  );

  const nowIso = new Date().toISOString();

  if (patch.lyrics !== undefined) {
    const stampedLyrics = validatedLyrics ? { ...validatedLyrics, updatedAt: validatedLyrics.updatedAt ?? nowIso } : null;
    // Always persist to localStorage lyric keys immediately (even if song isn't in Library yet).
    saveLyrics(target ? target.id : trimmed, stampedLyrics, { skipLibrarySync: true });
    if (target) {
      saveLyrics(`file:${target.fileName}`, stampedLyrics, { skipLibrarySync: true });
      target.lyrics = stampedLyrics;
    }
  }

  if (!target) return null;

  if (validatedTranspose !== undefined) {
    target.transpose = validatedTranspose;
  }
  if (validatedCapo !== undefined) {
    target.capo = validatedCapo;
  }
  if (validatedSimplify !== undefined) {
    target.simplify = validatedSimplify;
  }
  if (patch.practicePreferences !== undefined) {
    target.practicePreferences = patch.practicePreferences;
  }
  target.stateUpdatedAt = nowIso;
  writeAll(items);
  return target;
}

export function removeFromLibrary(id: string) {
  writeAll(readAll().filter((item) => item.id !== id));
}

export function toggleFavorite(id: string): boolean {
  const items = readAll();
  const item = items.find((i) => i.id === id);
  if (!item) return false;
  item.favorite = !item.favorite;
  writeAll(items);
  return Boolean(item.favorite);
}

export function markPracticed(id: string) {
  const items = readAll();
  const item = items.find((i) => i.id === id);
  if (item) {
    item.lastPracticed = new Date().toISOString();
    writeAll(items);
  }
}

export function getSavedById(id: string): SavedAnalysis | null {
  return resolveLibrarySong(id);
}

/** Drops saved analyses older than `maxAgeDays` (the "Analysis history" setting). Returns how many were removed. */
export function pruneLibrary(maxAgeDays: number): number {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const items = readAll();
  const kept = items.filter((item) => item.favorite || new Date(item.savedAt).getTime() >= cutoff);
  if (kept.length !== items.length) writeAll(kept);
  return items.length - kept.length;
}

/** Removes every saved analysis ("Delete analysis history"). */
export function clearLibrary() {
  writeAll([]);
  clearActiveSongRef();
}
