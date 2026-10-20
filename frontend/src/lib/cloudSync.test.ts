import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult } from "./api";

// Deterministic in-memory localStorage for Node test environment
const store = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return store.size;
  },
  clear() {
    store.clear();
  },
  getItem(key: string) {
    return store.has(key) ? store.get(key)! : null;
  },
  key(index: number) {
    return Array.from(store.keys())[index] ?? null;
  },
  removeItem(key: string) {
    store.delete(key);
  },
  setItem(key: string, value: string) {
    store.set(key, String(value));
  },
};
Object.defineProperty(globalThis, "localStorage", {
  value: memoryStorage,
  configurable: true,
  writable: true,
});

const calls: { op: string; arg: unknown }[] = [];
let mockError: { code?: string; message: string } | null = null;
let mockSelectRows: { kind: string; id: string; data: unknown; updated_at?: string }[] = [];

vi.mock("./supabase", () => {
  const query = {
    select: () =>
      Promise.resolve(
        mockError ? { data: null, error: mockError } : { data: mockSelectRows, error: null },
      ),
    upsert: (rows: unknown) => {
      calls.push({ op: "upsert", arg: rows });
      return Promise.resolve({ error: mockError });
    },
    delete: () => ({
      eq: () => ({
        in: (_c: string, ids: unknown) => {
          calls.push({ op: "delete", arg: ids });
          return Promise.resolve({ error: mockError });
        },
      }),
    }),
  };
  return { supabase: { from: () => query } };
});

const {
  clearSyncError,
  getLastSyncError,
  hasPendingSync,
  pullAccountData,
  syncList,
} = await import("./cloudSync");
const {
  getLibrary,
  resolveLibrarySong,
  saveToLibrary,
  updateLibrarySongState,
} = await import("./library");
const { loadLyrics, saveLyrics } = await import("./song/songStore");

const SAMPLE_ANALYSIS: AnalysisResult = {
  isDemo: false,
  demoNotice: null,
  fileName: "sample.mp3",
  fileSizeBytes: 1024,
  processingSeconds: 1.2,
  key: "C major",
  mode: "major",
  scale: "C major",
  bpm: 120,
  timeSignature: "4/4",
  durationSeconds: 180,
  duration: "3:00",
  chordProgression: ["C", "G"],
  chordTimeline: [
    { chord: "C", start: 0, end: 2, confidence: 0.92 },
    { chord: "G", start: 2, end: 4, confidence: 0.88 },
  ],
  difficulty: {
    difficultyLabel: "Beginner",
    difficultyScore: 20,
    factors: { chordComplexity: 10, chordChangeRate: 20, tempo: 30, modulation: 0 },
  },
};

