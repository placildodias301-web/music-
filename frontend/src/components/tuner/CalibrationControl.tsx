import { A4_DEFAULT, A4_MAX, A4_MIN, clampA4 } from "../../lib/tuner/notes";

/** A4 reference pitch: − / + in 1 Hz steps (415–466 Hz). Every target frequency follows it. */
export function CalibrationControl({ a4, onChange }: { a4: number; onChange: (value: number) => void }) {
  const step = (d: number) => onChange(clampA4(a4 + d));
  const btn =
    "grid h-8 w-8 place-items-center rounded-lg border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] text-base font-bold text-[var(--color-ns-text)] transition-colors hover:border-[var(--color-ns-purple-light)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--color-ns-muted)]" role="group" aria-label="A4 calibration">
      <span className="font-semibold uppercase tracking-wider">A4</span>
      <button type="button" className={btn} aria-label="Lower A4 by 1 Hz" disabled={a4 <= A4_MIN} onClick={() => step(-1)}>
        −
      </button>
      <span className="min-w-[4.5rem] text-center font-mono text-sm tabular-nums text-[var(--color-ns-text)]" aria-live="polite">
        {a4} Hz
      </span>
      <button type="button" className={btn} aria-label="Raise A4 by 1 Hz" disabled={a4 >= A4_MAX} onClick={() => step(1)}>
        +
      </button>
      <span className="ml-1 flex items-center gap-1" role="group" aria-label="Common reference pitches">
        {[440, 441, 442, 443, 444].map((hz) => (
          <button
            key={hz}
            type="button"
            aria-pressed={a4 === hz}
            onClick={() => onChange(hz)}
            className={`rounded-md border px-1.5 py-0.5 font-mono text-[0.6875rem] tabular-nums transition-colors ${
              a4 === hz ? "border-[var(--color-ns-purple-light)] bg-[var(--color-ns-purple)]/20 text-[var(--color-ns-text)]" : "border-[var(--color-ns-border)] hover:border-[var(--color-ns-border-strong)]"
            }`}
          >
            {hz}
          </button>
        ))}
      </span>
      {a4 !== A4_DEFAULT && (
        <button type="button" onClick={() => onChange(A4_DEFAULT)} className="font-semibold text-[var(--color-ns-purple-light)] hover:underline">
          Reset
        </button>
      )}
    </div>
  );
}
