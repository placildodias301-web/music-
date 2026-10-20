import type { HarmonicaModel, WindModel } from "../../lib/chords/model";

const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;

/**
 * A wind instrument plays one note at a time, so its "chord" is the chord tones in order — shown as note chips, with the
 * written chord underneath for transposing instruments (clarinet, saxophones, trumpet, horn). No fingering chart is drawn.
 */
export function WindChord({ model }: { model: WindModel }) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <ol className="flex flex-wrap items-center justify-center gap-1.5" aria-label={`${model.chord.label} on ${model.definition.name}: ${model.sounding.map((n) => n.name).join(", ")}`}>
        {model.sounding.map((n, i) => (
          <li key={`${n.midi}-${i}`} className="flex min-w-[2.75rem] flex-col items-center rounded-lg border border-[var(--color-ns-amber)]/50 bg-[var(--color-ns-amber)]/15 px-2 py-1.5">
            <span className="font-heading text-sm font-bold text-[var(--color-ns-text)]">{n.name}</span>
            <span className="font-mono text-[0.5625rem] text-[var(--color-ns-muted)]">{octaveOf(n.midi)}</span>
          </li>
        ))}
      </ol>
      {model.sounding.length === 0 && <p className="text-center text-xs text-[var(--color-ns-muted)]">This chord does not fit in the {model.definition.name}'s range.</p>}
      <p className="text-center text-[0.625rem] text-[var(--color-ns-dim)]">Range {model.rangeLow}–{model.rangeHigh} · sounding pitch</p>
      {model.written && (
        <p className="rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-2.5 py-1 text-center text-[0.6875rem] text-[var(--color-ns-muted)]">
          Written for {model.written.instrumentPitch} instrument: <span className="font-semibold text-[var(--color-ns-text)]">{model.written.label}</span> ({model.written.notes.join(" · ")})
        </p>
      )}
    </div>
  );
}

/** A 10-hole diatonic harmonica: each hole shows its blow and draw note, with chord tones lit and the best hole groups listed. */
export function HarmonicaChord({ model }: { model: HarmonicaModel }) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="grid w-full max-w-[420px] grid-cols-10 gap-0.5 text-center" role="img" aria-label={`${model.harpKey} harmonica holes for ${model.chord.label}`}>
        {model.holes.map((h) => (
          <div key={h.hole} className="flex flex-col overflow-hidden rounded-md border border-[var(--color-ns-border)] text-[0.5625rem] font-semibold">
            <span className={`py-1 ${h.blowInChord ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)]" : "text-[var(--color-ns-dim)]"}`}>{h.blow.name}</span>
            <span className="bg-[var(--color-ns-bg)] py-0.5 font-mono text-[0.5rem] text-[var(--color-ns-muted)]">{h.hole}</span>
            <span className={`py-1 ${h.drawInChord ? "bg-[var(--color-primary-light)] text-white" : "text-[var(--color-ns-dim)]"}`}>{h.draw.name}</span>
          </div>
        ))}
      </div>
      <p className="text-center text-[0.625rem] text-[var(--color-ns-dim)]">Top row: blow · bottom row: draw</p>
      {model.groups.length > 0 ? (
        <ul className="flex flex-col items-center gap-0.5 text-[0.6875rem] text-[var(--color-ns-muted)]">
          {model.groups.slice(0, 3).map((g) => (
            <li key={`${g.direction}-${g.from}-${g.to}`}>
              <span className="font-semibold text-[var(--color-ns-text)]">{g.direction === "blow" ? "Blow" : "Draw"} holes {g.from}–{g.to}</span> · {g.notes.map((n) => n.name).join(" ")}
            </li>
          ))}
        </ul>
      ) : (
        <p className="max-w-[16rem] text-center text-xs text-[var(--color-ns-muted)]">No clean blow or draw hole group for {model.chord.label} on a {model.harpKey} diatonic harmonica — try another key.</p>
      )}
    </div>
  );
}
