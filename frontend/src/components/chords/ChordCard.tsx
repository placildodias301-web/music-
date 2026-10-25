import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { getVoicingBadge, NOTE_NAMES, type ParsedChord } from "../../lib/chordTheory";
import { buildChordModel, type ChordSettings } from "../../lib/chords/model";
import { playArpeggio, playModel, playModelArpeggio, usesSynthVoice } from "../../lib/chords/play";
import { usePlayback } from "./usePlayback";
import { findDefinition } from "../../lib/instruments/definitions";
import { ChordDiagram } from "./ChordDiagram";

/** "C♯ minor seventh" — root spelled as the symbol writes it (B♭, not A♯). */
function chordDisplayName(chord: ParsedChord): string {
  const root = /^[A-G][#b♯♭]?/.exec(chord.label)?.[0] ?? "";
  const bass = chord.slashBassNote ? ` · bass ${chord.slashBassNote.replace("#", "♯").replace("b", "♭")}` : "";
  return `${root.replace("#", "♯").replace("b", "♭")} ${chord.quality.name}${bass}`;
}

export function FilterPill({
  selected,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium transition-all ${
        selected
          ? "border border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-semibold shadow-sm"
          : "border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)] hover:bg-[var(--color-ns-raised)]"
      }`}
    >
      {children}
    </button>
  );
}

export function ChordCard({
  chord,
  settings,
  onExplore,
}: {
  chord: ParsedChord;
  settings: ChordSettings;
  onExplore?: (chord: ParsedChord) => void;
}) {
  const [shapeIndex, setShapeIndex] = useState(0);
  const playback = usePlayback();
  const isPlaying = playback.playing;
  const definition = findDefinition(settings.definitionId);
  const model = useMemo(() => (definition ? buildChordModel(chord, definition, settings) : null), [chord, definition, settings]);
  if (!model || !definition) return null;
  const shapeCount = model.kind === "fretted" ? model.shapes.length : 0;
  const showInversion = model.kind === "keyboard" || model.kind === "mallet" || model.kind === "accordion";
  const currentShape = model.kind === "fretted" ? model.shapes[shapeIndex % Math.max(shapeCount, 1)] : null;
  const voicingBadge = currentShape ? getVoicingBadge(currentShape.name, currentShape.frets) : null;
  const windBadge = model.kind === "wind" ? { label: "Arpeggiated Tones", type: "arpeggio" } : null;
  const harmBadge = model.kind === "harmonica"
    ? model.groups.length > 0
      ? { label: "Hole Group Chord", type: "open" }
      : { label: "Diatonic Arpeggio", type: "arpeggio" }
    : null;
  const badge = voicingBadge ?? windBadge ?? harmBadge;

  const handlePlayAudio = () => playback.run(() => playModel(model, shapeIndex));

  return (
    <div className="group flex h-full flex-col items-center justify-between rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-4 sm:p-5 shadow-sm transition-all hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]">
      {onExplore ? (
        <button
          type="button"
          onClick={() => onExplore(chord)}
          className="group/title flex flex-col items-center"
          title={`Explore ${chord.label} in depth`}
        >
          <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)] sm:text-xl group-hover/title:text-[var(--color-ns-amber)] transition-colors">
            {chord.label.replace(/^([A-G])#/, "$1♯").replace(/^([A-G])b/, "$1♭").replace(/\/([A-G])#/, "/$1♯")}
          </h3>
          <p className="text-center text-[0.6875rem] capitalize text-[var(--color-ns-muted)]">{chordDisplayName(chord)}</p>
          {typeof settings.capo === "number" && settings.capo > 0 && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-300 border border-amber-500/30">
              Sounds as {NOTE_NAMES[(chord.root + settings.capo) % 12]}{chord.quality.suffix} (Capo {settings.capo})
            </span>
          )}
          {badge && (
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ${
                badge.type === "open"
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : badge.type === "barre"
                  ? "border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/10 text-[var(--color-ns-amber)]"
                  : "border border-sky-500/30 bg-sky-500/10 text-sky-400"
              }`}
            >
              {badge.label}
            </span>
          )}
        </button>
      ) : (
        <>
          <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)] sm:text-xl">
            {chord.label.replace(/^([A-G])#/, "$1♯").replace(/^([A-G])b/, "$1♭")}
          </h3>
          <p className="text-center text-[0.6875rem] capitalize text-[var(--color-ns-muted)]">{chordDisplayName(chord)}</p>
          {typeof settings.capo === "number" && settings.capo > 0 && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-300 border border-amber-500/30">
              Sounds as {NOTE_NAMES[(chord.root + settings.capo) % 12]}{chord.quality.suffix} (Capo {settings.capo})
            </span>
          )}
          {badge && (
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ${
                badge.type === "open"
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : badge.type === "barre"
                  ? "border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/10 text-[var(--color-ns-amber)]"
                  : "border border-sky-500/30 bg-sky-500/10 text-sky-400"
              }`}
            >
              {badge.label}
            </span>
          )}
        </>
      )}

      <div className="my-3 flex w-full flex-1 items-center justify-center">
        <ChordDiagram model={model} shapeIndex={shapeIndex} onShape={setShapeIndex} />
      </div>

      {shapeCount > 1 && (
        <div className="mb-2.5 flex w-full max-w-[15rem] items-center justify-between px-1" role="group" aria-label={`${chord.label} voicings`}>
          <button
            type="button"
            onClick={() => setShapeIndex((i) => (i - 1 + shapeCount) % shapeCount)}
            className="flex h-5 w-5 items-center justify-center rounded text-sm font-bold text-[var(--color-ns-muted)] hover:bg-[var(--color-ns-bg)] hover:text-[var(--color-ns-text)]"
            aria-label="Previous voicing"
          >
            ‹
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6562rem] font-medium text-[var(--color-ns-muted)]">
              Voicing {((shapeIndex % shapeCount) + shapeCount) % shapeCount + 1} of {shapeCount}
            </span>
            <div className="flex items-center gap-1">
              {model.kind === "fretted" &&
                model.shapes.map((v, i) => (
                  <button
                    key={v.frets.join(",")}
                    type="button"
                    aria-label={`Voicing ${i + 1}: ${v.name}`}
                    aria-pressed={i === shapeIndex % shapeCount}
                    onClick={() => setShapeIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === shapeIndex % shapeCount
                        ? "w-3.5 bg-[var(--color-ns-amber)]"
                        : "w-1.5 bg-[var(--color-ns-border)] hover:bg-[var(--color-ns-border-strong)]"
                    }`}
                  />
                ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShapeIndex((i) => (i + 1) % shapeCount)}
            className="flex h-5 w-5 items-center justify-center rounded text-sm font-bold text-[var(--color-ns-muted)] hover:bg-[var(--color-ns-bg)] hover:text-[var(--color-ns-text)]"
            aria-label="Next voicing"
          >
            ›
          </button>
        </div>
      )}

      <p className="text-center font-mono text-[0.6875rem] text-[var(--color-ns-muted)]">{model.notes.join(" · ")}</p>
      <p className="mb-3 text-center font-mono text-[0.625rem] text-[var(--color-ns-dim)]">
        {model.formula}
        {showInversion && ` · ${model.inversionLabel}`}
      </p>

      <div className="mt-auto pt-3 flex flex-wrap items-center justify-center gap-2 w-full border-t border-[var(--color-ns-border)]/50">
        <button
          type="button"
          onClick={handlePlayAudio}
          aria-label={`Play ${chord.label} chord audio`}
          className={`flex h-8 w-28 items-center justify-center gap-1.5 rounded-full border text-[0.6875rem] font-medium transition-colors ${
            isPlaying
              ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)] font-bold"
              : "border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-amber)]/60 hover:text-[var(--color-ns-text)] hover:bg-[var(--color-ns-raised)]"
          }`}
        >
          {/* Same size and label whether idle or playing, so the button never shifts. */}
          <span className="flex h-2.5 w-2.5 items-center justify-center">
            {isPlaying ? (
              <span className="h-2 w-2 rounded-full bg-[var(--color-ns-amber)]" />
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--color-ns-amber)]">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </span>
          <span>Play Audio</span>
        </button>
        {onExplore && (
          <button
            type="button"
            onClick={() => onExplore(chord)}
            className="flex h-8 w-20 items-center justify-center rounded-full border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 text-[0.6875rem] font-bold text-[var(--color-ns-amber)] transition-colors hover:bg-[var(--color-ns-amber)] hover:text-[var(--color-ns-ink)]"
          >
            Explore
          </button>
        )}
        {usesSynthVoice(definition.id) && (
          <button
            type="button"
            onClick={() => playback.run(() => playModelArpeggio(model, shapeIndex))}
            aria-label={`Play ${chord.label} one note at a time`}
            className="flex h-8 items-center justify-center rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] px-3 text-[0.6875rem] font-medium text-[var(--color-ns-muted)] transition-colors hover:border-[var(--color-ns-amber)]/60 hover:text-[var(--color-ns-text)]"
          >
            One by one
          </button>
        )}
        {model.kind === "bass" && (
          <button
            type="button"
            onClick={() => playback.run(() => playArpeggio(model))}
            aria-label={`Play ${chord.label} arpeggio`}
            className="flex h-8 items-center justify-center rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] px-3 text-[0.6875rem] font-medium text-[var(--color-ns-muted)] transition-colors hover:border-[var(--color-ns-amber)]/60 hover:text-[var(--color-ns-text)]"
          >
            Play arpeggio
          </button>
        )}
      </div>
    </div>
  );
}
