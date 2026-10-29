/**
 * Analysis ↔ Chord & Lyric Sheet ↔ Practice, through the real rendered app:
 * one saved analysis is the source of truth for all three, chord corrections
 * are stored apart from it, and nothing is analysed twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../test/renderApp";
import { makeSession, resetFakeSupabase } from "../test/fakeSupabase";
import { installFakeAudio } from "../test/fakeAudio";
import { installFakeFetch } from "../test/fakeNetwork";
import { seedSong, SONG_FILE } from "../test/fixtures";
import { resolveLibrarySong } from "../lib/library";

vi.mock("../lib/supabase", async () => (await import("../test/fakeSupabase")).fakeSupabaseModule());

const session = makeSession();
const FLOW_TIMEOUT = 20_000;
const page = () => within(screen.getByRole("main"));
const sheetText = () => page().getAllByRole("region").map((r) => r.textContent ?? "").join(" ");

beforeEach(() => {
  resetFakeSupabase();
  installFakeAudio();
  installFakeFetch(); // any network call (e.g. a second analysis) fails the test
});

describe("Chord & Lyric Sheet built from the saved analysis", () => {
  it("shows view modes, section chips from the detected sections, and says when lyrics are missing", async () => {
    const saved = seedSong(undefined, {
      sections: [
        { label: "intro", start: 0, end: 4 },
        { label: "chorus", start: 4, end: 8 },
      ],
    });
    const { user } = await renderApp({ session, path: `/song/${saved.id}` });

    const nav = await page().findByRole("navigation", { name: "Song sections" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Intro", "Chorus"]);
    expect(page().getByText("Lyrics unavailable for this analysis.")).toBeInTheDocument();

    const tabs = page().getByRole("tablist", { name: "Sheet view" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Sheet", "Timeline", "Practice", "Compact"]);
    await user.click(within(tabs).getByRole("tab", { name: "Timeline" }));
    expect(within(tabs).getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
  }, FLOW_TIMEOUT);

  it("flags low-confidence chords instead of presenting them as certain", async () => {
    const saved = seedSong(undefined, {
      chordTimeline: [
        { chord: "C", start: 0, end: 2, confidence: 0.95 },
        { chord: "G", start: 2, end: 4, confidence: 0.2, alternative: "Em" },
        { chord: "Am", start: 4, end: 6, confidence: 0.9 },
        { chord: "F", start: 6, end: 8, confidence: 0.9 },
      ],
    });
    await renderApp({ session, path: `/song/${saved.id}` });
    expect(await page().findByText("Some chords may need correction.")).toBeInTheDocument();
    expect(page().getByRole("button", { name: "Review chords" })).toBeInTheDocument();
  }, FLOW_TIMEOUT);

  it("corrects a chord without touching the analysis, then resets back to it", async () => {
    const saved = seedSong();
    const { user } = await renderApp({ session, path: `/song/${saved.id}` });
    await user.click(await page().findByRole("button", { name: "Edit chords" }));

    const field = page().getByRole("textbox", { name: "Chord at 0:02" });
    await user.clear(field);
    await user.type(field, "Em");
    fireEvent.blur(field);

    await waitFor(() => expect(resolveLibrarySong(saved.id)?.chordEdits).toEqual([{ op: "set", at: 2, chord: "Em" }]));
    expect(resolveLibrarySong(saved.id)?.analysis.chordTimeline[1].chord).toBe("G");
    await waitFor(() => expect(sheetText()).toContain("Em"));

    await user.click(page().getByRole("button", { name: "Reset to analysis (1)" }));
    await waitFor(() => expect(resolveLibrarySong(saved.id)?.chordEdits).toEqual([]));
    expect(sheetText()).not.toContain("Em");
  }, FLOW_TIMEOUT);
});

describe("Analysis → Sheet → Practice refer to the same saved song", () => {
  it("the Analysis page previews this song's sheet and links to it by its Library id", async () => {
    const saved = seedSong();
    const { user } = await renderApp({ session, path: `/song/${saved.id}` });
    await user.click(await page().findByRole("button", { name: "Analysis Overview" }));

    expect(await page().findByRole("heading", { name: "Chord & Lyric Sheet" })).toBeInTheDocument();
    expect(page().getByRole("link", { name: "Open Full Sheet" })).toHaveAttribute("href", `/song/${saved.id}`);
    expect(page().getByRole("link", { name: "Open Chord & Lyric Sheet" })).toHaveAttribute("href", `/song/${saved.id}`);

    await user.click(page().getByRole("link", { name: "Open Full Sheet" }));
    expect(window.location.pathname).toBe(`/song/${saved.id}`);
    expect(await page().findByRole("button", { name: "Practice This Song" })).toBeInTheDocument();
  }, FLOW_TIMEOUT);

  it("corrections show up in the Analysis preview too", async () => {
    const saved = seedSong();
    const { user } = await renderApp({ session, path: `/song/${saved.id}` });
    await user.click(await page().findByRole("button", { name: "Edit chords" }));
    const field = page().getByRole("textbox", { name: "Chord at 0:04" });
    await user.clear(field);
    await user.type(field, "Dm");
    fireEvent.blur(field);
    await waitFor(() => expect(resolveLibrarySong(saved.id)?.chordEdits).toHaveLength(1));

    await user.click(page().getByRole("button", { name: "Analysis Overview" }));
    const preview = await page().findByRole("region", { name: "Chord & Lyric Sheet" });
    expect(preview.textContent).toContain("Dm");
    expect(within(preview).getByText("Includes your chord corrections")).toBeInTheDocument();
  }, FLOW_TIMEOUT);

  it("Practice This Song opens Practice with the same song", async () => {
    const saved = seedSong();
    const { user } = await renderApp({ session, path: `/song/${saved.id}` });
    await user.click(await page().findByRole("button", { name: "Practice This Song" }));
    expect(window.location.pathname).toBe("/practice");
    await page().findByRole("heading", { name: "Interactive Practice Studio" });
    expect(page().getByText(`Track: ${SONG_FILE}`)).toBeInTheDocument();
  }, FLOW_TIMEOUT);
});

describe("Lyrics transcribed automatically from the song's audio", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const sung = (text: string, start: number) => ({
    text,
    start,
    end: start + text.split(" ").length * 0.4,
    stanza: 0,
    words: text.split(" ").map((word, i) => ({ word, start: start + i * 0.4, end: start + (i + 1) * 0.4 })),
  });

  it("starts by itself from the server's audio copy, shows progress, then puts the words under the chords", async () => {
    const saved = seedSong("auto_lyrics_song.mp3", { audioUrl: "/api/audio/media42" });
    let polls = 0;
    const calls = installFakeFetch({
      "/api/lyrics/transcribe": () => json({ job_id: "job1" }),
      "/api/lyrics/job/job1": () =>
        ++polls < 2
          ? json({ status: "running", progress: 40, message: "Isolating the vocals…", error: null, result: null })
          : json({
              status: "complete",
              progress: 100,
              message: "Done",
              error: null,
              result: { lines: [sung("hello from the verse", 0.2), sung("second sung line", 4.1)], words: 7, noVocals: false, model: "test", seconds: 1 },
            }),
    });
    await renderApp({ session, path: `/song/${saved.id}` });

    expect(await page().findByText(/Transcribing lyrics from the audio/)).toBeInTheDocument();
    await waitFor(() => expect(sheetText()).toContain("hello"), { timeout: 8000 });
    expect(sheetText()).toContain("second");
    expect(page().getByText(/Lyrics transcribed automatically from this recording/)).toBeInTheDocument();

    const start = calls.find((c) => c.url.includes("/api/lyrics/transcribe"));
    expect(JSON.parse(String(start?.init?.body))).toEqual({ media_id: "media42" }); // the analysed audio, no re-upload
    expect(resolveLibrarySong(saved.id)?.lyrics?.source).toBe("transcribed");
  }, FLOW_TIMEOUT);

  it("says so when the song has no singing", async () => {
    const saved = seedSong("instrumental_song.mp3", { audioUrl: "/api/audio/media43" });
    installFakeFetch({
      "/api/lyrics/transcribe": () => json({ job_id: "job2" }),
      "/api/lyrics/job/job2": () => json({ status: "complete", progress: 100, message: "Done", error: null, result: { lines: [], words: 0, noVocals: true, model: "test", seconds: 1 } }),
    });
    await renderApp({ session, path: `/song/${saved.id}` });
    expect(await page().findByText("No singing detected.")).toBeInTheDocument();
  }, FLOW_TIMEOUT);

  it("explains a failure and offers to try again", async () => {
    const saved = seedSong("expired_song.mp3", { audioUrl: "/api/audio/media44" });
    installFakeFetch({
      "/api/lyrics/transcribe": () => json({ detail: "The server's copy of this song has expired. Re-attach the audio file to transcribe its lyrics." }, 404),
    });
    await renderApp({ session, path: `/song/${saved.id}` });
    expect(await page().findByText("Chord analysis is available, but lyrics could not be generated.")).toBeInTheDocument();
    expect(page().getByText(/server's copy of this song has expired/)).toBeInTheDocument();
    expect(page().getByRole("button", { name: "Try again" })).toBeInTheDocument();
  }, FLOW_TIMEOUT);
});
