import { useRef, useState } from "react";
import { useSettings } from "../lib/settings/settingsContext";
import { useLocation, useNavigate } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  AnalysisError,
  analyzeFile,
  analyzeWithPipeline,
  fetchMediaFromLink,
  getAnalysisEngine,
  logRightsAttestation,
  validateUploadFile,
  validateMediaLink,
  validateYouTubeUrl,
  YOUTUBE_FALLBACK_MESSAGE,
  type AnalysisErrorKind,
} from "../lib/api";
import { generateSampleTrack } from "../lib/generateSampleTrack";
import { MicRecorder } from "../components/upload/MicRecorder";
import { YouTubeBrowser } from "../components/upload/YouTubeBrowser";
import type { AnalysisProgress, AnalysisResult, YouTubeVideo } from "../lib/api";
import { AnalysisProgressScreen, type AnalysisPhase } from "../components/upload/AnalysisProgressScreen";
import { getGuitarVoicings, getUkuleleShape, parseChordSymbol } from "../lib/chordTheory";
import { isVoiceableChord } from "../lib/chordSync";
import { saveToLibrary } from "../lib/library";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


type Source = "mic" | "link" | "files" | "social";

/** Works out every chord shape the analysis page will show (real work, cached in chordTheory). */
function prepareVoicings(analysis: AnalysisResult) {
  for (const symbol of new Set(analysis.chordProgression)) {
    if (!isVoiceableChord(symbol)) continue;
    const chord = parseChordSymbol(symbol);
    getGuitarVoicings(chord);
    getUkuleleShape(chord);
  }
}

/** Browser notification when the user has switched to another tab (Settings → Notifications). */
function notifyFinished(fileName: string) {
  if (!("Notification" in window) || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  try {
    new Notification("Your song is ready", { body: `${fileName} has been analysed. Open Wilsify to see the chords.`, icon: "/favicon.svg" });
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

const SOURCES: { id: Source; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    id: "mic",
    label: "Microphone",
    hint: "Record live singing or playing",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" stroke="none" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
      </svg>
    ),
  },
  {
    id: "link",
    label: "Paste a Link",
    hint: "YouTube, Instagram, TikTok and more",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M2.5 12h19M12 2.5c2.6 2.8 3.8 6 3.8 9.5s-1.2 6.7-3.8 9.5c-2.6-2.8-3.8-6-3.8-9.5S9.4 5.3 12 2.5Z" />
      </svg>
    ),
  },
  {
    id: "files",
    label: "Browse files",
    hint: "MP3, WAV, M4A, FLAC, MP4, MOV, WEBM",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
      </svg>
    ),
  },
  {
    id: "social",
    label: "YouTube Search",
    hint: "Search YouTube or paste a video link",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="4.5" fill="currentColor" />
        <path d="M10 9.2v5.6l4.8-2.8Z" fill="#050A18" />
      </svg>
    ),
  },
];

