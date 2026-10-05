import { useState } from "react";
import { Link } from "react-router-dom";
import type { AnalysisResult } from "../../lib/api";
import { ICON, Icon } from "./icons";
import { stripExtension, topChords, waveHeights } from "./homeUtils";

const FORMATS = ["MP3", "WAV", "M4A", "FLAC", "MP4", "MOV", "WEBM"];
const WAVE_BARS = 36;

interface AnalyzeHeroProps {
  onPickFile: () => void;
  onDropFile: (file: File) => void;
  onTrySample: () => void;
  analysis: AnalysisResult | null;
  fileName: string | null;
}

export function AnalyzeHero({ onPickFile, onDropFile, onTrySample, analysis, fileName }: AnalyzeHeroProps) {
  const [dragging, setDragging] = useState(false);
  const title = analysis ? stripExtension(fileName ?? analysis.fileName) : null;
  const bars = waveHeights(title ?? "wilsify-hero", WAVE_BARS);
  const chords = analysis ? topChords(analysis, 3) : [];

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
            Analyze <span className="bg-gradient-to-r from-[#6C4DFF] via-[#8B5CF6] to-[#A78BFA] bg-clip-text text-transparent drop-shadow-[0_2px_16px_rgba(108,77,255,0.4)]">your next song</span>
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

        {/* Right Column: Visual Stage with Guitar motif & Floating Badges */}
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

          {/* Central Animated Audio Waveform */}
          <div className="relative z-10 flex h-28 items-center justify-center gap-1.5 px-4" aria-hidden="true">
            {bars.map((h, i) => {
              const isCenter = Math.abs(i - WAVE_BARS / 2) < 8;
              return (
                <div
                  key={i}
                  className="w-1.5 rounded-full transition-all duration-300"
                  style={{
                    height: `${Math.max(16, h)}%`,
                    background: isCenter
                      ? "linear-gradient(to top, #6C4DFF, #22C7D9)"
                      : "linear-gradient(to top, rgba(108,77,255,0.4), rgba(77,163,255,0.7))",
                    boxShadow: isCenter ? "0 0 12px rgba(34,199,217,0.4)" : "none",
                  }}
                />
              );
            })}
          </div>

          {/* Floating Badges exactly like reference screenshot: Key, BPM, Chords, Scale */}
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

          {/* Quick link to view analysis if a track is active */}
          {analysis && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30">
              <Link
                to="/analysis"
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#6C4DFF] to-[#8B5CF6] px-4 py-1 text-xs font-bold text-white shadow-md transition-transform hover:scale-105"
              >
                <span>View {title}</span>
                <Icon size={12}>{ICON.arrowRight}</Icon>
              </Link>
            </div>
          )}
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
