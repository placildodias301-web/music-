/**
 * Job-based analysis (POST /api/pipeline/jobs, then polling GET /api/pipeline/jobs/{id})
 * and the mapping of the pipeline JSON onto AnalysisResult. Faked at the network
 * boundary only: the upload XHR and fetch; the polling and mapping code all run.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  AnalysisError,
  analyzeWithPipeline,
  getAnalysisEngine,
  mapPipelineResult,
  NO_CHORD_SYMBOL,
  type AnalysisProgress,
  type PipelineJobView,
  type PipelineResultJson,
} from "./api";
import { formatBpm, hasTempo, timeSignatureValue, timeSignatureNote, tempoNote } from "./analysisDisplay";
import { isValidAnalysisResult } from "./library";
import { installFakeFetch, installFakeXhr, xhrBehaviour, type FakeXHR } from "../test/fakeNetwork";
import { audioFile } from "../test/fixtures";

const JOB = "a".repeat(32);

function pipelineResult(overrides: Partial<PipelineResultJson> = {}): PipelineResultJson {
  return {
    status: "completed",
    pipeline_version: 6,
    audio_duration: 12,
    sample_rate: 44100,
    bpm: 120,
    time_signature: "4/4",
    beats: [0.5, 1, 1.5, 2],
    downbeats: [0.5, 2.5],
    sections: [
      { start: 0, end: 4.5, label: "intro" },
      { start: 4.5, end: 12, label: "chorus" },
    ],
    chords: [
      { start: 0, end: 1, chord: "N", simple: "N", type: "no_chord", confidence: null },
      { start: 1, end: 4, chord: "C:maj", simple: "C", type: "chord", confidence: null },
      { start: 4, end: 4.3, chord: "D:min", simple: "Dm", type: "passing", confidence: null },
      { start: 4.3, end: 8, chord: "G:maj/3", simple: "G/B", type: "chord", confidence: null },
      { start: 8, end: 12, chord: "A:min7", simple: "Am7", type: "chord", confidence: 0.8 },
    ],
    events: [
      { time: 4, type: "chord_change", value: "Dm", subtype: "passing", confidence: null },
      { time: 7.5, type: "possible_fill", value: null, subtype: null, confidence: 0.72 },
    ],
    engines: { extract: "ffmpeg", separation: "demucs:htdemucs@cpu", rhythm: "allin1@wsl2", chords: "btc@cpu", events: "heuristic" },
    warnings: [],
    key: "C Major",
    mode: "major",
    scale: "C Ionian (Major)",
    key_confidence: 0.82,
    key_alternatives: [{ key: "A Minor", score: 0.7 }],
    difficulty: { difficultyLabel: "Beginner", difficultyScore: 21, factors: { chordComplexity: 40, chordChangeRate: 30, tempo: 50, modulation: 0 } },
    ...overrides,
  };
}

function view(overrides: Partial<PipelineJobView> = {}): PipelineJobView {
  return {
    job_id: JOB,
    status: "running",
    stage: "separating",
    progress: 20,
    file_name: "song.mp4",
    cached: false,
    elapsed_seconds: 3.5,
    error: null,
    result: null,
    ...overrides,
  };
}

/** The fake server accepts the upload with 202 (optionally as a cached job). */
function acceptUpload({ cached = false } = {}) {
  xhrBehaviour.script = (xhr: FakeXHR) => {
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 2048, total: 2048 });
    xhr.status = 202;
    xhr.responseText = JSON.stringify({ job_id: JOB, status: cached ? "completed" : "queued", cached, poll_url: `/api/pipeline/jobs/${JOB}` });
    xhr.onload?.();
  };
}

/** Each poll answers with the next view in `views` (the last one repeats). */
function serveViews(views: (PipelineJobView | Response | Error)[]) {
  let i = 0;
  return installFakeFetch({
    [`/api/pipeline/jobs/${JOB}`]: () => {
      const next = views[Math.min(i++, views.length - 1)];
      if (next instanceof Error) throw next;
      if (next instanceof Response) return next;
      return new Response(JSON.stringify(next), { status: 200 });
    },
  });
}

