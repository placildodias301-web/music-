import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALLOWED_PRACTICE_SPEEDS,
  getMicrophoneErrorMessage,
  getPracticePreferencesKey,
  loadPracticePreferences,
  normalizePracticeSpeed,
  savePracticePreferences,
  type PracticePreferences,
} from "./practicePreferences";
import { validateUploadFile } from "./api";
import {
  getLibrary,
  saveToLibrary,
  updateLibrarySongState,
  type SavedAnalysis,
} from "./library";

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

vi.mock("./supabase", () => {
  const query = {
    select: () => Promise.resolve({ data: [], error: null }),
    upsert: () => Promise.resolve({ error: null }),
    delete: () => ({ eq: () => ({ in: () => Promise.resolve({ error: null }) }) }),
  };
  return {
    supabaseConfigured: true,
    supabase: {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
      from: () => query,
    },
  };
});

describe("Practice Studio - Microphone Permission Error Mapping", () => {
  it("maps NotAllowedError to exact permission denied message", () => {
    const error = new DOMException("Permission denied", "NotAllowedError");
    expect(getMicrophoneErrorMessage(error)).toBe(
      "Microphone permission was denied. Enable it in your browser settings to use pitch tracking."
    );
  });

  it("maps PermissionDeniedError legacy name to exact permission denied message", () => {
    const error = { name: "PermissionDeniedError" };
    expect(getMicrophoneErrorMessage(error)).toBe(
      "Microphone permission was denied. Enable it in your browser settings to use pitch tracking."
    );
  });

  it("maps NotFoundError to exact device not found message", () => {
    const error = new DOMException("Requested device not found", "NotFoundError");
    expect(getMicrophoneErrorMessage(error)).toBe("No microphone was found.");
  });

  it("maps DevicesNotFoundError legacy name to exact device not found message", () => {
    const error = { name: "DevicesNotFoundError" };
    expect(getMicrophoneErrorMessage(error)).toBe("No microphone was found.");
  });

  it("maps NotReadableError to exact hardware in-use message", () => {
    const error = new DOMException("Device in use", "NotReadableError");
    expect(getMicrophoneErrorMessage(error)).toBe("Your microphone is being used by another app.");
  });

  it("maps TrackStartError legacy name to exact hardware in-use message", () => {
    const error = { name: "TrackStartError" };
    expect(getMicrophoneErrorMessage(error)).toBe("Your microphone is being used by another app.");
  });

  it("maps SecurityError to exact HTTPS/localhost message", () => {
    const error = new DOMException("Insecure context", "SecurityError");
    expect(getMicrophoneErrorMessage(error)).toBe("Microphone access requires HTTPS or localhost.");
  });

  it("maps unknown or arbitrary errors to fallback message", () => {
    expect(getMicrophoneErrorMessage(new Error("Something went wrong"))).toBe(
      "Couldn't access the microphone — accuracy tracking needs mic access."
    );
    expect(getMicrophoneErrorMessage("error string")).toBe(
      "Couldn't access the microphone — accuracy tracking needs mic access."
    );
    expect(getMicrophoneErrorMessage(null)).toBe(
      "Couldn't access the microphone — accuracy tracking needs mic access."
    );
  });
});

describe("Practice Studio - Re-attach Audio Validation & File Matching", () => {
  it("validates re-attached files using existing preflight upload rules", () => {
    // Empty file
    expect(validateUploadFile({ name: "song.mp3", size: 0 })).toBe("File is empty.");

    // Oversized (>100MB)
    expect(validateUploadFile({ name: "song.mp3", size: 101 * 1024 * 1024 })).toBe(
      "File is too large. Maximum size is 100 MB."
    );

    // Unsupported extension
    expect(validateUploadFile({ name: "song.exe", size: 1024 })).toContain("Unsupported file type");

    // Valid audio files
    expect(validateUploadFile({ name: "take_five.mp3", size: 5 * 1024 * 1024 })).toBeNull();
    expect(validateUploadFile({ name: "track.wav", size: 25 * 1024 * 1024 })).toBeNull();
    expect(validateUploadFile({ name: "tune.m4a", size: 8 * 1024 * 1024 })).toBeNull();
  });

  it("distinguishes matching vs differing file names for re-attachment", () => {
    const activeFileName = "take_five.mp3";
    const sameFile = "take_five.mp3";
    const differentFile = "other_song.mp3";

    const isMatch = (active: string, candidate: string) =>
      active.toLowerCase() === candidate.toLowerCase();

    expect(isMatch(activeFileName, sameFile)).toBe(true);
    expect(isMatch(activeFileName, differentFile)).toBe(false);
  });
});

