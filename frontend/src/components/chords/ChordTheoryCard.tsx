import { type ChordAnalysis } from "../../lib/chords/analysis";
import { type VoicingExplanation } from "../../lib/chords/describe";

export interface ChordTheoryCardProps {
  analysis: ChordAnalysis;
  /** How the shape being shown produces the chord (from lib/chords/describe.ts). Omitted for instruments without a shape. */
  voicing?: VoicingExplanation;
}

const spell = (s: string) => s.replace(/#/g, "♯");

function Card({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">{title}</h4>
      {hint && <p className="mt-1 text-[0.6875rem] text-[var(--color-ns-muted)]">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * The theory section. Everything shown is computed from the chord's quality (lib/chords/describe.ts), so the notes,
 * formula and explanation always agree with the chord and with the shape drawn beside it.
 */
export function ChordTheoryCard({ analysis, voicing }: ChordTheoryCardProps) {
  const d = analysis.description;
  const notes = analysis.notes.map(spell);
  return (
    <div className="space-y-4">
      {/* Identity + formula */}
      <Card title="Chord identity">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-2xl font-extrabold text-[var(--color-ns-amber)]">{spell(analysis.symbol)}</span>
          <span className="rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-2.5 py-0.5 text-[0.6875rem] font-semibold text-[var(--color-ns-text)]">{d.kindLabel}</span>
          <span className="rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-2.5 py-0.5 text-[0.6875rem] font-semibold capitalize text-[var(--color-ns-muted)]">{analysis.parsed.quality.name}</span>
          <span className="rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-2.5 py-0.5 text-[0.6875rem] text-[var(--color-ns-dim)]">{analysis.category}</span>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">Root</dt>
          <dd className="font-mono font-semibold text-[var(--color-ns-text)]">{notes[0]}</dd>
          <dt className="font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">Notes</dt>
          <dd className="font-mono font-semibold text-[var(--color-ns-text)]">{notes.join(" – ")}</dd>
          <dt className="font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">Formula</dt>
          <dd className="font-mono font-semibold text-[var(--color-ns-text)]">{analysis.formula.replace(/ - /g, " – ")}</dd>
          {analysis.slashBassNote && (
            <>
              <dt className="font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">Bass note</dt>
              <dd className="font-mono font-semibold text-[var(--color-ns-text)]">{spell(analysis.slashBassNote)} (slash chord)</dd>
            </>
          )}
        </dl>
      </Card>

      {/* Intervals */}
      <Card title="Intervals from the root" hint="Each note and its distance above the root.">
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {d.intervals.map((row) => (
            <li key={row.note + row.semitones} className="flex items-center gap-2.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 px-3 py-1.5 text-xs">
              <span className="w-7 font-heading font-bold text-[var(--color-ns-amber)]">{row.shortName}</span>
              <span className="font-mono font-semibold text-[var(--color-ns-text)]">{spell(row.note)}</span>
              <span className="text-[var(--color-ns-muted)]">{row.name}</span>
              <span className="ml-auto rounded bg-[var(--color-ns-card)] px-1.5 font-mono text-[0.625rem] text-[var(--color-ns-dim)]">{row.semitones} st</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Construction + sound */}
      <Card title="How it is built and why it sounds that way">
        <p className="text-xs leading-relaxed text-[var(--color-ns-text)]">{spell(d.construction)}</p>
        <ul className="mt-3 space-y-1.5">
          {d.sound.map((line) => (
            <li key={line} className="flex gap-2 text-xs leading-relaxed text-[var(--color-ns-muted)]">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ns-amber)]" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Role + uses */}
      <Card title="Harmonic role and common uses">
        <p className="text-xs leading-relaxed text-[var(--color-ns-text)]">{spell(d.role)}</p>
        <ul className="mt-3 space-y-1.5">
          {d.uses.map((line) => (
            <li key={line} className="flex gap-2 text-xs leading-relaxed text-[var(--color-ns-muted)]">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ns-border-strong)]" />
              <span>{spell(line)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Related chords */}
      {d.related.length > 0 && (
        <Card title="Related chords" hint="One small change away from this chord.">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {d.related.map((r) => (
              <li key={r.symbol} className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading text-sm font-bold text-[var(--color-ns-text)]">{spell(r.symbol)}</span>
                  <span className="rounded bg-[var(--color-ns-border)] px-1.5 py-0.5 text-[0.5625rem] font-semibold text-[var(--color-ns-muted)]">{r.relation}</span>
                </div>
                <p className="mt-1 text-[0.6875rem] leading-snug text-[var(--color-ns-dim)]">{spell(r.detail)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* The shape itself */}
      {voicing && voicing.lines.length > 0 && (
        <Card title="How this shape makes the chord" hint="Read from the voicing drawn beside it, string by string.">
          <ul className="space-y-1">
            {voicing.lines.map((l) => (
              <li key={l.string} className="font-mono text-[0.6875rem] text-[var(--color-ns-text)]">{spell(l.text)}</li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1.5 border-t border-[var(--color-ns-border)]/60 pt-3">
            {voicing.summary.map((s) => (
              <li key={s} className="text-xs leading-relaxed text-[var(--color-ns-muted)]">{spell(s)}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Diatonic Keys & Roman Numerals */}
      {analysis.diatonicKeys.length > 0 && (
        <Card title="Diatonic keys & Roman numerals" hint={`Keys that naturally contain every note of ${spell(analysis.symbol)}:`}>
          <div className="flex flex-wrap gap-2">
            {analysis.diatonicKeys.map((dk, idx) => (
              <div key={idx} className="flex items-center gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 px-2.5 py-1 text-xs">
                <span className="font-medium text-[var(--color-ns-text)]">
                  {spell(dk.keyRoot)} {dk.mode === "major" ? "Maj" : "Min"}
                </span>
                <span className="rounded bg-[var(--color-ns-amber)]/20 px-1.5 py-0.5 font-serif text-[0.6875rem] font-bold text-[var(--color-ns-amber)]">{dk.romanNumeral}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Related Scales */}
      {analysis.relatedScales.length > 0 && (
        <Card title="Recommended scales for soloing & practice">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {analysis.relatedScales.slice(0, 4).map((scale, sIdx) => (
              <div key={sIdx} className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold text-[var(--color-ns-text)]">{scale.name}</span>
                  <span className="rounded bg-[var(--color-ns-border)] px-1.5 py-0.5 text-[0.5625rem] font-semibold text-[var(--color-ns-muted)]">{scale.category}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1 font-mono text-[0.6875rem] text-[var(--color-ns-amber)]">
                  {scale.notes.map((nt: string, nIdx: number) => (
                    <span key={nIdx}>{spell(nt)}</span>
                  ))}
                </div>
                <p className="mt-1.5 text-[0.625rem] text-[var(--color-ns-dim)]">{scale.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