beforeEach(() => {
  installFakeXhr();
});

describe("job creation and polling", () => {
  it("uploads to the job endpoint, reports each polled stage, and stops at completion", async () => {
    acceptUpload();
    const calls = serveViews([
      view({ status: "queued", stage: "queued", progress: 0 }),
      view({ stage: "separating", progress: 30 }),
      view({ stage: "chords", progress: 70 }),
      view({ status: "completed", stage: "completed", progress: 100, result: pipelineResult() }),
    ]);
    const progress: AnalysisProgress[] = [];
    const uploads: number[] = [];

    const analysis = await analyzeWithPipeline(audioFile("song.mp4", 2048, "video/mp4"), {
      pollIntervalMs: 1,
      onProgress: (p) => progress.push(p),
      onUpload: (loaded) => uploads.push(loaded),
    });

    const xhr = xhrBehaviour.instances[0];
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toMatch(/\/api\/pipeline\/jobs$/);
    expect((xhr.body as FormData).get("file")).toBeInstanceOf(File);
    expect(uploads).toEqual([2048]);
    expect(progress.map((p) => [p.stage, p.progress])).toEqual([
      ["queued", 0],
      ["queued", 0],
      ["separating", 30],
      ["chords", 70],
    ]);
    // Exactly four polls: polling stopped once the job completed.
    expect(calls).toHaveLength(4);
    expect(calls.every((c) => c.url.endsWith(`/api/pipeline/jobs/${JOB}`))).toBe(true);
    expect(analysis.engine).toBe("pipeline");
  });

  it("a cached file comes back completed on the first poll", async () => {
    acceptUpload({ cached: true });
    const calls = serveViews([view({ status: "completed", stage: "completed", progress: 100, cached: true, result: pipelineResult() })]);
    const progress: AnalysisProgress[] = [];

    const analysis = await analyzeWithPipeline(audioFile(), { pollIntervalMs: 1, onProgress: (p) => progress.push(p) });

    expect(progress).toEqual([{ stage: "completed", progress: 100, cached: true }]);
    expect(calls).toHaveLength(1);
    expect(analysis.key).toBe("C Major");
  });

  it("a failed job rejects with the server's safe message and stops polling", async () => {
    acceptUpload();
    const calls = serveViews([
      view({ stage: "rhythm", progress: 45 }),
      view({ status: "failed", stage: "rhythm", error: { code: "beat_this_failed", message: "Rhythm analysis failed: beat_this could not analyse this audio." } }),
      view({ status: "completed", result: pipelineResult() }), // never reached
    ]);

    const err = await analyzeWithPipeline(audioFile(), { pollIntervalMs: 1 }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AnalysisError);
    expect((err as AnalysisError).kind).toBe("server");
    expect((err as AnalysisError).message).toBe("Rhythm analysis failed: beat_this could not analyse this audio.");
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["no_audio_track", "That video has no audio track."],
    ["no_music", "This recording seems to be speech only, with no instruments."],
  ])("a file the server can't use (%s) is an 'unreadable' failure", async (code, message) => {
    acceptUpload();
    serveViews([view({ status: "failed", stage: "preprocessing", error: { code, message } })]);
    const err = (await analyzeWithPipeline(audioFile(), { pollIntervalMs: 1 }).catch((e: unknown) => e)) as AnalysisError;
    expect([err.kind, err.message]).toEqual(["unreadable", message]);
  });

  it("rides out a few failed polls, but gives up after repeated ones", async () => {
    acceptUpload();
    serveViews([new Error("offline"), new Response("", { status: 502 }), view({ status: "completed", result: pipelineResult() })]);
    expect((await analyzeWithPipeline(audioFile(), { pollIntervalMs: 1 })).engine).toBe("pipeline");

    acceptUpload();
    serveViews([new Error("offline")]);
    const err = (await analyzeWithPipeline(audioFile(), { pollIntervalMs: 1 }).catch((e: unknown) => e)) as AnalysisError;
    expect(err.kind).toBe("network");
  });

  it("a job the server no longer knows (404) fails at once", async () => {
    acceptUpload();
    const calls = serveViews([new Response(JSON.stringify({ detail: "That analysis job doesn't exist." }), { status: 404 })]);
    const err = (await analyzeWithPipeline(audioFile(), { pollIntervalMs: 1 }).catch((e: unknown) => e)) as AnalysisError;
    expect(err.status).toBe(404);
    expect(calls).toHaveLength(1);
  });

  it("cancel stops the polling", async () => {
    acceptUpload();
    const controller = new AbortController();
    const calls = serveViews([view({ stage: "separating", progress: 20 })]);
    const run = analyzeWithPipeline(audioFile(), {
      pollIntervalMs: 20,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.stage === "separating") controller.abort();
      },
    });
    const err = (await run.catch((e: unknown) => e)) as AnalysisError;
    expect(err.kind).toBe("cancelled");
    const polls = calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(calls.length).toBe(polls);
  });

  it("an upload the server rejects is classified like v2's", async () => {
    xhrBehaviour.script = (xhr) => xhr.failWithHttp(413, "File is too large. Maximum size is 100 MB.");
    installFakeFetch({});
    const err = (await analyzeWithPipeline(audioFile()).catch((e: unknown) => e)) as AnalysisError;
    expect(err.kind).toBe("too-large");
  });
});

