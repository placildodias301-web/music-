const WHITE_KEY_WIDTH = 26;
const WHITE_KEY_HEIGHT = 90;
const BLACK_KEY_WIDTH = 16;
const BLACK_KEY_HEIGHT = 56;

// One octave, C to B: pitch class -> {isBlack, whiteIndex (for black keys, the white key it sits after)}
const KEYS = [
  { pc: 0, name: "C", black: false },
  { pc: 1, name: "C#", black: true },
  { pc: 2, name: "D", black: false },
  { pc: 3, name: "D#", black: true },
  { pc: 4, name: "E", black: false },
  { pc: 5, name: "F", black: false },
  { pc: 6, name: "F#", black: true },
  { pc: 7, name: "G", black: false },
  { pc: 8, name: "G#", black: true },
  { pc: 9, name: "A", black: false },
  { pc: 10, name: "A#", black: true },
  { pc: 11, name: "B", black: false },
];

/** Renders one octave of a piano keyboard with the chord's notes highlighted. */
export function PianoRoll({ activePitchClasses }: { activePitchClasses: number[] }) {
  const whiteKeys = KEYS.filter((k) => !k.black);
  const width = whiteKeys.length * WHITE_KEY_WIDTH + 4;

  // Precompute horizontal slots instead of mutating counters during render
  // (render must stay pure). For a white key this is its own index among the
  // white keys; for a black key it is the index of the white key to its left.
  const slotByKey: number[] = [];
  {
    let seenWhite = -1;
    KEYS.forEach((key, i) => {
      if (!key.black) seenWhite += 1;
      slotByKey[i] = seenWhite;
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={width} height={WHITE_KEY_HEIGHT + 4}>
        {KEYS.map((key, i) => {
          const isActive = activePitchClasses.includes(key.pc);

          if (!key.black) {
            const x = slotByKey[i] * WHITE_KEY_WIDTH + 2;
            return (
              <g key={key.pc}>
                <rect
                  x={x}
                  y={2}
                  width={WHITE_KEY_WIDTH - 1}
                  height={WHITE_KEY_HEIGHT}
                  fill={isActive ? "var(--color-primary-light)" : "#f8fafc"}
                  stroke="#1e293b"
                  strokeWidth={1}
                  rx={2}
                />
                <text
                  x={x + (WHITE_KEY_WIDTH - 1) / 2}
                  y={WHITE_KEY_HEIGHT - 10}
                  fontSize="9"
                  textAnchor="middle"
                  fill={isActive ? "#fff" : "#0b1020"}
                >
                  {key.name}
                </text>
              </g>
            );
          }
          return null;
        })}

        {KEYS.map((key, i) => {
          if (!key.black) return null;
          const isActive = activePitchClasses.includes(key.pc);
          const x = slotByKey[i] * WHITE_KEY_WIDTH + 2 + WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;
          return (
            <rect
              key={key.pc}
              x={x}
              y={2}
              width={BLACK_KEY_WIDTH}
              height={BLACK_KEY_HEIGHT}
              fill={isActive ? "var(--color-cyan)" : "#0b1020"}
              stroke="#000"
              strokeWidth={0.5}
              rx={1.5}
            />
          );
        })}
      </svg>
      <p className="text-xs text-content-dim">Piano</p>
    </div>
  );
}