describe("Practice Studio - Practice Preferences Persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes practice speeds to allowed set [0.5, 0.75, 1, 1.25, 1.5]", () => {
    expect(ALLOWED_PRACTICE_SPEEDS).toEqual([0.5, 0.75, 1, 1.25, 1.5]);
    expect(normalizePracticeSpeed(0.5)).toBe(0.5);
    expect(normalizePracticeSpeed(0.75)).toBe(0.75);
    expect(normalizePracticeSpeed(1)).toBe(1);
    expect(normalizePracticeSpeed(1.25)).toBe(1.25);
    expect(normalizePracticeSpeed(1.5)).toBe(1.5);
    // Invalid speeds fallback to 1
    expect(normalizePracticeSpeed(2)).toBe(1);
    expect(normalizePracticeSpeed(-1)).toBe(1);
    expect(normalizePracticeSpeed("fast")).toBe(1);
    expect(normalizePracticeSpeed(null)).toBe(1);
  });

  it("generates correct namespaced localStorage key", () => {
    expect(getPracticePreferencesKey("take_five.mp3")).toBe("wilsify.practice.prefs.take_five.mp3");
    expect(getPracticePreferencesKey("file:take_five.mp3")).toBe("wilsify.practice.prefs.take_five.mp3");
    expect(getPracticePreferencesKey("song-uuid-123")).toBe("wilsify.practice.prefs.song-uuid-123");
  });

  it("saves and loads preferences without storing blob URLs or streams", () => {
    const prefs: PracticePreferences = {
      speed: 0.75,
      loop: true,
      autoTempoEnabled: true,
      metronomeRunning: true,
      preferredMode: "chord_practice",
    };

    savePracticePreferences("song-abc", prefs);
    const loaded = loadPracticePreferences("song-abc");

    expect(loaded).toEqual(prefs);

    // Verify localStorage payload is clean JSON and has no blob: URLs
    const raw = localStorage.getItem("wilsify.practice.prefs.song-abc");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("blob:");
    expect(raw).not.toContain("MediaStream");
  });

  it("returns null when loading non-existent or corrupt preferences", () => {
    expect(loadPracticePreferences("non-existent")).toBeNull();
    expect(loadPracticePreferences(null)).toBeNull();
    expect(loadPracticePreferences(undefined)).toBeNull();

    localStorage.setItem("wilsify.practice.prefs.bad", "not json");
    expect(loadPracticePreferences("bad")).toBeNull();

    localStorage.setItem("wilsify.practice.prefs.array", "[]");
    expect(loadPracticePreferences("array")).toBeNull();
  });

  it("persists practice preferences to SavedAnalysis in Library without losing lyrics/transpose/capo", () => {
    const mockAnalysis = {
      fileName: "test_song.mp3",
      fileSizeBytes: 2048,
      key: "G major",
      mode: "major",
      scale: "major",
      bpm: 120,
      timeSignature: "4/4",
      duration: "03:00",
      durationSeconds: 180,
      chordProgression: ["G", "C", "D"],
      chordTimeline: [
        { chord: "G", start: 0, end: 2, confidence: 0.9 },
        { chord: "C", start: 2, end: 4, confidence: 0.9 },
        { chord: "D", start: 4, end: 6, confidence: 0.9 },
      ],
      processingSeconds: 1.0,
      isDemo: false,
      demoNotice: "",
    } as unknown as import("./api").AnalysisResult;

    const saved = saveToLibrary("test_song.mp3", mockAnalysis, {
      lyrics: { raw: "Hello world", source: "pasted", updatedAt: "2026-10-18T00:00:00Z" },
      transpose: 2,
      capo: 1,
      simplify: true,
    });

    expect(saved.lyrics?.raw).toBe("Hello world");
    expect(saved.transpose).toBe(2);
    expect(saved.capo).toBe(1);
    expect(saved.simplify).toBe(true);

    // Update with practice preferences
    const updated = updateLibrarySongState(saved.id, {
      practicePreferences: {
        speed: 1.25,
        loop: true,
        autoTempoEnabled: false,
        preferredMode: "full_audio",
      },
    });

    expect(updated).not.toBeNull();
    expect(updated?.practicePreferences?.speed).toBe(1.25);
    expect(updated?.practicePreferences?.loop).toBe(true);
    // Preserves existing lyrics, transpose, capo, simplify
    expect(updated?.lyrics?.raw).toBe("Hello world");
    expect(updated?.transpose).toBe(2);
    expect(updated?.capo).toBe(1);
    expect(updated?.simplify).toBe(true);

    // Check library reloading and normalization
    const lib = getLibrary();
    const reloaded = lib.find((s: SavedAnalysis) => s.id === saved.id);
    expect(reloaded?.practicePreferences?.speed).toBe(1.25);
    expect(reloaded?.lyrics?.raw).toBe("Hello world");
  });
});
