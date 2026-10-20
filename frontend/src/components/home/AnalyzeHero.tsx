import { useState } from "react";
import { ICON, Icon } from "./icons";
import { AudioReactiveWaveform } from "./AudioReactiveWaveform";

const FORMATS = ["MP3", "WAV", "M4A", "FLAC", "MP4", "MOV", "WEBM"];
const WAVE_BARS = 26;

interface AnalyzeHeroProps {
  onPickFile: () => void;
  onDropFile: (file: File) => void;
  onTrySample: () => void;
}

/** Faded electric-guitar neck + body drawn behind the top-right of the hero card. */
function GuitarBackdrop() {
  const frets = Array.from({ length: 12 }, (_, i) => 70 + i * 34 - i * i * 0.6);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 640 360"
      preserveAspectRatio="xMaxYMin slice"
      className="hero-art pointer-events-none absolute right-0 top-0 h-full w-[68%] opacity-70"
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

/** What an analysis gives you — labels only, staggered beside the waveform. */
const FEATURES: { label: string; icon: keyof typeof ICON; offset: string }[] = [
  { label: "Key", icon: "key", offset: "ml-7" },
  { label: "BPM", icon: "metronome", offset: "ml-0" },
  { label: "Chords", icon: "chords", offset: "ml-1" },
  { label: "Scale", icon: "scale", offset: "ml-8" },
];

export function AnalyzeHero({ onPickFile, onDropFile, onTrySample }: AnalyzeHeroProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <section
      aria-labelledby="analyze-hero-title"
      className="@container relative overflow-hidden rounded-2xl border border-[var(--color-ns-border)] bg-gradient-to-br from-[var(--color-ns-card)] via-[var(--color-ns-bg-2)] to-[var(--color-ns-bg-2)] p-6 shadow-2xl sm:p-8"
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
      {/* Background guitar art and ambient glow */}
      <GuitarBackdrop />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 rounded-full bg-[var(--color-ns-purple)]/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-1/4 -bottom-16 h-64 w-64 rounded-full bg-[var(--color-ns-cyan)]/10 blur-3xl"
      />

      <div className="relative z-10 grid items-center gap-8 @min-[600px]:grid-cols-[minmax(0,1fr)_auto] @min-[900px]:gap-12">
        {/* Heading and CTAs */}
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ns-purple)]/35 bg-[var(--color-ns-purple)]/12 px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-violet-soft)]">
            <span className="text-[0.75rem]">✦</span>
            <span>AI Powered</span>
          </div>

          <h2
            id="analyze-hero-title"
            className="mt-4 font-heading text-3xl font-extrabold leading-[1.1] tracking-tight text-[var(--color-ns-text)] sm:text-4xl @min-[900px]:text-[2.625rem]"
          >
            Analyze{" "}
            <span className="bg-gradient-to-r from-[var(--color-ns-purple)] via-[var(--color-ns-purple-light)] to-[var(--color-violet-soft)] bg-clip-text text-transparent">
              your next song
            </span>
          </h2>

          <p className="mt-3.5 max-w-md text-[0.9375rem] leading-relaxed text-[var(--color-ns-muted)]">
            Upload audio or video and instantly discover its key, BPM, chords and more.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onPickFile}
              className="ns-btn-primary flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-[0_6px_24px_rgba(108,77,255,0.5)] transition-transform hover:scale-[1.03] active:scale-95"
            >
              <Icon size={17}>{ICON.upload}</Icon>
              <span>Upload Song</span>
            </button>

            <button
              type="button"
              onClick={onTrySample}
              className="ns-btn-secondary flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors hover:bg-[var(--color-ns-hover)]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-ns-text)]/10">
                <Icon size={12} className="text-[var(--color-ns-text)]">
                  {ICON.play}
                </Icon>
              </span>
              <span>Try Sample Track</span>
            </button>
          </div>

          <p className="mt-5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.7188rem] font-medium text-[var(--color-ns-muted)]">
            {FORMATS.map((f) => (
              <span key={f}>{f}</span>
            ))}
            <span className="text-[var(--color-ns-dim)]">(Max 100 MB)</span>
          </p>
        </div>

        {/* Feature labels beside the waveform */}
        <div className="flex items-center justify-center @min-[600px]:justify-end" aria-label="Detects key, BPM, chords and scale">
          <ul className="relative z-10 -mr-5 flex shrink-0 flex-col gap-2.5">
            {FEATURES.map((f) => (
              <li
                key={f.label}
                className={`${f.offset} flex w-fit items-center gap-2 rounded-lg border border-[var(--color-ns-cyan)]/20 bg-[var(--color-ns-card)]/85 px-2.5 py-1.5 text-[0.75rem] font-semibold text-[var(--color-ns-text)] shadow-[0_4px_14px_rgba(0,0,0,0.35)] backdrop-blur-md`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-ns-cyan)]/12 text-[var(--color-ns-cyan)]">
                  <Icon size={12}>{ICON[f.icon]}</Icon>
                </span>
                {f.label}
              </li>
            ))}
          </ul>
          <div className="w-[190px] shrink-0 @min-[900px]:w-[220px]">
            <AudioReactiveWaveform barCount={WAVE_BARS} seed="wilsify-hero" height={180} />
          </div>
        </div>
      </div>

      {dragging && (
        <div
          className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-ns-purple-light)] bg-[var(--color-ns-bg)]/90 backdrop-blur-sm"
          role="status"
        >
          <p className="flex items-center gap-2 font-heading text-lg font-bold text-[var(--color-ns-text)]">
            <Icon size={22} className="text-[var(--color-ns-purple-light)]">
              {ICON.upload}
            </Icon>
            Drop song to start analysis
          </p>
        </div>
      )}
    </section>
  );
}
