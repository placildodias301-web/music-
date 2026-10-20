import { useEffect, useRef, useState } from "react";
import { StemFileMixer } from "../stems/StemFileMixer";
import { ALLOWED_EXT, POLL_MS, PRESETS, analyseUpload, fmtBytes, getJob, getJobStems, startSeparation } from "../../lib/stemJob";
import type { StemResults } from "../../lib/stemJob";

type Mode = "two_stems" | "standard4" | "six_stems";
const MODES: { value: Mode; label: string }[] = [
  { value: "two_stems", label: "2 stems · vocals + music" },
  { value: "standard4", label: "4 stems · vocals, drums, bass, other" },
  { value: "six_stems", label: "6 stems · + guitar, piano (beta)" },
];

/** A file name the backend accepts: the real one when it has a known extension, else one guessed from the MIME type. */
export function uploadName(fileName: string | undefined, mime: string): string {
  const ext = (fileName?.split(".").pop() ?? "").toLowerCase();
  if (fileName && (ALLOWED_EXT as readonly string[]).includes(ext)) return fileName;
  const guess = mime.includes("wav") ? "wav" : mime.includes("webm") ? "webm" : mime.includes("audio/mp4") ? "m4a" : mime.includes("mp4") ? "mp4" : "mp3";
  return `song.${guess}`;
}

/**
 * Splits the song already open on the Analysis page with Demucs (the same
 * backend as the Stems page) and mixes the stems here, so nobody uploads twice.
 */
export function StemMixer({ audioUrl, fileName }: { audioUrl: string; fileName?: string }) {
  const [mode, setMode] = useState<Mode>("standard4");
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StemResults | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const start = async () => {
    setError(null);
    setResults(null);
    setProgress(0);
    setMessage("Sending the song to the separator…");
    try {
      const blob = await fetch(audioUrl).then((r) => r.blob());
      const file = new File([blob], uploadName(fileName, blob.type), { type: blob.type });
      const analysis = await analyseUpload(file, (p) => alive.current && setProgress(p * 0.05));
      const { job_id } = await startSeparation({
        upload_id: analysis.upload_id ?? null,
        track: analysis.track ?? file.name,
        mode,
        stems: PRESETS[mode],
        custom_stems: [],
        format: "wav",
        quality: "balanced",
        split_vocals: false,
        split_drums: false,
      });
      for (;;) {
        const job = await getJob(job_id);
        if (!alive.current) return;
        if (job.status === "failed") throw new Error(job.error ?? "Separation failed on the server.");
        setProgress(Number(job.progress) || 0);
        setMessage(job.message ?? "");
        if (job.status === "complete") break;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      const res = await getJobStems(job_id, "wav", audioUrl);
      if (alive.current) setResults(res);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Separation failed.");
    } finally {
      if (alive.current) setProgress(null);
    }
  };

  const busy = progress !== null;
  return (
    <div className="mt-4">
      <fieldset className="flex flex-wrap gap-2" disabled={busy}>
        <legend className="sr-only">Stems to make</legend>
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              mode === m.value
                ? "border-[var(--color-ns-purple)] bg-[var(--color-ns-purple)] text-white"
                : "border-[var(--color-ns-border-strong)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-purple-light)]"
            }`}
          >
            <input type="radio" name="analysis-stem-mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="sr-only" />
            {m.label}
          </label>
        ))}
      </fieldset>

      <button type="button" onClick={start} disabled={busy} className="btn-primary mt-3 py-2 text-xs">
        {busy ? (
          <>
            <span className="spinner" />
            <span>Separating… {Math.round(progress ?? 0)}%</span>
          </>
        ) : (
          <span>{results ? "Run again" : "Separate stems"}</span>
        )}
      </button>
      {busy && (
        <p role="status" className="mt-2 text-xs text-[var(--color-ns-muted)]">
          {message} Takes about as long as the song itself.
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-[var(--color-ns-coral)]">{error}</p>}

      {results && (
        <div className="mt-4">
          {results.notice && <p className="mb-3 text-xs text-[var(--color-ns-amber)]">{results.notice}</p>}
          <StemFileMixer stems={results.stems} />
          <ul className="flex flex-wrap gap-2 text-xs">
            {results.stems.map((s) => (
              <li key={s.id}>
                <a href={s.url} download={s.filename} className="text-[var(--color-ns-purple-light)] underline-offset-2 hover:underline">
                  Download {s.label} ({fmtBytes(s.size_bytes)})
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[11px] text-[var(--color-ns-dim)]">
        AI separation (Demucs) on our server. Separation is never perfect: a little of one instrument can be heard in another stem.
      </p>
    </div>
  );
}
