import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AnalysisResult } from "../../lib/api";
import { ICON, Icon } from "./icons";
import { stripExtension, topChords } from "./homeUtils";
import { AudioReactiveWaveform } from "./AudioReactiveWaveform";

const FORMATS = ["MP3", "WAV", "M4A", "FLAC", "MP4", "MOV", "WEBM"];
const WAVE_BARS = 30;

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface AnalyzeHeroProps {
  onPickFile: () => void;
  onDropFile: (file: File) => void;
  onTrySample: () => void;
  analysis: AnalysisResult | null;
  fileName: string | null;
  audioUrl?: string | null;
}

/** Faded electric-guitar neck + body drawn behind the top-right of the hero card. */
function GuitarBackdrop() {
  const frets = Array.from({ length: 12 }, (_, i) => 70 + i * 34 - i * i * 0.6);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 640 360"
      preserveAspectRatio="xMaxYMin slice"
      className="pointer-events-none absolute right-0 top-0 h-full w-[68%] opacity-70"
    >
      <defs>
        <linearGradient id="heroNeck" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1A1033" />
          <stop offset="100%" stopColor="#2A1748" />
        </linearGradient>
        <radialGradient id="heroBody" cx="0.35" cy="0.45" r="0.7">
          <stop offset="0%" stopColor="#2B1A4F" />
          <stop offset="70%" stopColor="#140C2A" />
          <stop offset="100%" stopColor="#0A0718" />
        </radialGradient>
        <linearGradient id="heroFadeGrad" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="55%" stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="heroFade">
          <rect width="640" height="360" fill="url(#heroFadeGrad)" />
        </mask>
      </defs>

      <g mask="url(#heroFade)">
        {/* Body */}
        <path
          d="M560,-40 C640,-30 700,40 680,120 C665,180 610,200 560,190 C520,182 500,150 470,140 C440,130 430,90 460,60 C490,30 500,-45 560,-40 Z"
          fill="url(#heroBody)"
          stroke="#C04CFF"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
        {/* Neck */}
        <g transform="rotate(-14 300 60)">
          <rect x="20" y="30" width="470" height="52" rx="4" fill="url(#heroNeck)" />
          {frets.map((x, i) => (
            <line
              key={i}
              x1={x}
              y1="30"
              x2={x}
              y2="82"
              stroke="#E879F9"
              strokeOpacity="0.45"
              strokeWidth="1.6"
            />
          ))}
          {[0, 1, 2, 3, 4, 5].map((s) => (
            <line
              key={s}
              x1="0"
              y1={36 + s * 8}
              x2="560"
              y2={36 + s * 8}
              stroke="#F0E6FF"
              strokeOpacity={0.28 + s * 0.04}
              strokeWidth={0.6 + s * 0.2}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

const BADGE_BASE =
  "flex w-fit items-center gap-2 rounded-xl border border-white/[0.06] bg-[#111A33]/80 px-3.5 py-2 text-[13px] font-semibold shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-md transition-transform hover:scale-105";

export function AnalyzeHero({
  onPickFile,
  onDropFile,
  onTrySample,
  analysis,
  fileName,
  audioUrl = null,
}: AnalyzeHeroProps) {
  const [dragging, setDragging] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const title = analysis ? stripExtension(fileName ?? analysis.fileName) : null;
  const chords = analysis ? topChords(analysis, 3) : [];

  // Manage HTMLAudioElement event listeners when audio element or URL changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err: unknown) => {
        console.warn("Audio playback failed:", err);
      });
    }
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  return (
    <section
      aria-labelledby="analyze-hero-title"
      className="relative overflow-hidden rounded-2xl border border-[#202E50] bg-gradient-to-br from-[#0D1630] via-[#0A1022] to-[#070D1C] p-6 shadow-2xl transition-all sm:p-8"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onDropFile(file);
      }}
    >
      {/* Hidden audio element bound to active audioUrl */}
      <audio ref={audioRef} src={audioUrl ?? undefined} preload="metadata" className="hidden" />

      {/* Background guitar art and ambient glow */}
      <GuitarBackdrop />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 rounded-full bg-[#6C4DFF]/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-1/4 -bottom-16 h-64 w-64 rounded-full bg-[#22C7D9]/10 blur-3xl"
      />

      <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] xl:gap-10">
        {/* Left Column: Heading and CTAs */}
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#22C7D9]/35 bg-[#22C7D9]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#22C7D9] shadow-sm">
            <span className="text-[12px]">✦</span>
            <span>AI POWERED</span>
          </div>

          <h2
            id="analyze-hero-title"
            className="mt-4 font-heading text-3xl font-extrabold leading-[1.1] tracking-tight text-[#F4F6FF] sm:text-4xl lg:text-[44px]"
          >
            Analyze{" "}
            <span className="bg-gradient-to-r from-[#6C4DFF] via-[#8B5CF6] to-[#A78BFA] bg-clip-text text-transparent drop-shadow-[0_2px_16px_rgba(108,77,255,0.4)]">
              your next song
            </span>
          </h2>

          <p className="mt-3.5 max-w-lg text-[15px] leading-relaxed text-[#A5B1CC]">
            Upload audio or video and instantly discover its key, BPM, chords and more.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onPickFile}
              className="ns-btn-primary flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-[0_6px_24px_rgba(108,77,255,0.5)] transition-all hover:scale-105 active:scale-95"
            >
              <Icon size={17}>{ICON.upload}</Icon>
              <span>Upload Song</span>
            </button>

            <button
              type="button"
              onClick={onTrySample}
              className="ns-btn-secondary flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all hover:bg-[#14203D]"
            >
              <Icon size={15} className="text-[#4DA3FF]">
                {ICON.play}
              </Icon>
              <span>Try Sample Track</span>
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-[#687797]">
            <span className="font-mono tracking-wide text-[#A5B1CC]">{FORMATS.join("  ")}</span>
            <span className="text-[#687797]">·</span>
            <span className="text-[#A5B1CC]">(Max 100 MB)</span>
          </div>
          <p className="mt-2 text-xs text-[#687797]">Or drag and drop a file onto this card.</p>
        </div>

        {/* Right Column: staggered badges beside the reactive waveform (no inner box) */}
        <div className="relative flex min-h-[220px] w-full items-center justify-center gap-2 lg:justify-end lg:pr-4">
          <div className="relative z-20 flex shrink-0 flex-col gap-3">
            <div className={`${BADGE_BASE} ml-7 text-[#E6ECFF]`}>
              <Icon size={14} className="text-[#7DD3FC]">
                {ICON.key}
              </Icon>
              <span>{analysis ? analysis.key : "Key"}</span>
            </div>
            <div className={`${BADGE_BASE} text-[#4DA3FF]`}>
              <Icon size={14}>{ICON.metronome}</Icon>
              <span>{analysis ? `${analysis.bpm} BPM` : "BPM"}</span>
            </div>
            <div className={`${BADGE_BASE} ml-0.5 text-[#E6ECFF]`}>
              <Icon size={14} className="text-[#A5B1CC]">
                {ICON.chords}
              </Icon>
              <span>{analysis && chords.length > 0 ? chords.join(" · ") : "Chords"}</span>
            </div>
            <div className={`${BADGE_BASE} ml-9 text-[#5EEAD4]`}>
              <Icon size={14}>{ICON.scale}</Icon>
              <span>{analysis ? analysis.scale : "Scale"}</span>
            </div>
          </div>

          <div className="relative z-10 flex w-[190px] shrink-0 flex-col items-center gap-3 sm:w-[220px]">
            <AudioReactiveWaveform
              audioRef={audioRef}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              onSeek={audioUrl ? handleSeek : undefined}
              barCount={WAVE_BARS}
              bpm={analysis?.bpm ?? 120}
              seed={title ?? (fileName ? stripExtension(fileName) : "wilsify-hero")}
              height={140}
            />

            {/* Playback / view-analysis actions */}
            {(audioUrl || analysis) && (
              <div className="flex items-center gap-2">
                {audioUrl && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full bg-gradient-to-r from-[#22C7D9] via-[#4DA3FF] to-[#6C4DFF] px-3.5 py-1 text-xs font-bold text-[#050A18] shadow-[0_2px_14px_rgba(34,199,217,0.4)] transition-all hover:scale-105 active:scale-95"
                    aria-label={isPlaying ? "Pause track" : "Play track"}
                  >
                    <Icon size={12}>{isPlaying ? ICON.pause : ICON.play}</Icon>
                    <span>{isPlaying ? "Pause" : "Play"}</span>
                    {duration > 0 && (
                      <span className="ml-0.5 font-mono text-[10px] text-[#050A18]/80">
                        {formatSeconds(currentTime)} / {formatSeconds(duration)}
                      </span>
                    )}
                  </button>
                )}

                {analysis && (
                  <Link
                    to="/analysis"
                    className={`flex items-center gap-1.5 rounded-full ${
                      audioUrl
                        ? "border border-[#6C4DFF]/40 bg-[#070D1C]/90 px-3 py-1 text-xs font-semibold text-[#A78BFA] shadow-md backdrop-blur-md hover:bg-[#6C4DFF]/20 hover:text-white"
                        : "bg-gradient-to-r from-[#6C4DFF] to-[#8B5CF6] px-4 py-1 text-xs font-bold text-white shadow-md hover:scale-105"
                    } transition-all`}
                  >
                    <span>View {audioUrl ? "Analysis" : title}</span>
                    <Icon size={12}>{ICON.arrowRight}</Icon>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {dragging && (
        <div
          className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-[#8B5CF6] bg-[#050A18]/90 backdrop-blur-sm"
          role="status"
        >
          <p className="flex items-center gap-2 font-heading text-lg font-bold text-white">
            <Icon size={22} className="text-[#8B5CF6]">
              {ICON.upload}
            </Icon>
            Drop song to start analysis
          </p>
        </div>
      )}
    </section>
  );
}
