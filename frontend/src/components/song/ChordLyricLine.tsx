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
}

interface Props {
  line: LyricLine;
  options: LineRenderOptions;
  /** Maps an analysed chord to what is shown (transpose / capo / simplify). */
  render: (originalChord: string) => string;
  isActiveLine: boolean;
  activeChordTime: number | null;
  selectedChord: string | null;
  lowConfidence: number;
  canSeek: boolean;
  onSeek: (time: number) => void;
  onChord: (event: ChordEvent) => void;
}

interface Word {
  text: string;
  chord: ChordEvent | null;
}

/**
 * One lyric line with its chords. Text is split into word columns, and a
 * chord is part of the column of the word it belongs to — so wrapping, font
 * size, zoom and transposing can never separate a chord from its word, and
 * no spaces are ever used to line things up.
 */
function ChordLyricLineImpl({ line, options, render, isActiveLine, activeChordTime, selectedChord, lowConfidence, canSeek, onSeek, onChord }: Props) {
  const words = useMemo<Word[]>(() => {
    const out: Word[] = [];
    for (const chunk of chunkLine(line.text, line.chords)) {
      const parts = chunk.text.split(/\s+/).filter(Boolean);
      if (!parts.length) out.push({ text: "", chord: chunk.chord });
      parts.forEach((p, i) => out.push({ text: p, chord: i === 0 ? chunk.chord : null }));
    }
    return out;
  }, [line.text, line.chords]);

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
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 ${isActiveLine ? "bg-[var(--color-ns-purple)]/10" : ""}`}
        style={{ lineHeight: lineSpacing, minHeight: chordSize * 1.8 }}
      >
        {line.startTime !== null && <span className="w-12 shrink-0 text-xs tabular-nums text-[var(--color-ns-dim)]">{formatTime(line.startTime)}</span>}
        {showChords ? line.chords.map((c) => <span key={`${c.time}-${c.originalChord}`}>{chordButton(c)}</span>) : <span className="text-xs text-[var(--color-ns-dim)]">(instrumental)</span>}
      </div>
    );
  }

  return (
    <div
      data-line-id={line.id}
      className={`rounded-lg px-2 transition-colors ${isActiveLine ? "bg-[var(--color-ns-purple)]/10" : ""}`}
      style={{ lineHeight: lineSpacing }}
    >
      <div
        role={seekable ? "button" : undefined}
        tabIndex={seekable ? 0 : undefined}
        onClick={seekable ? () => onSeek(line.startTime as number) : undefined}
        onKeyDown={seekable ? (e) => (e.key === "Enter" ? onSeek(line.startTime as number) : undefined) : undefined}
        className={`flex flex-wrap items-end gap-x-[0.45em] ${seekable ? "cursor-pointer" : ""}`}
        title={seekable ? `Jump to ${formatTime(line.startTime as number)}` : undefined}
      >
        {words.map((w, i) => (
          <span key={i} className="inline-flex flex-col items-start">
            {showChords && (
              <span className="flex items-end gap-1" style={{ minHeight: chordSize * 1.4 }} onClick={(e) => e.stopPropagation()}>
                {w.chord ? chordButton(w.chord) : null}
              </span>
            )}
            {showLyrics && w.text && (
              <span className={isActiveLine ? "text-[var(--color-ns-text)]" : "text-[var(--color-ns-muted)]"} style={{ fontSize: lyricSize }}>
                {w.text}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export const ChordLyricLine = memo(ChordLyricLineImpl);
