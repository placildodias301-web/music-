import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import { exportMidi, exportPdf } from "../lib/api";
import { parseChordSymbol, getGuitarVoicings, getUkuleleShape, chordMidiNotes } from "../lib/chordTheory";
import { GuitarChordDiagram } from "../components/GuitarChordDiagram";
import { UkuleleChordDiagram } from "../components/UkuleleChordDiagram";
import { PianoRoll } from "../components/PianoRoll";
import { separateStems, type StemResult } from "../lib/stemSeparation";
import { saveToLibrary, isSaved } from "../lib/library";

type View = "guitar" | "ukulele" | "piano";

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const DIFFICULTY_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  Beginner: { bg: "rgba(98, 214, 167, 0.12)", text: "#62D6A7", border: "rgba(98, 214, 167, 0.3)" },
  Intermediate: { bg: "rgba(244, 184, 74, 0.12)", text: "#F4B84A", border: "rgba(244, 184, 74, 0.3)" },
  Advanced: { bg: "rgba(255, 107, 87, 0.12)", text: "#FF6B57", border: "rgba(255, 107, 87, 0.3)" },
};

export function Analysis() {
  const { analysis, fileName, audioUrl, isSampleAudio } = useMvp();
  const [view, setView] = useState<View>("guitar");
  const [voicingIndex, setVoicingIndex] = useState(0);
  const [exporting, setExporting] = useState<"midi" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [stems, setStems] = useState<StemResult | null>(null);
  const [separatingStems, setSeparatingStems] = useState(false);
  const [stemsError, setStemsError] = useState<string | null>(null);
  const [savedToLibrary, setSavedToLibrary] = useState(false);

  // Embedded audio player state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const displayName = fileName ?? analysis?.fileName ?? "Analyzed Track";

  useEffect(() => {
    if (displayName) setSavedToLibrary(isSaved(displayName));
  }, [displayName]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }

  if (!analysis) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-[var(--color-ns-blue)] shadow-xl">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <h1 className="mt-6 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-3xl">
          No Song Analyzed Yet
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ns-muted)]">
          Upload an audio or video file, or try our built-in sample track in Studio to see key, BPM, harmonic progression, and instrument chord charts.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/upload" className="btn-primary">
            Upload Audio File
          </Link>
          <Link to="/studio" className="btn-secondary">
            Return to Studio
          </Link>
        </div>
      </div>
    );
  }

  const uniqueChords = Array.from(new Set(analysis.chordProgression));
  const diffInfo = analysis.difficulty
    ? DIFFICULTY_BADGES[analysis.difficulty.difficultyLabel] ?? {
        bg: "rgba(77, 163, 255, 0.12)",
        text: "var(--color-ns-blue)",
        border: "rgba(77, 163, 255, 0.3)",
      }
    : null;

  function handleSaveToLibrary() {
    saveToLibrary(displayName, analysis!);
    setSavedToLibrary(true);
  }

  async function handleSeparateStems() {
    if (!audioUrl) return;
    setStemsError(null);
    setSeparatingStems(true);
    try {
      const result = await separateStems(audioUrl);
      setStems(result);
    } catch {
      setStemsError("Couldn't separate stems from this audio (it may not be a stereo file).");
    } finally {
      setSeparatingStems(false);
    }
  }

  async function handleExport(kind: "midi" | "pdf") {
    setExportError(null);
    setExporting(kind);
    try {
      if (kind === "midi") {
        await exportMidi(analysis!.chordProgression, analysis!.bpm, displayName);
      } else {
        await exportPdf(analysis!, displayName);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* 1. TRACK HEADER */}
      <div className="mb-6 flex flex-col justify-between gap-5 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:flex-row sm:items-center sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-coral)] shadow-md">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-[var(--color-ns-blue)]/30 bg-[var(--color-ns-blue)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-ns-blue)]">
                Audio Analysis
              </span>
              {diffInfo && analysis.difficulty && (
                <span
                  className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: diffInfo.bg,
                    color: diffInfo.text,
                    borderColor: diffInfo.border,
                  }}
                >
                  {analysis.difficulty.difficultyLabel} · {analysis.difficulty.difficultyScore}/100
                </span>
              )}
              {isSampleAudio && (
                <span className="inline-flex items-center rounded-md border border-[var(--color-ns-border)] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-[var(--color-ns-muted)]">
                  Sample Clip
                </span>
              )}
            </div>
            <h1 className="mt-2 font-heading text-xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-2xl md:text-3xl">
              {displayName}
            </h1>
            <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
              Processed in {analysis.processingSeconds}s · Key of {analysis.key} {analysis.scale}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
          <Link to="/practice" className="btn-primary py-2 text-xs sm:text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 4 19 12 6 20 6 4" />
            </svg>
            Practice Track
          </Link>
          <button
            type="button"
            onClick={handleSaveToLibrary}
            disabled={savedToLibrary}
            className={`btn-secondary py-2 text-xs sm:text-sm ${
              savedToLibrary ? "border-[var(--color-ns-mint)]/40 bg-[var(--color-ns-mint)]/10 text-[var(--color-ns-mint)]" : ""
            }`}
          >
            {savedToLibrary ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Saved in Library
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Save to Library
              </>
            )}
          </button>
        </div>
      </div>

      {/* Real vs Demo Banner */}
      {analysis.isDemo ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/10 px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0 text-[var(--color-ns-amber)]">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-xs sm:text-sm text-[var(--color-ns-amber)]">{analysis.demoNotice}</p>
        </div>
      ) : (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--color-ns-mint)]/30 bg-[var(--color-ns-mint)]/10 px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0 text-[var(--color-ns-mint)]">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-xs sm:text-sm text-[var(--color-ns-mint)]">
            Real MIR analysis complete — key, tempo, and chord transitions detected from actual audio.
          </p>
        </div>
      )}

      {/* 2. KEY / BPM / TIME / DIFFICULTY STATS */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Detected Key</p>
          <p className="mt-2 font-heading text-2xl font-extrabold text-[var(--color-ns-coral)] sm:text-3xl">
            {analysis.key}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">{analysis.scale}</p>
        </div>

        <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Tempo</p>
          <p className="mt-2 font-heading text-2xl font-extrabold text-[var(--color-ns-blue)] sm:text-3xl">
            {analysis.bpm} <span className="text-base font-medium text-[var(--color-ns-muted)]">BPM</span>
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">Auto beat tracking</p>
        </div>

        <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Time Signature</p>
          <p className="mt-2 font-heading text-2xl font-extrabold text-[var(--color-ns-amber)] sm:text-3xl">
            {analysis.timeSignature}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">Meter</p>
        </div>

        <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Duration</p>
          <p className="mt-2 font-heading text-2xl font-extrabold text-[var(--color-ns-mint)] sm:text-3xl">
            {analysis.duration}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">{analysis.chordProgression.length} chord segments</p>
        </div>
      </div>

      {/* 3. AUDIO PLAYER (when audio is available) */}
      {audioUrl ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6">
          <audio ref={audioRef} src={audioUrl} preload="metadata" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-ns-coral)] text-[var(--color-ns-ink)] shadow-md transition-transform hover:scale-105 active:scale-95 self-center sm:self-auto"
              aria-label={isPlaying ? "Pause track" : "Play track"}
            >
              {isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                  <polygon points="7 5 19 12 7 19 7 5" />
                </svg>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs font-mono text-[var(--color-ns-muted)] mb-1.5">
                <span className="text-[var(--color-ns-text)]">{formatSeconds(currentTime)}</span>
                <span>{formatSeconds(duration)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek track position"
                className="w-full h-2 cursor-pointer rounded-lg bg-[var(--color-ns-border)] accent-[var(--color-ns-coral)]"
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-ns-blue)]/30 bg-[var(--color-ns-blue)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--color-ns-blue)]">
                <span className="h-2 w-2 rounded-full bg-[var(--color-ns-blue)] animate-pulse" />
                Live Audio
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 text-xs text-[var(--color-ns-muted)]">
          Reopened from your Library — the saved chords, key, tempo and difficulty are all real, but original audio is kept only in active sessions.
        </div>
      )}

      {/* 4. CHORD TIMELINE */}
      <div className="mt-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">Harmonic Chord Progression</h2>
            <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
              Sequential chord progression detected across the song timeline
            </p>
          </div>
          <span className="rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-ns-muted)]">
            {analysis.chordProgression.length} changes
          </span>
        </div>

        <div className="mt-5 flex overflow-x-auto pb-3 pt-1 scrollbar-thin">
          <div className="flex items-center gap-2 sm:gap-3">
            {analysis.chordProgression.map((chord, i) => (
              <div key={`${chord}-${i}`} className="flex items-center gap-2 sm:gap-3">
                <div className="flex flex-col items-center gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-3.5 py-2.5 transition-transform hover:scale-105 hover:border-[var(--color-ns-coral)]/50">
                  <span className="text-[10px] font-mono font-medium text-[var(--color-ns-muted)]">#{i + 1}</span>
                  <span className="font-heading text-lg font-bold text-[var(--color-ns-coral)] sm:text-xl">{chord}</span>
                </div>
                {i < analysis.chordProgression.length - 1 && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--color-ns-border-strong)] flex-shrink-0">
                    <path d="M5 12h14m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. INTERACTIVE INSTRUMENT VOICINGS */}
      <div className="mt-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">Interactive Instrument Voicings</h2>
            <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
              Visual chord diagrams and piano voicings for unique chords in this track
            </p>
          </div>
          <div className="flex gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1">
            {(["guitar", "ukulele", "piano"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setView(v);
                  setVoicingIndex(0);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold capitalize transition-all ${
                  view === v
                    ? "bg-[var(--color-ns-coral)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                    : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {uniqueChords.map((symbol) => {
            const chord = parseChordSymbol(symbol);
            const voicings = getGuitarVoicings(chord);
            const activeVoicing = voicings[Math.min(voicingIndex, voicings.length - 1)];

            return (
              <div
                key={symbol}
                className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-4 transition-all hover:border-[var(--color-ns-border-strong)]"
              >
                <span className="font-heading text-base font-bold text-[var(--color-ns-text)]">{symbol}</span>
                {view === "guitar" && <GuitarChordDiagram voicing={activeVoicing} />}
                {view === "ukulele" && <UkuleleChordDiagram frets={getUkuleleShape(chord)} />}
                {view === "piano" && <PianoRoll activePitchClasses={chordMidiNotes(chord).map((m) => m % 12)} />}
              </div>
            );
          })}
        </div>

        {view === "guitar" && (
          <div className="mt-6 border-t border-[var(--color-ns-border)] pt-5">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
              Alternate Voicing Position
            </p>
            <div className="flex flex-wrap gap-2">
              {getGuitarVoicings(parseChordSymbol(uniqueChords[0] ?? "C")).map((v, i) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => setVoicingIndex(i)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    voicingIndex === i
                      ? "bg-[var(--color-ns-coral)] text-[var(--color-ns-ink)] font-bold"
                      : "border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 6. STEM SEPARATION */}
      <div className="mt-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-[var(--color-ns-blue)]/30 bg-[var(--color-ns-blue)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ns-blue)]">
                Studio DSP
              </span>
              <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">Audio Stems Separation</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
              Phase-cancellation DSP extracts instrumental backing and center vocals directly inside your browser.
            </p>
          </div>
          {audioUrl && !stems && (
            <button
              type="button"
              onClick={handleSeparateStems}
              disabled={separatingStems}
              className="btn-primary self-start sm:self-center py-2 text-xs"
            >
              {separatingStems ? (
                <>
                  <span className="spinner" />
                  <span>Processing Stems…</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                  <span>Extract Backing Stems</span>
                </>
              )}
            </button>
          )}
        </div>

        {!audioUrl && (
          <p className="mt-3 text-xs text-[var(--color-ns-muted)]">
            Stems separation requires live audio from the current session.
          </p>
        )}

        {stemsError && <p className="mt-3 text-xs text-[var(--color-ns-coral)]">{stemsError}</p>}

        {stems && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--color-ns-text)]">Instrumental Backing</span>
                <span className="rounded-md bg-[var(--color-ns-blue)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ns-blue)]">
                  Vocals Diminished
                </span>
              </div>
              <audio controls src={stems.instrumentalUrl} className="w-full mt-2" />
            </div>

            <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--color-ns-text)]">Vocal-Emphasized Stem</span>
                <span className="rounded-md bg-[var(--color-ns-coral)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ns-coral)]">
                  Center Channel
                </span>
              </div>
              <audio controls src={stems.vocalEmphasizedUrl} className="w-full mt-2" />
            </div>
          </div>
        )}
      </div>

      {/* 7. EXPORT SECTION */}
      <div className="mt-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6">
        <div>
          <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">Export Song Charts & MIDI</h2>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
            Download standard MIDI files and printable lead sheets generated from detected chords.
          </p>
        </div>

        {exportError && <p className="mt-3 text-xs text-[var(--color-ns-coral)]">{exportError}</p>}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleExport("midi")}
            disabled={exporting !== null}
            className="btn-secondary py-2 text-xs"
          >
            <span className="rounded bg-[var(--color-ns-coral)]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-ns-coral)]">
              .MID
            </span>
            <span>{exporting === "midi" ? "Generating MIDI…" : "Download Standard MIDI"}</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null}
            className="btn-secondary py-2 text-xs"
          >
            <span className="rounded bg-[var(--color-ns-blue)]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-ns-blue)]">
              .PDF
            </span>
            <span>{exporting === "pdf" ? "Generating Lead Sheet…" : "Download Chord Chart PDF"}</span>
          </button>
        </div>
      </div>

      {/* 8. BOTTOM NAVIGATION CTAS */}
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--color-ns-border)] pt-6">
        <Link to="/practice" className="btn-primary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 4 19 12 6 20 6 4" />
          </svg>
          Open Practice Mode
        </Link>
        <Link to="/assistant" className="btn-secondary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
          </svg>
          Ask AI Tutor
        </Link>
        <Link to="/library" className="btn-ghost">
          View in Library
        </Link>
      </div>
    </div>
  );
}

