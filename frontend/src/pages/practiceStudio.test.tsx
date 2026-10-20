/**
 * TASK-10 — Practice Studio, through the real app.
 *
 * Mode B (Chord Practice) is what a saved song gets after a refresh because
 * the audio file is never stored. Re-attaching a valid file upgrades the page
 * to Mode A (Full Audio Practice). jsdom has no AudioContext, microphone or
 * media playback, so only those are faked (see src/test/fakeAudio.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp, refreshApp } from "../test/renderApp";
import { makeSession, resetFakeSupabase } from "../test/fakeSupabase";
import { installFakeAudio, type FakeAudioWorld } from "../test/fakeAudio";
import { installFakeFetch } from "../test/fakeNetwork";
import { audioFile, seedSong, SONG_FILE } from "../test/fixtures";

vi.mock("../lib/supabase", async () => (await import("../test/fakeSupabase")).fakeSupabaseModule());

const session = makeSession();
let audio: FakeAudioWorld;

beforeEach(() => {
  resetFakeSupabase();
  audio = installFakeAudio();
  installFakeFetch();
  guardAgainstRunawayPreferenceWrites();
});

const PREFS_KEY_PREFIX = "wilsify.practice.prefs.";
const prefWrites: string[] = [];
/**
 * Records every write of the practice-preferences key. If the page ever starts
 * rewriting them in a loop, writes beyond MAX_PREF_WRITES throw (as a full
 * storage quota would). That makes a runaway update loop FAIL a test quickly
 * instead of freezing the whole test run.
 */
const MAX_PREF_WRITES = 100;
function guardAgainstRunawayPreferenceWrites() {
  prefWrites.length = 0;
  const realSetItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
    if (key.startsWith(PREFS_KEY_PREFIX)) {
      prefWrites.push(value);
      if (prefWrites.length > MAX_PREF_WRITES) throw new DOMException("quota (test guard)", "QuotaExceededError");
    }
    return realSetItem.call(this, key, value);
  });
}

const page = () => within(screen.getByRole("main"));
type User = Awaited<ReturnType<typeof renderApp>>["user"];

/**
 * The re-attach <input type="file"> is `hidden` and unlabeled: the visible
 * "Re-attach audio file" button only calls .click() on it. A role query can't
 * reach it, so we take the single file input on the page.
 */
function reattachInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("re-attach input not found");
  return input;
}

async function openPractice() {
  seedSong();
  const app = await renderApp({ session, path: "/practice" });
  await page().findByRole("heading", { name: "Interactive Practice Studio" });
  return app;
}

async function reattach(user: User, file: File) {
  await user.upload(reattachInput(), file);
}

describe("Mode B: Chord Practice (no audio)", () => {
  it("renders chord practice with a Re-attach audio file button and no playback controls", async () => {
    await openPractice();

    expect(page().getByText("Mode B: Chord Practice")).toBeInTheDocument();
    expect(page().queryByText("Mode A: Full Audio Practice")).not.toBeInTheDocument();
    expect(page().getByText(`Track: ${SONG_FILE}`)).toBeInTheDocument();
    expect(page().getByRole("heading", { name: "Practice Without Audio Playback" })).toBeInTheDocument();
    expect(page().getByRole("button", { name: "Re-attach audio file" })).toBeEnabled();

    // No audio ⇒ no player.
    expect(page().queryByRole("slider", { name: "Seek position in track" })).not.toBeInTheDocument();
    expect(page().queryByRole("button", { name: "Play" })).not.toBeInTheDocument();

    // Chord practice itself works: every chord is a target, clicking one selects it.
    for (const [i, chord] of ["C", "G", "Am", "F"].entries()) {
      expect(page().getByRole("button", { name: new RegExp(`^Chord ${chord} at position ${i + 1}`) })).toBeInTheDocument();
    }
    expect(page().getByRole("button", { name: "Chord C at position 1 (active)" })).toBeInTheDocument();
  });

  it("selecting a chord card makes it the active target", async () => {
    const { user } = await openPractice();
    await user.click(page().getByRole("button", { name: "Chord Am at position 3" }));
    expect(page().getByRole("button", { name: "Chord Am at position 3 (active)" })).toBeInTheDocument();
    expect(page().getByRole("button", { name: "Chord C at position 1" })).toBeInTheDocument();
    expect(page().getByText("Current: Am")).toBeInTheDocument();
  });

  it("with no song at all it says so and points to Upload instead of offering Re-attach", async () => {
    await renderApp({ session, path: "/practice" });
    expect(await page().findByRole("heading", { name: "No Active Song Loaded" })).toBeInTheDocument();
    expect(page().queryByRole("button", { name: "Re-attach audio file" })).not.toBeInTheDocument();
    expect(page().getByRole("link", { name: "Upload Track" })).toHaveAttribute("href", "/upload");
    expect(page().getByRole("button", { name: "Open Chord & Lyric Sheet" })).toBeDisabled();
  });
});

