import type { AnalysisErrorKind, AnalysisProgress, AnalysisStage } from "../../lib/api";

export type AnalysisPhase = "downloading" | "preparing" | "uploading" | "analyzing" | "voicings" | "complete";

/** What the server is doing right now (shown under the step list). */
const SERVER_DETAIL: Record<AnalysisStage, string> = {
  uploaded: "Upload received",
  decoding: "Decoding the audio",
  separating: "Separating harmony from drums",
  beats: "Tracking beats and tempo",
  chroma: "Reading the notes in each moment",
  chords: "Recognising chords",
  key: "Estimating the key",
  meter: "Estimating the time signature",
};

type StepId = "link" | "sample" | "upload" | "tempo" | "chords" | "key" | "voicings";

const STEP_LABEL: Record<StepId, string> = {
  link: "Fetching media",
  sample: "Creating the sample track",
  upload: "Uploading/Preparing",
  tempo: "Analyzing: Detecting tempo & beats",
  chords: "Building chord timeline",
  key: "Detecting key & time signature",
  voicings: "Preparing chord voicings",
};

/** Server stages, in the order the analyser runs them, grouped into steps. */
const STAGE_STEP: Record<AnalysisStage, StepId> = {
  uploaded: "tempo",
  decoding: "tempo",
  separating: "tempo",
  beats: "tempo",
  chroma: "chords",
  chords: "chords",
  key: "key",
  meter: "key",
};

const ERROR_TITLE: Record<AnalysisErrorKind, string> = {
  network: "Can't reach the Wilsify server",
  "too-large": "That file is too large",
  unsupported: "That format isn't supported",
  unreadable: "We couldn't read the music in that file",
  busy: "The server is busy",
  server: "Something went wrong on the server",
  cancelled: "Analysis cancelled",
};

interface Props {
  fileName: string;
  /** Which input path this run uses (adds the first step). */
  origin: "file" | "link" | "sample";
  phase: AnalysisPhase;
  upload: { loaded: number; total: number; etaSeconds: number | null } | null;
  server: AnalysisProgress | null;
  error: { kind: AnalysisErrorKind; message: string } | null;
  onCancel: () => void;
  onRetry: () => void;
  onChooseAnother: () => void;
  onUploadFallback?: () => void;
}

function Equaliser() {
  // Purple, teal and grey bars; the global reduce-motion rules freeze them.
  const bars = ["purple", "cyan", "grey", "purple", "cyan", "purple", "grey"] as const;
  const color = { purple: "bg-[var(--color-ns-purple-light)]", cyan: "bg-[var(--color-ns-cyan)]", grey: "bg-[var(--color-ns-border-bright)]" };
  return (
    <div className="flex h-14 items-end justify-center gap-1.5" aria-hidden="true">
      {bars.map((c, i) => (
        <span key={i} className={`ns-eq-bar w-2 rounded-full ${color[c]}`} style={{ animationDelay: `${(i * 137) % 600}ms`, height: `${[60, 90, 45, 100, 70, 85, 50][i]}%` }} />
      ))}
    </div>
  );
}

function StepIcon({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-ns-mint)]/15 text-[var(--color-ns-mint)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className="absolute h-4 w-4 animate-ping rounded-full bg-[var(--color-ns-purple)]/40" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-[var(--color-ns-purple-light)]" />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center">
      <span className="h-2 w-2 rounded-full bg-[var(--color-ns-border-bright)]" />
    </span>
  );
}

function formatSeconds(s: number): string {
  if (s < 60) return `About ${Math.max(1, Math.round(s))} second${Math.round(s) === 1 ? "" : "s"} left`;
  return `About ${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? "" : "s"} left`;
}

/**
 * "Analysing your track": real progress only. Upload progress comes from
 * the browser, analysis stages from the server's stream; nothing advances
 * on a timer. Stems aren't separated during analysis (that's an optional
 * step on the analysis page), so there's no stems step here.
 */
