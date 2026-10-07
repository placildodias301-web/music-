import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AnalysisResult } from "../../lib/api";
import { ICON, Icon } from "./icons";
import { stripExtension, topChords } from "./homeUtils";
import { AudioReactiveWaveform } from "./AudioReactiveWaveform";

const FORMATS = ["MP3", "WAV", "M4A", "FLAC", "MP4", "MOV", "WEBM"];
const WAVE_BARS = 36;

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
      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        preload="metadata"
        className="hidden"
      />

      {/* Background ambient glow highlights */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 rounded-full bg-[#6C4DFF]/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-1/4 -bottom-16 h-64 w-64 rounded-full bg-[#22C7D9]/10 blur-3xl"
      />

      <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] xl:gap-12">
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

        {/* Right Column: Visual Stage with Guitar motif, Reactive Waveform & Floating Badges */}
        <div className="relative flex h-[260px] w-full items-center justify-center overflow-hidden rounded-2xl border border-[#202E50] bg-gradient-to-br from-[#0B132B]/80 via-[#070D1C]/90 to-[#050A18] p-5 shadow-inner sm:h-[280px]">
          {/* Subtle electric guitar fretboard / neck silhouette illustration in background */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-25">
            <svg viewBox="0 0 400 280" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
              <defs>
                <linearGradient id="guitarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6C4DFF" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="#22C7D9" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#050A18" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M-50,220 C50,150 180,90 380,20 L400,60 C220,120 100,180 -30,260 Z" fill="url(#guitarGrad)" />
              {/* Strings */}
              <line x1="-30" y1="230" x2="380" y2="35" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
              <line x1="-30" y1="235" x2="380" y2="40" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
              <line x1="-30" y1="240" x2="380" y2="45" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" />
              <line x1="-30" y1="245" x2="380" y2="50" stroke="rgba(255,255,255,0.18)" strokeWidth="1.4" />
              <line x1="-30" y1="250" x2="380" y2="55" stroke="rgba(255,255,255,0.18)" strokeWidth="1.6" />
            </svg>
          </div>

          {/* Central Real Audio-Reactive Waveform */}
          <div className="relative z-10 w-full max-w-[360px] px-2 sm:px-4 flex items-center justify-center">
            <AudioReactiveWaveform
              audioRef={audioRef}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              onSeek={audioUrl ? handleSeek : undefined}
              barCount={WAVE_BARS}
              bpm={analysis?.bpm ?? 120}
              seed={title ?? (fileName ? stripExtension(fileName) : "wilsify-hero")}
              height={116}
            />
          </div>

    {/* Floating Badges: Key, BPM, Chords, Scale */}
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-5">
      <div className="flex justify-between items-start">
        {/* Key Badge */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-[#22C7D9]/40 bg-[#070D1C]/90 px-3 py-1.5 text-xs font-bold text-[#22C7D9] shadow-lg backdrop-blur-md transition-transform hover:scale-105">
          <Icon size={13}>{ICON.key}</Icon>
          <span>{analysis ? analysis.key : "Key"}</span>
        </div>

        {/* BPM Badge */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-[#4DA3FF]/40 bg-[#070D1C]/90 px-3 py-1.5 text-xs font-bold text-[#4DA3FF] shadow-lg backdrop-blur-md transition-transform hover:scale-105">
          <Icon size={13}>{ICON.metronome}</Icon>
          <span>{analysis ? `${analysis.bpm} BPM` : "BPM"}</span>
        </div>
      </div>

      <div className="flex justify-between items-end">
        {/* Chords Badge */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-[#8B5CF6]/40 bg-[#070D1C]/90 px-3 py-1.5 text-xs font-bold text-[#8B5CF6] shadow-lg backdrop-blur-md transition-transform hover:scale-105">
          <Icon size={13}>{ICON.chords}</Icon>
          <span>{analysis && chords.length > 0 ? chords.join(" · ") : "Chords"}</span>
        </div>

        {/* Scale Badge */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-[#55D69A]/40 bg-[#070D1C]/90 px-3 py-1.5 text-xs font-bold text-[#55D69A] shadow-lg backdrop-blur-md transition-transform hover:scale-105">
          <Icon size={13}>{ICON.scale}</Icon>
          <span>{analysis ? analysis.scale : "Scale"}</span>
        </div>
      </div>
    </div>

    {/* Bottom control strip / playback action */}
    {(audioUrl || analysis) && (
      <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        {audioUrl && (
          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#22C7D9] via-[#4DA3FF] to-[#6C4DFF] px-3.5 py-1 text-xs font-bold text-[#050A18] shadow-[0_2px_14px_rgba(34,199,217,0.4)] transition-all hover:scale-105 active:scale-95 cursor-pointer"
            aria-label={isPlaying ? "Pause track" : "Play track"}
          >
            <Icon size={12}>{isPlaying ? ICON.pause : ICON.play}</Icon>
            <span>{isPlaying ? "Pause" : "Play"}</span>
            {duration > 0 && (
              <span className="font-mono text-[10px] text-[#050A18]/80 ml-0.5">
                {formatSeconds(currentTime)} / {formatSeconds(duration)}
              </span>
            )}
          </button>
        )}

        {analysis && (
          <Link
            to="/analysis"
            className={`flex items-center gap-1.5 rounded-full ${audioUrl
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
      </div >

    { dragging && (
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
    )
}
    </section >
  );
}
