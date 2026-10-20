/**
 * Everything this app keeps in the browser: what it is, how big it is,
 * and the Storage / Export / Delete actions from Settings. Wilsify has no
 * accounts yet, so this is all the user data there is.
 */

import { createZip } from "./zip";
import { APP_STORAGE_PREFIXES } from "./settings/settingsService";

const LABELS: Record<string, string> = {
  wilsify_settings_v1: "Settings & profile",
  wilsify_library_v1: "Library (saved analyses)",
  wilsify_practice_sessions_v1: "Practice history",
  "wilsify:assistant-chats": "AI Assistant chats",
  wilsify_community_v1: "Community posts",
  wilsify_account_v1: "Old profile (already moved to Settings)",
};

function appKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => APP_STORAGE_PREFIXES.some((p) => k.startsWith(p)));
  } catch {
    return [];
  }
}

export interface StorageUsage {
  /** Bytes this app's data takes in localStorage (UTF-16, as browsers store it). */
  appBytes: number;
  items: { key: string; label: string; bytes: number }[];
  /** The browser's own estimate for this site, when it provides one. */
  estimate: { usage: number; quota: number } | null;
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const items = appKeys().map((key) => {
    const value = localStorage.getItem(key) ?? "";
    return { key, label: LABELS[key] ?? key, bytes: (key.length + value.length) * 2 };
  });
  let estimate: StorageUsage["estimate"] = null;
  try {
    const e = await navigator.storage?.estimate?.();
    if (e && typeof e.usage === "number" && typeof e.quota === "number") estimate = { usage: e.usage, quota: e.quota };
  } catch {
    estimate = null;
  }
  return { appBytes: items.reduce((n, i) => n + i.bytes, 0), items: items.sort((a, b) => b.bytes - a.bytes), estimate };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/**
 * Clears data the app can rebuild on its own: browser caches for this site
 * and per-tab session data. Library, practice history, chats and settings
 * are not touched. Returns how many cache stores were removed.
 */
export async function clearCache(): Promise<number> {
  let removed = 0;
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      removed = names.length;
    }
  } catch {
    // Cache Storage unavailable (e.g. private mode) — nothing to clear.
  }
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
  return removed;
}

/** "Export my data": every stored item as JSON in a ZIP, with a short README. */
export function exportMyData(appVersion: string): void {
  const now = new Date();
  const files = appKeys().map((key) => {
    const raw = localStorage.getItem(key) ?? "";
    let pretty = raw;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // not JSON — export as-is
    }
    return { name: `${key.replace(/[^a-z0-9_.-]+/gi, "_")}.json`, content: pretty };
  });
  const readme = [
    "Wilsify AI — your data export",
    `Exported: ${now.toISOString()}`,
    `App version: ${appVersion}`,
    "",
    "Wilsify has no accounts yet, so everything it knows about you lives in",
    "this browser. These files are that data, exactly as stored:",
    "",
    ...appKeys().map((k) => `- ${k.replace(/[^a-z0-9_.-]+/gi, "_")}.json — ${LABELS[k] ?? k}`),
    "",
    "Uploaded audio is never stored: the server analyses it and deletes it.",
  ].join("\n");
  const blob = createZip([{ name: "README.txt", content: readme }, ...files], now);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wilsify-data-${now.toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
