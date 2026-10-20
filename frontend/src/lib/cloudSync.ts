/**
 * Keeps the per-device lists (Library, AI chats, practice log) in sync with
 * the signed-in account (Supabase table `user_data`, see
 * supabase/migrations/0001_user_data.sql).
 *
 * localStorage stays the working copy, so every page keeps reading it
 * synchronously. On sign-in the account's rows replace it (pullAccountData);
 * every write then pushes only what changed (syncList).
 */
import { supabase } from "./supabase";
import { hydrateLocalLyricsFromCloud, type StoredLyrics } from "./song/songStore";

export const SYNCED_KEYS = {
  library: "wilsify_library_v1",
  chat: "wilsify:assistant-chats",
  practice: "wilsify_practice_sessions_v1",
} as const;
export type SyncKind = keyof typeof SYNCED_KEYS;

/** Which account the synced keys in this browser belong to. */
const OWNER_KEY = "wilsify:sync-owner";
/** Kinds that failed to sync while offline and should be retried on next session load. */
const PENDING_KEY = "wilsify:sync-pending";

type Item = {
  id: string;
  fileName?: string;
  savedAt?: string;
  stateUpdatedAt?: string;
  updatedAt?: number | string;
  lyrics?: StoredLyrics | null;
};

let lastSyncError: string | null = null;
const errorListeners = new Set<(err: string | null) => void>();

function formatSyncError(error: unknown): string {
  const msg =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    /user_data.*does not exist|could not find the table/i.test(msg)
  ) {
    return "Cloud sync table (public.user_data) is not set up in Supabase yet — your songs and lyrics are safely saved on this device.";
  }
  return "Cloud sync is temporarily unavailable — your songs and lyrics are safely saved on this device.";
}

function setSyncError(error: string | null) {
  lastSyncError = error;
  for (const listener of errorListeners) {
    try {
      listener(lastSyncError);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function getLastSyncError(): string | null {
  return lastSyncError;
}

export function clearSyncError(): void {
  setSyncError(null);
}

export function subscribeSyncError(listener: (err: string | null) => void): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

function readPendingKinds(): Set<SyncKind> {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as SyncKind[]) : new Set();
  } catch {
    return new Set();
  }
}

function markPendingKind(kind: SyncKind, pending: boolean) {
  try {
    const current = readPendingKinds();
    if (pending) current.add(kind);
    else current.delete(kind);
    if (current.size === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(Array.from(current)));
  } catch {
    /* ignore storage errors */
  }
}

export function hasPendingSync(): boolean {
  return readPendingKinds().size > 0;
}

function warn(what: string, kind: SyncKind | null, error: unknown) {
  if (!error) return;
  console.warn(`[sync] ${what} failed`, error);
  if (kind) markPendingKind(kind, true);
  setSyncError(formatSyncError(error));
}

function itemTimestamp(item: Item): number {
  const candidates = [item.stateUpdatedAt, item.savedAt, item.updatedAt];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string") {
      const t = Date.parse(c);
      if (Number.isFinite(t)) return t;
    }
  }
  return 0;
}

function readLocalKind(kind: SyncKind): Item[] {
  try {
    const raw = localStorage.getItem(SYNCED_KEYS[kind]);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Item[]) : [];
  } catch {
    return [];
  }
}

/**
 * Pushes the difference between two versions of a list to the account.
 * If offline or Supabase errors, marks the kind dirty in localStorage and
 * records a non-blocking sync warning without losing local data.
 */
export function syncList(kind: SyncKind, before: Item[], after: Item[]) {
  const old = new Map(before.map((item) => [item.id, JSON.stringify(item)]));
  const changed = after.filter((item) => old.get(item.id) !== JSON.stringify(item));
  const kept = new Set(after.map((item) => item.id));
  const removed = before.filter((item) => !kept.has(item.id)).map((item) => item.id);

  if (!changed.length && !removed.length) return;

  if (changed.length) {
    const rows = changed.map((item) => ({ kind, id: item.id, data: item, updated_at: new Date().toISOString() }));
    void Promise.resolve(supabase.from("user_data").upsert(rows, { onConflict: "user_id,kind,id" }))
      .then(({ error }) => {
        if (error) warn(`save ${kind}`, kind, error);
        else {
          markPendingKind(kind, false);
          clearSyncError();
        }
      })
      .catch((err) => warn(`save ${kind}`, kind, err));
  }
  if (removed.length) {
    void Promise.resolve(supabase.from("user_data").delete().eq("kind", kind).in("id", removed))
      .then(({ error }) => {
        if (error) warn(`delete ${kind}`, kind, error);
        else {
          markPendingKind(kind, false);
          clearSyncError();
        }
      })
      .catch((err) => warn(`delete ${kind}`, kind, err));
  }
}

