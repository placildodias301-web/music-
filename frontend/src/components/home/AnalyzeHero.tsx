import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AnalysisResult } from "../../lib/api";
import { ICON, Icon } from "./icons";
import { stripExtension, topChords, waveHeights } from "./homeUtils";

const FORMATS = ["MP3", "WAV", "M4A", "FLAC", "MP4", "MOV", "WEBM"];
const WAVE_BARS = 56;

interface AnalyzeHeroProps {
  /** Opens the existing file picker (owned by the Home page). */
  onPickFile: () => void;
  /** Hands a dropped file to the existing upload flow. */
  onDropFile: (file: File) => void;
  /** Starts the existing sample-track flow. */
  onTrySample: () => void;
  /** The song currently loaded in the app, if any — real analysis data. */
  analysis: AnalysisResult | null;
  fileName: string | null;
}

function Readout({ label, value, icon, pending }: { label: string; value: ReactNode; icon: ReactNode; pending: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-ns-border bg-ns-bg-2 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-ns-blue">
        <Icon size={13}>{icon}</Icon>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ns-muted">{label}</span>
      </div>
      <p
        className={`mt-1 truncate font-heading text-[15px] font-bold ${pending ? "text-ns-muted/60" : "text-ns-text"}`}
      >
        {value}
      </p>
    </div>
  );
}

/** Right-hand "track panel": real values when a song is loaded, neutral placeholders otherwise. */
function TrackPanel({ analysis, fileName }: { analysis: AnalysisResult | null; fileName: string | null }) {
  const title = analysis ? stripExtension(fileName ?? analysis.fileName) : null;
  const bars = waveHeights(title ?? "wilsify", WAVE_BARS);
  const chords = analysis ? topChords(analysis, 3) : [];
  const timeline = analysis?.chordTimeline ?? [];
  const total = analysis?.durationSeconds || timeline.at(-1)?.end || 0;

  return (
    <div className="rounded-2xl border border-ns-border bg-ns-bg/60 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ns-eyebrow">{analysis ? "Current track" : "Track preview"}</p>
          <p className="mt-1 truncate text-sm font-bold text-ns-text" title={title ?? undefined}>
            {title ?? "No song loaded yet"}
          </p>
        </div>
        {analysis ? (
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-ns-mint/30 bg-ns-mint/10 px-2 py-0.5 text-[11px] font-bold text-ns-mint">
            <Icon size={11}>{ICON.check}</Icon>
            Analysed
          </span>
        ) : (
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-ns-border bg-ns-bg-2 px-2 py-0.5 text-[11px] font-semibold text-ns-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-ns-muted/60" aria-hidden="true" />
            Waiting for audio
          </span>
        )}
      </div>

      {/* Decorative waveform motif — not measured audio. */}
      <div className="mt-4 flex h-16 items-center gap-[3px]" aria-hidden="true">
        {bars.map((h, i) => (
          <span
            key={i}
            className="ns-wave-bar"
            style={{ height: `${h}%`, opacity: analysis ? (i < WAVE_BARS * 0.38 ? 1 : 0.4) : 0.28 }}
          />
        ))}
      </div>

      {/* Chord timeline — real segments from the analysis when available. */}
      {analysis && timeline.length > 0 && total > 0 ? (
        <div className="mt-3 flex h-6 gap-[2px] overflow-hidden rounded-md" aria-label="Chord timeline" role="img">
          {timeline.slice(0, 24).map((seg, i) => (
            <span
              key={`${seg.chord}-${i}`}
              className="flex min-w-0 items-center justify-center bg-ns-blue/[0.14] font-mono text-[10px] font-medium text-ns-text/85 first:rounded-l-md last:rounded-r-md"
              style={{ flexGrow: Math.max(seg.end - seg.start, 0.1), flexBasis: 0 }}
              title={seg.chord}
            >
              <span className="truncate px-1">{seg.chord}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex h-6 items-center justify-center rounded-md border border-dashed border-ns-border text-[11px] text-ns-muted/80">
          Chord timeline appears after analysis
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Readout label="Key" icon={ICON.key} pending={!analysis} value={analysis ? analysis.key : "—"} />
        <Readout label="BPM" icon={ICON.metronome} pending={!analysis} value={analysis ? analysis.bpm : "—"} />
        <Readout label="Scale" icon={ICON.scale} pending={!analysis} value={analysis ? analysis.scale : "—"} />
        <Readout
          label="Chords"
          icon={ICON.chords}
          pending={!analysis}
          value={analysis && chords.length > 0 ? chords.join(" · ") : "—"}
        />
      </div>

      {analysis && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to="/analysis" className="ns-btn-secondary min-h-[40px] px-3 text-[13px]">
            View analysis
          </Link>
          <Link to="/practice" className="ns-btn-secondary min-h-[40px] px-3 text-[13px]">
            Practice
          </Link>
        </div>
      )}
    </div>
  );
}

export function AnalyzeHero({ onPickFile, onDropFile, onTrySample, analysis, fileName }: AnalyzeHeroProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <section
      aria-labelledby="analyze-hero-title"
      className="ns-card relative overflow-hidden p-5 sm:p-7"
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
      {/* One faint studio light behind the track panel — kept deliberately subtle. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_90%_10%,rgba(77,163,255,0.08),transparent_70%)]"
      />

      <div className="relative grid items-center gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] xl:gap-8">
        <div className="min-w-0">
          <p className="ns-eyebrow flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-ns-blue" aria-hidden="true" />
            Song analysis
          </p>
          <h2
            id="analyze-hero-title"
            className="mt-3 font-heading text-[30px] font-bold leading-[1.1] tracking-tight text-ns-text sm:text-[40px]"
          >
            Analyze your <span className="text-ns-coral">next song</span>
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ns-muted">
            Upload audio or video and instantly discover its key, BPM, scale and chords.
          </p>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={onPickFile} className="ns-btn-primary px-6">
              <Icon size={17}>{ICON.upload}</Icon>
              Upload Song
            </button>
            <button type="button" onClick={onTrySample} className="ns-btn-secondary px-5">
              <Icon size={15} className="text-ns-blue">
                {ICON.play}
              </Icon>
              Try Sample Track
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-1.5 text-xs text-ns-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-ns-muted/80">Supported formats:</span>
              <span className="font-mono tracking-wide text-ns-muted/90">{FORMATS.join(" · ")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-ns-muted/80">Maximum:</span>
              <span className="font-semibold text-ns-text/90">100 MB</span>
            </div>
          </div>
          <p className="mt-2 hidden text-xs text-ns-muted/70 sm:block">Or drag and drop a file onto this card.</p>
        </div>

        <TrackPanel analysis={analysis} fileName={fileName} />
      </div>

      {dragging && (
        <div
          className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-[14px] border-2 border-dashed border-ns-coral/70 bg-ns-bg/85"
          role="status"
        >
          <p className="flex items-center gap-2 font-heading text-lg font-bold text-ns-text">
            <Icon size={20} className="text-ns-coral">
              {ICON.upload}
            </Icon>
            Release to analyse
          </p>
        </div>
      )}
    </section>
  );
}
