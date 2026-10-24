/**
 * Upload -> analysis with the job pipeline (server ANALYSIS_ENGINE=pipeline),
 * through the real app. Faked at the network boundary only, like
 * uploadAnalysisFlow.test.tsx: the upload XHR and fetch (engine info, job polls,
 * rights attestation). Supabase is faked at the module boundary.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../test/renderApp";
import { makeSession, resetFakeSupabase } from "../test/fakeSupabase";
import { installFakeAudio } from "../test/fakeAudio";
import { installFakeFetch, installFakeXhr, xhrBehaviour } from "../test/fakeNetwork";
import { audioFile, SONG_FILE } from "../test/fixtures";
import { getLibrary } from "../lib/library";
import type { PipelineJobView, PipelineResultJson } from "../lib/api";

vi.mock("../lib/supabase", async () => (await import("../test/fakeSupabase")).fakeSupabaseModule());

const session = makeSession();
const JOB = "b".repeat(32);
const TIMEOUT = 60_000; // the first render in a file loads every lazy page

const RESULT: PipelineResultJson = {
  status: "completed",
  pipeline_version: 6,
  audio_duration: 8,
  sample_rate: 44100,
  bpm: 96,
  time_signature: "3/4",
  beats: [0, 0.625, 1.25],
  downbeats: [0],
  sections: [{ start: 0, end: 8, label: "verse" }],
  chords: [
    { start: 0, end: 4, chord: "A:min7", simple: "Am7", type: "chord", confidence: null },
    { start: 4, end: 8, chord: "D:7", simple: "D7", type: "chord", confidence: null },
  ],
  events: [{ time: 3.5, type: "possible_fill", value: null, subtype: null, confidence: 0.66 }],
  engines: { chords: "btc@cpu" },
  warnings: ["Song sections unavailable because allin1 was not used."],
  key: "A Minor",
  mode: "minor",
  scale: "A Aeolian (Natural Minor)",
  key_confidence: 0.7,
  key_alternatives: [],
  difficulty: { difficultyLabel: "Intermediate", difficultyScore: 40, factors: { chordComplexity: 50, chordChangeRate: 30, tempo: 30, modulation: 0 } },
};

function jobView(overrides: Partial<PipelineJobView>): PipelineJobView {
  return { job_id: JOB, status: "running", stage: "queued", progress: 0, file_name: SONG_FILE, cached: false, elapsed_seconds: 2, error: null, result: null, ...overrides };
}

/** `views`: each poll answers with the next (the last repeats); a function decides per poll. */
function server(views: PipelineJobView[] | (() => PipelineJobView), { cached = false } = {}) {
  xhrBehaviour.script = (xhr) => {
    xhr.status = 202;
    xhr.responseText = JSON.stringify({ job_id: JOB, status: cached ? "completed" : "queued", cached, poll_url: `/api/pipeline/jobs/${JOB}` });
    xhr.onload?.();
  };
  let i = 0;
  return installFakeFetch({
    "/api/rights-attestation": () => new Response("{}", { status: 200 }),
    "/api/pipeline/info": () => new Response(JSON.stringify({ analysis_engine: "pipeline", pipeline_version: 6 })),
    [`/api/pipeline/jobs/${JOB}`]: () =>
      new Response(JSON.stringify(typeof views === "function" ? views() : views[Math.min(i++, views.length - 1)])),
  });
}

beforeEach(() => {
  resetFakeSupabase();
  installFakeAudio();
  installFakeXhr();
});

const page = () => within(screen.getByRole("main"));

async function analyse(user: Awaited<ReturnType<typeof renderApp>>["user"]) {
  await page().findByRole("heading", { name: "Select media" });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not found");
  await user.upload(input, audioFile());
  await user.click(page().getByRole("checkbox", { name: /I confirm I own this audio/ }));
  await user.click(page().getByRole("button", { name: "Analyze Song" }));
}

describe("pipeline analysis from the Upload page", () => {
  it("creates a job, shows the polled stage, then opens the mapped analysis and saves it", async () => {
    // The job stays in "rhythm" until the test has read the progress screen, however slow the machine.
    let released = false;
    let pollsAfterRelease = 0;
    const calls = server(() => {
      if (!released) return jobView({ stage: "rhythm", progress: 50 });
      pollsAfterRelease += 1;
      return jobView({ status: "completed", stage: "completed", progress: 100, result: RESULT });
    });
    const { user } = await renderApp({ session, path: "/upload" });
    await analyse(user);

    await waitFor(() => expect(xhrBehaviour.instances).toHaveLength(1));
    expect(xhrBehaviour.instances[0].url).toMatch(/\/api\/pipeline\/jobs$/);
    // The stage from the job, not a timer: "rhythm" at 50% of the server's share of the bar.
    expect(await page().findByText("Tracking beats, bars and song sections", {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(page().getByRole("progressbar", { name: "Analysis progress" })).toHaveAttribute("aria-valuenow", String(Math.round(20 + 50 * 0.75)));
    const pollsBeforeRelease = calls.length;
    released = true;

    await waitFor(() => expect(window.location.pathname).toBe("/analysis"), { timeout: 10_000 });
    // The pipeline's section band, fill marker and notes reach the existing Chord Timeline.
    // The Analysis page is lazy-loaded; on a busy machine it can take a few seconds to draw.
    expect(await screen.findByRole("button", { name: /^Verse · 0:00–0:08/ }, { timeout: 15_000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Possible drum fill · 0:03 · 66% likely/ })).toBeInTheDocument();
    expect(screen.getByText("Analysis notes (1)")).toBeInTheDocument();
    // Polling stopped at completion: exactly one poll answered "completed", none after it.
    expect(pollsAfterRelease).toBe(1);
    expect(calls.length).toBeGreaterThan(pollsBeforeRelease);
    const saved = getLibrary()[0];
    expect(saved.analysis.engine).toBe("pipeline");
    expect(saved.analysis.chordProgression).toEqual(["Am7", "D7"]);
    expect(saved.analysis.timeSignature).toBe("3/4");
  }, TIMEOUT);

  it("a cached result says so and completes on the first poll", async () => {
    const calls = server([jobView({ status: "completed", stage: "completed", progress: 100, cached: true, result: RESULT })], { cached: true });
    const { user } = await renderApp({ session, path: "/upload" });
    await analyse(user);
    await waitFor(() => expect(window.location.pathname).toBe("/analysis"), { timeout: 10_000 });
    expect(getLibrary()[0].analysis.key).toBe("A Minor");
    expect(calls.filter((c) => c.url.includes(`/api/pipeline/jobs/${JOB}`))).toHaveLength(1);
  }, TIMEOUT);

  it("a failed job shows the server's message, offers Retry, and saves nothing", async () => {
    server([jobView({ status: "failed", stage: "chords", error: { code: "chord_model_download_failed", message: "The BTC chord model could not be downloaded or loaded (OSError)." } })]);
    const { user } = await renderApp({ session, path: "/upload" });
    await analyse(user);

    const alert = await page().findByRole("alert", {}, { timeout: 10_000 });
    expect(within(alert).getByText("The BTC chord model could not be downloaded or loaded (OSError).")).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(getLibrary()).toHaveLength(0);
  }, TIMEOUT);
});
