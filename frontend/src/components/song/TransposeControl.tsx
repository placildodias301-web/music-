interface Props {
  value: number;
  onChange: (n: number) => void;
}

const btn = "h-8 w-8 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-sm font-bold text-[var(--color-ns-text)] hover:border-[var(--color-ns-border-strong)] disabled:opacity-40";

/** − / + in semitones. Changes chord names only — never the stored timestamps. */
export function TransposeControl({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Transpose">
      <span className="mr-1 text-xs font-semibold text-[var(--color-ns-muted)]">Transpose</span>
      <button type="button" className={btn} onClick={() => onChange(Math.max(-11, value - 1))} aria-label="Transpose down one semitone" disabled={value <= -11}>−</button>
      <button type="button" onClick={() => onChange(0)} title="Reset to original key" className="min-w-10 rounded-lg px-2 py-1 text-center text-sm font-bold tabular-nums text-[var(--color-ns-text)]">
        {value > 0 ? `+${value}` : value}
      </button>
      <button type="button" className={btn} onClick={() => onChange(Math.min(11, value + 1))} aria-label="Transpose up one semitone" disabled={value >= 11}>+</button>
    </div>
  );
}
