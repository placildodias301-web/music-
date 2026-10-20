import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { AbCompare } from "../components/stems/AbCompare";
import { StemFileMixer } from "../components/stems/StemFileMixer";
import { ThemedAudio } from "../components/stems/ThemedAudio";
import { SettingsSelect } from "../components/settings/SettingsSelect";
import type { Option } from "../lib/settings/model";
import {
  ACCEPT_ATTR,
  ALLOWED_EXT,
  POLL_MS,
  USE_MOCK,
  addCustomStem,
  analyseUpload,
  applyPreset,
  bleedWarning,
  buildRequest,
  buildZip,
  fmtBytes,
  fmtTime,
  getJob,
  getJobStems,
  startSeparation,
  validateAudioFile,
} from "../lib/stemJob";
import type { JobStage, SeparateRequest, SeparationMode, StemAnalysis, StemChoice, StemConfidence, StemResults } from "../lib/stemJob";

const ALL_MODES: { value: SeparationMode; title: string; hint: string }[] = [
  { value: "auto", title: "Auto detect stems", hint: "Everything the analysis found" },
  { value: "two_stems", title: "2 stems", hint: "Vocals + music (everything else)" },
  { value: "standard4", title: "Standard 4 stems", hint: "Vocals, drums, bass, other" },
  { value: "six_stems", title: "6 stems (beta)", hint: "Adds guitar and piano; if unsure, they stay in Other" },
  { value: "extended6", title: "Extended 6 stems", hint: "Adds guitar and piano" },
  { value: "custom", title: "Custom selection", hint: "Tick exactly what you want" },
];
// The mock fakes detection and its own 6 stems; the Demucs backend offers 2, 4
// or 6 stems and drops the ones that come out silent after separating.
const MODES = ALL_MODES.filter((m) =>
  USE_MOCK ? !["two_stems", "six_stems"].includes(m.value) : !["auto", "extended6"].includes(m.value),
);
const DEFAULT_MODE: SeparationMode = USE_MOCK ? "auto" : "standard4";
/**
 * The Demucs backend makes exactly vocals / drums / bass / other, so the extra
 * options (6 stems, custom stems, quality, vocal and drum-kit splits) only show
 * with the mock. ponytail: re-enable per option once the backend supports it.
 */
