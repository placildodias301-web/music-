/**
 * TASK-10 — core-loop LOGIC tests (no DOM). Everything here calls the real
 * app modules; rendered screens and routes are covered in
 * src/components/coreLoopScreens.test.tsx and src/pages/*.test.tsx.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { authMessage, createAuthController } from "./auth";
import { AnalysisError, analyzeFile, validateUploadFile, validateYouTubeUrl } from "./api";
import {
  getLibrary,
  resolveLibrarySong,
  restoreActiveSongFromSession,
  saveToLibrary,
  updateLibrarySongState,
} from "./library";
import { loadLyrics, saveLyrics } from "./song/songStore";
import { getMicrophoneErrorMessage, loadPracticePreferences, savePracticePreferences } from "./practicePreferences";
import { installFakeXhr, xhrBehaviour } from "../test/fakeNetwork";
import { makeSession } from "../test/fakeSupabase";
import { audioFile, makeAnalysis } from "../test/fixtures";

/** A Supabase client double whose auth events the test controls. */
function authClient(session: Session | null) {
  let emit: (event: string, s: Session | null) => void = () => {};
  const unsubscribe = vi.fn();
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      onAuthStateChange: vi.fn((cb: typeof emit) => {
        emit = cb;
        return { data: { subscription: { unsubscribe } } };
      }),
    },
  } as unknown as SupabaseClient;
  return { client, unsubscribe, emit: (e: string, s: Session | null) => emit(e, s) };
}