const SOCIAL_PLATFORMS: { name: string; pattern: RegExp }[] = [
  { name: "YouTube Shorts", pattern: /youtube\.com\/shorts\//i },
  { name: "YouTube Music", pattern: /music\.youtube\.com/i },
  { name: "YouTube", pattern: /(youtube\.com|youtu\.be)/i },
  { name: "Instagram", pattern: /(^|\.|\/)instagram\.com/i },
  { name: "TikTok", pattern: /(^|\.|\/)tiktok\.com/i },
  { name: "Facebook", pattern: /(^|\.|\/)(facebook\.com|fb\.watch)/i },
  { name: "X", pattern: /(^|\.|\/)(x\.com|twitter\.com)/i },
  { name: "SoundCloud", pattern: /(^|\.|\/)soundcloud\.com/i },
  { name: "Vimeo", pattern: /(^|\.|\/)vimeo\.com/i },
  { name: "Reddit", pattern: /(^|\.|\/)(reddit\.com|redd\.it)/i },
  { name: "Twitch", pattern: /(^|\.|\/)twitch\.tv/i },
];

function detectPlatform(url: string): string | null {
  return SOCIAL_PLATFORMS.find((p) => p.pattern.test(url))?.name ?? null;
}

/** Optional router state: Home's drop zone hands over a file or the sample choice. */
export interface UploadLocationState {
  file?: File;
  sample?: boolean;
}

export function Upload() {
  const navigate = useNavigate();
  const { setSong, setAnalysis } = useMvp();
  const { settings } = useSettings();
  const location = useLocation();
  const handoff = (location.state ?? {}) as UploadLocationState;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<Source>("files");
  const [selectedFile, setSelectedFile] = useState<File | null>(handoff.file instanceof File ? handoff.file : null);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [ytVideo, setYtVideo] = useState<YouTubeVideo | null>(null);
  const [usingSample, setUsingSample] = useState(Boolean(handoff.sample) && !(handoff.file instanceof File));
  // Analysis run state. phase === null shows the form.
  const [phase, setPhase] = useState<AnalysisPhase | null>(null);
  const [origin, setOrigin] = useState<"file" | "link" | "sample">("file");
  const [runName, setRunName] = useState("");
  const [upload, setUpload] = useState<{ loaded: number; total: number; etaSeconds: number | null } | null>(null);
  const [serverProgress, setServerProgress] = useState<AnalysisProgress | null>(null);
  const [runError, setRunError] = useState<{ kind: AnalysisErrorKind; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    handoff.file instanceof File ? validateUploadFile(handoff.file) : null,
  );
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  function switchToFileUpload() {
    setRunError(null);
    setPhase(null);
    setSource("files");
    setErrorMessage(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUsingSample(false);
    setErrorMessage(file ? validateUploadFile(file) : null);
    e.target.value = "";
  }

  function handleUseSample() {
    setSelectedFile(null);
    setUsingSample(true);
    setErrorMessage(null);
  }

  function cancelAnalysis() {
    abortRef.current?.abort();
    setPhase(null);
    setErrorMessage("Analysis cancelled.");
  }

  async function handleAnalyze() {
    setErrorMessage(null);
    setRunError(null);
    setServerProgress(null);
    setUpload(null);

    if (source === "files" && !usingSample) {
      const validationError = validateUploadFile(selectedFile);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
    } else if (source === "mic") {
      const validationError = validateUploadFile(recordedFile);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
    } else if (source === "social" || source === "link") {
      const linkError = source === "link" ? validateMediaLink(linkUrl) : validateYouTubeUrl(linkUrl);
      if (linkError) {
        setErrorMessage(linkError);
        return;
      }
    }

    if (!rightsConfirmed) {
      setErrorMessage("Please confirm you own this audio or have the right to use it before analyzing.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const cancelled = () => controller.signal.aborted;

    try {
      let file: File | null = null;
      let isSample = false;
      if (usingSample) {
        setOrigin("sample");
        setRunName("Wilsify Demo Track.wav");
        setPhase("preparing");
        const { blobUrl } = await generateSampleTrack();
        // Send the generated clip through the exact same real-analysis path as an upload.
        const blob = await (await fetch(blobUrl)).blob();
        file = new File([blob], "Wilsify Demo Track.wav", { type: "audio/wav" });
        isSample = true;
      } else if (source === "files") {
        setOrigin("file");
        file = selectedFile;
      } else if (source === "mic") {
        setOrigin("file");
        file = recordedFile;
      } else if (linkUrl.trim()) {
        setOrigin("link");
        setRunName(ytVideo?.title || linkUrl.trim());
        // "Downloads over Wi-Fi only" — only enforceable where the browser reports the connection type.
        const connection = (navigator as Navigator & { connection?: { type?: string } }).connection;
        if (settings.app.wifiOnly && connection?.type === "cellular") {
          throw new AnalysisError("network", "You're on mobile data and \u201cDownloads over Wi-Fi only\u201d is on. Connect to Wi-Fi, or turn it off in Settings \u2192 App.");
        }
        setPhase("downloading");
        try {
          file = await fetchMediaFromLink(linkUrl.trim(), controller.signal);
        } catch (err) {
          if (cancelled()) return;
          setPhase(null);
          setErrorMessage(err instanceof Error && err.message ? err.message : YOUTUBE_FALLBACK_MESSAGE);
          return;
        }
      }
      if (!file || cancelled()) return;

      const preflightError = validateUploadFile(file);
      if (preflightError) {
        setPhase(null);
        setErrorMessage(preflightError);
        return;
      }

      setRunName(file.name);
      void logRightsAttestation(file.name);

      setPhase("uploading");
      setUpload({ loaded: 0, total: file.size, etaSeconds: null });
      // ANALYSIS_ENGINE on the server picks the flow: the job pipeline (upload, then poll for
      // stage/progress) or the v2 stream. Both resolve to the same AnalysisResult.
      const engine = await getAnalysisEngine(controller.signal);
      if (cancelled()) return;
      const analyze = engine === "pipeline" ? analyzeWithPipeline : analyzeFile;
      const started = performance.now();
      const sourceType = usingSample ? "sample" : source === "social" ? "youtube" : source === "link" ? "link" : source === "mic" ? "mic" : "file";
      const analysis = await analyze(file, {
        signal: controller.signal,
        sourceType,
        onUpload: (loaded, total) => {
          // Time left from the measured upload speed (after a second of data, so it's meaningful).
          const elapsed = (performance.now() - started) / 1000;
          const eta = elapsed > 1 && loaded > 0 && loaded < total ? (total - loaded) / (loaded / elapsed) : null;
          setUpload({ loaded, total, etaSeconds: eta });
        },
        onProgress: (p) => {
          setPhase("analyzing");
          setServerProgress(p);
        },
      });
      if (cancelled()) return;

      const savedEntry = saveToLibrary(file.name, analysis);
      setSong({
        libraryId: savedEntry.id,
        fileName: file.name,
        fileSizeBytes: file.size,
        audioUrl: URL.createObjectURL(file),
        isSampleAudio: isSample,
      });

      setPhase("voicings");
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      prepareVoicings(analysis);
      setAnalysis(analysis);
      setPhase("complete");
      if (settings.notifications.analysisFinished) notifyFinished(file.name);
      // Let the bar visibly fill to 100% (its width animates over 300ms) before leaving.
      await new Promise((r) => setTimeout(r, 700));
      if (cancelled()) return;
      navigate("/analysis");
    } catch (err) {
      if (cancelled() || (err instanceof AnalysisError && err.kind === "cancelled")) return;
      setPhase(null);
      setRunError(
        err instanceof AnalysisError
          ? { kind: err.kind, message: err.message }
          : { kind: "server", message: err instanceof Error ? err.message : "Something went wrong." }
      );
    }
  }

  const hasInput =
    source === "files"
      ? selectedFile !== null || usingSample
      : source === "mic"
        ? recordedFile !== null
        : linkUrl.trim().length > 0;
  const isBusy = phase !== null;
  const canAnalyze = hasInput && rightsConfirmed && !isBusy;
  const platform = source === "social" || source === "link" ? detectPlatform(linkUrl) : null;

  if (phase !== null || runError) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-2xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
        <AnalysisProgressScreen
          fileName={runName}
          origin={origin}
          phase={phase ?? "uploading"}
          upload={upload}
          server={serverProgress}
          error={runError}
          onCancel={cancelAnalysis}
          onRetry={() => void handleAnalyze()}
          onChooseAnother={() => {
            setRunError(null);
            setPhase(null);
          }}
          onUploadFallback={switchToFileUpload}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-2xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 text-center sm:mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ns-blue/30 bg-ns-blue/10 px-3 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ns-blue">
          Audio & Video MIR Analysis
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-content sm:text-4xl">
          Select media
        </h1>
        <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-content-muted">
          Record yourself live, pick a file, or paste a link from YouTube, Instagram, TikTok, Facebook, X, SoundCloud and more. Wilsify AI extracts the audio and detects chords, key, and tempo.
        </p>
      </div>

      <div className="glass-card relative overflow-hidden p-6 sm:p-8 border border-ns-border bg-ns-card rounded-2xl shadow-xl">
        <input
          ref={fileInputRef}
          type="file"
          accept={`audio/*,video/*,${ALLOWED_UPLOAD_EXTENSIONS.join(",")}`}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Source picker */}
        <div role="tablist" aria-label="Media source" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
          {SOURCES.map((s) => {
            // The sample track is its own choice, so no tile looks selected while it is.
            const active = source === s.id && !usingSample;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={isBusy}
                onClick={() => {
                  setSource(s.id);
                  setUsingSample(false);
                  setErrorMessage(null);
                  if (s.id === "files") fileInputRef.current?.click();
                }}
                onDragOver={s.id === "files" ? (e) => e.preventDefault() : undefined}
                onDrop={
                  s.id === "files"
                    ? (e) => {
                        e.preventDefault();
                        if (isBusy) return;
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                          setSource("files");
                          setSelectedFile(file);
                          setUsingSample(false);
                          setErrorMessage(validateUploadFile(file));
                        }
                      }
                    : undefined
                }
                className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-5 text-center transition-all disabled:cursor-not-allowed disabled:opacity-60 sm:py-6 ${
                  active
                    ? "border-primary/60 bg-primary/10 text-content shadow-[0_4px_20px_rgba(108,77,255,0.25)]"
                    : "border-ns-border bg-white/[0.02] text-content-muted hover:border-ns-border-strong hover:bg-white/[0.04] hover:text-content"
                }`}
              >
                <span className={active ? (s.id === "social" ? "text-[#FF4D5E]" : "text-primary") : ""}>{s.icon}</span>
                <span className="font-heading text-sm font-semibold sm:text-base">{s.label}</span>
                <span className="hidden text-[0.6875rem] leading-snug text-content-dim sm:block">{s.hint}</span>
              </button>
            );
          })}
        </div>

        {source === "mic" && <MicRecorder onRecorded={setRecordedFile} disabled={isBusy} />}

        {source === "social" && (
          <div className="mb-4">
            <YouTubeBrowser
              selected={ytVideo}
              disabled={isBusy}
              onFallbackToUpload={switchToFileUpload}
              onSelect={(video) => {
                setYtVideo(video);
                setLinkUrl(video?.url ?? "");
                setErrorMessage(null);
              }}
            />
          </div>
        )}

        {(source === "link" || source === "social") && (
          <div className="rounded-2xl border border-ns-border bg-white/[0.015] p-5">
            <label htmlFor="media-link" className="text-xs font-semibold uppercase tracking-wider text-content-muted">
              {source === "social" ? "Or paste a YouTube video link" : "Video or song link"}
            </label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-ns-border bg-ns-raised px-3 focus-within:border-primary/60">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-content-dim" aria-hidden="true">
                <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                id="media-link"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={linkUrl}
                disabled={isBusy}
                aria-invalid={Boolean(errorMessage && (source === "social" || source === "link"))}
                aria-describedby={errorMessage && (source === "social" || source === "link") ? "upload-error-message" : undefined}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  setYtVideo(null);
                  setErrorMessage(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canAnalyze) void handleAnalyze();
                }}
                placeholder={source === "social" ? "https://www.youtube.com/watch?v=..." : "Paste a YouTube, Instagram, TikTok, ... link"}
                style={{ boxShadow: "none", outline: "none" }}
                className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm text-content placeholder:text-content-dim focus:outline-none focus:ring-0"
              />
              {platform && (
                <span className="flex-shrink-0 rounded-full bg-primary/15 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-primary">
                  {platform}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(source === "social"
                ? ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]
                : ["YouTube", "Instagram", "TikTok", "Facebook", "X / Twitter", "SoundCloud", "Vimeo", "and more"]
              ).map((p) => (
                <span key={p} className="rounded-md border border-ns-border bg-ns-raised px-2 py-0.5 text-[0.625rem] font-medium text-content-muted">
                  {p}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[0.6875rem] leading-relaxed text-content-dim">
              Single public videos or tracks only · up to 20 minutes · you are responsible for having rights to analyze the selected video · temporary audio is deleted immediately after analysis.
            </p>
          </div>
        )}

        {source === "files" && (
        <>
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
                <p className="text-[0.6875rem] text-content-dim">{formatBytes(selectedFile.size)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {validateUploadFile(selectedFile) ? (
                <span className="rounded-full bg-pink/15 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-pink">
                  Invalid
                </span>
              ) : (
                <span className="rounded-full bg-ns-mint/15 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-ns-mint">
                  Ready
                </span>
              )}
              <button
                type="button"
                aria-label="Remove selected file"
                onClick={() => {
                  setSelectedFile(null);
                  setErrorMessage(null);
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-content-dim hover:text-content"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-glass" />
          <span className="text-[0.6875rem] font-semibold tracking-wider text-content-dim">OR</span>
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
              <p className="text-sm font-semibold text-content">Sample Track</p>
              <p className="text-xs text-content-muted">
                A short original song, made in your browser — see a real analysis without a file.
              </p>
            </div>
          </div>
          {usingSample && (
            <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-primary">
              Selected
            </span>
          )}
        </button>
        </>
        )}

        {/* Rights attestation */}
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-glass bg-white/[0.02] p-3.5 transition-colors hover:border-glass-strong">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(e) => setRightsConfirmed(e.target.checked)}
            disabled={isBusy}
            className="ns-check mt-0.5"
          />
          <span className="text-xs leading-relaxed text-content-muted">
            I confirm I own this audio or have the right to analyze it for personal practice. Attestations are logged with timestamps — no raw audio is retained beyond analysis.
          </span>
        </label>

        {errorMessage && (
          <div
            id="upload-error-message"
            role="alert"
            className="alert alert-error mt-4 flex flex-col gap-2 rounded-xl border border-pink/30 bg-pink/10 p-3 text-xs text-pink"
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-px flex-shrink-0 text-pink" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 7.5v5.5M12 16.5v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>{errorMessage}</span>
            </div>
            {(source === "social" || source === "link") && (
              <div>
                <button
                  type="button"
                  onClick={switchToFileUpload}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ns-border bg-ns-raised px-3 py-1.5 text-xs font-semibold text-content hover:border-ns-border-strong"
                >
                  Upload audio file directly
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          className="btn-primary mt-6 w-full py-3.5 text-sm sm:text-base font-bold shadow-[0_4px_24px_rgba(108,77,255,0.4)]"
        >
          Analyze Song
        </button>

      </div>
    </div>
  );
}
