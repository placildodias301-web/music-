import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import {
  loadChordEdits,
  persistActiveSongRef,
  resolveCanonicalSongId,
  resolveLibrarySong,
  saveChordEdits,
  updateLibrarySongState,
} from "../lib/library";
import { resolveServerAudioUrl, type AnalysisResult, type ChordSegment } from "../lib/api";
import { DEFAULT_LOW_CONFIDENCE, formatTime } from "../lib/chordSync";
import { capoSuggestions, transposeAnalysis, transposeChord, transposeKey } from "../lib/transpose";
import { usePlaybackClock } from "../lib/usePlaybackClock";
import { simplifyChord } from "../lib/song/simplify";
import { lineAt } from "../lib/song/sections";
import { buildSheet } from "../lib/song/sheetData";
import type { ChordEdit } from "../lib/song/chordEdits";
import type { ChordEvent, SongSection } from "../lib/song/model";
import {
  loadDisplay,
  loadLyrics,
  materializeLyrics,
  saveDisplay,
  saveLyrics,
  type DisplaySettings as Display,
  type StoredLyrics,
} from "../lib/song/songStore";
import { EmptyState } from "../components/ui";
import { SongHeader } from "../components/song/SongHeader";
import { AudioPlayer } from "../components/song/AudioPlayer";
import { TransposeControl } from "../components/song/TransposeControl";
import { CapoControl } from "../components/song/CapoControl";
import { PracticeMode } from "../components/song/PracticeMode";
import { ChordSheet } from "../components/song/ChordSheet";
import { ChordPanel } from "../components/song/ChordPanel";
import { DisplaySettings } from "../components/song/DisplaySettings";
import { AskWilsify } from "../components/song/AskWilsify";
import { LyricsEditor } from "../components/song/LyricsEditor";
import { useSongCursor } from "../components/song/useSongCursor";
import { useAutoLyrics } from "../components/song/useAutoLyrics";
import { SectionNav } from "../components/song/SectionNav";
import { ChordEditor } from "../components/song/ChordEditor";
import { ChordTimeline } from "../components/analysis/ChordTimeline";
import type { PlaybackClock } from "../lib/usePlaybackClock";

type SheetView = "sheet" | "timeline" | "practice" | "compact";
const VIEWS: { id: SheetView; label: string; hint: string }[] = [
  { id: "sheet", label: "Sheet", hint: "Chords above the lyrics" },
  { id: "timeline", label: "Timeline", hint: "Chords along the audio timeline" },
  { id: "practice", label: "Practice", hint: "Large chords and lyrics for playing along" },
  { id: "compact", label: "Compact", hint: "Smaller text, more of the song on screen" },
];

/** Index of the timeline chord sounding now; re-renders only when it changes. */
function useActiveSegment(clock: PlaybackClock, timeline: ChordSegment[]): number {
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    const update = (t: number) => setIndex(timeline.findIndex((s) => t >= s.start && t < s.end));
    update(clock.getCurrentTime());
    return clock.subscribe(update);
  }, [clock, timeline]);
  return index;
}

