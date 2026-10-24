import { useMemo } from "react";
import { useSettings } from "../../lib/settings/settingsContext";
import { assignFingers, type FingeringResult } from "../../lib/chords/fingering";
import { type PlayedStringAnalysis } from "../../lib/chords/analysis";

export interface InteractiveChordDiagramProps {
  stringNames: string[];
  frets: (number | null)[];
  playedStrings: PlayedStringAnalysis[];
  selectedStringIndex: number | null;
  onSelectString: (stringIndex: number) => void;
  fingering?: FingeringResult;
  caption?: string;
  /** Per course, the strings it holds (semitone offsets). Courses with 2+ strings are drawn as pairs. */
  courses?: number[][];
  /** No frets (violin family): a plain fingerboard, finger dots placed by pitch, no fret lines or barres. */
  fretless?: boolean;
  dotDisplayMode?: "fingers" | "notes" | "intervals";
}

export function InteractiveChordDiagram({
  stringNames,
  frets,
  playedStrings,
  selectedStringIndex,
  onSelectString,
  fingering,
  caption,
  courses,
  fretless = false,
  dotDisplayMode = "fingers",
}: InteractiveChordDiagramProps) {
  const { settings } = useSettings();
  const n = stringNames.length;
  const fResult = useMemo(() => fingering || assignFingers(frets), [fingering, frets]);

  const frettedVals = frets.filter((f): f is number => f !== null && f > 0);
  const minFret = frettedVals.length ? Math.min(...frettedVals) : 0;
  const maxFret = frettedVals.length ? Math.max(...frettedVals) : 0;
  const startFret = !fretless && maxFret > 4 ? minFret - 1 : 0;
  const fretCount = fretless ? 5 : Math.min(8, Math.max(4, maxFret - startFret));

  const spacing = n <= 4 ? 32 : n <= 6 ? 26 : 22;
  const fretSpacing = 32;
  const left = 32;
  const top = 44;
  const width = left * 2 + spacing * (n - 1);
  const height = top + fretSpacing * fretCount + 28;

  // Left-handed support
  const isLeftHanded = settings.display.leftHanded;
  const xOf = (s: number) => left + (isLeftHanded ? n - 1 - s : s) * spacing;
  // Fretless: semitone n sits at 1 − 2^(−n/12) of the way along the string, so spacing narrows toward the bridge.
  const reach = Math.max(6, maxFret + 2);
  const fingerboardY = (n: number) => top + fretSpacing * fretCount * ((1 - Math.pow(2, -n / 12)) / (1 - Math.pow(2, -reach / 12)));
  const strandX = (s: number) => {
    const k = courses?.[s]?.length ?? 1;
    return Array.from({ length: k }, (_, j) => xOf(s) + (j - (k - 1) / 2) * 7);
  };

  return (
    <div className="flex flex-col items-center">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={caption || "Interactive chord diagram"}
        className="select-none"
      >
        {/* Nut or Start Fret Indicator */}
        {startFret > 0 ? (
          <text
            x={left - 18}
            y={top + fretSpacing / 2 + 5}
            fontSize="12"
            fontWeight="bold"
            fill="var(--color-ns-amber)"
            textAnchor="middle"
          >
            {startFret + 1}fr
          </text>
        ) : (
          <rect
            x={left}
            y={top - 4}
            width={spacing * (n - 1)}
            height={5}
            rx={1}
            fill="var(--color-ns-text)"
          />
        )}

        {/* Fingerboard: a plain board, no fret lines */}
        {fretless && (
          <rect x={left - 8} y={top} width={spacing * (n - 1) + 16} height={fretSpacing * fretCount} rx={3} fill="var(--color-ns-border)" opacity={0.25} />
        )}

        {/* Frets (horizontal lines) */}
        {!fretless && Array.from({ length: fretCount + 1 }).map((_, i) => (
          <line
            key={`fret-${i}`}
            x1={left}
            x2={left + spacing * (n - 1)}
            y1={top + i * fretSpacing}
            y2={top + i * fretSpacing}
            stroke="var(--color-ns-border)"
            strokeWidth={i === 0 && startFret === 0 ? 0 : 1.5}
          />
        ))}

        {/* Strings (vertical lines) */}
        {stringNames.map((name, s) => {
          const isSelected = selectedStringIndex === s;
          return (
            <g key={`str-${s}`}>
              {strandX(s).map((x, j) => (
                <line
                  key={j}
                  x1={x}
                  x2={x}
                  y1={top}
                  y2={top + fretSpacing * fretCount}
                  stroke={isSelected ? "var(--color-ns-amber)" : "var(--color-ns-border-strong)"}
                  strokeWidth={isSelected ? 2 : 1 + (n - 1 - s) * 0.3}
                />
              ))}
              <text
                x={xOf(s)}
                y={height - 8}
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
                fill={isSelected ? "var(--color-ns-amber)" : "var(--color-ns-muted)"}
              >
                {name}
              </text>
            </g>
          );
        })}

        {/* Barre bridges */}
        {!fretless && fResult.barres.map((barre, bIdx) => {
          const relFret = barre.fret - startFret;
          if (relFret < 1 || relFret > fretCount) return null;
          const cy = top + (relFret - 0.5) * fretSpacing;
          const x1 = Math.min(xOf(barre.fromString), xOf(barre.toString));
          const x2 = Math.max(xOf(barre.fromString), xOf(barre.toString));
          return (
            <rect
              key={`barre-${bIdx}`}
              x={x1 - 10}
              y={cy - 10}
              width={x2 - x1 + 20}
              height={20}
              rx={10}
              fill="var(--color-ns-amber)"
              opacity={0.3}
              className="pointer-events-none"
            />
          );
        })}

        {/* String Action Indicators at Top (Open 'O' or Muted 'X') */}
        {frets.map((fret, s) => {
          const isSelected = selectedStringIndex === s;
          const cx = xOf(s);
          const cy = top - 18;

          if (fret === null || fret < 0) {
            // Muted string 'X'
            return (
              <g
                key={`mute-${s}`}
                onClick={() => onSelectString(s)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectString(s);
                  }
                }}
                className="cursor-pointer outline-none transition-[filter] hover:[filter:drop-shadow(0_0_5px_var(--color-ns-amber))] focus-visible:[filter:drop-shadow(0_0_5px_var(--color-ns-amber))]"
              >
                <title>{`String ${n - s}: Muted (Click to inspect)`}</title>
                <circle cx={cx} cy={cy} r={9} fill="transparent" />
                <text
                  x={cx}
                  y={cy + 4}
                  fontSize="14"
                  fontWeight="bold"
                  textAnchor="middle"
                  fill="var(--color-ns-error, #f43f5e)"
                >
                  ✕
                </text>
              </g>
            );
          }

          if (fret === 0) {
            // Open string 'O'
            const stringInfo = playedStrings[s];
            const isRoot = stringInfo?.isRoot;
            return (
              <g
                key={`open-${s}`}
                onClick={() => onSelectString(s)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectString(s);
                  }
                }}
                className="cursor-pointer outline-none transition-[filter] hover:[filter:drop-shadow(0_0_5px_var(--color-ns-amber))] focus-visible:[filter:drop-shadow(0_0_5px_var(--color-ns-amber))]"
              >
                <title>{`String ${n - s}: Open ${stringInfo?.noteName || ""} (Click to play)`}</title>
                <circle
                  cx={cx}
                  cy={cy}
                  r={8}
                  fill={isSelected ? "var(--color-ns-amber)" : "transparent"}
                  stroke={isRoot ? "var(--color-ns-amber)" : "var(--color-ns-success, #10b981)"}
                  strokeWidth={isRoot ? 2.5 : 2}
                />
                {isSelected && (
                  <circle cx={cx} cy={cy} r={3} fill="var(--color-ns-ink, #000)" />
                )}
              </g>
            );
          }

          return null;
        })}

        {/* Fretted Dots */}
        {frets.map((fret, s) => {
          if (fret === null || fret <= 0) return null;
          const rel = fret - startFret;
          if (!fretless && (rel < 1 || rel > fretCount)) return null;

          const cx = xOf(s);
          const cy = fretless ? fingerboardY(fret) : top + (rel - 0.5) * fretSpacing;
          const isSelected = selectedStringIndex === s;
          const stringInfo = playedStrings[s];
          const isRoot = stringInfo?.isRoot;
          const finger = fResult.fingers[s];

          // Text to display inside the dot based on mode
          let dotLabel = "";
          if (dotDisplayMode === "fingers") {
            dotLabel = finger ? String(finger) : "";
          } else if (dotDisplayMode === "notes") {
            dotLabel = stringInfo?.noteName?.replace("#", "♯") || "";
          } else if (dotDisplayMode === "intervals") {
            dotLabel = stringInfo?.interval?.shortName || "";
          }

          return (
            <g
              key={`dot-${s}`}
              onClick={() => onSelectString(s)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectString(s);
                }
              }}
              className="cursor-pointer outline-none transition-[filter] hover:[filter:drop-shadow(0_0_5px_var(--color-ns-amber))] focus-visible:[filter:drop-shadow(0_0_5px_var(--color-ns-amber))]"
            >
              <title>{`String ${n - s}: ${fretless ? `${fret} semitones above the open string` : `Fret ${fret}`}, Note ${stringInfo?.noteName || ""} (Click to play)`}</title>
              {/* Highlight halo when selected */}
              {isSelected && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={15}
                  fill="none"
                  stroke="var(--color-ns-amber)"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />
              )}

              {/* Main dot circle */}
              <circle
                cx={cx}
                cy={cy}
                r={11}
                fill={isRoot ? "var(--color-ns-amber)" : "var(--color-ns-card, #1e293b)"}
                stroke={isRoot ? "#ffffff" : isSelected ? "var(--color-ns-amber)" : "var(--color-ns-text)"}
                strokeWidth={isRoot ? 2 : 1.5}
              />

              {/* Dot Label (Finger number / Note / Interval) */}
              <text
                x={cx}
                y={cy + 3.5}
                fontSize={dotLabel.length > 2 ? "9" : "11"}
                fontWeight="bold"
                textAnchor="middle"
                fill={isRoot ? "var(--color-ns-ink, #0f172a)" : "var(--color-ns-text)"}
              >
                {dotLabel}
              </text>
            </g>
          );
        })}
      </svg>

      {caption && (
        <p className="mt-2 text-xs font-semibold text-[var(--color-ns-muted)]">
          {caption}
        </p>
      )}
    </div>
  );
}
