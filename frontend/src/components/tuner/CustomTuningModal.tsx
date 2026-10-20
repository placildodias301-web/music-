import { useEffect, useId, useRef, useState } from "react";
import { newCustomId, validateCustomTuning } from "../../lib/tuner/customTunings";
import type { CustomTuning, TunerVariant, TuningPreset } from "../../lib/tuner/types";

/** Create a custom tuning for the current instrument (and manage the saved ones). */
export function CustomTuningModal({
  instrumentId,
  variant,
  basePreset,
  saved,
  onSave,
  onDelete,
  onClose,
}: {
  instrumentId: string;
  variant: TunerVariant;
  /** Notes the form starts with (the tuning that was selected). */
  basePreset: TuningPreset;
  saved: CustomTuning[];
  onSave: (tuning: CustomTuning) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState<string[]>(() => basePreset.strings.map((s) => s.note));
  const [errors, setErrors] = useState<string[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const mine = saved.filter((c) => c.variantId === variant.id);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit() {
    const result = validateCustomTuning({ name, instrumentId, variantId: variant.id, notes }, saved);
    setErrors(result.errors);
    if (!result.ok) return;
    onSave({ id: newCustomId(), name: name.trim(), instrumentId, variantId: variant.id, notes: result.notes });
  }

  const input =
    "w-full rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-2 text-sm text-[var(--color-ns-text)] focus-visible:border-[var(--color-ns-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple)]/40";

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-0 sm:place-items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <h2 id={titleId} className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
          Custom tuning
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">{variant.name} · one note per string, in the order the pegs are listed.</p>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]" htmlFor={`${titleId}-name`}>
          Name
        </label>
        <input id={`${titleId}-name`} ref={nameRef} className={`${input} mt-1`} value={name} maxLength={40} placeholder="My Drop C" onChange={(e) => setName(e.target.value)} />

        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]">Notes</p>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {notes.map((n, i) => (
            <div key={i}>
              <label className="mb-0.5 block text-[0.6875rem] text-[var(--color-ns-muted)]" htmlFor={`${titleId}-n${i}`}>
                String {variant.stringCount - i}
              </label>
              <input
                id={`${titleId}-n${i}`}
                className={`${input} text-center font-mono`}
                value={n}
                maxLength={4}
                placeholder="C2"
                onChange={(e) => setNotes((prev) => prev.map((x, k) => (k === i ? e.target.value : x)))}
              />
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[0.6875rem] text-[var(--color-ns-dim)]">Use letter, # or b, and octave: C#2, Eb3, F4.</p>

        {errors.length > 0 && (
          <ul role="alert" className="mt-3 list-disc space-y-0.5 rounded-lg bg-[var(--color-ns-red)]/10 py-2 pl-7 pr-3 text-xs text-[var(--color-ns-text)]">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] py-2.5 text-sm font-bold text-[var(--color-ns-text)]">
            Cancel
          </button>
          <button type="button" onClick={submit} className="btn-primary flex-1 py-2.5 text-sm font-bold">
            Save tuning
          </button>
        </div>

        {mine.length > 0 && (
          <div className="mt-5 border-t border-[var(--color-ns-border)] pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]">Saved for {variant.name}</p>
            <ul className="mt-2 space-y-1.5">
              {mine.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm text-[var(--color-ns-text)]">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{c.name}</span> <span className="font-mono text-xs text-[var(--color-ns-muted)]">{c.notes.join(" ")}</span>
                  </span>
                  <button type="button" onClick={() => onDelete(c.id)} className="text-xs font-semibold text-[var(--color-ns-red)] hover:underline" aria-label={`Delete ${c.name}`}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
