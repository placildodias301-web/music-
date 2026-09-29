import { useEffect, useState } from "react";
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

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-content-dim">{label}</p>
      <p className="mt-2 font-heading text-2xl font-bold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

const DIFFICULTY_COLORS: Record<string, string> = {
  Beginner: "var(--color-green)",
  Intermediate: "var(--color-orange)",
  Advanced: "var(--color-pink)",
};

export function Analysis() {
  const { analysis, fileName, audioUrl } = useMvp();
  const [view, setView] = useState<View>("guitar");
  const [voicingIndex, setVoicingIndex] = useState(0);
  const [exporting, setExporting] = useState<"midi" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [stems, setStems] = useState<StemResult | null>(null);
  const [separatingStems, setSeparatingStems] = useState(false);
  const [stemsError, setStemsError] = useState<string | null>(null);
  const [savedToLibrary, setSavedToLibrary] = useState(false);

  const displayName = fileName ?? analysis?.fileName ?? "";

  useEffect(() => {
    if (displayName) setSavedToLibrary(isSaved(displayName));
  }, [displayName]);

  if (!analysis) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-73px)] max-w-lg flex-col justify-center px-5 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-content">No analysis yet</h1>
        <p className="mt-3 text-content-muted">
          Upload a song or video first — or try the built-in sample track —
          to see a real music analysis here.
        </p>
        <Link to="/upload" className="btn-primary mt-6 inline-flex">
          Go to Upload
        </Link>
      </div>
    );
  }

  const uniqueChords = Array.from(new Set(analysis.chordProgression));

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
      {/* Top Header & Quick Actions */}
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-glass/80 pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary-light">
              Analysis Results
            </span>
            {analysis.difficulty && (
              <span
                className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                style={{
                  color: DIFFICULTY_COLORS[analysis.difficulty.difficultyLabel] ?? "var(--color-content)",
                  borderColor: `${DIFFICULTY_COLORS[analysis.difficulty.difficultyLabel]}55`,
                  background: `${DIFFICULTY_COLORS[analysis.difficulty.difficultyLabel]}15`,
                }}
              >
                {analysis.difficulty.difficultyLabel} · {analysis.difficulty.difficultyScore}/100
              </span>
            )}
          </div>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-content sm:text-3xl">
            {displayName}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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
              savedToLibrary ? "border-green/40 bg-green/10 text-green" : ""
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

      {analysis.isDemo ? (
        <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-card-sm)] border border-orange/30 bg-orange/10 px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0">
            <circle cx="12" cy="12" r="9" stroke="var(--color-orange)" strokeWidth="2" />
            <path d="M12 8v5M12 16h.01" stroke="var(--color-orange)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-orange">{analysis.demoNotice}</p>
        </div>
      ) : (
        <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-card-sm)] border border-green/30 bg-green/10 px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0">
            <path d="M20 6L9 17l-5-5" stroke="var(--color-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-sm text-green">
            Real analysis — key, tempo, and chords were detected from the actual audio you uploaded
            (processed in {analysis.processingSeconds}s).
          </p>
        </div>
      )}

      {!audioUrl && (
        <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-card-sm)] border border-glass bg-white/[0.03] px-4 py-3">
          <p className="text-sm text-content-muted">
            Reopened from your Library — the saved chords, key, tempo and difficulty are all real,
            but the original audio isn't kept in this browser-only demo, so playback, stems and the
            tuner aren't available for this session.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Key" value={analysis.key} accent="var(--color-primary-light)" />
        <StatCard label="Tempo" value={`${analysis.bpm} BPM`} accent="var(--color-cyan)" />
        <StatCard label="Time Signature" value={analysis.timeSignature} accent="var(--color-pink)" />
        <StatCard label="Duration" value={analysis.duration} accent="var(--color-green)" />
      </div>

      <div className="glass-card mt-6 p-6">
        <h2 className="font-heading text-lg font-semibold text-content">Scale</h2>
        <p className="mt-1 text-content-muted">{analysis.scale}</p>
      </div>

      {/* Chord Progression Timeline */}
      <div className="glass-card mt-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold text-content">Detected Chord Progression</h2>
            <p className="mt-0.5 text-xs text-content-dim">
              Sequential harmonic progression detected by the MIR analysis pipeline
            </p>
          </div>
          <span className="rounded-full border border-glass bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-content-dim">
            {analysis.chordProgression.length} chords
          </span>
        </div>

        <div className="mt-5 flex overflow-x-auto pb-3 pt-1 scrollbar-thin">
          <div className="flex items-center gap-3">
            {analysis.chordProgression.map((chord, i) => (
              <div key={`${chord}-${i}`} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 transition-transform hover:scale-105">
                  <span className="text-[10px] font-bold text-content-dim">#{i + 1}</span>
                  <span className="font-heading text-xl font-extrabold text-primary-light">{chord}</span>
                </div>
                {i < analysis.chordProgression.length - 1 && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-content-dim flex-shrink-0">
                    <path d="M5 12h14m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Instrument-specific views + alternate voicings */}
      <div className="glass-card mt-6 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-content">Interactive Instrument Voicings</h2>
            <p className="mt-0.5 text-xs text-content-dim">
              Visual chord diagrams and piano keys for all unique chords in this piece
            </p>
          </div>
          <div className="flex gap-1.5 rounded-xl border border-glass bg-white/[0.02] p-1">
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
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "text-content-muted hover:text-content"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {uniqueChords.map((symbol) => {
            const chord = parseChordSymbol(symbol);
            const voicings = getGuitarVoicings(chord);
            const activeVoicing = voicings[Math.min(voicingIndex, voicings.length - 1)];

            return (
              <div
                key={symbol}
                className="flex flex-col items-center gap-2 rounded-xl border border-glass bg-white/[0.02] p-4 transition-all hover:border-glass-strong"
              >
                <span className="font-heading text-base font-bold text-content">{symbol}</span>
                {view === "guitar" && <GuitarChordDiagram voicing={activeVoicing} />}
                {view === "ukulele" && <UkuleleChordDiagram frets={getUkuleleShape(chord)} />}
                {view === "piano" && <PianoRoll activePitchClasses={chordMidiNotes(chord).map((m) => m % 12)} />}
              </div>
            );
          })}
        </div>

        {view === "guitar" && (
          <div className="mt-6 border-t border-glass pt-5">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-content-dim">
              Alternate Voicings Position
            </p>
            <div className="flex flex-wrap gap-2">
              {getGuitarVoicings(parseChordSymbol(uniqueChords[0] ?? "C")).map((v, i) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => setVoicingIndex(i)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    voicingIndex === i
                      ? "bg-primary text-white shadow-sm"
                      : "border border-glass bg-white/[0.03] text-content-muted hover:border-glass-strong hover:text-content"
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stem separation */}
      <div className="glass-card mt-6 p-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-lg font-semibold text-content">Audio Stems Separation</h2>
            <p className="mt-0.5 text-xs text-content-dim">
              Phase-cancellation DSP extracts instrumental backing and center vocals directly in your browser.
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
          <p className="mt-3 text-xs text-content-dim">
            Stems require live audio from this session.
          </p>
        )}

        {stemsError && <p className="mt-3 text-xs text-pink">{stemsError}</p>}

        {stems && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-glass bg-white/[0.02] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-content">Instrumental Backing</span>
                <span className="rounded-md bg-cyan/15 px-2 py-0.5 text-[10px] font-semibold text-cyan">Vocals Diminished</span>
              </div>
              <audio controls src={stems.instrumentalUrl} className="w-full mt-2" />
            </div>

            <div className="rounded-xl border border-glass bg-white/[0.02] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-content">Vocal-Emphasized Stem</span>
                <span className="rounded-md bg-pink/15 px-2 py-0.5 text-[10px] font-semibold text-pink">Center Channel</span>
              </div>
              <audio controls src={stems.vocalEmphasizedUrl} className="w-full mt-2" />
            </div>
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="glass-card mt-6 p-6">
        <div>
          <h2 className="font-heading text-lg font-semibold text-content">Export Song Charts & MIDI</h2>
          <p className="mt-0.5 text-xs text-content-dim">
            Export standard MIDI files and lead sheets generated from detected chords.
          </p>
        </div>

        {exportError && <p className="mt-3 text-xs text-pink">{exportError}</p>}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleExport("midi")}
            disabled={exporting !== null}
            className="btn-secondary py-2 text-xs"
          >
            <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary-light">.MID</span>
            <span>{exporting === "midi" ? "Generating MIDI…" : "Download Standard MIDI"}</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null}
            className="btn-secondary py-2 text-xs"
          >
            <span className="rounded bg-cyan/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan">.PDF</span>
            <span>{exporting === "pdf" ? "Generating Lead Sheet…" : "Download Chord Chart PDF"}</span>
          </button>
        </div>
      </div>

      {/* Bottom Navigation CTAs */}
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-glass pt-6">
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
          Ask AI Assistant
        </Link>
        <Link to="/library" className="btn-ghost">
          View in Library
        </Link>
      </div>
    </div>
  );
}
