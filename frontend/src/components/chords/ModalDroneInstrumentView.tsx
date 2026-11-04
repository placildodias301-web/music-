import type { ModalModel } from "../../lib/chords/model";

export function ModalDroneInstrumentView({ model }: { model: ModalModel }) {
  const isIndian = model.tradition === "indian";

  return (
    <div className="flex w-full flex-col gap-4 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
      {/* Tradition Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-ns-border)] pb-3">
        <div>
          <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-ns-amber)]">
            {isIndian ? "Indian Classical Modal System (Raga & Sargam)" : "Middle Eastern Modal System (Maqam & Sayr)"}
          </span>
          <h3 className="font-heading text-lg font-extrabold text-[var(--color-ns-text)]">
            {model.definition.name} — Modal Pitch Relationships
          </h3>
        </div>
        <span className="rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-1 text-[0.6875rem] font-semibold text-[var(--color-ns-muted)]">
          {model.chord.label}
        </span>
      </div>

      {/* Cultural Honesty Notice */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        <p className="font-semibold text-amber-300">
          Cultural Music Theory Notice:
        </p>
        <p className="mt-1 leading-relaxed text-amber-200/90">
          The {model.definition.name} is a melodic and drone instrument, not played in Western harmonic chord shapes.
          Instead of forcing a false guitar-style fretboard diagram, Wilsify AI displays the tonic drone, {isIndian ? "Sargam syllables (swaras)" : "Maqam degrees"}, and related modes.
        </p>
      </div>

      {/* Drone Pitches */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
          Continuous Drone Reference (Tanpura / Chikari / Base)
        </h4>
        <div className="mt-2 flex flex-wrap gap-2">
          {model.droneNotes.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-2"
            >
              <span className="font-mono text-sm font-bold text-[var(--color-ns-amber)]">{d.name}</span>
              <span className="rounded-md border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-1.5 py-0.5 text-[0.625rem] font-semibold text-[var(--color-ns-muted)]">
                {d.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Swara / Maqam Tone Chips */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
          {isIndian ? "Sargam Swara Realization (Notes in Playing Order)" : "Maqam Scale Degrees"}
        </h4>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {model.sargamOrMaqamTones.map((tone, idx) => (
            <div
              key={idx}
              className="flex flex-col items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-3 text-center"
            >
              <span className="font-heading text-lg font-bold text-[var(--color-ns-amber)]">
                {tone.syllable}
              </span>
              <span className="font-mono text-xs font-semibold text-[var(--color-ns-text)]">
                {tone.note}
              </span>
              <span className="mt-1 text-[0.625rem] text-[var(--color-ns-muted)]">
                {tone.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Resonant Ragas / Maqamat */}
      <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
          {isIndian ? "Compatible Classical Ragas" : "Compatible Maqamat"}
        </h4>
        <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
          Modes sharing these pitch relationships in performance:
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {model.resonantRagasOrMaqams.map((raga, i) => (
            <span
              key={i}
              className="rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-1 text-xs font-semibold text-[var(--color-ns-text)]"
            >
              {raga}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[0.6875rem] italic text-[var(--color-ns-dim)]">
          Melodic outline: {model.melodicMovement}
        </p>
      </div>
    </div>
  );
}
