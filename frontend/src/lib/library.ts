/**
 * Library — Section "05 Desktop / Library" of the Figma board.
 *
 * A saved analysis is real data the user already got back from /api/analyze,
 * kept locally (localStorage) so it survives a refresh and can be reopened
 * or attached to a Community post. This demo has no backend database, so
 * only the analysis fields are kept — not the original audio file (too
 * large for localStorage), which is disclosed wherever a saved song is
 * reopened without audio.
 */
import type { AnalysisResult } from "./api";

const STORAGE_KEY = "wilsify_library_v1";

export interface SavedAnalysis {
  id: string;
  fileName: string;
  savedAt: string; // ISO timestamp
  analysis: AnalysisResult;
  favorite?: boolean;
  lastPracticed?: string;
}

function readAll(): SavedAnalysis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: SavedAnalysis[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage full/unavailable — non-fatal for the demo
  }
}

export function getLibrary(): SavedAnalysis[] {
  return readAll().sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

export function isSaved(fileName: string): boolean {
  return readAll().some((item) => item.fileName === fileName);
}

export function saveToLibrary(fileName: string, analysis: AnalysisResult): SavedAnalysis {
  const items = readAll();
  const existing = items.find((item) => item.fileName === fileName);
  if (existing) {
    existing.analysis = analysis;
    existing.savedAt = new Date().toISOString();
    writeAll(items);
    return existing;
  }
  const entry: SavedAnalysis = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName,
    savedAt: new Date().toISOString(),
    analysis,
  };
  writeAll([entry, ...items]);
  return entry;
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
  return readAll().find((item) => item.id === id) ?? null;
}
