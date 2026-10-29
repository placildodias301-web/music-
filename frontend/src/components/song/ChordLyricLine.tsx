import { memo, useMemo } from "react";
import { chunkLine } from "../../lib/song/align";
import type { ChordEvent, LyricLine } from "../../lib/song/model";
import { formatTime } from "../../lib/chordSync";
import { ChordBadge } from "./ChordBadge";

export interface LineRenderOptions {
  chordSize: number;
  lyricSize: number;
  lineSpacing: number;
  showChords: boolean;
  showLyrics: boolean;
  showRomanized?: boolean;
}

interface Props {
  line: LyricLine;
  options: LineRenderOptions;
  /** Maps an analysed chord to what is shown (transpose / capo / simplify). */
  render: (originalChord: string) => string;
  isActiveLine: boolean;
  activeChordTime: number | null;
  /** Active singing word index for karaoke-style synced highlighting. */
  activeWordIndex?: number | null;
  selectedChord: string | null;
  lowConfidence: number;
  canSeek: boolean;
  onSeek: (time: number) => void;
  onChord: (event: ChordEvent) => void;
}

interface WordCol {
  text: string;
  chord: ChordEvent | null;
  start: number | null;
  wordIndex: number;
  romanized?: string | null;
}

/**
 * Studio-Grade Chord + Lyric Line:
 * Font stack: 'Plus Jakarta Sans', 'Inter', 'Noto Sans', 'Noto Sans Devanagari', system-ui, sans-serif.
 * Chords in monospace bold badges with vibrant tonic/passing tones.
 * Karaoke word-by-word synced highlighting and click-to-seek on words and chords.
 */
