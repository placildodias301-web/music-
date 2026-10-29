import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AnalysisResult } from "../../lib/api";
import { DEFAULT_LOW_CONFIDENCE, displayKey } from "../../lib/chordSync";
import { formatBpm, timeSignatureValue } from "../../lib/analysisDisplay";
import { loadChordEdits } from "../../lib/library";
import { buildSheet } from "../../lib/song/sheetData";
import { loadLyrics, materializeLyrics } from "../../lib/song/songStore";
import { lineAt } from "../../lib/song/sections";
import { ChordLyricLine, type LineRenderOptions } from "../song/ChordLyricLine";
import { useAutoLyrics } from "../song/useAutoLyrics";
import { translateLyrics, type TranslatedLine } from "../../lib/api";

interface Props {
  analysis: AnalysisResult;
  libraryId: string | null;
  fileName: string;
  /** The audio file opened this session (used to transcribe lyrics when the server copy is gone). */
  sessionAudioUrl: string | null;
  /** Chord name as shown on this page (transpose / capo applied). */
  render: (chord: string) => string;
  /** Key as shown on this page. */
  shownKey: string;
  /** Bumped by the page when lyrics or corrections may have changed (e.g. after saving). */
  version?: unknown;
}

const PREVIEW_LINES = 6;
const NO_SELECTION = null;

const LANGUAGE_OPTIONS = [
  { code: "en", label: "🇬🇧 English" },
  { code: "kok", label: "🇮🇳 Konkani (कोंकणी / Romi)" },
  { code: "hi", label: "🇮🇳 Hindi (हिन्दी)" },
  { code: "mr", label: "🇮🇳 Marathi (मराठी)" },
  { code: "ta", label: "🇮🇳 Tamil (தமிழ்)" },
  { code: "es", label: "🇪🇸 Spanish (Español)" },
  { code: "fr", label: "🇫🇷 French (Français)" },
  { code: "pt", label: "🇵🇹 Portuguese (Português)" },
  { code: "de", label: "🇩🇪 German (Deutsch)" },
  { code: "ko", label: "🇰🇷 Korean (한국어)" },
  { code: "ja", label: "🇯🇵 Japanese (日本語)" },
];

const NON_LATIN_LANGS = new Set(["hi", "kok", "mr", "ta", "ko", "ja", "ar"]);

