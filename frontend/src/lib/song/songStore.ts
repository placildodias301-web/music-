/**
 * Per-song sheet data kept on this device: the lyrics the user pasted /
 * uploaded, any line start times they tapped in, and display preferences.
 * (Analysis itself lives in the Library.) Everything is optional and every
 * storage access is guarded — private windows and full storage must not
 * break the page.
 */
import { syncList } from "../cloudSync";
import { parseLyrics } from "./lyrics";
import type { ParsedLyrics } from "./model";

const lyricsKey = (songId: string) => `wilsify.song.lyrics.${songId}`;
const SETTINGS_KEY = "wilsify.song.display";
const LIBRARY_STORAGE_KEY = "wilsify_library_v1";

export interface StoredLyrics {
  raw: string;
  /** Start times keyed by flat line index, from tap-sync. Overrides LRC/plain. */
  taps?: Record<number, number>;
  /** Where the lyrics came from — shown on the page so provenance is clear. */
  source: "pasted" | "uploaded" | "ai";
  /** ISO timestamp of the latest edit, used so cloud sync never overwrites newer local lyrics. */
  updatedAt?: string;
}

const VALID_SOURCES = new Set<StoredLyrics["source"]>(["pasted", "uploaded", "ai"]);

export function validateLyrics(value: StoredLyrics | null | undefined): StoredLyrics | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || typeof value.raw !== "string" || !VALID_SOURCES.has(value.source)) {
    throw new Error("Invalid lyrics payload.");
  }
  if (value.taps !== undefined) {
    if (typeof value.taps !== "object" || value.taps === null) {
      throw new Error("Invalid lyrics tap timestamps.");
    }
    for (const [k, v] of Object.entries(value.taps)) {
      if (!Number.isFinite(Number(k)) || typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        throw new Error("Invalid lyrics tap timestamp value.");
      }
    }
  }
  return value;
}

export interface MinimalLibraryEntry {
  id: string;
  fileName: string;
  lyrics?: StoredLyrics | null;
  stateUpdatedAt?: string;
  [key: string]: unknown;
}

export function stripFilePrefix(songIdOrFile: string): string {
  const trimmed = songIdOrFile.trim();
  return trimmed.startsWith("file:") ? trimmed.slice(5) : trimmed;
}

export function findMatchingLibraryEntry(songIdOrFile: string): MinimalLibraryEntry | null {
  if (!songIdOrFile || typeof songIdOrFile !== "string") return null;
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    const trimmed = songIdOrFile.trim();
    const stripped = stripFilePrefix(trimmed);
    return (
      list.find(
        (item: MinimalLibraryEntry) =>
          item &&
          typeof item === "object" &&
          (item.id === trimmed ||
            item.id === stripped ||
            item.fileName === stripped ||
            item.fileName === trimmed ||
            `file:${item.fileName}` === trimmed),
      ) ?? null
    );
  } catch {
    return null;
  }
}

function readRawLyricsKey(key: string): StoredLyrics | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return validateLyrics(JSON.parse(raw) as StoredLyrics);
  } catch {
    return null;
  }
}

function pickNewerLyrics(a: StoredLyrics | null, b: StoredLyrics | null): StoredLyrics | null {
  if (!a) return b;
  if (!b) return a;
  const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
  const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
  if (Number.isFinite(ta) && Number.isFinite(tb) && tb > ta) return b;
  return a;
}

/**
 * Hydrates local lyric keys from a SavedAnalysis record pulled from cloud sync
 * without overwriting newer local lyrics.
 */
export function hydrateLocalLyricsFromCloud(id: string, fileName: string, cloudLyrics: StoredLyrics | null | undefined): void {
  if (!cloudLyrics) return;
  try {
    const validated = validateLyrics(cloudLyrics);
    if (!validated) return;
    const idKey = lyricsKey(id);
    const fileKey = lyricsKey(`file:${stripFilePrefix(fileName)}`);
    const existing = pickNewerLyrics(readRawLyricsKey(idKey), readRawLyricsKey(fileKey));
    const chosen = pickNewerLyrics(existing, validated);
    if (chosen) {
      const serialized = JSON.stringify(chosen);
      localStorage.setItem(idKey, serialized);
      localStorage.setItem(fileKey, serialized);
    }
  } catch {
    /* ignore malformed cloud lyrics or storage quota errors */
  }
}

/**
 * Loads lyrics for a song by Library ID, `file:<fileName>`, or raw `fileName`.
 * If a legacy lyric record exists only under `file:<fileName>`, safely migrates
 * it to the canonical Library ID without removing the legacy key or losing data.
 */
