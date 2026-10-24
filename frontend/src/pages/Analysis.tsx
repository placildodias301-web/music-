import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import { exportMidi, exportPdf, pitchShiftAudio } from "../lib/api";
import type { AnalysisResult } from "../lib/api";
import { scaleName } from "../lib/chordSync";
import { useNotation } from "../lib/useNotation";
import { useSettings } from "../lib/settings/settingsContext";
import { LiveChordSync } from "../components/analysis/LiveChordSync";
import { InstrumentVoicings } from "../components/analysis/InstrumentVoicings";
import { TransposePanel } from "../components/analysis/TransposePanel";
import {
  capoSuggestions,
  shapeShift,
  soundingShift,
  transposeAnalysis,
  NO_TRANSPOSE,
  type TransposeSettings,
} from "../lib/transpose";
import { StemMixer } from "../components/analysis/StemMixer";
import { saveToLibrary, isSaved, resolveLibrarySong, updateLibrarySongState } from "../lib/library";
import {
  DEFAULT_DIFFICULTY_BADGE,
  DIFFICULTY_BADGES,
  describeKeyConfidence,
} from "../lib/analysisDisplay";
import { buildLeadSheet } from "../lib/leadSheet";
import { MeterCard, TempoCard } from "../components/analysis/RhythmCards";

/** A detected capo is applied by default only when the analysis is at least this sure. */
const CAPO_AUTO_MIN_CONFIDENCE = 0.4;

