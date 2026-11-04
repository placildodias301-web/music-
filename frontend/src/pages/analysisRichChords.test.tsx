/**
 * The upgraded engine emits slash, sus, add9, dim7 and uncertain ("?") chords,
 * segment roles, a fingerstyle intro and a Wilsify AI breakdown. Every page that
 * renders an analysis must take that output without falling into the
 * router's "Reload page" error screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../test/renderApp";
import { makeSession, resetFakeSupabase } from "../test/fakeSupabase";
import { installFakeAudio } from "../test/fakeAudio";
import { audioFile, seedSong } from "../test/fixtures";
import type { AnalysisResult } from "../lib/api";

vi.mock("../lib/supabase", async () => (await import("../test/fakeSupabase")).fakeSupabaseModule());

const session = makeSession();

const rich: Partial<AnalysisResult> = {
  key: "Gb",
  chordProgression: ["Gb", "Gb/Bb", "Cb", "Db7", "Dbsus4", "Ebm", "Abmadd9", "Ebdim7", "F?", "Gbaug", "N"],
  chordTimeline: [
    { chord: "Gb", start: 0, end: 1, confidence: 0.9, role: "main" },
    { chord: "Gb/Bb", start: 1, end: 1.3, confidence: 0.6, role: "passing" },
    { chord: "Cb", start: 1.3, end: 2, confidence: 0.8, role: "main" },
    { chord: "Db7", start: 2, end: 3, confidence: 0.8, role: "main" },
    { chord: "Dbsus4", start: 3, end: 3.4, confidence: 0.5, role: "filler" },
    { chord: "Ebm", start: 3.4, end: 4, confidence: 0.7, role: "main" },
    { chord: "Abmadd9", start: 4, end: 5, confidence: 0.4, role: "main" },
    { chord: "Ebdim7", start: 5, end: 5.3, confidence: 0.4, role: "passing" },
    { chord: "F?", start: 5.3, end: 6, confidence: 0.2, role: "main" },
    { chord: "Gbaug", start: 6, end: 7, confidence: 0.3, role: "main" },
    { chord: "N", start: 7, end: 8, confidence: 0.3, role: "main" },
  ],
  fingerstyleIntro: {
    detected: true,
    patternName: "Travis",
    startTime: 0,
    endTime: 2,
    notes: [
      { time: 0, duration: 0.25, noteName: "Gb", string: 6, stringName: "Low E (6th)", fret: 2, leftFinger: "Middle (2)", rightFinger: "p (Thumb)", chord: "Gb" },
      { time: 0.25, noteName: "Gb", string: 1, stringName: "High e (1st)", fret: 2, leftFinger: "Middle (2)", rightFinger: "a (Ring)", chord: "Gb" },
    ],
  } as AnalysisResult["fingerstyleIntro"],
  wilsifyAi: {
    verifiedKey: "Gb",
    verifiedTimeSignature: "4/4",
    aiSummary: "I – IV – V7 in Gb.",
    strummingOrPickingPattern: "D-DU-UDU",
    capoRecommendation: "Capo 6, play in C shapes.",
    playingTips: ["Keep the thumb on the bass."],
    source: "local",
    learnedRulesApplied: 0,
  } as AnalysisResult["wilsifyAi"],
};

beforeEach(() => {
  resetFakeSupabase();
  installFakeAudio();
});

const page = () => within(screen.getByRole("main"));

describe("rich engine output", () => {
  it.each(["/analysis", "/song/current", "/practice"])("%s renders without the error screen", async (path) => {
    seedSong(undefined, rich);
    const { user } = await renderApp({ session, path });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (input) await user.upload(input, audioFile());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Reload page/i)).not.toBeInTheDocument();
    expect(page()).toBeTruthy();
  }, 60_000);
});

describe("server audio fallback", () => {
  const serverPath = `/api/audio/${"a".repeat(32)}`;

  it("switches the player to the normalized server copy when the session file can't play", async () => {
    seedSong(undefined, { audioUrl: serverPath, mediaId: "a".repeat(32) });
    const { user } = await renderApp({ session, path: "/analysis" });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("re-attach input not found");
    await user.upload(input, audioFile());

    const audio = await waitFor(() => {
      const el = document.querySelector("audio");
      expect(el?.getAttribute("src")).toMatch(/^blob:/);
      return el!;
    });
    audio.dispatchEvent(new Event("error"));

    await waitFor(() => expect(document.querySelector("audio")?.getAttribute("src")).toBe(serverPath));
    expect(screen.queryByText(/can't play this file's audio/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reload page/i)).not.toBeInTheDocument();
  }, 60_000);

  it("plays the server copy directly when there is no session file", async () => {
    seedSong(undefined, { audioUrl: serverPath });
    await renderApp({ session, path: "/analysis" });
    await waitFor(() => expect(document.querySelector("audio")?.getAttribute("src")).toBe(serverPath));
    expect(screen.getByText(/Playing the server's temporary copy/)).toBeInTheDocument();
  }, 60_000);
});

describe("isBenignPlaybackError", () => {
  it("treats only AbortError as benign", async () => {
    const { isBenignPlaybackError } = await import("../lib/usePlaybackClock");
    expect(isBenignPlaybackError(new DOMException("interrupted", "AbortError"))).toBe(true);
    expect(isBenignPlaybackError({ name: "AbortError" })).toBe(true);
    expect(isBenignPlaybackError(new DOMException("no source", "NotSupportedError"))).toBe(false);
    expect(isBenignPlaybackError(null)).toBe(false);
  });
});