function ChordLyricLineImpl({
  line,
  options,
  render,
  isActiveLine,
  activeChordTime,
  activeWordIndex,
  selectedChord,
  lowConfidence,
  canSeek,
  onSeek,
  onChord,
}: Props) {
  const words = useMemo<WordCol[]>(() => {
    const out: WordCol[] = [];
    let wIdx = 0;
    for (const chunk of chunkLine(line.text, line.chords)) {
      const parts = chunk.text.split(/\s+/).filter(Boolean);
      if (!parts.length) {
        out.push({ text: "", chord: chunk.chord, start: null, wordIndex: -1 });
      }
      parts.forEach((p, i) => {
        const timing = line.words && wIdx < line.words.length ? line.words[wIdx] : null;
        const romWord = line.romanizedWords && wIdx < line.romanizedWords.length ? line.romanizedWords[wIdx].word : null;
        out.push({
          text: p,
          chord: i === 0 ? chunk.chord : null,
          start: timing?.start ?? null,
          wordIndex: wIdx,
          romanized: romWord,
        });
        wIdx++;
      });
    }
    return out;
  }, [line.text, line.chords, line.words]);

  const { chordSize, lyricSize, lineSpacing, showChords, showLyrics } = options;
  const seekable = canSeek && line.startTime !== null;

  const chordButton = (c: ChordEvent) => (
    <ChordBadge
      label={render(c.originalChord)}
      colorKey={c.originalChord}
      fontSize={chordSize}
      active={activeChordTime !== null && c.time === activeChordTime && isActiveLine}
      selected={selectedChord === c.originalChord}
      uncertain={(c.confidence ?? 1) < lowConfidence}
      title={`${formatTime(c.time)}${canSeek ? " — click to jump here" : ""}${(c.confidence ?? 1) < lowConfidence ? " · low-confidence detection" : ""}`}
      onClick={() => onChord(c)}
    />
  );

  if (line.instrumental) {
    return (
      <div
        data-line-id={line.id}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-1.5 transition-all duration-150 ${
          isActiveLine
            ? "border-l-4 border-[var(--color-ns-purple-light)] bg-[var(--color-ns-purple)]/15 shadow-[inset_0_0_16px_rgba(139,92,246,0.08)]"
            : "border-l-4 border-transparent hover:bg-white/[0.02]"
        }`}
        style={{
          lineHeight: lineSpacing,
          minHeight: chordSize * 1.8,
          fontFamily: "'Plus Jakarta Sans', 'Inter', 'Noto Sans', 'Noto Sans Devanagari', system-ui, sans-serif",
        }}
      >
        {line.startTime !== null && (
          <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-[var(--color-ns-dim)]">
            {formatTime(line.startTime)}
          </span>
        )}
        {showChords ? (
          line.chords.map((c) => <span key={`${c.time}-${c.originalChord}`}>{chordButton(c)}</span>)
        ) : (
          <span className="text-xs text-[var(--color-ns-dim)]">(instrumental)</span>
        )}
      </div>
    );
  }

  return (
    <div
      data-line-id={line.id}
      className={`group relative rounded-xl px-3 py-1.5 transition-all duration-150 ${
        isActiveLine
          ? "border-l-4 border-[var(--color-ns-purple-light)] bg-[var(--color-ns-purple)]/15 shadow-[inset_0_0_16px_rgba(139,92,246,0.08)]"
          : "border-l-4 border-transparent hover:bg-white/[0.02]"
      }`}
      style={{
        lineHeight: lineSpacing,
        fontFamily: "'Plus Jakarta Sans', 'Inter', 'Noto Sans', 'Noto Sans Devanagari', system-ui, sans-serif",
      }}
    >
      <div
        role={seekable ? "button" : undefined}
        tabIndex={seekable ? 0 : undefined}
        onClick={seekable ? () => onSeek(line.startTime as number) : undefined}
        onKeyDown={seekable ? (e) => (e.key === "Enter" ? onSeek(line.startTime as number) : undefined) : undefined}
        className={`flex flex-wrap items-end gap-x-[0.5em] gap-y-1 ${seekable ? "cursor-pointer" : ""}`}
        title={seekable ? `Jump to line start ${formatTime(line.startTime as number)}` : undefined}
      >
        {words.map((w, i) => {
          const isCurrentWord =
            isActiveLine &&
            activeWordIndex !== null &&
            activeWordIndex !== undefined &&
            w.wordIndex >= 0 &&
            w.wordIndex === activeWordIndex;

          const handleWordClick = (e: React.MouseEvent) => {
            if (!canSeek) return;
            e.stopPropagation();
            if (w.start !== null) {
              onSeek(w.start);
            } else if (line.startTime !== null) {
              onSeek(line.startTime);
            }
          };

          return (
            <span key={i} className="inline-flex flex-col items-start">
              {showChords && (
                <span
                  className="flex items-end gap-1"
                  style={{ minHeight: chordSize * 1.4 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {w.chord ? chordButton(w.chord) : null}
                </span>
              )}
              {showLyrics && w.text && (
                <span className="flex flex-col">
                  <span
                    onClick={handleWordClick}
                    className={`rounded px-0.5 transition-all duration-100 ${
                      isCurrentWord
                        ? "font-bold text-[var(--color-ns-purple-light)] drop-shadow-[0_0_8px_rgba(167,139,250,0.6)] underline decoration-[var(--color-ns-purple)] decoration-2 underline-offset-4"
                        : isActiveLine
                        ? "text-[var(--color-ns-text)]"
                        : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                    } ${canSeek ? "hover:underline cursor-pointer" : ""}`}
                    style={{ fontSize: lyricSize }}
                    title={w.start !== null && canSeek ? `Jump to ${formatTime(w.start)}` : undefined}
                  >
                    {w.text}
                  </span>
                  {options.showRomanized && (w.romanized || line.romanizedText) && (
                    <span
                      onClick={handleWordClick}
                      className="text-[0.72em] font-normal tracking-wide text-[var(--color-ns-cyan)]/85 italic"
                      title="Phonetic Romanized"
                    >
                      {w.romanized || ""}
                    </span>
                  )}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export const ChordLyricLine = memo(ChordLyricLineImpl);