export function AnalysisProgressScreen({ fileName, origin, phase, upload, server, error, onCancel, onRetry, onChooseAnother, onUploadFallback }: Props) {
  const steps: StepId[] = [...(origin === "link" ? (["link"] as StepId[]) : origin === "sample" ? (["sample"] as StepId[]) : []), "upload", "tempo", "chords", "key", "voicings"];

  const activeStep: StepId | "done" =
    phase === "downloading"
      ? "link"
      : phase === "preparing"
        ? "sample"
        : phase === "uploading"
          ? "upload"
          : phase === "analyzing"
            ? server
              ? STAGE_STEP[server.stage]
              : "tempo"
            : phase === "voicings"
              ? "voicings"
              : "done";
  const activeIndex = activeStep === "done" ? steps.length : steps.indexOf(activeStep);

  // Overall bar: upload bytes fill the first 20%, then the server's own percentage.
  const uploadPct = upload && upload.total ? upload.loaded / upload.total : 0;
  const percent =
    phase === "uploading"
      ? Math.round(uploadPct * 20)
      : phase === "analyzing"
        ? Math.round(20 + (server?.progress ?? 0) * 0.75)
        : phase === "voicings"
          ? 97
          : phase === "complete"
            ? 100
            : null;

  const detail =
    phase === "uploading"
      ? upload && upload.loaded >= upload.total && upload.total > 0
        ? "Upload complete — waiting for the server to start"
        : upload
          ? `${(upload.loaded / 1048576).toFixed(1)} of ${(upload.total / 1048576).toFixed(1)} MB`
          : "Starting upload"
      : phase === "analyzing"
        ? server
          ? SERVER_DETAIL[server.stage]
          : "Upload received"
        : phase === "voicings"
          ? "Working out guitar, ukulele and piano shapes"
          : phase === "downloading"
            ? "Fetching media from YouTube on the server"
            : phase === "preparing"
              ? "Synthesising an original demo clip"
              : "Done";

  if (error) {
    const fixable = error.kind === "too-large" || error.kind === "unsupported";
    return (
      <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 text-center sm:p-8" role="alert">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-ns-red)]/12 text-[var(--color-ns-red)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.5v.01" />
          </svg>
        </span>
        <h2 className="mt-4 font-heading text-xl font-bold text-[var(--color-ns-text)]">{ERROR_TITLE[error.kind]}</h2>
        <p className="mx-auto mt-1 max-w-sm truncate text-[0.8125rem] text-[var(--color-ns-dim)]" title={fileName}>
          {fileName}
        </p>
        <div className="mt-4 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-3 text-left">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]">What went wrong</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--color-ns-muted)]">{error.message}</p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <button type="button" className={fixable ? "btn-primary" : "btn-secondary"} onClick={onChooseAnother}>
            Choose another file
          </button>
          {origin === "link" && onUploadFallback && (
            <button type="button" className="btn-secondary" onClick={onUploadFallback}>
              Upload audio file directly
            </button>
          )}
          {!fixable && (
            <button type="button" className="btn-primary" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-8" aria-busy={phase !== "complete"}>
      <Equaliser />
      <h2 className="mt-5 text-center font-heading text-xl font-bold text-[var(--color-ns-text)] sm:text-2xl">Analysing your track</h2>
      <p className="mx-auto mt-1 max-w-sm truncate text-center text-[0.8125rem] text-[var(--color-ns-muted)]" title={fileName}>
        {fileName}
      </p>

      <div className="mt-5">
        <div
          className="h-2 overflow-hidden rounded-full bg-[var(--color-ns-border)]"
          role="progressbar"
          aria-label="Analysis progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          aria-valuetext={percent === null ? detail : `${percent}% — ${detail}`}
        >
          {percent === null ? (
            <div className="ns-indeterminate h-full w-1/3 rounded-full bg-gradient-to-r from-[var(--color-ns-purple)] to-[var(--color-ns-cyan)]" />
          ) : (
            <div className="h-full rounded-full bg-gradient-to-r from-[var(--color-ns-purple)] to-[var(--color-ns-cyan)] transition-[width] duration-300" style={{ width: `${percent}%` }} />
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-[0.75rem]">
          <span className="truncate text-[var(--color-ns-muted)]" aria-live="polite">
            {detail}
          </span>
          <span className="shrink-0 font-mono tabular-nums text-[var(--color-ns-text)]">{percent === null ? "" : `${percent}%`}</span>
        </div>
        {phase === "uploading" && upload?.etaSeconds != null && upload.etaSeconds > 2 && (
          <p className="mt-1 text-[0.75rem] text-[var(--color-ns-dim)]">{formatSeconds(upload.etaSeconds)}</p>
        )}
      </div>

      <ol className="mt-6 space-y-2.5">
        {steps.map((id, i) => {
          const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <li key={id} className="flex items-center gap-3" aria-current={state === "active" ? "step" : undefined}>
              <StepIcon state={state} />
              <span
                className={`text-[0.875rem] ${
                  state === "active" ? "font-semibold text-[var(--color-ns-text)]" : state === "done" ? "text-[var(--color-ns-muted)]" : "text-[var(--color-ns-dim)]"
                }`}
              >
                {STEP_LABEL[id]}
              </span>
              <span className="sr-only">{state === "done" ? "(done)" : state === "active" ? "(in progress)" : "(not started)"}</span>
            </li>
          );
        })}
      </ol>

      {phase !== "complete" && (
        <div className="mt-6 flex justify-center">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
