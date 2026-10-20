import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { ParsedChord } from "../../lib/chordTheory";
import { buildChordModel, type ChordSettings } from "../../lib/chords/model";
import { playArpeggio, playModel } from "../../lib/chords/play";
import { findDefinition } from "../../lib/instruments/definitions";
import { ChordDiagram } from "./ChordDiagram";

/** "C♯ minor seventh" — root spelled as the symbol writes it (B♭, not A♯). */
function chordDisplayName(chord: ParsedChord): string {
  const root = /^[A-G][#b♯♭]?/.exec(chord.label)?.[0] ?? "";
  return `${root.replace("#", "♯").replace("b", "♭")} ${chord.quality.name}`;
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
      className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
        selected
          ? "border border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)] font-bold shadow-sm"
          : "border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
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
  const [isPlaying, setIsPlaying] = useState(false);
  const definition = findDefinition(settings.definitionId);
  const model = useMemo(() => (definition ? buildChordModel(chord, definition, settings) : null), [chord, definition, settings]);
  if (!model || !definition) return null;
  const shapeCount = model.kind === "fretted" ? model.shapes.length : 0;
  const showInversion = model.kind === "keyboard" || model.kind === "mallet" || model.kind === "accordion";

  const handlePlayAudio = () => {
    setIsPlaying(true);
    playModel(model, shapeIndex);
    setTimeout(() => setIsPlaying(false), 2000);
  };

  return (
    <div className="group flex flex-col items-center justify-between rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5 shadow-sm transition-all hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]">
      {onExplore ? (
        <button
          type="button"
          onClick={() => onExplore(chord)}
          className="group/title flex flex-col items-center"
          title={`Explore ${chord.label} in depth`}
        >
          <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)] sm:text-xl group-hover/title:text-[var(--color-ns-amber)] transition-colors">
            {chord.label.replace(/^([A-G])#/, "$1♯").replace(/^([A-G])b/, "$1♭")}
          </h3>
          <p className="text-center text-[0.6875rem] capitalize text-[var(--color-ns-muted)]">{chordDisplayName(chord)}</p>
        </button>
      ) : (
        <>
          <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)] sm:text-xl">
            {chord.label.replace(/^([A-G])#/, "$1♯").replace(/^([A-G])b/, "$1♭")}
          </h3>
          <p className="text-center text-[0.6875rem] capitalize text-[var(--color-ns-muted)]">{chordDisplayName(chord)}</p>
        </>
      )}

      <div className="my-3 flex w-full flex-1 items-center justify-center">
        <ChordDiagram model={model} shapeIndex={shapeIndex} onShape={setShapeIndex} />
      </div>

      {shapeCount > 1 && (
        <div className="mb-2.5 flex items-center gap-1.5" role="group" aria-label={`${chord.label} voicings`}>
          {model.kind === "fretted" &&
            model.shapes.map((v, i) => (
              <button
                key={v.frets.join(",")}
                type="button"
                aria-label={`Voicing ${i + 1}: ${v.name}`}
                aria-pressed={i === shapeIndex % shapeCount}
                onClick={() => setShapeIndex(i)}
                className={`h-2 rounded-full transition-all ${i === shapeIndex % shapeCount ? "w-5 bg-[var(--color-ns-amber)]" : "w-2 bg-[var(--color-ns-border)] hover:bg-[var(--color-ns-border-strong)]"}`}
              />
            ))}
        </div>
      )}

      <p className="text-center font-mono text-[0.6875rem] text-[var(--color-ns-muted)]">{model.notes.join(" · ")}</p>
      <p className="mb-3 text-center font-mono text-[0.625rem] text-[var(--color-ns-dim)]">
        {model.formula}
        {showInversion && ` · ${model.inversionLabel}`}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={handlePlayAudio}
          aria-label={`Play ${chord.label} chord audio`}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[0.6875rem] font-medium transition-all active:scale-95 ${
            isPlaying
              ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)] font-bold shadow-sm"
              : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-amber)]/60 hover:text-[var(--color-ns-text)] hover:bg-[var(--color-ns-card)]"
          }`}
        >
          {isPlaying ? (
            <>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-ns-amber)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-ns-amber)]"></span>
              </span>
              <span>Playing</span>
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--color-ns-amber)]">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Play Audio</span>
            </>
          )}
        </button>
        {onExplore && (
          <button
            type="button"
            onClick={() => onExplore(chord)}
            className="flex items-center gap-1 rounded-xl border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 px-2.5 py-1.5 text-[0.6875rem] font-bold text-[var(--color-ns-amber)] transition-all hover:bg-[var(--color-ns-amber)] hover:text-[var(--color-ns-ink)] active:scale-95"
          >
            Explore
          </button>
        )}
        {model.kind === "bass" && (
          <button
            type="button"
            onClick={() => playArpeggio(model)}
            className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-1.5 text-[0.6875rem] font-medium text-[var(--color-ns-muted)] transition-all hover:border-[var(--color-ns-amber)]/60 hover:text-[var(--color-ns-text)] active:scale-95"
          >
            Play arpeggio
          </button>
        )}
      </div>
    </div>
  );
}