describe("engine choice", () => {
  it("uses the pipeline only when the server says so; anything else keeps v2", async () => {
    installFakeFetch({ "/api/pipeline/info": () => new Response(JSON.stringify({ analysis_engine: "pipeline" })) });
    expect(await getAnalysisEngine()).toBe("pipeline");
    installFakeFetch({ "/api/pipeline/info": () => new Response(JSON.stringify({ analysis_engine: "v2" })) });
    expect(await getAnalysisEngine()).toBe("v2");
    installFakeFetch({ "/api/pipeline/info": () => new Response("", { status: 404 }) });
    expect(await getAnalysisEngine()).toBe("v2");
    installFakeFetch({}); // older backend / offline: the request throws
    expect(await getAnalysisEngine()).toBe("v2");
  });
});

describe("mapping the completed result", () => {
  const file = { name: "song.mp4", size: 4096 };

  it("keeps BPM, meter, beats and the chord timeline the existing pages read", () => {
    const a = mapPipelineResult(view({ status: "completed", result: pipelineResult() }), file);
    expect(a).toMatchObject({
      key: "C Major",
      mode: "major",
      bpm: 120,
      bpmStatus: "detected",
      timeSignature: "4/4",
      timeSignatureStatus: "estimated",
      beatsPerBar: 4,
      beats: [0.5, 1, 1.5, 2],
      downbeats: [0.5, 2.5],
      durationSeconds: 12,
      duration: "0:12",
      keyConfidence: 0.82,
      processingSeconds: 3.5,
      fileName: "song.mp4",
      fileSizeBytes: 4096,
      analysisVersion: 2,
    });
    expect(isValidAnalysisResult(a)).toBe(true);
  });

  it("shows simple chord symbols and keeps the Harte labels separately", () => {
    const a = mapPipelineResult(view({ status: "completed", result: pipelineResult() }), file);
    expect(a.chordTimeline.map((s) => [s.chord, s.harte])).toEqual([
      [NO_CHORD_SYMBOL, "N"],
      ["C", "C:maj"],
      ["Dm", "D:min"],
      ["G/B", "G:maj/3"],
      ["Am7", "A:min7"],
    ]);
    expect(a.chordProgression).toEqual(["C", "Dm", "G/B", "Am7"]); // no-chord is not a chord
    expect(a.chordTimeline[2].passing).toBe(true);
    expect(a.chordTimeline.filter((s) => s.passing)).toHaveLength(1);
    expect(a.chordTimeline[4].confidence).toBe(0.8);
    expect("confidence" in a.chordTimeline[1]).toBe(false); // null confidence is left out, not 0
  });

  it("adds sections, events, possible fills and warnings", () => {
    const a = mapPipelineResult(view({ status: "completed", result: pipelineResult({ warnings: ["Song sections unavailable because allin1 was not used."] }) }), file);
    expect(a.sections).toEqual([
      { start: 0, end: 4.5, label: "intro" },
      { start: 4.5, end: 12, label: "chorus" },
    ]);
    expect(a.events).toHaveLength(2);
    expect(a.possibleFills).toEqual([{ time: 7.5, confidence: 0.72 }]);
    expect(a.warnings).toEqual(["Song sections unavailable because allin1 was not used."]);
    expect(a.engines?.chords).toBe("btc@cpu");
  });

  it("an unnamed chord quality falls back to its Harte label rather than going blank", () => {
    const result = pipelineResult({ chords: [{ start: 0, end: 12, chord: "C:(1,3,5)", simple: null, type: "chord", confidence: null }] });
    expect(mapPipelineResult(view({ status: "completed", result }), file).chordTimeline[0].chord).toBe("C:(1,3,5)");
  });

  it("no key or no chords is reported as unreadable, like v2's 'no pitched content'", () => {
    const noKey = pipelineResult({ key: null });
    expect(() => mapPipelineResult(view({ status: "completed", result: noKey }), file)).toThrow(AnalysisError);
    const onlyNoChord = pipelineResult({ chords: [{ start: 0, end: 12, chord: "N", simple: "N", type: "no_chord", confidence: null }] });
    expect(() => mapPipelineResult(view({ status: "completed", result: onlyNoChord }), file)).toThrow(/No chords could be recognised/);
  });
});

