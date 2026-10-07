import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import { analyzeFile, fetchMediaFromLink, logRightsAttestation } from "../lib/api";
import { generateSampleTrack } from "../lib/generateSampleTrack";
import { MicRecorder } from "../components/upload/MicRecorder";
import { YouTubeBrowser } from "../components/upload/YouTubeBrowser";
import type { YouTubeVideo } from "../lib/api";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type Stage = "idle" | "downloading" | "uploading" | "preparing" | "analyzing" | "complete" | "error";

type Source = "mic" | "link" | "files" | "social";

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
    label: "Link URL",
    hint: "Direct link to an audio or video file",
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
    label: "YouTube & Social",
    hint: "YouTube, Shorts, Reels, TikTok & more",
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
  { name: "YouTube", pattern: /(youtube\.com|youtu\.be|youtube-nocookie\.com)/i },
  { name: "Instagram", pattern: /instagram\.com/i },
  { name: "TikTok", pattern: /tiktok\.com/i },
  { name: "Facebook", pattern: /(facebook\.com|fb\.watch)/i },
  { name: "X / Twitter", pattern: /(\/\/|\.|^)(x|twitter)\.com/i },
  { name: "SoundCloud", pattern: /soundcloud\.com/i },
  { name: "Vimeo", pattern: /vimeo\.com/i },
  { name: "Reddit", pattern: /(reddit\.com|redd\.it)/i },
  { name: "Dailymotion", pattern: /(dailymotion\.com|dai\.ly)/i },
  { name: "Twitch", pattern: /twitch\.tv/i },
  { name: "Bandcamp", pattern: /bandcamp\.com/i },
  { name: "Mixcloud", pattern: /mixcloud\.com/i },
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
  const location = useLocation();
  const handoff = (location.state ?? {}) as UploadLocationState;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<Source>("files");
  const [selectedFile, setSelectedFile] = useState<File | null>(handoff.file instanceof File ? handoff.file : null);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [ytVideo, setYtVideo] = useState<YouTubeVideo | null>(null);
  const [usingSample, setUsingSample] = useState(Boolean(handoff.sample) && !(handoff.file instanceof File));
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUsingSample(false);
    setErrorMessage(null);
    e.target.value = "";
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

      let file: File | null = null;
      if (source === "files") file = selectedFile;
      else if (source === "mic") file = recordedFile;
      else if (linkUrl.trim()) {
        setStage("downloading");
        file = await fetchMediaFromLink(linkUrl.trim());
      }
      if (!file) return;

      setStage("uploading");
      const audioUrl = URL.createObjectURL(file);
      setSong({
        fileName: file.name,
        fileSizeBytes: file.size,
        audioUrl,
        isSampleAudio: false,
      });

      void logRightsAttestation(file.name);

      const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
      setStage("preparing");
      if (isVideo) {
        await new Promise((r) => setTimeout(r, 600));
      } else {
        await new Promise((r) => setTimeout(r, 300));
      }

      setStage("analyzing");
      const analysis = await analyzeFile(file);
      setAnalysis(analysis);
      setStage("complete");
      await new Promise((r) => setTimeout(r, 350));
      navigate("/analysis");
    } catch (err) {
      setStage("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const hasInput =
    source === "files"
      ? selectedFile !== null || usingSample
      : source === "mic"
        ? recordedFile !== null
        : linkUrl.trim().length > 0;
  const canAnalyze = hasInput && rightsConfirmed && (stage === "idle" || stage === "error");
  const platform = source === "social" || source === "link" ? detectPlatform(linkUrl) : null;
  const isBusy = stage !== "idle" && stage !== "error";

  const stageProgress = {
    idle: 0,
    downloading: 15,
    uploading: 35,
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
          Select media
        </h1>
        <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-content-muted">
          Record yourself live, paste a link, pick a file, or grab a YouTube video, Short or Instagram Reel. Wilsify AI extracts the audio and detects chords, key, and tempo.
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

        {/* Source picker */}
        <div role="tablist" aria-label="Media source" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
          {SOURCES.map((s) => {
            const active = source === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={isBusy}
                onClick={() => {
                  setSource(s.id);
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
                          setErrorMessage(null);
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
                <span className="hidden text-[11px] leading-snug text-content-dim sm:block">{s.hint}</span>
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
              {source === "social" ? "Or paste a video / post link" : "Audio / video file link"}
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
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  setYtVideo(null);
                  setErrorMessage(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canAnalyze) void handleAnalyze();
                }}
                placeholder={
                  source === "social"
                    ? "https://youtube.com/shorts/…  or  instagram.com/reel/…"
                    : "https://example.com/song.mp3"
                }
                className="min-w-0 flex-1 bg-transparent py-3 text-sm text-content placeholder:text-content-dim focus:outline-none"
              />
              {platform && (
                <span className="flex-shrink-0 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  {platform}
                </span>
              )}
            </div>
            {source === "social" ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["YouTube", "Shorts", "Instagram Reels", "TikTok", "Facebook", "X", "SoundCloud", "Vimeo", "Reddit"].map((p) => (
                  <span key={p} className="rounded-md border border-ns-border bg-ns-raised px-2 py-0.5 text-[10px] font-medium text-content-muted">
                    {p}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2.5 text-[11px] text-content-dim">
                Paste a link that ends in a media file (.mp3, .wav, .m4a, .mp4…). Social links work here too.
              </p>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-content-dim">
              Public posts only · up to 20 minutes · audio is downloaded just for analysis and then deleted.
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
        </>
        )}

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
          {stage === "downloading" && (
            <>
              <span className="spinner" /> Getting audio from link…
            </>
          )}
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
                {stage === "downloading" && "Getting audio from link..."}
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
