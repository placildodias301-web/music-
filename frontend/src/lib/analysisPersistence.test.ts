import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult } from "./api";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
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
}

Object.defineProperty(globalThis, "localStorage", {
  value: createMemoryStorage(),
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: createMemoryStorage(),
  configurable: true,
  writable: true,
});

const mockUpsert = vi.fn();
let mockSelectError: { code?: string; message: string } | null = null;

vi.mock("./supabase", () => {
  const query = {
    select: () =>
      Promise.resolve(
        mockSelectError ? { data: null, error: mockSelectError } : { data: [], error: null },
      ),
    upsert: (...args: unknown[]) => mockUpsert(...args),
    delete: () => ({
      eq: () => ({
        in: () => Promise.resolve({ error: null }),
      }),
    }),
  };
  return {
    supabaseConfigured: true,
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
      from: () => query,
    },
  };
});

const {
  ACTIVE_SONG_SESSION_KEY,
  clearActiveSongRef,
  getLibrary,
  persistActiveSongRef,
  restoreActiveSongFromSession,
  saveToLibrary,
} = await import("./library");
const { analyzeFile, AnalysisError } = await import("./api");
const { clearSyncError, getLastSyncError, pullAccountData } = await import("./cloudSync");
const { saveLyrics } = await import("./song/songStore");

function makeValidAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    fileName: "wonderwall.mp3",
    fileSizeBytes: 2048,
    key: "F# Minor",
    mode: "minor",
    scale: "minor",
    bpm: 87,
    timeSignature: "4/4",
    duration: "04:18",
    durationSeconds: 258,
    chordProgression: ["F#m", "A", "E", "B"],
    chordTimeline: [
      { chord: "F#m", start: 0, end: 2.5 },
      { chord: "A", start: 2.5, end: 5.0 },
      { chord: "E", start: 5.0, end: 7.5 },
      { chord: "B", start: 7.5, end: 10.0 },
    ],
    processingSeconds: 1.4,
    isDemo: false,
    demoNotice: "",
    difficulty: {
      difficultyLabel: "Beginner",
      difficultyScore: 22,
      factors: { chordComplexity: 15, chordChangeRate: 20, tempo: 25, modulation: 0 },
    },
    capo: {
      detected: true,
      fret: 2,
      confidence: 0.82,
      soundingKey: "F# Minor",
      shapeKey: "E Minor",
    },
    ...overrides,
  };
}

type XhrSendBehavior = (xhr: MockXMLHttpRequest) => void;
let currentXhrBehavior: XhrSendBehavior | null = null;