export function ChordSheetPreview({
  analysis,
  libraryId,
  fileName,
  sessionAudioUrl,
  render,
  shownKey,
  version,
}: Props) {
  // Bumped when lyrics transcribed from the audio arrive, so the preview re-reads them.
  const [lyricsVersion, setLyricsVersion] = useState(0);
  const [fontSizeDelta, setFontSizeDelta] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  // Google Translate-style state
  const [sourceLang, setSourceLang] = useState<string>("auto");
  const [detectedLangName, setDetectedLangName] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState<string>("original");
  const [showRomanized, setShowRomanized] = useState<boolean>(true);
  const [translating, setTranslating] = useState<boolean>(false);
  const [translations, setTranslations] = useState<Record<string, Record<string, TranslatedLine>>>({});

  const onLyrics = useCallback(() => setLyricsVersion((v) => v + 1), []);

  const options = useMemo<LineRenderOptions>(
    () => ({
      chordSize: Math.max(12, Math.min(24, 15 + fontSizeDelta)),
      lyricSize: Math.max(13, Math.min(26, 15 + fontSizeDelta)),
      lineSpacing: 1.6,
      showChords: true,
      showLyrics: true,
      showRomanized: showRomanized && NON_LATIN_LANGS.has(targetLang),
    }),
    [fontSizeDelta, showRomanized, targetLang],
  );

  const sheet = useMemo(() => {
    const ref = libraryId ?? fileName;
    const stored = loadLyrics(ref) ?? loadLyrics(`file:${fileName}`);
    return buildSheet(analysis, loadChordEdits(ref, fileName), stored ? materializeLyrics(stored) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, libraryId, fileName, version, lyricsVersion]);

  // Total lines across all sections
  const totalLines = useMemo(
    () => sheet.sections.reduce((acc, s) => acc + s.lines.length, 0),
    [sheet],
  );

  // Translation handling
  const handleTargetChange = async (newTarget: string) => {
    setTargetLang(newTarget);
    if (newTarget === "original") return;
    if (translations[newTarget]) return; // already cached locally!

    const allLines = sheet.sections.flatMap((s) => s.lines);
    if (!allLines.length) return;

    setTranslating(true);
    try {
      const res = await translateLyrics({
        lines: allLines.map((l) => ({
          id: l.id,
          text: l.text,
          chords: l.chords.map((c) => ({
            chord: c.originalChord,
            time: c.time,
          })),
          words: l.words?.map((w) => ({
            word: w.word,
            start: w.start,
            end: w.end,
          })),
          startTime: l.startTime,
          endTime: l.endTime,
        })),
        targetLang: newTarget,
        sourceLang: sourceLang === "auto" ? undefined : sourceLang,
      });

      if (res.detectedSourceLangName && !detectedLangName) {
        setDetectedLangName(res.detectedSourceLangName);
      }

      const map: Record<string, TranslatedLine> = {};
      for (const tl of res.translatedLines) {
        map[tl.id] = tl;
      }
      setTranslations((prev) => ({ ...prev, [newTarget]: map }));
    } catch (e) {
      console.error("Translation error:", e);
    } finally {
      setTranslating(false);
    }
  };

  const handleSwapLanguages = () => {
    if (targetLang === "original") return;
    const oldTarget = targetLang;
    const oldSource = sourceLang === "auto" ? "en" : sourceLang;
    setSourceLang(oldTarget);
    handleTargetChange(oldSource);
  };

  const handleResetToOriginal = () => {
    setTargetLang("original");
  };

  const activeTranslationMap = targetLang !== "original" ? translations[targetLang] : null;

  const visibleSections = useMemo(() => {
    const rawSections = sheet.sections.map((s) => {
      const lines = s.lines.map((l) => {
        if (!activeTranslationMap || !activeTranslationMap[l.id]) return l;
        const trans = activeTranslationMap[l.id];
        return {
          ...l,
          text: trans.text,
          romanizedText: trans.romanizedText,
          chords: trans.chords.map((c) => ({
            originalChord: c.originalChord || c.chord,
            time: c.time,
            endTime: c.endTime ?? c.time + 1.5,
            charIndex: c.charIndex ?? 0,
            confidence: c.confidence ?? 1.0,
          })),
          words: trans.words?.map((w) => ({
            word: w.word,
            start: w.start,
            end: w.end,
            charStart: w.charStart ?? 0,
          })),
          romanizedWords: trans.romanizedWords?.map((rw) => ({
            word: rw.word,
            start: rw.start,
            end: rw.end,
            charStart: rw.charStart ?? 0,
          })),
        };
      });
      return { id: s.id, sectionId: s.id, name: s.name, lines };
    });

    if (expanded) return rawSections;

    const out: { id: string; sectionId: string; name: string; lines: (typeof rawSections)[number]["lines"] }[] = [];
    let left = PREVIEW_LINES;
    for (const s of rawSections) {
      if (left <= 0) break;
      const lines = s.lines.slice(0, left);
      left -= lines.length;
      out.push({ id: s.id, sectionId: s.sectionId, name: s.name, lines });
    }
    return out;
  }, [sheet, expanded, activeTranslationMap]);

  const { state: lyricsState } = useAutoLyrics({
    songRef: libraryId ?? `file:${fileName}`,
    fileName,
    analysis,
    sessionAudioUrl,
    hasLyrics: sheet.hasLyrics,
    onLyrics,
  });

  // Track playback time from the analysis player for real-time karaoke sync
  useEffect(() => {
    const getAudio = () =>
      (document.getElementById("analysis-audio-player") as HTMLAudioElement | null) ||
      document.querySelector("audio");

    const onUpdate = () => {
      const el = getAudio();
      if (el && !el.paused) {
        setCurrentTime(el.currentTime);
      }
    };

    const interval = setInterval(onUpdate, 100);
    const audio = getAudio();
    audio?.addEventListener("timeupdate", onUpdate);
    audio?.addEventListener("pause", onUpdate);
    audio?.addEventListener("ended", () => setCurrentTime(null));

    return () => {
      clearInterval(interval);
      audio?.removeEventListener("timeupdate", onUpdate);
      audio?.removeEventListener("pause", onUpdate);
    };
  }, []);

  // Compute active line and word index from currentTime
  const activeHit = useMemo(() => {
    if (currentTime === null) return null;
    const allSecs = visibleSections.map((s) => ({
      id: s.sectionId,
      name: s.name,
      lines: s.lines,
      instrumental: false,
    }));
    const hit = lineAt(allSecs as any, currentTime);
    if (!hit) return null;
    let wordIdx: number | null = null;
    if (hit.line.words && hit.line.words.length) {
      const found = hit.line.words.findIndex((w) => currentTime >= w.start - 0.05 && currentTime < w.end + 0.05);
      wordIdx = found >= 0 ? found : null;
    }
    const chord = [...hit.line.chords].reverse().find((c) => currentTime >= c.time) ?? hit.line.chords[0] ?? null;
    return {
      lineId: hit.line.id,
      chordTime: chord?.time ?? null,
      wordIndex: wordIdx,
    };
  }, [visibleSections, currentTime]);

  const firstStart = sheet.sections[0]?.lines.find((l) => l.startTime !== null)?.startTime ?? null;

  // Jump to time in place without leaving the Analysis page
  const playFrom = useCallback((t: number) => {
    window.dispatchEvent(new CustomEvent("wilsify:seek", { detail: { time: t, play: true } }));
    const audio =
      (document.getElementById("analysis-audio-player") as HTMLAudioElement | null) ||
      document.querySelector("audio");
    if (audio) {
      audio.currentTime = t;
      void audio.play().catch(() => {});
    }
  }, []);

  const threshold = analysis.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE;
  const hasChords = sheet.analysis.chordTimeline.length > 0;
  const hasMoreLines = totalLines > PREVIEW_LINES;

  return (
    <section
      aria-labelledby="sheet-preview-title"
      className="mt-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6 shadow-sm"
      style={{
        fontFamily: "'Plus Jakarta Sans', 'Inter', 'Noto Sans', 'Noto Sans Devanagari', system-ui, sans-serif",
      }}
    >
      {/* Header bar matching Image 1 */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sheet-preview-title" className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
            Chord & Lyric Sheet
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
            Key {displayKey(shownKey)} · {formatBpm(analysis)} BPM · {timeSignatureValue(analysis)} — built from this analysis, nothing is re-analysed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Font size control */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-0.5">
            <button
              type="button"
              onClick={() => setFontSizeDelta((d) => Math.max(-3, d - 1))}
              title="Decrease font size (A-)"
              className="rounded px-2 py-1 text-xs font-bold text-[var(--color-ns-muted)] hover:bg-white/[0.06] hover:text-[var(--color-ns-text)]"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontSizeDelta((d) => Math.min(6, d + 1))}
              title="Increase font size (A+)"
              className="rounded px-2 py-1 text-xs font-bold text-[var(--color-ns-muted)] hover:bg-white/[0.06] hover:text-[var(--color-ns-text)]"
            >
              A+
            </button>
          </div>

          <Link to="/practice" className="btn-secondary px-3.5 py-2 text-xs sm:text-sm">
            Practice
          </Link>

          {firstStart !== null && (
            <button
              type="button"
              onClick={() => playFrom(firstStart)}
              className="btn-secondary px-3.5 py-2 text-xs sm:text-sm"
            >
              ▶ Play From Here
            </button>
          )}
        </div>
      </div>

      {/* Google Translate-Style Language Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)]/80 p-2 sm:p-2.5">
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Left dropdown (Source Language) */}
          <div className="relative">
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="appearance-none rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-1.5 pr-7 text-xs font-semibold text-[var(--color-ns-text)] focus:border-[var(--color-ns-purple-light)] focus:outline-none cursor-pointer"
            >
              <option value="auto">
                ✨ Detect Language {detectedLangName ? `(${detectedLangName})` : "(Auto)"}
              </option>
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-2 text-[10px] text-[var(--color-ns-muted)]">▼</span>
          </div>

          {/* Swap Button (⇄) */}
          <button
            type="button"
            onClick={handleSwapLanguages}
            disabled={targetLang === "original"}
            title="Swap languages (⇄)"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-xs font-bold text-[var(--color-ns-muted)] hover:bg-white/[0.08] hover:text-[var(--color-ns-text)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ⇄
          </button>

          {/* Right dropdown (Target Language) */}
          <div className="relative">
            <select
              value={targetLang}
              onChange={(e) => handleTargetChange(e.target.value)}
              className="appearance-none rounded-lg border border-[var(--color-ns-purple-light)]/50 bg-[var(--color-ns-card)] px-3 py-1.5 pr-7 text-xs font-semibold text-[var(--color-ns-purple-light)] focus:border-[var(--color-ns-purple-light)] focus:outline-none cursor-pointer"
            >
              <option value="original">Original (No Translation)</option>
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-2 text-[10px] text-[var(--color-ns-purple-light)]">▼</span>
          </div>
        </div>

        {/* Translation Status & Controls */}
        <div className="flex items-center gap-2">
          {translating && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ns-purple-light)] animate-pulse">
              <span className="h-2 w-2 rounded-full bg-[var(--color-ns-purple-light)]" />
              Translating lyrics & aligning chords…
            </span>
          )}

          {targetLang !== "original" && NON_LATIN_LANGS.has(targetLang) && (
            <button
              type="button"
              onClick={() => setShowRomanized((r) => !r)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                showRomanized
                  ? "border-[var(--color-ns-cyan)]/50 bg-[var(--color-ns-cyan)]/15 text-[var(--color-ns-cyan)]"
                  : "border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
              }`}
              title="Toggle phonetic Romanized sing-along script"
            >
              Aa Romanized
            </button>
          )}

          {targetLang !== "original" && (
            <button
              type="button"
              onClick={handleResetToOriginal}
              className="rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-2.5 py-1 text-xs font-medium text-[var(--color-ns-muted)] hover:bg-white/[0.08] hover:text-[var(--color-ns-text)] transition-colors cursor-pointer"
              title="Restore original untranslated lyrics"
            >
              ↺ Original
            </button>
          )}
        </div>
      </div>

      {/* Status pills */}
      <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
        {!sheet.hasLyrics && lyricsState.status === "running" && (
          <span
            role="status"
            className="rounded-md border border-[var(--color-ns-purple-light)]/40 bg-[var(--color-ns-purple)]/10 px-2 py-0.5 text-[var(--color-ns-purple-light)]"
          >
            Transcribing lyrics from the audio… {Math.round(lyricsState.progress)}%
          </span>
        )}
        {!sheet.hasLyrics && lyricsState.status === "no-vocals" && (
          <span className="rounded-md border border-[var(--color-ns-border)] px-2 py-0.5 text-[var(--color-ns-muted)]">
            No singing detected — chords only.
          </span>
        )}
        {!sheet.hasLyrics && lyricsState.status === "failed" && (
          <span className="rounded-md border border-[var(--color-ns-border)] px-2 py-0.5 text-[var(--color-ns-muted)]">
            Chord analysis is available, but lyrics could not be generated.
          </span>
        )}
        {!sheet.hasLyrics && (lyricsState.status === "idle" || lyricsState.status === "needs-audio") && (
          <span className="rounded-md border border-[var(--color-ns-border)] px-2 py-0.5 text-[var(--color-ns-muted)]">
            Lyrics unavailable for this analysis — re-attach the audio to transcribe them.
          </span>
        )}
        {sheet.uncertainCount > 0 && (
          <span className="rounded-md border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 px-2 py-0.5 text-[var(--color-ns-amber)]">
            Some chords may need correction ({sheet.uncertainCount} marked ?)
          </span>
        )}
        {sheet.analysis.chordTimeline.some((s) => s.edited) && (
          <span className="rounded-md border border-[var(--color-ns-mint)]/40 bg-[var(--color-ns-mint)]/10 px-2 py-0.5 text-[var(--color-ns-mint)]">
            Includes your chord corrections
          </span>
        )}
      </div>

      {!hasChords ? (
        <p className="text-sm text-[var(--color-ns-muted)]">Chord detection wasn't confident enough for this song.</p>
      ) : (
        <div className="space-y-5">
          {visibleSections.map((s) => (
            <div key={s.sectionId}>
              {s.name && (
                <div className="mb-2">
                  <span className="inline-flex items-center rounded-lg border border-[var(--color-ns-purple-light)]/30 bg-[var(--color-ns-purple)]/10 px-2.5 py-0.5 font-heading text-[11px] font-bold uppercase tracking-widest text-[var(--color-ns-purple-light)] shadow-sm">
                    [{s.name}]
                  </span>
                </div>
              )}
              <div className="space-y-1">
                {s.lines.map((line) => (
                  <ChordLyricLine
                    key={line.id}
                    line={line}
                    options={options}
                    render={render}
                    isActiveLine={activeHit?.lineId === line.id}
                    activeChordTime={activeHit?.lineId === line.id ? activeHit.chordTime : null}
                    activeWordIndex={activeHit?.lineId === line.id ? activeHit.wordIndex : null}
                    selectedChord={NO_SELECTION}
                    lowConfidence={threshold}
                    canSeek
                    onSeek={playFrom}
                    onChord={(c) => playFrom(c.time)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* In-place expandable Show More / Show Less toggle */}
          {hasMoreLines && (
            <div className="mt-4 pt-3 border-t border-[var(--color-ns-border)]/60 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ns-purple-light)] hover:text-white transition-colors cursor-pointer"
              >
                <span>{expanded ? "Show less" : `Show all lines (${totalLines})`}</span>
                <span aria-hidden="true">{expanded ? "↑" : "↓"}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
