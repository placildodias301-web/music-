import { useState } from "react";
import { bassOptions, type BassModel } from "../../lib/chords/model";
import { FretboardDiagram } from "./FretboardDiagram";

type Mode = "shape" | "arpeggio";

/**
 * Bass: a CHORD SHAPE (notes sounded together — usually just two or three on bass) is kept clearly apart from an ARPEGGIO
 * (the same tones played one after another, numbered in playing order).
 */
export function BassChord({ model, shapeIndex, onShape }: { model: BassModel; shapeIndex: number; onShape: (i: number) => void }) {
  const [mode, setMode] = useState<Mode>("shape");
  const options = bassOptions(model);
  const current = options[shapeIndex % Math.max(options.length, 1)];

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div role="tablist" aria-label="Bass display" className="flex gap-1 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-0.5">
        {(["shape", "arpeggio"] as Mode[]).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-md px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-wide ${mode === m ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)]" : "text-[var(--color-ns-muted)]"}`}>
            {m === "shape" ? "Chord shape" : "Arpeggio"}
          </button>
        ))}
      </div>
      {mode === "shape" ? (
        current ? (
          <>
            <FretboardDiagram stringNames={model.stringNames} frets={current.frets} caption={current.name} ariaLabel={`${model.chord.label} chord shape on bass`} />
            {options.length > 1 && (
              <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Bass shapes">
                {options.map((o, i) => (
                  <button key={o.name + i} type="button" aria-pressed={i === shapeIndex % options.length} onClick={() => onShape(i)} className={`rounded-full px-2 py-0.5 text-[0.625rem] ${i === shapeIndex % options.length ? "bg-[var(--color-ns-amber)]/25 font-bold text-[var(--color-ns-amber)]" : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"}`}>
                    {o.name}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-[var(--color-ns-muted)]">No comfortable chord shape on this bass tuning — use the arpeggio.</p>
        )
      ) : (
        <>
          <FretboardDiagram stringNames={model.stringNames} dots={model.arpeggio.map((a) => ({ string: a.string, fret: a.fret, label: String(a.order) }))} caption={`Arpeggio: ${model.arpeggio.map((a) => a.note).join(" → ")}`} ariaLabel={`${model.chord.label} arpeggio on bass`} />
          <p className="text-center text-[0.6875rem] text-[var(--color-ns-muted)]">Numbers show the order to play the notes, one at a time.</p>
        </>
      )}
    </div>
  );
}
