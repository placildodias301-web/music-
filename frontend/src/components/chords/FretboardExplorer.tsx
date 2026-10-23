import { useState } from "react";
import { NOTE_NAMES, type ParsedChord } from "../../lib/chordTheory";
import { midiToFrequency } from "../../lib/theory/notes";
import { audioEngine } from "../../lib/audio";
import { useSettings } from "../../lib/settings/settingsContext";

export interface FretboardExplorerProps {
  chord: ParsedChord;
  tuningMidi: number[];
  stringNames?: string[];
  activeShapeFrets?: (number | null)[];
  instrument?: string;
  /** How many frets to draw (24 on a guitar, fewer on a ukulele or mandolin). */
  numFrets?: number;
  /** Heading name: "Fretboard", or "Fingerboard" for fretless instruments. */
  boardName?: string;
  onNoteClick?: (info: {
    stringIndex: number;
    fret: number;
    note: string;
    midi: number;
    frequencyHz: number;
    isRoot: boolean;
  }) => void;
}

type FilterMode = "chord-tones" | "root-only" | "active-shape" | "all-notes";
type LabelMode = "notes" | "intervals" | "degrees";

const FRET_MARKERS_SINGLE = [3, 5, 7, 9, 15, 17, 19, 21];
const FRET_MARKERS_DOUBLE = [12, 24];