/** /song/current = the song just analysed this session; /song/:id = a saved Library song. */
function useSong(songId: string | undefined) {
  const mvp = useMvp();
  return useMemo(() => {
    if (songId === "current" || !songId) {
      const ref = mvp.libraryId || mvp.fileName || mvp.analysis?.fileName || "";
      const saved = ref ? resolveLibrarySong(ref) : null;
      const analysis = mvp.analysis ?? saved?.analysis ?? null;
      if (!analysis) return null;
      const fileName = mvp.fileName ?? saved?.fileName ?? analysis.fileName;
      const canonicalId = saved?.id ?? resolveCanonicalSongId(mvp.libraryId || fileName);
      return {
        id: canonicalId,
        fileName,
        analysis,
        audioUrl: mvp.audioUrl ?? resolveServerAudioUrl(analysis.audioUrl),
        sessionAudioUrl: mvp.audioUrl,
        savedTranspose: saved?.transpose,
        savedCapo: saved?.capo,
        savedSimplify: saved?.simplify,
        attachAudioFile: mvp.attachAudioFile,
        setSong: mvp.setSong,
        setAnalysis: mvp.setAnalysis,
      };
    }
    const item = resolveLibrarySong(songId);
    if (!item) return null;
    // Saved songs keep the analysis, not the audio: audio is only there if the same file is open this session.
    // The server's temporary copy is the fallback while it still exists.
    const audioUrl = (mvp.fileName === item.fileName ? mvp.audioUrl : null) ?? resolveServerAudioUrl(item.analysis.audioUrl);
    return {
      id: item.id,
      fileName: item.fileName,
      analysis: item.analysis,
      audioUrl,
      sessionAudioUrl: mvp.fileName === item.fileName ? mvp.audioUrl : null,
      savedTranspose: item.transpose,
      savedCapo: item.capo,
      savedSimplify: item.simplify,
      attachAudioFile: mvp.attachAudioFile,
      setSong: mvp.setSong,
      setAnalysis: mvp.setAnalysis,
    };
  }, [songId, mvp.analysis, mvp.fileName, mvp.audioUrl, mvp.libraryId, mvp.attachAudioFile, mvp.setSong, mvp.setAnalysis]);
}

const titleOf = (fileName: string) => fileName.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_]+/g, " ").trim();

export function Song() {
  const { songId } = useParams();
  const song = useSong(songId);
  if (!song) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <EmptyState title="No active song" body="Choose a song from your Library or upload a new one.">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/upload" className="btn-primary text-xs sm:text-sm">
              Upload a song
            </Link>
            <Link to="/library" className="btn-secondary text-xs sm:text-sm">
              Open Library
            </Link>
            <button
              type="button"
              disabled
              title="Analyze or select a song first to open Practice Studio"
              className="btn-secondary text-xs sm:text-sm"
            >
              Practice This Song
            </button>
          </div>
        </EmptyState>
      </div>
    );
  }
  return (
    <SongView
      key={song.id}
      id={song.id}
      fileName={song.fileName}
      analysis={song.analysis}
      audioUrl={song.audioUrl}
      sessionAudioUrl={song.sessionAudioUrl}
      savedTranspose={song.savedTranspose}
      savedCapo={song.savedCapo}
      savedSimplify={song.savedSimplify}
      attachAudioFile={song.attachAudioFile}
      setSong={song.setSong}
      setAnalysis={song.setAnalysis}
    />
  );
}