describe("null BPM and time signature", () => {
  const file = { name: "ambient.wav", size: 1 };

  it("a song without a clear pulse maps to 'no tempo', is still a valid analysis, and displays as —", () => {
    const a = mapPipelineResult(view({ status: "completed", result: pipelineResult({ bpm: null, time_signature: null, beats: [], downbeats: [] }) }), file);
    expect([a.bpm, a.bpmStatus, a.timeSignature, a.timeSignatureStatus, a.beatsPerBar]).toEqual([0, "unavailable", "", "unavailable", undefined]);
    expect(isValidAnalysisResult(a)).toBe(true);
    expect(hasTempo(a)).toBe(false);
    expect(formatBpm(a)).toBe("—");
    expect(tempoNote(a)).toBe("No clear beat detected");
    expect(timeSignatureValue(a)).toBe("—");
    expect(timeSignatureNote(a)).toBe("No confident meter detected");
  });

  it.each([
    ["4/4", 4],
    ["3/4", 3],
    ["5/4", 5],
    ["6/8", 6],
  ])("time signature %s is shown as detected, with %i beats per bar", (meter, perBar) => {
    const a = mapPipelineResult(view({ status: "completed", result: pipelineResult({ time_signature: meter }) }), file);
    expect(timeSignatureValue(a)).toBe(meter);
    expect(a.beatsPerBar).toBe(perBar);
  });

  it("a v2 analysis with a real BPM is unaffected, and bpm 0 without 'unavailable' is still rejected", () => {
    const v2 = { ...mapPipelineResult(view({ status: "completed", result: pipelineResult() }), file), engine: undefined, bpmStatus: "detected" as const };
    expect(formatBpm({ ...v2, bpm: 98.6 })).toBe("99");
    expect(isValidAnalysisResult({ ...v2, bpm: 0 })).toBe(false);
  });
});