class MockXMLHttpRequest {
  status = 200;
  responseText = "";
  timeout = 0;
  headers: Record<string, string> = {};
  upload: {
    onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(_method: string, _url: string) {}
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(_body?: unknown) {
    if (currentXhrBehavior) {
      currentXhrBehavior(this);
    }
  }
  abort() {
    this.onabort?.();
  }
}

Object.defineProperty(globalThis, "XMLHttpRequest", {
  value: MockXMLHttpRequest,
  configurable: true,
  writable: true,
});

describe("TASK-06: MIR analysis auto-save, refresh persistence, and streaming resilience", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearSyncError();
    mockSelectError = null;
    currentXhrBehavior = null;
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: null });
    vi.restoreAllMocks();
  });

  it("auto-saves successful analysis to Library with current lyrics, transpose, and capo state", () => {
    saveLyrics("file:wonderwall.mp3", {
      raw: "[Verse]\nToday is gonna be the day",
      source: "pasted",
    });

    const analysis = makeValidAnalysis();
    const saved = saveToLibrary("wonderwall.mp3", analysis, { transpose: 1 });

    expect(saved.fileName).toBe("wonderwall.mp3");
    expect(saved.analysis.key).toBe("F# Minor");
    expect(saved.lyrics?.raw).toContain("Today is gonna be the day");
    expect(saved.transpose).toBe(1);
    expect(saved.capo).toBe(2);
    expect(getLibrary()).toHaveLength(1);
  });

  it("rejects incomplete or failed analyses so they are never saved as usable Library songs", () => {
    const emptyTimelineAnalysis = makeValidAnalysis({ chordTimeline: [] });
    expect(() => saveToLibrary("broken.mp3", emptyTimelineAnalysis)).toThrow(/incomplete or invalid analysis/i);
    expect(getLibrary()).toHaveLength(0);
  });

  it("persists stable active-song reference in sessionStorage without Blob URLs and restores across refresh", () => {
    const analysis = makeValidAnalysis();
    const saved = saveToLibrary("wonderwall.mp3", analysis);

    persistActiveSongRef({
      libraryId: saved.id,
      fileName: saved.fileName,
    });

    const rawSession = sessionStorage.getItem(ACTIVE_SONG_SESSION_KEY);
    expect(rawSession).toBeTruthy();
    expect(rawSession).not.toContain("blob:");
    expect(rawSession).toContain("file:wonderwall.mp3");

    const restored = restoreActiveSongFromSession();
    expect(restored).not.toBeNull();
    expect(restored?.id).toBe(saved.id);
    expect(restored?.fileName).toBe("wonderwall.mp3");
    expect(restored?.analysis.chordTimeline).toHaveLength(4);
  });

  it("falls back to the most recent valid Library item when sessionStorage has no active song", () => {
    saveToLibrary("older.mp3", makeValidAnalysis({ fileName: "older.mp3", key: "C Major" }));
    const newer = saveToLibrary("newer.mp3", makeValidAnalysis({ fileName: "newer.mp3", key: "G Major" }));
    clearActiveSongRef();

    const restored = restoreActiveSongFromSession();
    expect(restored?.id).toBe(newer.id);
    expect(restored?.fileName).toBe("newer.mp3");
    expect(restored?.analysis.key).toBe("G Major");
  });

  it("clears corrupt or missing sessionStorage active-song records and falls back safely", () => {
    sessionStorage.setItem(ACTIVE_SONG_SESSION_KEY, "{not-valid-json");
    expect(restoreActiveSongFromSession()).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_SONG_SESSION_KEY)).toBeNull();

    // Reference containing a forbidden blob: URL is rejected and cleared
    sessionStorage.setItem(
      ACTIVE_SONG_SESSION_KEY,
      JSON.stringify({
        libraryId: "blob:http://localhost:5173/1234",
        fileKey: "file:song.mp3",
        fileName: "song.mp3",
        updatedAt: new Date().toISOString(),
      }),
    );
    expect(restoreActiveSongFromSession()).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_SONG_SESSION_KEY)).toBeNull();

    // Reference pointing to a deleted Library song is cleared and returns null
    persistActiveSongRef({
      libraryId: "missing-id",
      fileName: "missing.mp3",
    });
    expect(restoreActiveSongFromSession()).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_SONG_SESSION_KEY)).toBeNull();
  });

  it("preserves local Library entry and sets a non-blocking sync warning when Supabase sync fails", async () => {
    await pullAccountData("user-123");
    mockUpsert.mockResolvedValueOnce({ error: { message: "Supabase offline" } });

    const saved = saveToLibrary("offline-track.mp3", makeValidAnalysis({ fileName: "offline-track.mp3" }));
    await new Promise((r) => setTimeout(r, 20));

    expect(getLibrary().some((item) => item.id === saved.id)).toBe(true);
    expect(getLastSyncError()).toBeTruthy();
  });

  it("handles streaming cancellation cleanly without saving partial results", async () => {
    const controller = new AbortController();
    const file = new File([new Uint8Array([1, 2, 3, 4])], "cancel-me.wav", { type: "audio/wav" });

    currentXhrBehavior = (xhr) => {
      xhr.status = 200;
      xhr.responseText = JSON.stringify({ type: "progress", stage: "loading", progress: 8 }) + "\n";
      xhr.onprogress?.();
    };

    const promise = analyzeFile(file, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });

    await expect(promise).rejects.toMatchObject({
      name: "AnalysisError",
      kind: "cancelled",
    });
    expect(getLibrary()).toHaveLength(0);
  });

  it("detects heartbeat loss on stalled analysis stream and rejects with a retryable network error", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "stalled.wav", { type: "audio/wav" });

    currentXhrBehavior = (xhr) => {
      xhr.status = 200;
      xhr.responseText = JSON.stringify({ type: "progress", stage: "chords", progress: 48 }) + "\n";
      xhr.onprogress?.();
      // Stream stalls after the first progress event; heartbeat timer will fire.
    };

    await expect(
      analyzeFile(file, {
        heartbeatTimeoutMs: 40,
      }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AnalysisError &&
        err.kind === "network" &&
        /connection to the analysis server was lost/i.test(err.message)
      );
    });
  });
});