function SongView({
  id,
  fileName,
  analysis,
  audioUrl,
  sessionAudioUrl,
  savedTranspose,
  savedCapo,
  savedSimplify,
  attachAudioFile,
  setSong,
  setAnalysis,
}: {
  id: string;
  fileName: string;
  analysis: AnalysisResult;
  audioUrl: string | null;
  /** The audio file opened this session (not the server copy), handed on to Practice / Analysis. */
  sessionAudioUrl: string | null;
  savedTranspose?: number;
  savedCapo?: number;
  savedSimplify?: boolean;
  attachAudioFile: (file: File) => void;
  setSong: ReturnType<typeof useMvp>["setSong"];
  setAnalysis: ReturnType<typeof useMvp>["setAnalysis"];
}) {
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement>(null);
  const reattachInputRef = useRef<HTMLInputElement>(null);
  const clock = usePlaybackClock(audioRef, audioUrl);
  const [shift, setShiftState] = useState(() => (typeof savedTranspose === "number" ? savedTranspose : 0));
  const [capo, setCapoState] = useState(() =>
    typeof savedCapo === "number" ? savedCapo : analysis.capo?.detected ? analysis.capo.fret : 0,
  );
  const [display, setDisplayState] = useState<Display>(() => {
    const base = loadDisplay();
    return typeof savedSimplify === "boolean" ? { ...base, simplify: savedSimplify } : base;
  });
  const [stored, setStored] = useState<StoredLyrics | null>(() => loadLyrics(id) ?? loadLyrics(`file:${fileName}`));
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [loopId, setLoopId] = useState<string | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [tapIndex, setTapIndex] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [searchParams] = useSearchParams();
  // User chord corrections, kept apart from the analysis (RAW ANALYSIS + CORRECTIONS = this sheet).
  const [edits, setEditsState] = useState<ChordEdit[]>(() => loadChordEdits(id, fileName));
  const [editingChords, setEditingChords] = useState(false);
  const [view, setView] = useState<SheetView>("sheet");
  // No lyrics yet: transcribe them from the song's own audio (once per song).
  const onAutoLyrics = useCallback((l: StoredLyrics) => setStored(l), []);
  const autoLyrics = useAutoLyrics({ songRef: id, fileName, analysis, sessionAudioUrl, hasLyrics: Boolean(stored), onLyrics: onAutoLyrics });
  const lyricsState = autoLyrics.state;

  // Keep the active song reference synchronized in sessionStorage without duplicating Library entries.
  useEffect(() => {
    const libId = id.startsWith("file:") ? null : id;
    persistActiveSongRef({ libraryId: libId, fileName });
  }, [id, fileName]);

  const setShift = useCallback(
    (next: number) => {
      setShiftState(next);
      updateLibrarySongState(id || fileName, { transpose: next });
    },
    [id, fileName],
  );

  const setCapo = useCallback(
    (next: number) => {
      setCapoState(next);
      updateLibrarySongState(id || fileName, { capo: next });
    },
    [id, fileName],
  );

  const setDisplay = useCallback(
    (next: Display) => {
      setDisplayState((prev) => {
        if (next.simplify !== prev.simplify) {
          updateLibrarySongState(id || fileName, { simplify: next.simplify });
        }
        return next;
      });
      saveDisplay(next);
    },
    [id, fileName],
  );

  const commitEdits = useCallback(
    (next: ChordEdit[]) => {
      setEditsState(next);
      saveChordEdits(id, fileName, next);
    },
    [id, fileName],
  );

  const applySpeed = useCallback((s: number) => {
    const a = audioRef.current;
    if (a) {
      a.playbackRate = s;
      (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    }
    setSpeed(s);
  }, []);

  // Analysis, Chord Sheet and Practice all open THIS song: make it the session's song first.
  const openAs = useCallback(
    (path: string) => {
      const libId = id.startsWith("file:") ? null : id;
      setSong({
        libraryId: libId,
        fileName,
        fileSizeBytes: analysis.fileSizeBytes ?? 0,
        audioUrl: sessionAudioUrl,
        isSampleAudio: false,
      });
      setAnalysis(analysis);
      navigate(path);
    },
    [id, fileName, analysis, sessionAudioUrl, setSong, setAnalysis, navigate],
  );
  const handleOpenPracticeStudio = useCallback(() => openAs("/practice"), [openAs]);

  const parsed = useMemo(() => (stored ? materializeLyrics(stored) : null), [stored]);
  const sheet = useMemo(() => buildSheet(analysis, edits, parsed), [analysis, edits, parsed]);
  const sections = sheet.sections;
  const cursor = useSongCursor(clock, sections);
  const activeSegment = useActiveSegment(clock, sheet.analysis.chordTimeline);
  const canSeek = Boolean(audioUrl);
  const timelineAnalysis = useMemo(() => transposeAnalysis(sheet.analysis, shift - capo), [sheet.analysis, shift, capo]);

  // "Play from here" links (/song/:id?t=42.5): scroll to that line and, with audio, play from it.
  const startedFromLink = useRef(false);
  useEffect(() => {
    const t = Number(searchParams.get("t"));
    if (startedFromLink.current || !searchParams.has("t") || !Number.isFinite(t)) return;
    startedFromLink.current = true;
    const hit = lineAt(sections, t);
    if (hit) document.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(hit.line.id)}"]`)?.scrollIntoView?.({ block: "center" });
    if (canSeek) clock.playFrom(t);
  }, [searchParams, sections, canSeek, clock]);

  const jumpToSection = (s: SongSection) => {
    if (view !== "timeline") {
      document.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(s.id)}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
    if (canSeek && s.startTime !== null) clock.playFrom(s.startTime);
  };

  const render = useCallback(
    (original: string) => {
      const played = transposeChord(original, shift - capo);
      return display.simplify ? simplifyChord(played) : played;
    },
    [shift, capo, display.simplify],
  );
  const concert = useCallback((original: string) => transposeChord(original, shift), [shift]);

  // Loop the chosen section (kept in sync if the section list changes).
  useEffect(() => {
    const s = sections.find((x) => x.id === loopId);
    clock.setLoop(s && s.startTime !== null && s.endTime !== null ? { start: s.startTime, end: s.endTime } : null);
  }, [loopId, sections, clock]);

  const onLoop = (s: SongSection) => {
    if (loopId === s.id) setLoopId(null);
    else {
      setLoopId(s.id);
      if (s.startTime !== null) clock.playFrom(s.startTime);
    }
  };
  const onChord = (c: ChordEvent) => {
    setSelected(c.originalChord);
    if (canSeek) clock.playFrom(c.time);
  };

  // Tap-sync: assign the current playback time to the next untimed line.
  const lineCount = parsed ? parsed.sections.reduce((n, s) => n + s.lines.length, 0) : 0;
  const needsSync = parsed && !parsed.timed && lineCount > 0;
  const markLine = useCallback(() => {
    if (tapIndex === null || !stored) return;
    const taps = { ...(stored.taps ?? {}), [tapIndex]: Math.round(clock.getCurrentTime() * 100) / 100 };
    const next: StoredLyrics = { ...stored, taps, updatedAt: new Date().toISOString() };
    setStored(next);
    saveLyrics(id, next);
    setTapIndex(tapIndex + 1 < lineCount ? tapIndex + 1 : null);
  }, [tapIndex, stored, clock, id, lineCount]);
  useEffect(() => {
    if (tapIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        markLine();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tapIndex, markLine]);

  const flatLines = useMemo(() => (parsed ? parsed.sections.flatMap((s) => s.lines) : []), [parsed]);
  const sectionName = sections.find((s) => s.id === cursor.sectionId)?.name ?? null;
  const key_ = transposeKey(analysis.key, shift);
  const firstChord = sheet.analysis.chordTimeline[0]?.chord;
  const lowConfidence = analysis.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE;
  // Practice view: big enough to read from a music stand; Compact: more of the song per screen.
  const scale = view === "practice" ? 1.45 : view === "compact" ? 0.82 : 1;
  const options = {
    chordSize: Math.round(display.chordSize * scale),
    lyricSize: Math.round(display.lyricSize * scale),
    lineSpacing: view === "compact" ? Math.min(display.lineSpacing, 1.5) : display.lineSpacing,
    showChords: display.showChords,
    showLyrics: display.showLyrics,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <SongHeader title={titleOf(fileName)} artist={null} analysis={analysis} key_={key_} capo={capo} transpose={shift} />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:pt-1">
          <button
            type="button"
            onClick={handleOpenPracticeStudio}
            className="btn-primary px-4 py-2 text-xs sm:text-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="6 4 19 12 6 20 6 4" />
            </svg>
            Practice This Song
          </button>
          <button type="button" onClick={() => openAs("/analysis")} className="btn-secondary px-3.5 py-2 text-xs sm:text-sm">
            Analysis Overview
          </button>
        </div>
      </div>

      <div className="mb-3 space-y-3">
        <AudioPlayer
          audioRef={audioRef}
          src={audioUrl}
          clock={clock}
          fallbackDuration={analysis.durationSeconds}
          speed={speed}
          onSpeed={applySpeed}
          sectionName={sectionName}
        />
        {!audioUrl && (
          <div className="flex flex-col justify-between gap-2 rounded-2xl border border-[var(--color-ns-amber)]/35 bg-[var(--color-ns-amber)]/10 px-4 py-2.5 sm:flex-row sm:items-center">
            <p className="text-xs text-[var(--color-ns-text)]">
              Saved chord sheet loaded. Re-attach your audio file (`{fileName}`) to enable audio playback and section looping.
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
              className="btn-secondary shrink-0 px-3 py-1 text-xs font-semibold"
            >
              Re-attach audio file
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3">
          <TransposeControl value={shift} onChange={setShift} />
          <CapoControl
            capo={capo}
            onChange={setCapo}
            example={firstChord ? transposeChord(firstChord, shift) : undefined}
            suggestions={capoSuggestions(analysis, shift, 3)}
          />
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ns-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={display.simplify}
              onChange={(e) => setDisplay({ ...display, simplify: e.target.checked })}
            />
            Simplify chords
          </label>
          <span className="text-[11px] text-[var(--color-ns-dim)]">Transpose changes the chord names, not the recording.</span>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-0.5">
            <button
              type="button"
              onClick={() => {
                const next = {
                  ...display,
                  lyricSize: Math.max(13, Math.min(28, display.lyricSize - 1)),
                  chordSize: Math.max(12, Math.min(26, display.chordSize - 1)),
                };
                setDisplay(next);
                saveDisplay(next);
              }}
              title="Decrease font size (A-)"
              className="rounded px-2 py-1 text-xs font-bold text-[var(--color-ns-muted)] hover:bg-white/[0.06] hover:text-[var(--color-ns-text)]"
            >
              A-
            </button>
            <span className="px-1 text-[11px] tabular-nums text-[var(--color-ns-dim)]">{display.lyricSize}px</span>
            <button
              type="button"
              onClick={() => {
                const next = {
                  ...display,
                  lyricSize: Math.max(13, Math.min(28, display.lyricSize + 1)),
                  chordSize: Math.max(12, Math.min(26, display.chordSize + 1)),
                };
                setDisplay(next);
                saveDisplay(next);
              }}
              title="Increase font size (A+)"
              className="rounded px-2 py-1 text-xs font-bold text-[var(--color-ns-muted)] hover:bg-white/[0.06] hover:text-[var(--color-ns-text)]"
            >
              A+
            </button>
          </div>
          <button
            type="button"
            onClick={() => setEditingChords((v) => !v)}
            aria-expanded={editingChords}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${editingChords ? "border-[var(--color-ns-purple-light)] bg-[var(--color-ns-purple)]/20 text-[var(--color-ns-purple-light)]" : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"}`}
          >
            Edit chords{edits.length ? ` (${edits.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            title="Edit words, split or merge lines, and rename or reorder [Section] headers"
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${editing ? "border-[var(--color-ns-purple-light)] bg-[var(--color-ns-purple)]/20 text-[var(--color-ns-purple-light)]" : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"}`}
          >
            {editing ? "Close edit" : stored ? "Edit lyrics" : "Add lyrics"}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
            className="rounded-lg border border-[var(--color-ns-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
          >
            Display
          </button>
        </div>
        {showSettings && <DisplaySettings value={display} onChange={setDisplay} />}
        {editing && (
          <LyricsEditor
            initial={stored?.raw ?? ""}
            hasLyrics={Boolean(stored)}
            analysis={analysis}
            fileName={fileName}
            onSave={(raw, source) => {
              const next: StoredLyrics = { raw, source, updatedAt: new Date().toISOString() };
              setStored(next);
              saveLyrics(id, next);
              setEditing(false);
            }}
            onRemove={() => {
              setStored(null);
              saveLyrics(id, null);
              setEditing(false);
            }}
            onClose={() => setEditing(false)}
          />
        )}
        {editingChords && (
          <ChordEditor
            timeline={sheet.analysis.chordTimeline}
            editCount={edits.length}
            lowConfidence={lowConfidence}
            currentTime={clock.getCurrentTime}
            onEdit={(e) => commitEdits([...edits, e])}
            onUndo={() => commitEdits(edits.slice(0, -1))}
            onReset={() => commitEdits([])}
            onClose={() => setEditingChords(false)}
          />
        )}
        {sheet.analysis.chordTimeline.length === 0 && (
          <div role="status" className="rounded-2xl border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 p-3 text-xs text-[var(--color-ns-text)]">
            Chord detection wasn&apos;t confident enough for this song. You can add chords yourself with <strong>Edit chords</strong>.
          </div>
        )}
        {sheet.uncertainCount > 0 && !editingChords && (
          <div className="flex flex-col justify-between gap-2 rounded-2xl border border-[var(--color-ns-amber)]/35 bg-[var(--color-ns-amber)]/10 px-4 py-2.5 sm:flex-row sm:items-center">
            <p className="text-xs text-[var(--color-ns-text)]">
              <strong>Some chords may need correction.</strong> {sheet.uncertainCount} chord{sheet.uncertainCount === 1 ? " was" : "s were"} detected with low confidence and {sheet.uncertainCount === 1 ? "is" : "are"} marked <strong>?</strong>.
            </p>
            <button type="button" onClick={() => setEditingChords(true)} className="btn-secondary shrink-0 px-3 py-1 text-xs font-semibold">
              Review chords
            </button>
          </div>
        )}
        {needsSync && (
          <div role="status" className="rounded-2xl border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 p-3 text-xs text-[var(--color-ns-text)]">
            {tapIndex === null ? (
              <>
                <strong>These lyrics aren't timed yet</strong>, so chords can't be placed on the words.{" "}
                {canSeek
                  ? "Play the song and tap each line as it starts — chords then snap to the words."
                  : "Open this song from Upload with its audio to sync them, or paste an .lrc file."}
                {canSeek && (
                  <button
                    className="ml-3 rounded-lg bg-[var(--color-ns-amber)] px-3 py-1 font-semibold text-black"
                    onClick={() => {
                      clock.playFrom(0);
                      setTapIndex(0);
                    }}
                  >
                    Start syncing
                  </button>
                )}
              </>
            ) : (
              <>
                Next line ({tapIndex + 1}/{lineCount}): <strong>“{flatLines[tapIndex]?.text}”</strong> — press <kbd>Enter</kbd> or{" "}
                <button className="rounded-lg bg-[var(--color-ns-amber)] px-3 py-1 font-semibold text-black" onClick={markLine}>
                  Mark start ({formatTime(clock.getCurrentTime())})
                </button>
                <button className="ml-2 underline" onClick={() => setTapIndex(null)}>
                  Stop
                </button>
              </>
            )}
          </div>
        )}
        {stored?.source === "transcribed" && !editing && (
          <p className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-4 py-2 text-[11px] text-[var(--color-ns-muted)]">
            Lyrics transcribed automatically from this recording&apos;s vocals — they may contain mistakes. Use <strong>Edit lyrics</strong> to correct words or lines.
          </p>
        )}
        {!stored && !editing && lyricsState.status === "running" && (
          <div role="status" className="rounded-2xl border border-[var(--color-ns-purple-light)]/35 bg-[var(--color-ns-purple)]/10 px-4 py-3">
            <p className="text-xs text-[var(--color-ns-text)]">
              <strong>Transcribing lyrics from the audio…</strong> {lyricsState.message} {Math.round(lyricsState.progress)}%
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-ns-raised)]">
              <div className="h-full rounded-full bg-[var(--color-ns-purple)] transition-[width]" style={{ width: `${Math.max(3, lyricsState.progress)}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--color-ns-dim)]">This takes a few minutes on the first run. The chord sheet below works meanwhile; lyrics appear above the chords when ready.</p>
          </div>
        )}
        {!stored && !editing && lyricsState.status !== "running" && (
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-4 py-3 sm:flex-row sm:items-center">
            <p className="text-xs text-[var(--color-ns-muted)]">
              {lyricsState.status === "no-vocals" ? (
                <>
                  <strong className="text-[var(--color-ns-text)]">No singing detected.</strong> This looks like an instrumental, so the sheet shows chords only.{" "}
                </>
              ) : lyricsState.status === "failed" ? (
                <>
                  <strong className="text-[var(--color-ns-text)]">Chord analysis is available, but lyrics could not be generated.</strong> {lyricsState.error}{" "}
                </>
              ) : (
                <>
                  <strong className="text-[var(--color-ns-text)]">Lyrics unavailable for this analysis.</strong> Re-attach the audio file to transcribe them automatically — the chord sheet below works without them.{" "}
                </>
              )}
              Add lyrics to see them synced with your chords. Paste or upload lyrics (.txt / .lrc) to align chords directly above the words.
            </p>
            {lyricsState.status === "failed" && (
              <button type="button" onClick={autoLyrics.retry} className="btn-secondary shrink-0 px-3 py-1.5 text-xs font-semibold">
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-secondary shrink-0 px-3 py-1.5 text-xs font-semibold"
            >
              Add lyrics
            </button>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Sheet view" className="flex shrink-0 gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              title={v.hint}
              onClick={() => setView(v.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === v.id ? "bg-[var(--color-ns-purple)]/25 text-[var(--color-ns-text)]" : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <SectionNav sections={sections} currentId={cursor.sectionId} onJump={jumpToSection} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {view === "timeline" ? (
          <div className="min-w-0 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4">
            <ChordTimeline
              analysis={timelineAnalysis}
              clock={clock}
              syncOffsetMs={0}
              activeIndex={activeSegment}
              selectedChord={selected ? render(selected) : null}
              isPlaying={clock.isPlaying}
              interactive={canSeek}
              onPickSegment={(seg) => {
                const original = sheet.analysis.chordTimeline.find((x) => x.start === seg.start);
                if (original) setSelected(original.chord);
                if (canSeek) clock.playFrom(seg.start);
              }}
              onSeekTime={(t) => {
                if (canSeek) clock.playFrom(t);
              }}
            />
          </div>
        ) : (
          <ChordSheet
            sections={sections}
            options={options}
            render={render}
            cursor={cursor}
            playing={clock.isPlaying}
            autoScroll={display.autoScroll}
            light={display.light}
            selectedChord={selected}
            lowConfidence={lowConfidence}
            canSeek={canSeek}
            loopSectionId={loopId}
            onSeek={clock.playFrom}
            onChord={onChord}
            onLoop={onLoop}
          />
        )}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          {selected && (
            <div className="fixed inset-x-2 bottom-2 z-30 max-h-[65vh] overflow-auto shadow-2xl lg:static lg:max-h-none lg:shadow-none">
              <ChordPanel
                chord={render(selected)}
                concert={capo ? concert(selected) : undefined}
                onAskWhy={(c) => setSeed(`Why is ${c} used here?`)}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
          <PracticeMode
            audioRef={audioRef}
            speed={speed}
            onSpeed={setSpeed}
            sections={sections}
            loopSectionId={loopId}
            onLoopSection={setLoopId}
            disabled={!canSeek}
          />
          <AskWilsify
            analysis={analysis}
            fileName={fileName}
            seedQuestion={seed}
            context={() => ({
              songId: id,
              currentTime: clock.getCurrentTime(),
              section: sectionName,
              chord: cursor.chord ? render(cursor.chord) : null,
              prevChord: cursor.prevChord ? render(cursor.prevChord) : null,
              nextChord: cursor.nextChord ? render(cursor.nextChord) : null,
              key: key_,
              bpm: analysis.bpm,
              timeSignature: analysis.timeSignature,
              instrument: "guitar",
            })}
          />
        </aside>
      </div>
    </div>
  );
}