describe("TASK-02: cloudSync, library state, and offline-first lyrics", () => {
  beforeEach(() => {
    store.clear();
    calls.length = 0;
    mockError = null;
    mockSelectRows = [];
    clearSyncError();
  });

  it("pushes only changed items and deletes removed ones in syncList", async () => {
    syncList(
      "library",
      [
        { id: "a", n: 1 },
        { id: "b", n: 1 },
        { id: "c", n: 1 },
      ] as never,
      [
        { id: "a", n: 1 },
        { id: "b", n: 2 },
        { id: "d", n: 1 },
      ] as never,
    );
    await Promise.resolve();
    const upserted = (calls.find((c) => c.op === "upsert")?.arg as { id: string }[]).map((r) => r.id);
    expect(upserted).toEqual(["b", "d"]);
    expect(calls.find((c) => c.op === "delete")?.arg).toEqual(["c"]);
  });

  it("sends nothing when the list is unchanged", () => {
    syncList("chat", [{ id: "a" }], [{ id: "a" }]);
    expect(calls).toEqual([]);
  });

  it("1. Legacy SavedAnalysis without lyrics, transpose, or capo loads normally", () => {
    const legacyRecord = [
      {
        id: "legacy-1",
        fileName: "vintage-track.mp3",
        savedAt: "2026-01-01T00:00:00.000Z",
        analysis: SAMPLE_ANALYSIS,
      },
    ];
    localStorage.setItem("wilsify_library_v1", JSON.stringify(legacyRecord));

    const loaded = getLibrary();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("legacy-1");
    expect(loaded[0].fileName).toBe("vintage-track.mp3");
    expect(loaded[0].lyrics).toBeUndefined();
    expect(loaded[0].transpose).toBeUndefined();
    expect(loaded[0].capo).toBeUndefined();
    expect(loadLyrics("legacy-1")).toBeNull();
  });

  it("2. Lyrics, transpose, and capo save locally first and resolve across file:<fileName> and library ID", () => {
    const entry = saveToLibrary("acoustic-demo.wav", SAMPLE_ANALYSIS);
    calls.length = 0;

    // Save lyrics via file:<fileName> (as SongView does right after upload)
    saveLyrics("file:acoustic-demo.wav", {
      raw: "Hello world\nSecond line",
      source: "pasted",
      taps: { 0: 1.25 },
    });

    // Immediate local read works by both file:<fileName> and library ID
    const byFileKey = loadLyrics("file:acoustic-demo.wav");
    const byId = loadLyrics(entry.id);
    expect(byFileKey?.raw).toBe("Hello world\nSecond line");
    expect(byId?.raw).toBe("Hello world\nSecond line");
    expect(byId?.taps).toEqual({ 0: 1.25 });

    // Save transpose and capo locally
    const updated = updateLibrarySongState(entry.id, { transpose: 3, capo: 2 });
    expect(updated?.transpose).toBe(3);
    expect(updated?.capo).toBe(2);
    expect(updated?.lyrics?.raw).toBe("Hello world\nSecond line");

    // Verify localStorage has the updated SavedAnalysis immediately
    const rawLib = JSON.parse(localStorage.getItem("wilsify_library_v1") ?? "[]");
    expect(rawLib[0].transpose).toBe(3);
    expect(rawLib[0].capo).toBe(2);
    expect(rawLib[0].lyrics.raw).toBe("Hello world\nSecond line");
  });

  it("3. Supabase sync success updates cloud user_data with lyrics, transpose, and capo", async () => {
    const entry = saveToLibrary("cloud-song.mp3", SAMPLE_ANALYSIS);
    calls.length = 0;

    updateLibrarySongState(entry.id, {
      transpose: -2,
      capo: 4,
      lyrics: { raw: "Synced chorus", source: "pasted" },
    });

    await Promise.resolve();
    const upsertCall = calls.find((c) => c.op === "upsert");
    expect(upsertCall).toBeDefined();
    const rows = upsertCall?.arg as { kind: string; id: string; data: Record<string, unknown> }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("library");
    expect(rows[0].id).toBe(entry.id);
    expect(rows[0].data.transpose).toBe(-2);
    expect(rows[0].data.capo).toBe(4);
    expect((rows[0].data.lyrics as { raw: string }).raw).toBe("Synced chorus");
    expect(getLastSyncError()).toBeNull();
    expect(hasPendingSync()).toBe(false);
  });

  it("4. Supabase failure preserves local data, records a visible sync error, and does not overwrite newer local lyrics on pull", async () => {
    mockError = { code: "42P01", message: 'relation "public.user_data" does not exist' };

    const entry = saveToLibrary("offline-song.mp3", SAMPLE_ANALYSIS);
    updateLibrarySongState(entry.id, {
      transpose: 5,
      capo: 1,
      lyrics: {
        raw: "Newer local offline lyrics",
        source: "pasted",
        updatedAt: "2026-10-17T12:00:00.000Z",
      },
    });

    // Wait for async Supabase promise rejection/error handling
    await new Promise((r) => setTimeout(r, 10));

    // Local data is intact
    const saved = resolveLibrarySong(entry.id);
    expect(saved?.transpose).toBe(5);
    expect(saved?.capo).toBe(1);
    expect(loadLyrics(entry.id)?.raw).toBe("Newer local offline lyrics");

    // Visible sync error and pending sync flag are recorded
    expect(getLastSyncError()).toContain("public.user_data");
    expect(hasPendingSync()).toBe(true);

    // Pulling while Supabase still errors preserves local data
    await pullAccountData("user-123");
    expect(getLibrary()).toHaveLength(1);
    expect(loadLyrics(entry.id)?.raw).toBe("Newer local offline lyrics");

    // Now Supabase recovers, returning older cloud lyrics for the same song
    mockError = null;
    mockSelectRows = [
      {
        kind: "library",
        id: entry.id,
        updated_at: "2026-10-17T10:00:00.000Z",
        data: {
          ...entry,
          transpose: 0,
          capo: 0,
          stateUpdatedAt: "2026-10-17T10:00:00.000Z",
          lyrics: {
            raw: "Older cloud lyrics",
            source: "pasted",
            updatedAt: "2026-10-17T10:00:00.000Z",
          },
        },
      },
    ];

    await pullAccountData("user-123");

    // Newer local lyrics and state are preserved and not overwritten by older cloud data
    expect(loadLyrics(entry.id)?.raw).toBe("Newer local offline lyrics");
    expect(resolveLibrarySong(entry.id)?.transpose).toBe(5);
    expect(getLastSyncError()).toBeNull();
  });

  it("5. updateLibrarySongState works with fileName, file:<fileName>, and library ID on the same record", () => {
    const entry = saveToLibrary("my-jam.mp3", SAMPLE_ANALYSIS);

    const byName = updateLibrarySongState("my-jam.mp3", { transpose: 2 });
    expect(byName?.id).toBe(entry.id);
    expect(byName?.transpose).toBe(2);

    const byFilePrefix = updateLibrarySongState("file:my-jam.mp3", { capo: 3 });
    expect(byFilePrefix?.id).toBe(entry.id);
    expect(byFilePrefix?.transpose).toBe(2);
    expect(byFilePrefix?.capo).toBe(3);

    const byId = updateLibrarySongState(entry.id, {
      lyrics: { raw: "Bridge lyrics", source: "pasted" },
    });
    expect(byId?.id).toBe(entry.id);
    expect(byId?.transpose).toBe(2);
    expect(byId?.capo).toBe(3);
    expect(loadLyrics("file:my-jam.mp3")?.raw).toBe("Bridge lyrics");
    expect(loadLyrics(entry.id)?.raw).toBe("Bridge lyrics");
    expect(getLibrary()).toHaveLength(1);
  });

  it("6. Invalid transpose and capo values are rejected before modifying state", () => {
    const entry = saveToLibrary("validation.mp3", SAMPLE_ANALYSIS);

    expect(() => updateLibrarySongState(entry.id, { transpose: -13 })).toThrow(RangeError);
    expect(() => updateLibrarySongState(entry.id, { transpose: 13 })).toThrow(RangeError);
    expect(() => updateLibrarySongState(entry.id, { transpose: 1.5 })).toThrow(RangeError);
    expect(() => updateLibrarySongState(entry.id, { capo: -1 })).toThrow(RangeError);
    expect(() => updateLibrarySongState(entry.id, { capo: 8 })).toThrow(RangeError);
    expect(() => updateLibrarySongState(entry.id, { capo: 2.5 })).toThrow(RangeError);

    const unchanged = resolveLibrarySong(entry.id);
    expect(unchanged?.transpose).toBeUndefined();
    expect(unchanged?.capo).toBeUndefined();
  });
});