export function FretboardExplorer({
  chord,
  tuningMidi,
  stringNames: _stringNames,
  activeShapeFrets,
  instrument = "guitar",
  numFrets = 24,
  boardName = "Fretboard",
  onNoteClick,
}: FretboardExplorerProps) {
  const { settings } = useSettings();
  const [filterMode, setFilterMode] = useState<FilterMode>("chord-tones");
  const [labelMode, setLabelMode] = useState<LabelMode>("notes");
  const [useFlats, setUseFlats] = useState(false);

  const numStrings = tuningMidi.length;
  const isLeftHanded = settings.display.leftHanded;

  // Chord tones pitch classes
  const chordTones = new Set(
    chord.quality.tones.map(([st]) => (chord.root + st) % 12)
  );

  // Interval short names mapping
  const intervalByPc = new Map<number, string>();
  for (const [st, deg] of chord.quality.tones) {
    const pc = (chord.root + st) % 12;
    const name = st === 0 ? "R" : deg ? String(deg) : String(st);
    intervalByPc.set(pc, name);
  }

  const handleCellClick = (sIdx: number, fret: number) => {
    const midi = tuningMidi[sIdx] + fret;
    const pc = midi % 12;
    const note = NOTE_NAMES[pc];
    const freq = midiToFrequency(midi);
    const isRoot = pc === chord.root;

    const inst = instrument === "bass" ? "bass" : instrument === "ukulele" ? "ukulele" : "guitar";
    audioEngine.playNote({
      midi,
      stringIndex: sIdx,
      totalStrings: numStrings,
      fret,
      isOpen: fret === 0,
      instrument: inst,
    });

    if (onNoteClick) {
      onNoteClick({
        stringIndex: sIdx,
        fret,
        note,
        midi,
        frequencyHz: freq,
        isRoot,
      });
    }
  };

  const fretWidth = 44;
  const stringHeight = 28;
  const nutWidth = 10;
  const totalWidth = nutWidth + numFrets * fretWidth + 40;
  const totalHeight = (numStrings + 1) * stringHeight + 20;

  // Render fretboard SVG
  return (
    <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-4">
        <div>
          <h4 className="font-heading text-sm font-bold text-[var(--color-ns-text)]">
            Full {numFrets}-{boardName === "Fretboard" ? "Fret Fretboard" : "Position Fingerboard"} Explorer
          </h4>
          <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
            Click any fret position to play the note and view its harmonic interval.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Display Mode */}
          <div className="flex items-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-xs">
            {(
              [
                ["chord-tones", "Chord Tones"],
                ["active-shape", "Shape Only"],
                ["root-only", "Roots"],
                ["all-notes", "All Notes"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`rounded-lg px-2.5 py-1 text-[0.6875rem] font-semibold transition-all ${
                  filterMode === mode
                    ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                    : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Labels Toggle */}
          <div className="flex items-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-xs">
            <button
              type="button"
              onClick={() => setLabelMode("notes")}
              className={`rounded-lg px-2 py-1 text-[0.6875rem] font-semibold ${
                labelMode === "notes"
                  ? "bg-[var(--color-ns-border-strong)] text-[var(--color-ns-text)] font-bold"
                  : "text-[var(--color-ns-muted)]"
              }`}
            >
              Notes
            </button>
            <button
              type="button"
              onClick={() => setLabelMode("intervals")}
              className={`rounded-lg px-2 py-1 text-[0.6875rem] font-semibold ${
                labelMode === "intervals"
                  ? "bg-[var(--color-ns-border-strong)] text-[var(--color-ns-text)] font-bold"
                  : "text-[var(--color-ns-muted)]"
              }`}
            >
              Intervals
            </button>
            <button
              type="button"
              onClick={() => setUseFlats((f) => !f)}
              className="rounded-lg px-2 py-1 text-[0.6875rem] font-semibold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)] border-l border-[var(--color-ns-border)]"
            >
              {useFlats ? "♭" : "♯"}
            </button>
          </div>
        </div>
      </div>

      {/* Horizontally scrollable fretboard */}
      <div className="mt-4 overflow-x-auto pb-2">
        <svg
          width={totalWidth}
          height={totalHeight}
          viewBox={`0 0 ${totalWidth} ${totalHeight}`}
          className="select-none min-w-[900px]"
        >
          {/* Fret marker dots on wood */}
          {FRET_MARKERS_SINGLE.filter((f) => f <= numFrets).map((fret) => {
            const cx = nutWidth + (fret - 0.5) * fretWidth;
            const cy = (totalHeight - 20) / 2;
            return (
              <circle
                key={`single-${fret}`}
                cx={cx}
                cy={cy}
                r={4}
                fill="var(--color-ns-border-strong)"
                opacity={0.6}
              />
            );
          })}

          {FRET_MARKERS_DOUBLE.filter((f) => f <= numFrets).map((fret) => {
            const cx = nutWidth + (fret - 0.5) * fretWidth;
            return (
              <g key={`double-${fret}`}>
                <circle
                  cx={cx}
                  cy={stringHeight * 1.5}
                  r={3.5}
                  fill="var(--color-ns-border-strong)"
                  opacity={0.6}
                />
                <circle
                  cx={cx}
                  cy={stringHeight * (numStrings - 1.5)}
                  r={3.5}
                  fill="var(--color-ns-border-strong)"
                  opacity={0.6}
                />
              </g>
            );
          })}

          {/* Frets (vertical lines) */}
          {Array.from({ length: numFrets + 1 }).map((_, f) => {
            const x = nutWidth + f * fretWidth;
            const isNut = f === 0;
            return (
              <g key={`fret-${f}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={10}
                  y2={numStrings * stringHeight}
                  stroke={isNut ? "var(--color-ns-text)" : "var(--color-ns-border)"}
                  strokeWidth={isNut ? 4 : 1.5}
                />
                {f > 0 && (
                  <text
                    x={x - fretWidth / 2}
                    y={numStrings * stringHeight + 16}
                    fontSize="10"
                    fontWeight="600"
                    textAnchor="middle"
                    fill="var(--color-ns-muted)"
                  >
                    {f}
                  </text>
                )}
              </g>
            );
          })}

          {/* Strings (horizontal lines) */}
          {tuningMidi.map((_, s) => {
            // Visual order: top line is high string, bottom line is low string
            const displayIndex = isLeftHanded ? s : numStrings - 1 - s;
            const y = (displayIndex + 0.5) * stringHeight + 5;
            const strThickness = 1 + s * 0.4;

            return (
              <line
                key={`str-line-${s}`}
                x1={nutWidth}
                x2={nutWidth + numFrets * fretWidth}
                y1={y}
                y2={y}
                stroke="var(--color-ns-border-strong)"
                strokeWidth={strThickness}
              />
            );
          })}

          {/* Note Dots */}
          {tuningMidi.map((openMidi, sIdx) => {
            const displayIndex = isLeftHanded ? sIdx : numStrings - 1 - sIdx;
            const cy = (displayIndex + 0.5) * stringHeight + 5;

            return Array.from({ length: numFrets + 1 }).map((_, fret) => {
              const midi = openMidi + fret;
              const pc = midi % 12;
              const isRoot = pc === chord.root;
              const isChordTone = chordTones.has(pc);
              const isActiveShapeNote =
                activeShapeFrets && activeShapeFrets[sIdx] === fret;

              // Filter logic
              let showDot = false;
              if (filterMode === "all-notes") {
                showDot = true;
              } else if (filterMode === "root-only") {
                showDot = isRoot;
              } else if (filterMode === "chord-tones") {
                showDot = isChordTone;
              } else if (filterMode === "active-shape") {
                showDot = !!isActiveShapeNote;
              }

              if (!showDot) return null;

              const cx = fret === 0 ? nutWidth / 2 : nutWidth + (fret - 0.5) * fretWidth;
              const rawName = NOTE_NAMES[pc];
              const noteLabel = useFlats
                ? rawName.replace("#", "b")
                : rawName.replace("#", "♯");
              const intervalLabel = isRoot ? "R" : intervalByPc.get(pc) || "";
              const text = labelMode === "intervals" ? intervalLabel : noteLabel;

              return (
                <g
                  key={`dot-${sIdx}-${fret}`}
                  onClick={() => handleCellClick(sIdx, fret)}
                  className="cursor-pointer transition-[filter] hover:[filter:drop-shadow(0_0_5px_var(--color-ns-amber))]"
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isActiveShapeNote ? 11 : isRoot ? 10 : 9}
                    fill={
                      isRoot
                        ? "var(--color-ns-amber)"
                        : isActiveShapeNote
                        ? "var(--color-ns-border-strong)"
                        : isChordTone
                        ? "var(--color-ns-card)"
                        : "var(--color-ns-bg)"
                    }
                    stroke={
                      isActiveShapeNote
                        ? "var(--color-ns-amber)"
                        : isRoot
                        ? "#ffffff"
                        : "var(--color-ns-border-strong)"
                    }
                    strokeWidth={isActiveShapeNote ? 2.5 : isRoot ? 2 : 1}
                  />
                  <text
                    x={cx}
                    y={cy + 3.5}
                    fontSize={text.length > 2 ? "8" : "9"}
                    fontWeight="bold"
                    textAnchor="middle"
                    fill={isRoot ? "var(--color-ns-ink)" : "var(--color-ns-text)"}
                  >
                    {text}
                  </text>
                </g>
              );
            });
          })}
        </svg>
      </div>
    </div>
  );
}