/**
 * Merges cloud account rows with local browser storage.
 * - Never deletes local data when Supabase fails for the current or offline user.
 * - Preserves newer local edits or pending offline writes and pushes them to Supabase.
 * - Hydrates local lyric storage from SavedAnalysis.lyrics without overwriting newer local lyrics.
 */
export async function pullAccountData(userId: string): Promise<void> {
  const owner = localStorage.getItem(OWNER_KEY);
  const sameOrUnclaimedOwner = !owner || owner === userId;

  let data: { kind: string; id: string; data: Item }[] | null = null;
  let error: unknown = null;
  try {
    const res = await supabase.from("user_data").select("kind, id, data");
    data = (res.data as { kind: string; id: string; data: Item }[] | null) ?? null;
    error = res.error;
  } catch (err) {
    error = err;
  }

  if (error || !data) {
    warn("load account data", null, error ?? new Error("Empty response from user_data"));
    // Only clear local storage if switching away from a DIFFERENT signed-in account.
    if (owner && owner !== userId) forgetLocalData();
    return;
  }

  clearSyncError();
  const pendingKinds = readPendingKinds();
  const byKind: Record<SyncKind, Item[]> = { library: [], chat: [], practice: [] };
  for (const row of data) {
    if (row && row.kind in byKind && row.data && typeof row.data === "object") {
      byKind[row.kind as SyncKind].push(row.data);
    }
  }

  try {
    for (const kind of Object.keys(SYNCED_KEYS) as SyncKind[]) {
      const cloudItems = byKind[kind];
      const localItems = sameOrUnclaimedOwner ? readLocalKind(kind) : [];
      const mergedMap = new Map<string, Item>();

      for (const cItem of cloudItems) {
        mergedMap.set(cItem.id, cItem);
      }

      const toPushUp: Item[] = [];
      for (const lItem of localItems) {
        const existingCloud = mergedMap.get(lItem.id);
        if (!existingCloud) {
          // Local item created while offline or before initial sync: keep and push when pending/unclaimed.
          if (pendingKinds.has(kind) || !owner || cloudItems.length === 0) {
            mergedMap.set(lItem.id, lItem);
            toPushUp.push(lItem);
          }
        } else if (itemTimestamp(lItem) > itemTimestamp(existingCloud)) {
          mergedMap.set(lItem.id, lItem);
          toPushUp.push(lItem);
        }
      }

      const finalItems = Array.from(mergedMap.values());
      if (kind === "library") {
        for (const item of finalItems) {
          if (item.id && item.fileName && item.lyrics) {
            hydrateLocalLyricsFromCloud(item.id, item.fileName, item.lyrics);
          }
        }
      }

      localStorage.setItem(SYNCED_KEYS[kind], JSON.stringify(finalItems));

      if (toPushUp.length > 0) {
        const rows = toPushUp.map((item) => ({ kind, id: item.id, data: item, updated_at: new Date().toISOString() }));
        void Promise.resolve(supabase.from("user_data").upsert(rows, { onConflict: "user_id,kind,id" }))
          .then(({ error: pushErr }) => {
            if (pushErr) warn(`retry ${kind}`, kind, pushErr);
            else markPendingKind(kind, false);
          })
          .catch((err) => warn(`retry ${kind}`, kind, err));
      } else {
        markPendingKind(kind, false);
      }
    }
    localStorage.setItem(OWNER_KEY, userId);
  } catch (e) {
    warn("store account data in this browser", null, e);
  }
}

/** On sign-out: the next person on this browser must not see this account's data. */
export function forgetLocalData() {
  try {
    for (const key of Object.values(SYNCED_KEYS)) localStorage.removeItem(key);
    localStorage.removeItem(PENDING_KEY);
    localStorage.setItem(OWNER_KEY, "");
  } catch {
    // storage blocked — nothing stored to forget
  }
}

/** "Delete my data": removes every synced row from the account. */
export async function deleteAccountData(): Promise<void> {
  const { error } = await supabase.from("user_data").delete().in("kind", Object.keys(SYNCED_KEYS));
  if (error) throw new Error("Couldn't delete your data from your account. Check your connection and try again.");
}
