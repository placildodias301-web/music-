import { useSettings } from "../../lib/settings/settingsContext";

export interface FretDot {
  /** Index of the string in the instrument's string order. */
  string: number;
  fret: number;
  label?: string;
}

/**
 * A fretboard for ANY number of strings: chord shapes (one fret per string, null = muted) or a run of numbered notes (arpeggio).
 * Which strings and notes it shows come entirely from the tuning the model was built with — nothing here knows about a particular instrument.
 */
export function FretboardDiagram({
  stringNames,
  frets,
  dots: dotsProp,
  drone,
  caption,
  ariaLabel,
  courses,
}: {
  stringNames: string[];
  /** Chord-shape mode: one entry per string. */
  frets?: (number | null)[];
  /** Arpeggio mode: explicit dots (several can share a string). */
  dots?: FretDot[];
  /** String that always rings open (banjo's high drone) — drawn dashed. */
  drone?: number;
  caption?: string;
  ariaLabel?: string;
  /** Per course, the strings it holds (semitone offsets): paired courses (mandolin, 12-string) are drawn as two strings. */
  courses?: number[][];
}) {
  const { settings } = useSettings();
  const n = stringNames.length;
  const dots: FretDot[] = dotsProp ?? (frets ?? []).flatMap((f, i) => (f !== null && f > 0 ? [{ string: i, fret: f }] : []));
  const states = frets ?? stringNames.map(() => null as number | null);

  const fretted = dots.map((d) => d.fret).filter((f) => f > 0);
  const minFret = fretted.length ? Math.min(...fretted) : 0;
  const maxFret = fretted.length ? Math.max(...fretted) : 0;
  const startFret = maxFret > 4 ? minFret - 1 : 0;
  const fretCount = Math.min(8, Math.max(4, maxFret - startFret));

  const spacing = n <= 4 ? 24 : n <= 6 ? 20 : 17;
  const fretSpacing = 26;
  const left = 22;
  const top = 34;
  const width = left * 2 + spacing * (n - 1);
  const height = top + fretSpacing * fretCount + 18;
  // Left-handed: mirror so the lowest string is on the right.
  const xOf = (s: number) => left + (settings.display.leftHanded ? n - 1 - s : s) * spacing;
  const strandX = (s: number) => {
    const k = courses?.[s]?.length ?? 1;
    return Array.from({ length: k }, (_, j) => xOf(s) + (j - (k - 1) / 2) * 5);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel ?? caption ?? "Chord diagram"}>
        {startFret > 0 && (
          <text x={2} y={top + fretSpacing / 2 + 4} fontSize="10" fill="var(--color-content-dim)">
            {startFret + 1}fr
          </text>
        )}
        <rect x={left} y={top} width={spacing * (n - 1)} height={startFret === 0 ? 3 : 1} fill="var(--color-content-muted)" />
        {Array.from({ length: fretCount + 1 }).map((_, i) => (
          <line key={i} x1={left} x2={left + spacing * (n - 1)} y1={top + i * fretSpacing} y2={top + i * fretSpacing} stroke="var(--color-content-dim)" strokeWidth={1} />
        ))}
        {stringNames.map((name, s) => (
          <g key={s}>
            {strandX(s).map((x, j) => (
              <line key={j} x1={x} x2={x} y1={top} y2={top + fretSpacing * fretCount} stroke="var(--color-content-dim)" strokeWidth={1} strokeDasharray={s === drone ? "3 3" : undefined} />
            ))}
            <text x={xOf(s)} y={height - 4} fontSize="9" textAnchor="middle" fill="var(--color-content-dim)">
              {name}
            </text>
          </g>
        ))}
        {!dotsProp &&
          states.map((f, s) =>
            f === null ? (
              <text key={`m${s}`} x={xOf(s)} y={top - 11} fontSize="12" textAnchor="middle" fill="var(--color-pink)">
                x
              </text>
            ) : f === 0 ? (
              <circle key={`o${s}`} cx={xOf(s)} cy={top - 13} r={4} fill="none" stroke="var(--color-green)" strokeWidth={1.5} />
            ) : null,
          )}
        {dots.map((d, i) => {
          const rel = d.fret - startFret;
          if (d.fret === 0) return <circle key={i} cx={xOf(d.string)} cy={top - 13} r={4} fill="none" stroke="var(--color-green)" strokeWidth={1.5} />;
          if (rel < 1 || rel > fretCount) return null;
          const cy = top + (rel - 0.5) * fretSpacing;
          return (
            <g key={i}>
              <circle cx={xOf(d.string)} cy={cy} r={dotsProp ? 8 : 7} fill="var(--color-primary-light)" />
              {d.label && (
                <text x={xOf(d.string)} y={cy + 3.5} fontSize="10" fontWeight="700" textAnchor="middle" fill="#fff">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {caption && <p className="text-xs text-content-dim">{caption}</p>}
    </div>
  );
}