const EXTRA_OPTIONS = USE_MOCK;
const FORMAT_OPTIONS: Option<"wav" | "flac">[] = [
  { value: "wav", label: "WAV (lossless)" },
  { value: "flac", label: "FLAC (lossless, smaller)" },
];
const QUALITY_OPTIONS: Option<SeparateRequest["quality"]>[] = [
  { value: "fast", label: "Fast" },
  { value: "balanced", label: "Balanced" },
  { value: "best", label: "Best (slowest)" },
];
const STAGES: JobStage[] = ["uploading", "analyzing", "separating", "exporting", "complete"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function confClass(c: StemConfidence | "custom"): string {
  switch (c) {
    case "high":
      return "border-[var(--color-ns-mint)] text-[var(--color-ns-mint)]";
    case "medium":
    case "mixed":
      return "border-[var(--color-ns-amber)] text-[var(--color-ns-amber)]";
    case "low":
      return "border-[var(--color-ns-red)] text-[var(--color-ns-red)]";
    default:
      return "border-[var(--color-ns-border-strong)] text-[var(--color-ns-muted)]";
  }
}

function Pill({ conf }: { conf: StemConfidence | "custom" }) {
  return (
    <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${confClass(conf)}`}>
      {conf === "custom" ? "custom" : conf === "not detected" ? "not detected" : `${conf} confidence`}
    </span>
  );
}

const card = "rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5";
const btn =
  "rounded-xl border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] px-3.5 py-2 text-sm font-semibold text-[var(--color-ns-text)] hover:border-[var(--color-ns-purple-light)] disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary =
  "rounded-xl bg-[var(--color-ns-purple)] px-5 py-2.5 text-sm font-bold text-white shadow-[var(--shadow-primary)] hover:bg-[var(--color-ns-purple-light)] disabled:cursor-not-allowed disabled:opacity-50";

function StepTitle({ n, children }: { n: number; children: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5 font-heading text-base font-bold text-[var(--color-ns-text)]">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-ns-purple)] text-xs text-white">{n}</span>
      {children}
    </h2>
  );
}

function Progress({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-2.5 flex-1 overflow-hidden rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)]"
      >
        <div className="h-full rounded-full bg-gradient-to-r from-[var(--color-ns-purple)] to-[var(--color-ns-purple-light)] transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs text-[var(--color-ns-muted)]">{Math.round(pct)}%</span>
    </div>
  );
}

export function Stems() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<StemAnalysis | null>(null);
  const [stems, setStems] = useState<StemChoice[]>([]);
  const [mode, setMode] = useState<SeparationMode>("auto");
  const [format, setFormat] = useState<"wav" | "flac">("wav");
  const [quality, setQuality] = useState<SeparateRequest["quality"]>("balanced");
  const [splitVocals, setSplitVocals] = useState(false);
  const [splitDrums, setSplitDrums] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customError, setCustomError] = useState("");

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [stage, setStage] = useState<JobStage>("uploading");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [showJob, setShowJob] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [formError, setFormError] = useState("");
  const [jobError, setJobError] = useState("");
  const [results, setResults] = useState<StemResults | null>(null);
  const [zipping, setZipping] = useState(false);

  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const urlRef = useRef<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  /* ---------- upload + analyse ---------- */
  const handleFile = useCallback(
    async (f: File) => {
      if (running) return;
      setUploadError("");
      const err = validateAudioFile(f);
      if (err) {
        setUploadError(err);
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(f);
      urlRef.current = url;
      setFile(f);
      setFileUrl(url);
      setDuration(null);
      setAnalysis(null);
      setStems([]);
      setResults(null);
      setShowJob(false);
      setJobError("");
      setUploadPct(0);

      const probe = new Audio();
      probe.preload = "metadata";
      probe.onloadedmetadata = () => alive.current && setDuration(Number.isFinite(probe.duration) ? probe.duration : 0);
      probe.onerror = () => alive.current && setDuration(0);
      probe.src = url;

      setRunning(true);
      setShowJob(true);
      setStage("uploading");
      setProgress(0);
      setMessage("Uploading…");
      try {
        const a = await analyseUpload(f, (p) => alive.current && setUploadPct(p));
        if (!alive.current) return;
        setUploadPct(100);
        setAnalysis(a);
        setMode(DEFAULT_MODE);
        setStems(applyPreset(a.detected_stems.map((s) => ({ ...s, checked: s.available })), DEFAULT_MODE));
        setShowJob(false);
      } catch (e) {
        if (alive.current) setJobError(e instanceof Error ? e.message : "Analysis failed.");
      } finally {
        if (alive.current) setRunning(false);
      }
    },
    [running],
  );

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void handleFile(f);
  }

  /* ---------- stem selection ---------- */
  const changeMode = (m: SeparationMode) => {
    setMode(m);
    setStems((s) => applyPreset(s, m));
  };
  const toggle = (id: string, checked: boolean) => {
    setMode("custom");
    setStems((s) => s.map((x) => (x.id === id ? { ...x, checked } : x)));
  };
  const selectAll = () => {
    setMode("custom");
    setStems((s) => s.map((x) => ({ ...x, checked: x.available })));
  };
  const clearAll = () => {
    setMode("custom");
    setStems((s) => s.map((x) => ({ ...x, checked: false })));
  };
  const addCustom = () => {
    const r = addCustomStem(stems, customName);
    setCustomError(r.error ?? "");
    if (!r.error) {
      setStems(r.stems);
      setCustomName("");
      setMode("custom");
    }
  };

  /* ---------- run a job ---------- */
  async function onStart(e: FormEvent) {
    e.preventDefault();
    if (running || !analysis || !file) return;
    setFormError("");
    const req = buildRequest(analysis, file.name, mode, stems, { format, quality, split_vocals: splitVocals, split_drums: splitDrums });
    if (!req.stems.length && !req.custom_stems.length) {
      setFormError("Select at least one stem.");
      return;
    }
    setRunning(true);
    setResults(null);
    setShowJob(true);
    setJobError("");
    setStage("separating");
    setProgress(0);
    setMessage("Starting…");
    try {
      const { job_id } = await startSeparation(req);
      for (;;) {
        const j = await getJob(job_id);
        if (!alive.current) return;
        if (j.status === "failed") throw new Error(j.error ?? "Separation failed on the server.");
        setStage(STAGES.includes(j.status as JobStage) && j.status !== "uploading" ? (j.status as JobStage) : "separating");
        setProgress(Number(j.progress) || 0);
        setMessage(j.message ?? "");
        if (j.status === "complete") break;
        await sleep(POLL_MS);
      }
      const res = await getJobStems(job_id, format, fileUrl);
      if (!alive.current) return;
      setResults(res);
      setProgress(100);
      setMessage("Done.");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      if (alive.current) setJobError(err instanceof Error ? err.message : "Separation failed.");
    } finally {
      if (alive.current) setRunning(false);
    }
  }

  async function downloadZip() {
    if (!results) return;
    if (results.zip_url) {
      const a = document.createElement("a");
      a.href = results.zip_url;
      a.download = "stems.zip";
      a.click();
      return;
    }
    setZipping(true);
    try {
      const files = [];
      for (const s of results.stems) {
        files.push({ name: s.filename, data: new Uint8Array(await (await fetch(s.url)).arrayBuffer()) });
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(buildZip(files));
      a.download = "stems.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      setJobError("Could not build the ZIP. Download the stems one by one instead.");
      setShowJob(true);
    } finally {
      setZipping(false);
    }
  }

  const selected = stems.filter((s) => s.checked).length;
  const stageIdx = STAGES.indexOf(stage);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      {USE_MOCK && (
        <p className="inline-block rounded-full border border-[var(--color-ns-border-strong)] px-3 py-0.5 text-xs text-[var(--color-ns-purple-light)]">
          Mock backend — no server is being called
        </p>
      )}

      {/* 1. Upload */}
      <section className={card} aria-labelledby="stem-upload">
        <StepTitle n={1}>Upload audio</StepTitle>
        <span id="stem-upload" className="sr-only">Upload audio</span>
        <div
          role="button"
          tabIndex={0}
          aria-disabled={running}
          aria-label="Drop an audio file here, or press Enter to browse"
          onClick={() => !running && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !running) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`cursor-pointer rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragOver ? "border-[var(--color-ns-purple)] bg-[var(--color-ns-hover)]" : "border-[var(--color-ns-border-strong)] hover:border-[var(--color-ns-purple-light)]"
          } ${running ? "opacity-60" : ""}`}
        >
          <p className="text-sm text-[var(--color-ns-text)]">
            <strong>Drag &amp; drop</strong> a song here
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">{ALLOWED_EXT.map((e) => e.toUpperCase()).join(", ")} — video files work too, only the audio is used</p>
          <button
            type="button"
            className={`${btn} mt-3`}
            disabled={running}
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Browse files
          </button>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {uploadError && (
          <p role="alert" className="mt-3 text-sm text-[var(--color-ns-red)]">
            {uploadError}
          </p>
        )}
        {file && (
          <div className="mt-4 space-y-3">
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                ["File", file.name],
                ["Size", fmtBytes(file.size)],
                ["Duration", duration === null ? "reading…" : duration ? fmtTime(duration) : "unknown"],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0 rounded-xl bg-[var(--color-ns-raised)] px-3 py-2">
                  <dt className="text-[11px] text-[var(--color-ns-muted)]">{k}</dt>
                  <dd className="break-words text-sm font-semibold text-[var(--color-ns-text)]">{v}</dd>
                </div>
              ))}
            </dl>
            {uploadPct !== null && <Progress pct={uploadPct} label="Upload progress" />}
          </div>
        )}
      </section>

      {/* 2. Options */}
      {analysis && (
        <form className={card} onSubmit={onStart} aria-labelledby="stem-options" noValidate>
          <h2 id="stem-options" className="mb-1 flex items-center gap-2.5 font-heading text-base font-bold text-[var(--color-ns-text)]">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-ns-purple)] text-xs text-white">2</span>
            Choose stems
          </h2>
          <p className="text-sm text-[var(--color-ns-muted)]">
            {USE_MOCK
              ? `${analysis.detected_stems.filter((s) => s.available).length} of ${analysis.detected_stems.length} layers detected`
              : "Stems that turn out silent in this song are left out of the results"}
            {analysis.duration_seconds ? ` · ${fmtTime(analysis.duration_seconds)} long` : ""}.
          </p>

          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-[var(--color-ns-text)]">Separation mode</legend>
            {MODES.map((m) => (
              <label
                key={m.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${
                  mode === m.value ? "border-[var(--color-ns-purple)] bg-[var(--color-ns-hover)]" : "border-[var(--color-ns-border)]"
                }`}
              >
                <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => changeMode(m.value)} className="mt-1 accent-[var(--color-ns-purple)]" />
                <span className="text-sm font-semibold text-[var(--color-ns-text)]">
                  {m.title}
                  <small className="block text-xs font-normal text-[var(--color-ns-muted)]">{m.hint}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="mt-4 rounded-xl border border-[var(--color-ns-border)] p-3">
            <legend className="px-1.5 text-sm font-semibold text-[var(--color-ns-text)]">
              Stems <span className="font-normal text-[var(--color-ns-muted)]">({selected} selected)</span>
            </legend>
            <div className="mb-2 flex flex-wrap gap-2">
              <button type="button" className={`${btn} !py-1.5 !text-xs`} onClick={selectAll}>
                Select all detected stems
              </button>
              <button type="button" className={`${btn} !py-1.5 !text-xs`} onClick={clearAll}>
                Clear selection
              </button>
            </div>
            <ul className="grid gap-2">
              {stems.map((s) => (
                <li key={s.id} className={`flex items-center gap-2 rounded-xl bg-[var(--color-ns-raised)] px-3 py-2 ${s.available ? "" : "opacity-55"}`}>
                  <label className={`flex min-w-0 flex-1 items-center gap-2.5 ${s.available ? "cursor-pointer" : "cursor-not-allowed"}`}>
                    <input
                      type="checkbox"
                      checked={s.checked}
                      disabled={!s.available}
                      onChange={(e) => toggle(s.id, e.target.checked)}
                      className="h-4 w-4 accent-[var(--color-ns-purple)]"
                    />
                    <span className="min-w-0 flex-1 break-words text-sm text-[var(--color-ns-text)]">{s.label}</span>
                    <Pill conf={s.custom ? "custom" : s.confidence} />
                  </label>
                  {s.custom && (
                    <button
                      type="button"
                      aria-label={`Remove ${s.label}`}
                      className="px-1 text-lg text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                      onClick={() => setStems((x) => x.filter((y) => y.id !== s.id))}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {EXTRA_OPTIONS && <div className="mt-3">
              <label htmlFor="custom-stem" className="mb-1.5 block text-sm text-[var(--color-ns-text)]">
                Add a custom stem <span className="text-[var(--color-ns-muted)]">(synth, strings, brass, pads, FX, percussion…)</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="custom-stem"
                  type="text"
                  maxLength={40}
                  value={customName}
                  autoComplete="off"
                  placeholder="e.g. Strings"
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] px-3 py-2 text-sm text-[var(--color-ns-text)]"
                />
                <button type="button" className={btn} onClick={addCustom}>
                  Add
                </button>
              </div>
              {customError && (
                <p role="alert" className="mt-1.5 text-sm text-[var(--color-ns-red)]">
                  {customError}
                </p>
              )}
            </div>}
          </fieldset>

          <fieldset className="mt-4 rounded-xl border border-[var(--color-ns-border)] p-3">
            <legend className="px-1.5 text-sm font-semibold text-[var(--color-ns-text)]">Output</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs text-[var(--color-ns-muted)]">Format</span>
                <SettingsSelect variant="field" label="Format" value={format} options={FORMAT_OPTIONS} onChange={setFormat} />
              </div>
              {EXTRA_OPTIONS && (
                <div>
                  <span className="mb-1 block text-xs text-[var(--color-ns-muted)]">Quality</span>
                  <SettingsSelect variant="field" label="Quality" value={quality} options={QUALITY_OPTIONS} onChange={setQuality} />
                </div>
              )}
            </div>
            {EXTRA_OPTIONS && (
              <>
                <label className="mt-3 flex items-start gap-2.5 text-sm text-[var(--color-ns-text)]">
                  <input type="checkbox" checked={splitVocals} onChange={(e) => setSplitVocals(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-ns-purple)]" />
                  Separate lead vocal from backing vocals
                </label>
                <label className="mt-2 flex items-start gap-2.5 text-sm text-[var(--color-ns-text)]">
                  <input type="checkbox" checked={splitDrums} onChange={(e) => setSplitDrums(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-ns-purple)]" />
                  Separate drums into kick, snare, toms, hi-hat, ride, crash
                </label>
              </>
            )}
            {analysis.estimated_seconds ? (
              <p className="mt-3 text-sm text-[var(--color-ns-muted)]">Estimated processing time: ~{fmtTime(analysis.estimated_seconds)}</p>
            ) : null}
          </fieldset>

          <div className="mt-4">
            <button type="submit" className={btnPrimary} disabled={running}>
              {running ? "Working…" : "Start separation"}
            </button>
            {formError && (
              <p role="alert" className="mt-2 text-sm text-[var(--color-ns-red)]">
                {formError}
              </p>
            )}
          </div>
        </form>
      )}

      {/* 3. Processing */}
      {showJob && (
        <section className={card} aria-labelledby="stem-job">
          <h2 id="stem-job" className="mb-3 flex items-center gap-2.5 font-heading text-base font-bold text-[var(--color-ns-text)]">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-ns-purple)] text-xs text-white">3</span>
            Processing
          </h2>
          <ol className="mb-3 flex flex-wrap gap-1.5" aria-label="Job stages">
            {STAGES.map((s, i) => {
              const done = i < stageIdx || stage === "complete";
              const now = i === stageIdx && stage !== "complete";
              return (
                <li
                  key={s}
                  aria-current={now ? "step" : undefined}
                  className={`rounded-full border px-3 py-1 text-xs capitalize ${
                    now
                      ? "border-[var(--color-ns-purple)] bg-[var(--color-ns-purple)] text-white"
                      : done
                        ? "border-[var(--color-ns-mint)] text-[var(--color-ns-mint)]"
                        : "border-[var(--color-ns-border-strong)] text-[var(--color-ns-muted)]"
                  }`}
                >
                  {s}
                </li>
              );
            })}
          </ol>
          <Progress pct={progress} label="Job progress" />
          <p aria-live="polite" className="mt-2 text-sm text-[var(--color-ns-muted)]">
            {message}
          </p>
          {jobError && (
            <p role="alert" className="mt-2 text-sm text-[var(--color-ns-red)]">
              {jobError}
            </p>
          )}
        </section>
      )}

      {/* 4. Results */}
      {results && <Results results={results} onZip={downloadZip} zipping={zipping} sectionRef={resultsRef} fallbackOriginal={fileUrl} />}

      <p className="px-1 text-xs text-[var(--color-ns-dim)]">
        Confidence shows how sure the analysis is that a layer exists — not how clean the separation is. Stems marked with a warning may contain bleed.
      </p>
    </div>
  );
}

