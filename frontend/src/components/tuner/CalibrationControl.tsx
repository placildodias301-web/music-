import { A4_DEFAULT, A4_MAX, A4_MIN, clampA4 } from "../../lib/tuner/notes";

/** A4 reference pitch: − / + in 1 Hz steps (415–466 Hz). Every target frequency follows it. */
export function CalibrationControl({ a4, onChange }: { a4: number; onChange: (value: number) => void }) {
  const step = (d: number) => onChange(clampA4(a4 + d));
  const btn =
    "grid h-9 w-9 place-items-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-sm font-bold text-[var(--color-ns-text)] transition-colors hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ns-amber)]";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--color-ns-muted)]" role="group" aria-label="A4 calibration">
      <span className="font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]">A4</span>
      <button type="button" className={btn} aria-label="Lower A4 by 1 Hz" disabled={a4 <= A4_MIN} onClick={() => step(-1)}>
        −
      </button>
      <span className="min-w-[4.5rem] text-center font-mono text-sm font-bold tabular-nums text-[var(--color-ns-text)]" aria-live="polite">
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
            className={`rounded-lg border px-2 py-1 font-mono text-xs tabular-nums transition-all ${
              a4 === hz
                ? "border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)] font-bold shadow-sm"
                : "border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            {hz}
          </button>
        ))}
      </span>
      {a4 !== A4_DEFAULT && (
        <button type="button" onClick={() => onChange(A4_DEFAULT)} className="font-semibold text-[var(--color-ns-amber)] hover:underline ml-1">
          Reset
        </button>
      )}
    </div>
  );
}