export function Analysis() {
  const { analysis, libraryId, fileName, audioUrl, isSampleAudio, setAnalysis, attachAudioFile } = useMvp();
  const reattachInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState<"midi" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pdfLight, setPdfLight] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  // The chord sounding now (from the playback clock) and the one the user picked.
  const [playingChord, setPlayingChord] = useState<string | null>(null);
  const [selectedChord, setSelectedChord] = useState<string | null>(null);

  // Transpose / capo. `transpose.audio` is the shift of the audio actually
  // playing; a requested change waits in `audioPending` until the server
  // returns the re-pitched file, so chords and sound never disagree.
  const { settings } = useSettings();
  const displayName = fileName ?? analysis?.fileName ?? "Analyzed Track";
  const [transpose, setTranspose] = useState<TransposeSettings>(() => {
    const saved = resolveLibrarySong(libraryId || displayName);
    if (saved && (saved.transpose !== undefined || saved.capo !== undefined)) {
      return {
        ...NO_TRANSPOSE,
        chordsOnly: saved.transpose ?? 0,
        capo: saved.capo ?? 0,
      };
    }
    if (analysis?.capo?.detected && analysis.capo.fret > 0 && analysis.capo.confidence >= CAPO_AUTO_MIN_CONFIDENCE) {
      return { ...NO_TRANSPOSE, capo: analysis.capo.fret };
    }
    if (!analysis || settings.display.capo !== "easiest") return NO_TRANSPOSE;
    const [best] = capoSuggestions(analysis, 0);
    const none = capoSuggestions(analysis, 0, 8).find((s) => s.capo === 0);
    return best && best.capo > 0 && best.openShare > (none?.openShare ?? 0) ? { ...NO_TRANSPOSE, capo: best.capo } : NO_TRANSPOSE;
  });
  const notation = useNotation(analysis?.key ?? "");
  const displayKey = notation.key;
  const [shiftedUrls, setShiftedUrls] = useState<Record<number, string>>({});
  const [audioPending, setAudioPending] = useState<number | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const shiftRequest = useRef<{ id: number; abort: AbortController | null }>({ id: 0, abort: null });
  const createdUrls = useRef<string[]>([]);

  useEffect(() => {
    if (displayName) setSavedToLibrary(isSaved(displayName));
  }, [displayName]);

  useEffect(() => {
    const urls = createdUrls.current;
    const request = shiftRequest.current;
    return () => {
      request.abort?.abort();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const shown = useMemo(() => (analysis ? transposeAnalysis(analysis, shapeShift(transpose)) : null), [analysis, transpose]);
  const suggestions = useMemo(() => (analysis ? capoSuggestions(analysis, soundingShift(transpose)) : []), [analysis, transpose]);
  const playbackUrl = transpose.audio && shiftedUrls[transpose.audio] ? shiftedUrls[transpose.audio] : audioUrl;

  function handleTransposeChange(next: TransposeSettings) {
    setSelectedChord(null);
    setAudioError(null);
    const target = next.audio;
    // Capo / chords-only apply at once; the audio shift only once its audio is ready.
    setTranspose((t) => ({ ...next, audio: t.audio }));
    try {
      updateLibrarySongState(libraryId || displayName, {
        transpose: Math.max(-12, Math.min(12, Math.round(next.chordsOnly))),
        capo: Math.max(0, Math.min(7, Math.round(next.capo))),
      });
    } catch {
      // ignore out-of-range
    }
    if (target === (audioPending ?? transpose.audio)) return;

    const request = shiftRequest.current;
    request.abort?.abort();
    request.abort = null;
    const id = ++request.id;

    if (target === 0 || shiftedUrls[target] || !audioUrl) {
      setAudioPending(null);
      if (target === 0 || shiftedUrls[target]) setTranspose((t) => ({ ...t, audio: target }));
      return;
    }

    const controller = new AbortController();
    request.abort = controller;
    setAudioPending(target);
    pitchShiftAudio(audioUrl, target, controller.signal)
      .then((blob) => {
        if (shiftRequest.current.id !== id) return;
        const url = URL.createObjectURL(blob);
        createdUrls.current.push(url);
        setShiftedUrls((m) => ({ ...m, [target]: url }));
        setTranspose((t) => ({ ...t, audio: target }));
        setAudioPending(null);
      })
      .catch((err) => {
        if (shiftRequest.current.id !== id || controller.signal.aborted) return;
        setAudioError(err instanceof Error ? err.message : "Couldn't re-pitch the audio.");
        setAudioPending(null);
      });
  }

  if (!analysis || !shown) {
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
          <button
            type="button"
            disabled
            title="Analyze or select a song first to open the Chord & Lyric Sheet"
            className="btn-secondary"
          >
            Open Chord & Lyric Sheet
          </button>
        </div>
      </div>
    );
  }

  const uniqueChords = Array.from(new Set(shown.chordProgression));
  const isV2 = (analysis.analysisVersion ?? 1) >= 2;
  const keyConfidence = describeKeyConfidence(analysis);
  const diffInfo = analysis.difficulty
    ? DIFFICULTY_BADGES[analysis.difficulty.difficultyLabel] ?? DEFAULT_DIFFICULTY_BADGE
    : null;

  /** Tempo/meter picked by the user: update this song, and its Library copy if saved. */
  function applyRhythm(next: AnalysisResult) {
    setAnalysis(next);
    const targetRef = libraryId || displayName;
    if (isSaved(targetRef)) saveToLibrary(targetRef, next);
  }

  function handleSaveToLibrary() {
    saveToLibrary(libraryId || displayName, analysis!);
    setSavedToLibrary(true);
  }

  async function handleExport(kind: "midi" | "pdf") {
    setExportError(null);
    setExporting(kind);
    try {
      if (kind === "midi") {
        const sounding = transposeAnalysis(analysis!, soundingShift(transpose));
        // Chords keep their detected times; without a tempo the file just needs a nominal one.
      await exportMidi(sounding.chordProgression, analysis!.bpm > 0 ? analysis!.bpm : 120, displayName, sounding.chordTimeline);
      } else {
        await exportPdf(
          buildLeadSheet({
            analysis: analysis!,
            shown: shown!,
            transpose,
            title: displayName,
            theme: pdfLight ? "light" : "dark",
            display: {
              notation: { accidentals: settings.display.accidentals, notation: settings.display.notation },
              leftHanded: settings.display.leftHanded,
              showUncertain: settings.practice.showUncertain,
            },
          })
        );
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
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-coral)] shadow-md">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-[var(--color-ns-blue)]/30 bg-[var(--color-ns-blue)]/10 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-[var(--color-ns-blue)]">
                Audio Analysis
              </span>
              {diffInfo && analysis.difficulty && (
                <span
                  className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-[0.6875rem] font-semibold"
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
                <span className="inline-flex items-center rounded-md border border-[var(--color-ns-border)] bg-white/[0.04] px-2 py-0.5 text-[0.625rem] font-medium text-[var(--color-ns-muted)]">
                  Sample Clip
                </span>
              )}
            </div>
            <h1 className="mt-2 break-words font-heading text-xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-2xl md:text-3xl">
              {displayName}
            </h1>
            <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
              Processed in {analysis.processingSeconds}s · Key of {displayKey(analysis.key)} · {scaleName(analysis)}
            </p>
          </div>
        </div>

        {/* Action buttons: the main action on top, two quick actions side by side */}
        <div className="grid w-full grid-cols-2 gap-2.5 sm:w-72 sm:flex-shrink-0">
          <Link to="/song/current" className="btn-primary col-span-2">
            Open Chord & Lyric Sheet
          </Link>
          <Link to="/practice" className="btn-secondary col-span-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 4 19 12 6 20 6 4" />
            </svg>
            Practice Track
          </Link>
          <button
            type="button"
            onClick={handleSaveToLibrary}
            disabled={savedToLibrary}
            aria-label={savedToLibrary ? "Saved in Library" : "Save to Library"}
            className={`btn-secondary px-3 text-[0.8125rem] ${
              savedToLibrary ? "!border-[var(--color-ns-mint)]/40 !bg-[var(--color-ns-mint)]/10 !text-[var(--color-ns-mint)] !opacity-100" : ""
            }`}
          >
            {savedToLibrary ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {savedToLibrary ? "Saved" : "Save"}
          </button>
          <Link to="/upload" className="btn-secondary px-3 text-[0.8125rem]" aria-label="Analyze another song">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Song
          </Link>
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
            {isV2 ? (
              <>
                Real audio analysis complete — key, tempo, beats and {analysis.chordTimeline.length} chord changes detected from this
                recording. Chords are read as major, minor and 7th chords; ones the analysis wasn't sure about are marked{" "}
                <span className="font-bold">?</span>.
              </>
            ) : (
              <>
                Real MIR analysis — key, tempo, and chord transitions detected from actual audio. Saved with an earlier analysis
                version, so confidence and beat data aren't available for this track.
              </>
            )}
          </p>
        </div>
      )}

      {/* 2. KEY / BPM / TIME / DURATION STATS */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Detected Key</p>
          <p className="mt-2 font-heading text-2xl font-extrabold text-[var(--color-ns-coral)] sm:text-3xl">
            {displayKey(analysis.key)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
            {scaleName(analysis)}
            {keyConfidence && <span className={keyConfidence.className}> · {keyConfidence.label}</span>}
          </p>
          {keyConfidence?.alternative && (
            <p className="mt-0.5 text-[0.6875rem] text-[var(--color-ns-dim)]">Could also be {displayKey(keyConfidence.alternative)}</p>
          )}
        </div>

        <TempoCard analysis={analysis} onChange={applyRhythm} />

        <MeterCard analysis={analysis} onChange={applyRhythm} />

        <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Duration</p>
          <p className="mt-2 font-heading text-2xl font-extrabold text-[var(--color-ns-mint)] sm:text-3xl">
            {analysis.duration}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
            {analysis.chordTimeline.length} chord changes · {uniqueChords.length} unique
          </p>
        </div>
      </div>

      {/* TRANSPOSE & CAPO */}
      <TransposePanel
        settings={transpose}
        onChange={handleTransposeChange}
        originalKey={analysis.key}
        audioAvailable={Boolean(audioUrl)}
        audioPending={audioPending}
        audioError={audioError}
        suggestions={suggestions}
        detectedCapo={analysis.capo}
      />

      {/* 3–4. PLAYER, NOW-PLAYING CHORD & CHORD TIMELINE (one shared playback clock) */}
      {!audioUrl && (
        <div className="mt-6 flex flex-col justify-between gap-3 rounded-xl border border-[var(--color-ns-amber)]/35 bg-[var(--color-ns-amber)]/10 px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-xs text-[var(--color-ns-text)] sm:text-sm">
            Your saved chord analysis is ready. Re-attach your local audio file (`{displayName}`) to play along with live chord sync.
          </p>
          <input
            ref={reattachInputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) attachAudioFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => reattachInputRef.current?.click()}
            className="btn-secondary shrink-0 px-3 py-1.5 text-xs font-semibold"
          >
            Re-attach audio file
          </button>
        </div>
      )}
      <LiveChordSync
        analysis={shown}
        audioUrl={playbackUrl}
        selectedChord={selectedChord}
        onActiveChordChange={setPlayingChord}
        onSelectChord={setSelectedChord}
      />

      {/* 5. INTERACTIVE INSTRUMENT VOICINGS */}
      <InstrumentVoicings
        chords={uniqueChords}
        songKey={shown.key}
        playingChord={playingChord}
        selectedChord={selectedChord}
        onSelectChord={setSelectedChord}
      />

      {/* 6. STEM SEPARATION */}
      <div className="mt-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-[var(--color-ns-blue)]/30 bg-[var(--color-ns-blue)]/10 px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--color-ns-blue)]">
                AI
              </span>
              <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">Audio Stems Separation</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
              Splits this song into vocals and music, or vocals, drums, bass and other. Same engine as the Stem Splitter, no need to upload again.
            </p>
          </div>
        </div>

        {!audioUrl && (
          <p className="mt-3 text-xs text-[var(--color-ns-muted)]">
            Stems separation requires live audio from the current session.
          </p>
        )}

        {/* key: a new song starts a fresh separator instead of showing the old stems */}
        {audioUrl && <StemMixer key={audioUrl} audioUrl={audioUrl} fileName={fileName ?? undefined} />}
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
            <span className="rounded bg-[var(--color-ns-coral)]/20 px-1.5 py-0.5 font-mono text-[0.625rem] font-bold text-[var(--color-ns-coral)]">
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
            <span className="rounded bg-[var(--color-ns-blue)]/20 px-1.5 py-0.5 font-mono text-[0.625rem] font-bold text-[var(--color-ns-blue)]">
              .PDF
            </span>
            <span>{exporting === "pdf" ? "Generating Lead Sheet…" : "Download Chord Chart PDF"}</span>
          </button>
          <label className="inline-flex cursor-pointer select-none items-center gap-2 self-center text-xs text-[var(--color-ns-muted)]">
            <input
              type="checkbox"
              checked={pdfLight}
              onChange={(e) => setPdfLight(e.target.checked)}
              className="ns-check"
            />
            Print-friendly (light)
          </label>
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
        <Link to="/upload" className="btn-secondary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Analyze Another Song
        </Link>
        <Link to="/library" className="btn-ghost">
          View in Library
        </Link>
      </div>
    </div>
  );
}