export function loadLyrics(songId: string): StoredLyrics | null {
  if (!songId || typeof songId !== "string") return null;
  const trimmed = songId.trim();
  const stripped = stripFilePrefix(trimmed);
  const direct = readRawLyricsKey(lyricsKey(trimmed));
  const legacyFile = readRawLyricsKey(lyricsKey(`file:${stripped}`));
  const entry = findMatchingLibraryEntry(trimmed);
  if (!entry) {
    return pickNewerLyrics(direct, legacyFile);
  }

  const canonicalIdKey = lyricsKey(entry.id);
  const canonicalFileKey = lyricsKey(`file:${entry.fileName}`);
  const byId = readRawLyricsKey(canonicalIdKey);
  const byFile = readRawLyricsKey(canonicalFileKey);
  const fromEntry = (() => {
    try {
      return validateLyrics(entry.lyrics ?? null);
    } catch {
      return null;
    }
  })();

  const resolved = pickNewerLyrics(
    pickNewerLyrics(direct, legacyFile),
    pickNewerLyrics(byId, pickNewerLyrics(byFile, fromEntry)),
  );

  // Safe migration: if lyrics exist under a legacy key but not yet under the canonical Library ID,
  // copy them to the canonical ID key and Library record without deleting the original key.
  if (resolved && (!byId || !fromEntry)) {
    try {
      const serialized = JSON.stringify(resolved);
      if (!byId) {
        localStorage.setItem(canonicalIdKey, serialized);
      }
      if (!byFile) {
        localStorage.setItem(canonicalFileKey, serialized);
      }
      if (!fromEntry) {
        const rawLib = localStorage.getItem(LIBRARY_STORAGE_KEY);
        if (rawLib) {
          const items = JSON.parse(rawLib);
          if (Array.isArray(items)) {
            const target = items.find((i: MinimalLibraryEntry) => i && i.id === entry.id);
            if (target && !target.lyrics) {
              target.lyrics = resolved;
              target.stateUpdatedAt = resolved.updatedAt ?? new Date().toISOString();
              localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(items));
            }
          }
        }
      }
    } catch {
      /* non-fatal: original key remains intact */
    }
  }

  return resolved;
}

export function saveLyrics(songId: string, value: StoredLyrics | null, options?: { skipLibrarySync?: boolean }): boolean {
  const validated = validateLyrics(value);
  const nowIso = new Date().toISOString();
  const stamped: StoredLyrics | null = validated
    ? { ...validated, updatedAt: validated.updatedAt ?? nowIso }
    : null;
  try {
    const trimmed = songId.trim();
    const stripped = stripFilePrefix(trimmed);
    const entry = findMatchingLibraryEntry(trimmed);
    const keysToUpdate = new Set<string>([lyricsKey(trimmed), lyricsKey(`file:${stripped}`)]);
    if (entry) {
      keysToUpdate.add(lyricsKey(entry.id));
      keysToUpdate.add(lyricsKey(`file:${entry.fileName}`));
    }
    for (const k of keysToUpdate) {
      if (!stamped) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(stamped));
    }
    if (!options?.skipLibrarySync && entry) {
      // Keep the SavedAnalysis record in wilsify_library_v1 in sync and queue cloudSync.
      const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
      if (raw) {
        const before = JSON.parse(raw);
        const items = JSON.parse(raw);
        if (Array.isArray(before) && Array.isArray(items)) {
          const target = items.find((i: MinimalLibraryEntry) => i && i.id === entry.id);
          if (target) {
            target.lyrics = stamped;
            target.stateUpdatedAt = stamped?.updatedAt ?? nowIso;
            localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(items));
            syncList("library", before as { id: string }[], items as { id: string }[]);
          }
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Parses stored lyrics and applies tapped times (turning plain text into timed lines). */
export function materializeLyrics(stored: StoredLyrics): ParsedLyrics {
  const parsed = parseLyrics(stored.raw);
  const taps = stored.taps ?? {};
  let i = 0;
  for (const s of parsed.sections) {
    for (const l of s.lines) {
      if (taps[i] !== undefined) {
        l.startTime = taps[i];
        l.words = undefined; // tapped line times replace any word times
      }
      i++;
    }
  }
  const lines = parsed.sections.flatMap((s) => s.lines);
  const timed = lines.length > 0 && lines.every((l) => l.startTime !== null);
  if (timed) for (const s of parsed.sections) s.lines.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  return { ...parsed, timed };
}

export interface DisplaySettings {
  chordSize: number; // px
  lyricSize: number; // px
  lineSpacing: number; // multiplier
  showChords: boolean;
  showLyrics: boolean;
  simplify: boolean;
  autoScroll: boolean;
  light: boolean;
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  chordSize: 16,
  lyricSize: 17,
  lineSpacing: 1.9,
  showChords: true,
  showLyrics: true,
  simplify: false,
  autoScroll: true,
  light: false,
};

export function loadDisplay(): DisplaySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_DISPLAY, ...(JSON.parse(raw) as Partial<DisplaySettings>) } : DEFAULT_DISPLAY;
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function saveDisplay(s: DisplaySettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* non-fatal */
  }
}