describe("Re-attaching audio", () => {
  it("a valid file with the song's name switches to Mode A: Full Audio Practice", async () => {
    const { user } = await openPractice();
    const file = audioFile(SONG_FILE);

    await reattach(user, file);

    expect(await page().findByText("Mode A: Full Audio Practice")).toBeInTheDocument();
    expect(page().queryByText("Mode B: Chord Practice")).not.toBeInTheDocument();
    expect(page().queryByRole("button", { name: "Re-attach audio file" })).not.toBeInTheDocument();
    expect(page().getByRole("slider", { name: "Seek position in track" })).toBeInTheDocument();
    expect(page().getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
  });

  it("a differently named file asks for confirmation; Cancel keeps Mode B, Attach File switches to Mode A", async () => {
    const { user } = await openPractice();
    await reattach(user, audioFile("another_take.mp3"));

    const dialogText = await screen.findByRole("heading", { name: "Different File Name" });
    expect(dialogText).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled(); // nothing attached yet

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Different File Name" })).not.toBeInTheDocument();
    expect(page().getByText("Mode B: Chord Practice")).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    await reattach(user, audioFile("another_take.mp3"));
    await user.click(await screen.findByRole("button", { name: "Attach File" }));
    expect(await page().findByText("Mode A: Full Audio Practice")).toBeInTheDocument();
  });

  const bad: [string, () => File, string][] = [
    ["unsupported type", () => audioFile("notes.exe", 500, "application/octet-stream"), "Unsupported file type"],
    ["empty file", () => audioFile(SONG_FILE, 0), "File is empty."],
    [
      "oversized file (>100 MB)",
      () => {
        const huge = audioFile(SONG_FILE, 10);
        Object.defineProperty(huge, "size", { value: 101 * 1024 * 1024 }); // avoid allocating 101 MB
        return huge;
      },
      "File is too large. Maximum size is 100 MB.",
    ],
  ];
  it.each(bad)("rejects an %s using the app's upload validation and stays in Mode B", async (_label, make, message) => {
    const { user } = await openPractice();

    await reattach(user, make());

    expect(await page().findByText(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeInTheDocument();
    expect(page().getByText("Mode B: Chord Practice")).toBeInTheDocument();
    expect(page().queryByText("Mode A: Full Audio Practice")).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Different File Name" })).not.toBeInTheDocument();
    // The user can try again with a good file.
    await reattach(user, audioFile(SONG_FILE));
    expect(await page().findByText("Mode A: Full Audio Practice")).toBeInTheDocument();
    expect(page().queryByText(new RegExp(message.slice(0, 12)))).not.toBeInTheDocument(); // old error cleared
  });
});

describe("Practice settings persist", () => {
  it("changing the playback speed saves it once — it does not trigger an endless save/reload loop", async () => {
    const { user } = await openPractice();
    await reattach(user, audioFile(SONG_FILE));
    await page().findByText("Mode A: Full Audio Practice");
    prefWrites.length = 0; // only count what the click causes

    await user.click(page().getByRole("button", { name: "0.75x" }));
    // let any follow-up renders/effects run
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    expect(prefWrites.length).toBeLessThan(5);
    expect(prefWrites.at(-1)).toContain('"speed":0.75');
    expect(page().getByText("0.75x Playback")).toBeInTheDocument();
  });

  it("speed survives a refresh (shown as a badge even before audio is re-attached)", async () => {
    const first = await openPractice();
    await reattach(first.user, audioFile(SONG_FILE));
    await first.user.click(await page().findByRole("button", { name: "0.75x" }));
    expect(page().getByText("0.75x Playback")).toBeInTheDocument();

    await refreshApp(first, { session, path: "/practice" });
    expect(await page().findByText("0.75x Playback")).toBeInTheDocument();
    expect(page().getByText("Mode B: Chord Practice")).toBeInTheDocument(); // audio itself is not restored
  });
});

describe("Leaving Practice cleans up", () => {
  /** Tracks the metronome's scheduler interval (the only 25 ms interval in the app). */
  function watchSchedulerIntervals() {
    const realSet = window.setInterval.bind(window);
    const realClear = window.clearInterval.bind(window);
    const active = new Set<number>();
    const started: number[] = [];
    const cleared: number[] = [];
    let maxConcurrent = 0;
    vi.spyOn(window, "setInterval").mockImplementation(((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      const id = realSet(fn, ms, ...args);
      if (ms === 25) {
        active.add(id);
        started.push(id);
        maxConcurrent = Math.max(maxConcurrent, active.size);
      }
      return id;
    }) as typeof window.setInterval);
    vi.spyOn(window, "clearInterval").mockImplementation(((id?: number) => {
      if (id !== undefined && active.delete(id)) cleared.push(id);
      realClear(id);
    }) as typeof window.clearInterval);
    return { active, started, cleared, maxConcurrent: () => maxConcurrent };
  }

  it("stops the metronome scheduler, the microphone and its analyser loop", async () => {
    const intervals = watchSchedulerIntervals();
    const { user } = await openPractice();
    await reattach(user, audioFile(SONG_FILE));
    await page().findByText("Mode A: Full Audio Practice");

    // Audio playing.
    await user.click(page().getByRole("button", { name: "Play" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    // Metronome: start, stop, start again — never two schedulers at once.
    await user.click(page().getByRole("button", { name: "Start Metronome" }));
    await user.click(page().getByRole("button", { name: "Stop Metronome" }));
    await user.click(page().getByRole("button", { name: "Start Metronome" }));
    expect(intervals.started).toHaveLength(2);
    expect(intervals.maxConcurrent()).toBe(1);
    expect(intervals.active.size).toBe(1);

    // Microphone tracking.
    const contextsBeforeMic = audio.contexts.length;
    await user.click(page().getByRole("button", { name: "Start Accuracy Tracking" }));
    await page().findByRole("button", { name: "Stop Tracking" });
    expect(audio.getUserMedia).toHaveBeenCalledTimes(1);
    expect(audio.tracks).toHaveLength(1);
    const micContext = audio.contexts[contextsBeforeMic];
    expect(micContext).toBeDefined();
    await waitFor(() => expect(audio.analyserReads.count).toBeGreaterThan(0)); // the analyser loop is running

    // Leave the page.
    await user.click(screen.getAllByRole("link", { name: /^Library/ })[0]);
    await screen.findByRole("heading", { name: "Song Library" });

    // Scheduler stopped: nothing left running, every interval that was started was cleared.
    expect(intervals.active.size).toBe(0);
    expect([...intervals.cleared].sort()).toEqual([...intervals.started].sort());
    // Microphone released.
    expect(audio.tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(micContext.close).toHaveBeenCalledTimes(1);
    // The analyser loop no longer runs: wait two animation frames and the read count must not move.
    const reads = audio.analyserReads.count;
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    expect(audio.analyserReads.count).toBe(reads);
  });

  it("pauses the audio element when the user leaves the page", async () => {
    const { user } = await openPractice();
    await reattach(user, audioFile(SONG_FILE));
    await page().findByText("Mode A: Full Audio Practice");
    const audioEl = document.querySelector("audio"); // <audio> has no ARIA role; it is the only one on the page
    expect(audioEl).not.toBeNull();
    await user.click(page().getByRole("button", { name: "Play" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    const pausesBefore = vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts.filter((c) => c === audioEl).length;

    await user.click(screen.getAllByRole("link", { name: /^Library/ })[0]);
    await screen.findByRole("heading", { name: "Song Library" });

    const pausesAfter = vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts.filter((c) => c === audioEl).length;
    expect(pausesAfter).toBeGreaterThan(pausesBefore);
  });

  it("coming back to Practice starts exactly one scheduler (no interval left over from the first visit)", async () => {
    const intervals = watchSchedulerIntervals();
    const { user } = await openPractice();
    await user.click(page().getByRole("button", { name: "Start Metronome" }));
    expect(intervals.active.size).toBe(1);

    await user.click(screen.getAllByRole("link", { name: /^Library/ })[0]);
    await screen.findByRole("heading", { name: "Song Library" });
    expect(intervals.active.size).toBe(0);

    await user.click(screen.getAllByRole("link", { name: /^Practice$/ })[0]);
    await page().findByRole("heading", { name: "Interactive Practice Studio" });
    await user.click(page().getByRole("button", { name: "Start Metronome" }));

    expect(intervals.started).toHaveLength(2);
    expect(intervals.active.size).toBe(1);
    expect(intervals.maxConcurrent()).toBe(1);
  });

  it("stopping the microphone from the page releases its tracks and returns the button to Start", async () => {
    const { user } = await openPractice();
    await user.click(page().getByRole("button", { name: "Start Accuracy Tracking" }));
    await page().findByRole("button", { name: "Stop Tracking" });

    await user.click(page().getByRole("button", { name: "Stop Tracking" }));

    expect(audio.tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(page().getByRole("button", { name: "Start Accuracy Tracking" })).toBeInTheDocument();
  });

  it("a denied microphone shows a plain-language message and leaves the page usable", async () => {
    audio.getUserMedia.mockRejectedValueOnce(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const { user } = await openPractice();
    await user.click(page().getByRole("button", { name: "Start Accuracy Tracking" }));

    expect(await page().findByText(/Microphone permission was denied/)).toBeInTheDocument();
    expect(page().getByRole("button", { name: "Start Accuracy Tracking" })).toBeEnabled();
    expect(audio.tracks).toHaveLength(0);
  });
});
