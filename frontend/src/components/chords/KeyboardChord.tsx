import { keyboardWindow } from "../../lib/chords/theory";
import type { KeyedNote } from "../../lib/chords/model";

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const isBlack = (midi: number) => !WHITE_PCS.includes(((midi % 12) + 12) % 12);
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/**
 * A multi-octave keyboard with the chord's notes lit — used for piano, keyboard, organ, synthesizer and the accordion's right hand.
 * With variant="bars" the same layout is drawn as separate bars (marimba, xylophone): naturals in the front row, accidentals raised behind.
 */
export function KeyboardChord({ keys, variant = "keys", caption }: { keys: KeyedNote[]; variant?: "keys" | "bars"; caption?: string }) {
  const midis = keys.map((k) => k.midi);
  const { from, to } = keyboardWindow(midis, 1);
  const whites: number[] = [];
  for (let m = from; m <= to; m++) if (!isBlack(m)) whites.push(m);
  const kw = 20;
  const width = whites.length * kw + 4;
  const bars = variant === "bars";
  const wh = bars ? 44 : 84;
  const bh = bars ? 36 : 52;
  const nameOf = (m: number) => keys.find((k) => k.midi === m)?.name;
  const lit = (m: number) => midis.includes(m);
  const slot = (m: number) => whites.filter((w) => w < m).length;

  return (
    <div className="flex w-full flex-col items-center gap-1">
      <svg viewBox={`0 0 ${width} ${bars ? wh + bh + 8 : wh + 6}`} className="h-auto w-full max-w-[420px]" role="img" aria-label={caption ?? "Chord notes on the keys"}>
        {whites.map((m) => {
          const x = slot(m) * kw + 2;
          const y = bars ? bh + 6 : 2;
          return (
            <g key={m}>
              <rect x={x} y={y} width={kw - (bars ? 3 : 1)} height={wh} rx={bars ? 4 : 2} fill={lit(m) ? "var(--color-primary-light)" : bars ? "#d9b98a" : "#f8fafc"} stroke={bars ? "#8a6a3c" : "#1e293b"} strokeWidth={1} />
              {(lit(m) || m % 12 === 0) && (
                <text x={x + (kw - 1) / 2} y={y + wh - 7} fontSize="8" textAnchor="middle" fontWeight={lit(m) ? 700 : 400} fill={lit(m) ? "#fff" : "#475569"}>
                  {lit(m) ? nameOf(m) : `C${Math.floor(m / 12) - 1}`}
                </text>
              )}
            </g>
          );
        })}
        {Array.from({ length: to - from + 1 }, (_, i) => from + i)
          .filter(isBlack)
          .map((m) => {
            const x = slot(m) * kw + 2 + kw - 6;
            return (
              <g key={m}>
                <rect x={x} y={bars ? 2 : 2} width={12} height={bh} rx={bars ? 4 : 1.5} fill={lit(m) ? "var(--color-cyan)" : bars ? "#7a5a30" : "#0b1020"} stroke={bars ? "#4a3318" : "#000"} strokeWidth={0.5} />
                {lit(m) && (
                  <text x={x + 6} y={bh - 6} fontSize="7" textAnchor="middle" fontWeight={700} fill="#fff">
                    {nameOf(m) ?? NAMES[m % 12]}
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
