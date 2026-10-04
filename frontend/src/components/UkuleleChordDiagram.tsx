const STRING_COUNT = 4;
const FRET_COUNT = 4;
const STRING_SPACING = 22;
const FRET_SPACING = 26;
const TOP_MARGIN = 26;
const LEFT_MARGIN = 14;

/** Renders one ukulele chord fingering (4-string, GCEA tuning) as an SVG diagram. */
export function UkuleleChordDiagram({ frets }: { frets: (number | null)[] }) {
  const frettedFrets = frets.filter((f): f is number => f !== null && f > 0);
  const minFret = frettedFrets.length ? Math.min(...frettedFrets) : 0;
  const maxFret = frettedFrets.length ? Math.max(...frettedFrets) : 0;
  // If the shape reaches past the first four frets, shift the diagram up
  // (like a real chord chart showing "starts at fret N").
  const startFret = maxFret > FRET_COUNT ? minFret - 1 : 0;

  const width = LEFT_MARGIN * 2 + STRING_SPACING * (STRING_COUNT - 1) + 16;
  const height = TOP_MARGIN + FRET_SPACING * FRET_COUNT + 12;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {startFret > 0 && (
          <text x={2} y={TOP_MARGIN + FRET_SPACING / 2} fontSize="11" fill="var(--color-content-dim)">
            {startFret + 1}fr
          </text>
        )}

        <rect
          x={LEFT_MARGIN}
          y={TOP_MARGIN}
          width={STRING_SPACING * (STRING_COUNT - 1)}
          height={startFret === 0 ? 3 : 1}
          fill="var(--color-content-muted)"
        />

        {Array.from({ length: FRET_COUNT + 1 }).map((_, i) => (
          <line
            key={`fret-${i}`}
            x1={LEFT_MARGIN}
            x2={LEFT_MARGIN + STRING_SPACING * (STRING_COUNT - 1)}
            y1={TOP_MARGIN + i * FRET_SPACING}
            y2={TOP_MARGIN + i * FRET_SPACING}
            stroke="var(--color-content-dim)"
            strokeWidth={1}
          />
        ))}

        {Array.from({ length: STRING_COUNT }).map((_, i) => (
          <line
            key={`string-${i}`}
            x1={LEFT_MARGIN + i * STRING_SPACING}
            x2={LEFT_MARGIN + i * STRING_SPACING}
            y1={TOP_MARGIN}
            y2={TOP_MARGIN + FRET_SPACING * FRET_COUNT}
            stroke="var(--color-content-dim)"
            strokeWidth={1}
          />
        ))}

        {frets.map((fret, stringIndex) => {
          const x = LEFT_MARGIN + stringIndex * STRING_SPACING;
          if (fret === null) {
            return (
              <text key={stringIndex} x={x - 4} y={TOP_MARGIN - 10} fontSize="12" fill="var(--color-pink)">
                x
              </text>
            );
          }
          if (fret === 0) {
            return (
              <circle
                key={stringIndex}
                cx={x}
                cy={TOP_MARGIN - 12}
                r={4}
                fill="none"
                stroke="var(--color-green)"
                strokeWidth={1.5}
              />
            );
          }
          const relativeFret = fret - startFret;
          if (relativeFret < 1 || relativeFret > FRET_COUNT) return null;
          const y = TOP_MARGIN + (relativeFret - 0.5) * FRET_SPACING;
          return <circle key={stringIndex} cx={x} cy={y} r={7} fill="var(--color-cyan)" />;
        })}
      </svg>
      <p className="text-xs text-content-dim">Ukulele</p>
    </div>
  );
}
