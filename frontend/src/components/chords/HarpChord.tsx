import { accidentalSymbol } from "../../lib/tuner/harp";
import type { HarpModel } from "../../lib/chords/model";

/**
 * A harp with the chord's strings highlighted. There is no fretboard: a harp plays the notes of the chord on whichever
 * strings carry them, and the levers or pedals must be set so those letters sound the right accidental.
 */
export function HarpChord({ model }: { model: HarpModel }) {
  const n = model.strings.length;
  const sw = n > 40 ? 6.4 : 8.5;
  const width = n * sw + 8;
  const hMax = 150;
  const hMin = 50;
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <svg viewBox={`0 0 ${width} ${hMax + 24}`} className="h-auto w-full max-w-[460px]" role="img" aria-label={`Harp strings for ${model.chord.label}: ${model.notes.join(", ")}`}>
        {model.strings.map((s, i) => {
          const x = 4 + i * sw + sw / 2;
          const len = hMax - ((hMax - hMin) * i) / Math.max(n - 1, 1);
          const y0 = 4 + (hMax - len);
          const isC = s.letter === "C";
          const isF = s.letter === "F";
          const stroke = s.inChord ? "var(--color-ns-amber, #f5a524)" : isC ? "var(--color-coral, #e5604d)" : isF ? "var(--color-cyan, #38bdf8)" : "var(--color-content-dim)";
          return (
            <g key={s.id}>
              <line x1={x} x2={x} y1={y0} y2={hMax + 4} stroke={stroke} strokeWidth={s.inChord ? 2.2 : 1} opacity={s.inChord || isC || isF ? 1 : 0.55} />
              {s.inChord && <circle cx={x} cy={y0} r={2.6} fill="var(--color-ns-amber, #f5a524)" />}
              {isC && <text x={x} y={hMax + 16} fontSize="5.5" textAnchor="middle" fill="var(--color-content-dim)">{`C${s.octave}`}</text>}
            </g>
          );
        })}
      </svg>
      <p className="text-center text-[0.6875rem] text-[var(--color-ns-muted)]">
        {model.rangeName} · {n} strings · red = C, blue = F, amber = chord notes
      </p>
      <p className="text-center text-[0.6875rem] font-mono text-[var(--color-ns-text)]">
        Set: {model.needs.map((x) => `${x.letter}${accidentalSymbol(x.accidental)}`).join("  ")}
      </p>
      {model.conflict && (
        <p className="text-center text-[0.6875rem] text-[var(--color-ns-amber)]">
          This chord needs {model.conflict} in two different positions at once, which a harp cannot do. Play it with a respelled version.
        </p>
      )}
      {model.blocked.length > 0 && (
        <p className="text-center text-[0.6875rem] text-[var(--color-ns-amber)]">
          {model.blocked.join(", ")} cannot be raised or lowered on this harp, so that string is left out.
        </p>
      )}
    </div>
  );
}
