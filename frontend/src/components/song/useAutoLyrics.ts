import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getLyricsJob, startLyricsTranscription, type AnalysisResult } from "../../lib/api";
import { mediaIdOf, transcriptionToLrc } from "../../lib/song/autoLyrics";
import { saveLyrics, type StoredLyrics } from "../../lib/song/songStore";

export type AutoLyricsState =
  | { status: "idle" }
  | { status: "needs-audio" }
  | { status: "running"; progress: number; message: string }
  | { status: "no-vocals" }
  | { status: "failed"; error: string }
  | { status: "done"; lyrics: StoredLyrics };

interface Run {
  state: AutoLyricsState;
  listeners: Set<() => void>;
}

const POLL_MS = 2000;
/** One transcription per song per page session, shared by every view of that song. */
const runs = new Map<string, Run>();

function runFor(key: string): Run {
  let run = runs.get(key);
  if (!run) {
    run = { state: { status: "idle" }, listeners: new Set() };
    runs.set(key, run);
  }
  return run;
}

function publish(run: Run, state: AutoLyricsState) {
  run.state = state;
  run.listeners.forEach((l) => l());
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function transcribe(run: Run, opts: { songRef: string; fileName: string; analysis: AnalysisResult; sessionAudioUrl: string | null }) {
  const { songRef, fileName, analysis, sessionAudioUrl } = opts;
  publish(run, { status: "running", progress: 0, message: "Starting…" });
  try {
    let jobId: string | null = null;
    const mediaId = mediaIdOf(analysis.audioUrl);
    let firstError: unknown = null;
    if (mediaId) {
      try {
        jobId = await startLyricsTranscription({ mediaId });
      } catch (e) {
        firstError = e; // e.g. the server copy expired: fall back to the file opened this session
      }
    }
    if (!jobId && sessionAudioUrl) {
      const blob = await (await fetch(sessionAudioUrl)).blob();
      jobId = await startLyricsTranscription({ file: blob, fileName });
    }
    if (!jobId) {
      if (firstError) throw firstError;
      publish(run, { status: "needs-audio" });
      return;
    }
    for (;;) {
      const job = await getLyricsJob(jobId);
      if (job.status === "failed") throw new Error(job.error || "Lyrics transcription failed.");
      if (job.status === "complete" && job.result) {
        if (job.result.noVocals || !job.result.lines.length) {
          publish(run, { status: "no-vocals" });
          return;
        }
        const lyrics: StoredLyrics = {
          raw: transcriptionToLrc(job.result, analysis.sections ?? []),
          source: "transcribed",
          updatedAt: new Date().toISOString(),
        };
        saveLyrics(songRef, lyrics);
        publish(run, { status: "done", lyrics });
        return;
      }
      publish(run, { status: "running", progress: job.progress, message: job.message });
      await wait(POLL_MS);
    }
  } catch (e) {
    publish(run, { status: "failed", error: e instanceof Error ? e.message : "Lyrics transcription failed." });
  }
}

/**
 * Lyrics from the song's own audio, started automatically when a song has
 * none. Uses the server's playback copy (no re-upload), else the audio file
 * opened this session; with neither, reports "needs-audio".
 */
export function useAutoLyrics(opts: {
  songRef: string;
  fileName: string;
  analysis: AnalysisResult;
  sessionAudioUrl: string | null;
  hasLyrics: boolean;
  onLyrics?: (lyrics: StoredLyrics) => void;
}) {
  const { songRef, fileName, analysis, sessionAudioUrl, hasLyrics, onLyrics } = opts;
  const key = fileName;
  const subscribe = useCallback(
    (cb: () => void) => {
      const run = runFor(key);
      run.listeners.add(cb);
      return () => {
        run.listeners.delete(cb);
      };
    },
    [key],
  );
  const state = useSyncExternalStore(subscribe, () => runFor(key).state);

  const start = useCallback(
    (force: boolean) => {
      const run = runFor(key);
      const busy = run.state.status === "running";
      const settled = run.state.status !== "idle" && run.state.status !== "needs-audio";
      if (busy || (settled && !force)) return;
      void transcribe(run, { songRef, fileName, analysis, sessionAudioUrl });
    },
    [key, songRef, fileName, analysis, sessionAudioUrl],
  );

  // Hand freshly transcribed lyrics to the view showing them.
  useEffect(() => {
    if (state.status === "done") onLyrics?.(state.lyrics);
  }, [state, onLyrics]);

  useEffect(() => {
    if (!hasLyrics) start(false);
  }, [hasLyrics, start]);

  return { state, retry: () => start(true) };
}
