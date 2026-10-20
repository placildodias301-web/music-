import { type ChordAnalysis } from "../../lib/chords/analysis";

export interface ChordTheoryCardProps {
  analysis: ChordAnalysis;
}

export function ChordTheoryCard({ analysis }: ChordTheoryCardProps) {
  return (
    <div className="space-y-4">
      {/* Formula & Construction Overview */}
      <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
          Chord Construction & Formula
        </h4>

        {/* Formula Badges */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {analysis.intervals.map((inv, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 px-3 py-1.5"
            >
              <span className="font-heading text-xs font-bold text-[var(--color-ns-amber)]">
                {inv.shortName}
              </span>
              <span className="text-[0.6875rem] font-medium text-[var(--color-ns-text)]">
                {inv.name}
              </span>
              <span className="rounded bg-[var(--color-ns-card)] px-1 font-mono text-[0.625rem] text-[var(--color-ns-dim)]">
                {inv.semitones}st
              </span>
            </div>
          ))}
        </div>

        {/* Notes in Chord */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
            Spelled Notes:
          </span>
          <div className="flex items-center gap-1.5">
            {analysis.notes.map((n, i) => (
              <span
                key={i}
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-lg bg-[var(--color-ns-border)]/50 px-1.5 font-heading text-xs font-bold text-[var(--color-ns-text)]"
              >
                {n.replace("#", "♯").replace("b", "♭")}
              </span>
            ))}
          </div>
        </div>

        {/* Theory Explanation */}
        <div className="mt-4 border-t border-[var(--color-ns-border)] pt-3">
          <p className="text-xs leading-relaxed text-[var(--color-ns-text)]">
            <span className="font-semibold text-[var(--color-ns-amber)]">Acoustic Sound & Role: </span>
            {analysis.whyItWorks}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-ns-muted)]">
            <span className="font-semibold text-[var(--color-ns-text)]">Harmonic Function: </span>
            {analysis.harmonicFunction}
          </p>
        </div>

        {/* Comparison with related chord */}
        {analysis.comparison && (
          <div className="mt-3 rounded-xl border border-[var(--color-ns-border)]/70 bg-[var(--color-ns-bg)]/40 p-3 text-xs text-[var(--color-ns-muted)]">
            <span className="font-bold text-[var(--color-ns-text)]">
              Compared to {analysis.comparison.relativeChord}:{" "}
            </span>
            {analysis.comparison.description}
          </div>
        )}
      </div>

      {/* Diatonic Keys & Roman Numerals */}
      {analysis.diatonicKeys.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
            Diatonic Keys & Roman Numerals
          </h4>
          <p className="mt-1 text-[0.6875rem] text-[var(--color-ns-muted)]">
            Keys that naturally contain every note of {analysis.symbol}:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {analysis.diatonicKeys.map((dk, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 px-2.5 py-1 text-xs"
              >
                <span className="font-medium text-[var(--color-ns-text)]">
                  {dk.keyRoot} {dk.mode === "major" ? "Maj" : "Min"}
                </span>
                <span className="rounded bg-[var(--color-ns-amber)]/20 px-1.5 py-0.5 font-serif text-[0.6875rem] font-bold text-[var(--color-ns-amber)]">
                  {dk.romanNumeral}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Scales */}
      {analysis.relatedScales.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
            Recommended Scales for Soloing & Practice
          </h4>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {analysis.relatedScales.slice(0, 4).map((scale, sIdx) => (
              <div
                key={sIdx}
                className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/50 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs font-bold text-[var(--color-ns-text)]">
                    {scale.name}
                  </span>
                  <span className="rounded bg-[var(--color-ns-border)] px-1.5 py-0.5 text-[0.5625rem] font-semibold text-[var(--color-ns-muted)]">
                    {scale.category}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1 font-mono text-[0.6875rem] text-[var(--color-ns-amber)]">
                  {scale.notes.map((nt: string, nIdx: number) => (
                    <span key={nIdx}>{nt.replace("#", "♯")}</span>
                  ))}
                </div>
                <p className="mt-1.5 text-[0.625rem] text-[var(--color-ns-dim)]">
                  {scale.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