function Results({
  results,
  onZip,
  zipping,
  sectionRef,
  fallbackOriginal,
}: {
  results: StemResults;
  onZip: () => void;
  zipping: boolean;
  sectionRef: React.RefObject<HTMLElement | null>;
  fallbackOriginal: string | null;
}) {
  const originalUrl = results.original_url ?? fallbackOriginal;

  return (
    <section ref={sectionRef} className={card} aria-labelledby="stem-results">
      <h2 id="stem-results" className="mb-1 flex items-center gap-2.5 font-heading text-base font-bold text-[var(--color-ns-text)]">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-ns-purple)] text-xs text-white">4</span>
        Results
      </h2>
      {results.notice && (
        <p role="note" className="mb-2 rounded-xl border border-[var(--color-ns-amber)] px-3 py-2 text-sm text-[var(--color-ns-amber)]">
          {results.notice}
        </p>
      )}
      <p className="text-sm text-[var(--color-ns-muted)]">Separation is never perfect. Stems with a warning may contain bleed from other instruments.</p>

      <div className="my-3 flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} onClick={onZip} disabled={zipping}>
          {zipping ? "Building ZIP…" : "Download all as ZIP"}
        </button>
      </div>

      {originalUrl && (
        <div className="mb-3 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] p-3">
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-ns-text)]">Original song</h3>
          <ThemedAudio id="original" src={originalUrl} label="original song" />
        </div>
      )}

      <StemFileMixer stems={results.stems} />

      {originalUrl && <AbCompare originalUrl={originalUrl} stems={results.stems} />}

      <h3 className="mb-2 mt-4 text-sm font-semibold text-[var(--color-ns-text)]">Each stem</h3>
      <ul className="grid gap-2.5">
        {results.stems.map((s) => {
          const warn = bleedWarning(s);
          return (
            <li key={s.id} className="grid gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="min-w-[8rem] flex-1 text-sm text-[var(--color-ns-text)]">{s.label}</strong>
                <Pill conf={s.confidence} />
                <span className="text-xs text-[var(--color-ns-muted)]">{fmtBytes(s.size_bytes)}</span>
                <a href={s.url} download={s.filename} className={`${btn} !py-1.5 !text-xs`}>
                  Download
                </a>
              </div>
              <ThemedAudio id={`stem-${s.id}`} src={s.url} label={s.label} />
              {warn && <p className="text-xs text-[var(--color-ns-amber)]">⚠ {warn}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
