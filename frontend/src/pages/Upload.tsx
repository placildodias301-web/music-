import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import { analyzeFile, logRightsAttestation } from "../lib/api";
import { generateSampleTrack } from "../lib/generateSampleTrack";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type Stage = "idle" | "uploading" | "preparing" | "analyzing" | "complete" | "error";

/** Optional router state: Home's drop zone hands over a file or the sample choice. */
export interface UploadLocationState {
  file?: File;
  sample?: boolean;
}

export function Upload() {
  const navigate = useNavigate();
  const { setSong, setAnalysis } = useMvp();
  const location = useLocation();
  const handoff = (location.state ?? {}) as UploadLocationState;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(handoff.file instanceof File ? handoff.file : null);
  const [usingSample, setUsingSample] = useState(Boolean(handoff.sample) && !(handoff.file instanceof File));
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUsingSample(false);
    setErrorMessage(null);
  }

  function handleUseSample() {
    setSelectedFile(null);
    setUsingSample(true);
    setErrorMessage(null);
  }

  async function handleAnalyze() {
    setErrorMessage(null);

    if (!rightsConfirmed) {
      setErrorMessage("Please confirm you own this audio or have the right to use it before analyzing.");
      return;
    }

    try {
      if (usingSample) {
        setStage("preparing");
        const { blobUrl } = await generateSampleTrack();

        // Fetch the generated blob back as a File so we can send it through
        // the exact same real-analysis path as an uploaded file.
        const blobResponse = await fetch(blobUrl);
        const blob = await blobResponse.blob();
        const sampleFile = new File([blob], "Wilsify Demo Track.wav", { type: "audio/wav" });

        setSong({
          fileName: sampleFile.name,
          fileSizeBytes: sampleFile.size,
          audioUrl: blobUrl,
          isSampleAudio: true,
        });

        void logRightsAttestation(sampleFile.name);
        setStage("analyzing");
        const analysis = await analyzeFile(sampleFile);
        setAnalysis(analysis);
        setStage("complete");
        await new Promise((r) => setTimeout(r, 350));
        navigate("/analysis");
        return;
      }

      if (!selectedFile) return;

      setStage("uploading");
      const audioUrl = URL.createObjectURL(selectedFile);
      setSong({
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size,
        audioUrl,
        isSampleAudio: false,
      });

      void logRightsAttestation(selectedFile.name);
      
      const isVideo = selectedFile.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/i.test(selectedFile.name);
      setStage("preparing");
      if (isVideo) {
        await new Promise((r) => setTimeout(r, 600));
      } else {
        await new Promise((r) => setTimeout(r, 300));
      }

      setStage("analyzing");
      const analysis = await analyzeFile(selectedFile);
      setAnalysis(analysis);
      setStage("complete");
      await new Promise((r) => setTimeout(r, 350));
      navigate("/analysis");
    } catch (err) {
      setStage("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const canAnalyze =
    (selectedFile !== null || usingSample) && rightsConfirmed && (stage === "idle" || stage === "error");
  const isBusy = stage !== "idle" && stage !== "error";

  const stageProgress = {
    idle: 0,
    uploading: 25,
    preparing: 55,
    analyzing: 85,
    complete: 100,
    error: 0,
  }[stage];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-2xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 text-center sm:mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ns-blue/30 bg-ns-blue/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ns-blue">
          Audio & Video MIR Analysis
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-content sm:text-4xl">
          Upload a Track
        </h1>
        <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-content-muted">
          Select any music or video file from your device. Wilsify AI automatically extracts audio, handles conversion, and performs real signal-processing to detect chords, key, and tempo.
        </p>
      </div>

      <div className="glass-card relative overflow-hidden p-6 sm:p-8 border border-ns-border bg-ns-card rounded-2xl shadow-xl">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Drop zone with drag-and-drop */}
        <div
          onClick={() => !isBusy && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isBusy) return;
            const file = e.dataTransfer.files?.[0];
            if (file) {
              setSelectedFile(file);
              setUsingSample(false);
              setErrorMessage(null);
            }
          }}
          className={`group flex cursor-pointer flex-col items-center gap-3.5 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all ${
            selectedFile
              ? "border-primary/50 bg-primary/5"
              : "border-ns-border bg-white/[0.015] hover:border-primary/50 hover:bg-white/[0.03]"
          } ${isBusy ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary transition-transform group-hover:scale-105">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="font-heading text-base font-semibold text-content">
              {selectedFile ? "Change selected file" : "Choose a file or drag & drop"}
            </p>
            <p className="mt-1 text-xs text-content-dim">
              Supports MP3, WAV, M4A, FLAC, MP4, MOV, WEBM (auto-converted)
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 pt-1">
            {["MP3", "WAV", "M4A", "FLAC", "MP4", "MOV", "WEBM"].map((fmt) => (
              <span key={fmt} className="rounded-md border border-ns-border bg-ns-raised px-2 py-0.5 text-[10px] font-mono font-medium text-content-muted">
                {fmt}
              </span>
            ))}
          </div>
        </div>

        {/* Selected File Card */}
        {selectedFile && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 p-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
                  <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-content sm:text-sm">{selectedFile.name}</p>
                <p className="text-[11px] text-content-dim">{formatBytes(selectedFile.size)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="rounded-full bg-ns-mint/15 px-2.5 py-0.5 text-[11px] font-semibold text-ns-mint">
                Ready
              </span>
              <button
                type="button"
                aria-label="Remove selected file"
                onClick={() => setSelectedFile(null)}
                className="flex h-6 w-6 items-center justify-center rounded text-content-dim hover:text-content"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-glass" />
          <span className="text-[11px] font-semibold tracking-wider text-content-dim">OR</span>
          <div className="h-px flex-1 bg-glass" />
        </div>

        {/* Sample Track Option */}
        <button
          type="button"
          onClick={handleUseSample}
          disabled={isBusy}
          className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            usingSample
              ? "border-primary/60 bg-primary/10 shadow-[0_2px_16px_rgba(108,77,255,0.15)]"
              : "border-ns-border bg-white/[0.02] hover:border-ns-border-strong hover:bg-white/[0.04]"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content">Instant Demo Track</p>
              <p className="text-xs text-content-muted">
                Synthesizes a short original audio track and runs real MIR chord & tempo analysis
              </p>
            </div>
          </div>
          {usingSample && (
            <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              Selected
            </span>
          )}
        </button>

        {/* Rights attestation */}
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-glass bg-white/[0.02] p-3.5 transition-colors hover:border-glass-strong">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(e) => setRightsConfirmed(e.target.checked)}
            disabled={isBusy}
            className="mt-0.5 h-4 w-4 rounded border-glass bg-transparent accent-[#6C4DFF]"
          />
          <span className="text-xs leading-relaxed text-content-muted">
            I confirm I own this audio or have the right to analyze it for personal practice. Attestations are logged with timestamps — no raw audio is retained beyond analysis.
          </span>
        </label>

        {errorMessage && (
          <div role="alert" className="alert alert-error mt-4 flex items-center gap-2 rounded-xl border border-pink/30 bg-pink/10 p-3 text-xs text-pink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-px flex-shrink-0 text-pink" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M12 7.5v5.5M12 16.5v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          className="btn-primary mt-6 w-full py-3.5 text-sm sm:text-base font-bold shadow-[0_4px_24px_rgba(108,77,255,0.4)]"
        >
          {stage === "uploading" && (
            <>
              <span className="spinner" /> Uploading track…
            </>
          )}
          {stage === "preparing" && (
            <>
              <span className="spinner" /> Preparing audio…
            </>
          )}
          {stage === "analyzing" && (
            <>
              <span className="spinner" /> Analyzing audio (detecting key, BPM & chords)…
            </>
          )}
          {stage === "complete" && (
            <>
              <span className="text-ns-mint">✓</span> Analysis complete!
            </>
          )}
          {(stage === "idle" || stage === "error") && "Analyze Song"}
        </button>

        {isBusy && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-content-muted mb-1.5 font-medium">
              <span>
                {stage === "uploading" && "Uploading track..."}
                {stage === "preparing" && "Preparing audio..."}
                {stage === "analyzing" && "Analyzing audio..."}
                {stage === "complete" && "Analysis complete"}
              </span>
              <span>{stageProgress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-cyan transition-all duration-300"
                style={{ width: `${stageProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