describe("auth controller", () => {
  it("hydrates a stored session into an authenticated user", async () => {
    const { client } = authClient(makeSession());
    const auth = createAuthController({ client, configError: null, pullData: vi.fn(async () => {}), forgetData: vi.fn() });
    expect(auth.getSnapshot().status).toBe("loading");
    auth.start();
    await vi.waitFor(() => expect(auth.getSnapshot().status).toBe("authenticated"));
    expect(auth.getSnapshot().user).toMatchObject({ email: "tester@wilsify.test", firstName: "Test", lastName: "User" });
    auth.stop();
  });

  it("is unauthenticated with no stored session", async () => {
    const { client } = authClient(null);
    const auth = createAuthController({ client, configError: null, pullData: vi.fn(), forgetData: vi.fn() });
    auth.start();
    await vi.waitFor(() => expect(auth.getSnapshot().status).toBe("unauthenticated"));
    expect(auth.getSnapshot().session).toBeNull();
    auth.stop();
  });

  it("a SIGNED_OUT event clears the user and wipes this account's local data; stop() unsubscribes", async () => {
    const { client, emit, unsubscribe } = authClient(makeSession());
    const forgetData = vi.fn();
    const auth = createAuthController({ client, configError: null, pullData: vi.fn(async () => {}), forgetData });
    auth.start();
    await vi.waitFor(() => expect(auth.getSnapshot().status).toBe("authenticated"));

    emit("SIGNED_OUT", null);
    expect(auth.getSnapshot()).toMatchObject({ status: "unauthenticated", user: null, session: null });
    expect(forgetData).toHaveBeenCalledTimes(1);

    auth.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("reports a timeout (retryable) when the session check hangs", async () => {
    vi.useFakeTimers();
    const client = {
      auth: { getSession: () => new Promise(() => {}), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    } as unknown as SupabaseClient;
    const auth = createAuthController({ client, configError: null, hydrationTimeoutMs: 50, pullData: vi.fn(), forgetData: vi.fn() });
    auth.start();
    await vi.advanceTimersByTimeAsync(60);
    expect(auth.getSnapshot().status).toBe("timeout");
    auth.stop();
  });

  it("maps auth failures to human messages", () => {
    expect(authMessage({ code: "invalid_credentials", name: "AuthApiError", status: 400 })).toBe("Incorrect email or password.");
    expect(authMessage({ name: "AuthRetryableFetchError", status: 0 })).toBe("Cannot reach authentication service. Check your internet connection.");
    expect(authMessage({ code: "over_request_rate_limit", status: 429 })).toBe("Too many attempts. Please wait and try again.");
    expect(authMessage({ code: "email_not_confirmed" })).toBe("Please confirm your email before signing in.");
  });
});

describe("upload validation", () => {
  it("accepts a normal audio file", () => {
    expect(validateUploadFile(audioFile("song.mp3"))).toBeNull();
  });
  it("rejects missing, empty, oversized and unsupported files with specific messages", () => {
    expect(validateUploadFile(null)).toBe("Please choose an audio or video file.");
    expect(validateUploadFile(audioFile("empty.wav", 0))).toBe("File is empty.");
    expect(validateUploadFile({ name: "huge.wav", size: 101 * 1024 * 1024 })).toBe("File is too large. Maximum size is 100 MB.");
    expect(validateUploadFile(audioFile("malware.exe", 500))).toMatch(/^Unsupported file type/);
    expect(validateUploadFile(audioFile("noextension", 500))).toMatch(/^Unsupported file type/);
  });
  it("YouTube validation accepts single videos and rejects other hosts and playlists", () => {
    expect(validateYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(validateYouTubeUrl("https://vimeo.com/12345678")).toEqual(expect.any(String));
    expect(validateYouTubeUrl("https://www.youtube.com/playlist?list=PL12345")).toEqual(expect.any(String));
    expect(validateYouTubeUrl("")).toEqual(expect.any(String));
  });
});

describe("analyzeFile (network boundary faked)", () => {
  beforeEach(() => installFakeXhr());

  it("rejects an invalid file before any request is made", async () => {
    await expect(analyzeFile(audioFile("bad.exe", 100))).rejects.toMatchObject({ name: "AnalysisError", kind: "unsupported" });
    expect(xhrBehaviour.instances).toHaveLength(0);
  });

  it("a network failure becomes a retryable 'network' AnalysisError and leaves the file untouched", async () => {
    xhrBehaviour.script = (xhr) => xhr.failWithNetworkError();
    const file = audioFile("track.wav");
    const err = await analyzeFile(file).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisError);
    expect(err.kind).toBe("network");
    expect(file.name).toBe("track.wav");
  });

  it("an already-aborted signal cancels without sending", async () => {
    const c = new AbortController();
    c.abort();
    await expect(analyzeFile(audioFile("a.mp3"), { signal: c.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(xhrBehaviour.instances).toHaveLength(0);
  });
});

describe("Library persistence", () => {
  const analysis = makeAnalysis();

  it("saveToLibrary stores a completed analysis that is immediately resolvable by id, file name and file:<name>", () => {
    const saved = saveToLibrary("mister_sandman.mp3", analysis);
    expect(getLibrary()).toHaveLength(1);
    for (const ref of [saved.id, "mister_sandman.mp3", "file:mister_sandman.mp3"]) {
      expect(resolveLibrarySong(ref)?.id).toBe(saved.id);
    }
  });

  it("refuses to save an incomplete analysis (what a failed run would produce)", () => {
    expect(() => saveToLibrary("x.mp3", { ...analysis, chordTimeline: [] })).toThrow(/incomplete or invalid/);
    expect(() => saveToLibrary("x.mp3", { ...analysis, bpm: 0 })).toThrow();
    expect(getLibrary()).toEqual([]);
  });

  it("saving the same file again updates one record instead of duplicating it", () => {
    const a = saveToLibrary("song.mp3", analysis);
    const b = saveToLibrary("song.mp3", { ...analysis, bpm: 90 });
    expect(b.id).toBe(a.id);
    expect(getLibrary()).toHaveLength(1);
    expect(getLibrary()[0].analysis.bpm).toBe(90);
  });

  it("the active song reference survives a refresh (sessionStorage) and corrupt data falls back to a clean empty state", () => {
    const saved = saveToLibrary("song.mp3", analysis);
    sessionStorage.setItem("wilsify:active-song", JSON.stringify({ libraryId: saved.id, fileKey: "file:song.mp3", fileName: "song.mp3" }));
    expect(restoreActiveSongFromSession()?.id).toBe(saved.id);

    sessionStorage.setItem("wilsify:active-song", "{corrupt");
    expect(restoreActiveSongFromSession()).toBeNull();
    expect(sessionStorage.getItem("wilsify:active-song")).toBeNull();
  });

  it("never restores a blob: URL as the active song", () => {
    saveToLibrary("song.mp3", analysis);
    sessionStorage.setItem("wilsify:active-song", JSON.stringify({ libraryId: null, fileKey: "blob:http://x/1", fileName: "song.mp3" }));
    expect(restoreActiveSongFromSession()).toBeNull();
  });

  it("transpose, capo and simplify persist on the record and out-of-range values are rejected", () => {
    const saved = saveToLibrary("song.mp3", analysis);
    updateLibrarySongState(saved.id, { transpose: 2, capo: 1, simplify: true });
    expect(resolveLibrarySong(saved.id)).toMatchObject({ transpose: 2, capo: 1, simplify: true });
    expect(() => updateLibrarySongState(saved.id, { transpose: 13 })).toThrow(RangeError);
    expect(() => updateLibrarySongState(saved.id, { capo: 8 })).toThrow(RangeError);
    expect(resolveLibrarySong(saved.id)?.transpose).toBe(2);
  });

  it("lyrics saved under the file name are found by Library id, and the reverse", () => {
    const saved = saveToLibrary("let_it_be.mp3", analysis);
    saveLyrics(saved.fileName, { raw: "[Verse 1]\nWhen I find myself", source: "pasted" });
    expect(loadLyrics(saved.id)?.raw).toContain("When I find myself");
    saveLyrics(saved.id, { raw: "[Chorus]\nLet it be", source: "uploaded" });
    expect(loadLyrics(`file:${saved.fileName}`)?.raw).toContain("Let it be");
  });
});

describe("practice preferences", () => {
  it("round-trips speed/loop/auto-tempo/mode per song and snaps invalid speeds to 1x", () => {
    savePracticePreferences("take_five.mp3", { speed: 0.75, loop: true, autoTempoEnabled: true, preferredMode: "chord_practice" });
    expect(loadPracticePreferences("file:take_five.mp3")).toMatchObject({ speed: 0.75, loop: true, autoTempoEnabled: true, preferredMode: "chord_practice" });
    savePracticePreferences("take_five.mp3", { speed: 3 as never, loop: false, autoTempoEnabled: false });
    expect(loadPracticePreferences("take_five.mp3")?.speed).toBe(1);
    expect(loadPracticePreferences("other.mp3")).toBeNull();
  });

  it("corrupt stored preferences are ignored", () => {
    localStorage.setItem("wilsify.practice.prefs.song.mp3", "{nope");
    expect(loadPracticePreferences("song.mp3")).toBeNull();
  });

  it("microphone errors become plain-language instructions", () => {
    expect(getMicrophoneErrorMessage({ name: "NotAllowedError" })).toMatch(/permission was denied/i);
    expect(getMicrophoneErrorMessage({ name: "NotFoundError" })).toBe("No microphone was found.");
    expect(getMicrophoneErrorMessage({ name: "NotReadableError" })).toMatch(/another app/);
    expect(getMicrophoneErrorMessage(new Error("weird"))).toMatch(/Couldn't access the microphone/);
  });
});

