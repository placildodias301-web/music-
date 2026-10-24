import { Link } from "react-router-dom";
import type { AnalysisResult } from "../../lib/api";
import { formatBpm, hasTempo, tempoNote, timeSignatureNote, timeSignatureValue } from "../../lib/analysisDisplay";
import { resetRhythm, withTempo } from "../../lib/rhythm";
import { HalfDoubleButtons } from "../TapTempo";

const CARD = "rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5";
const LABEL = "text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]";

interface CardProps {
  analysis: AnalysisResult;
  onChange: (next: AnalysisResult) => void;
}

/** After the user sets a tempo (or on older songs set by hand), let them undo it. */
function ResetLink({ analysis, onChange }: CardProps) {
  if (!analysis.detectedRhythm) return null;
  return (
    <button
      type="button"
      onClick={() => onChange(resetRhythm(analysis))}
      className="text-[0.7188rem] font-semibold text-[var(--color-ns-purple-light)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
    >
      Reset to detected
    </button>
  );
}

/**
 * Tempo: the analyser's best answer, which the user can correct — halve or
 * double it in one tap (the commonest miss). Tapping along happens in
 * Practice, where the song plays.
 */
export function TempoCard({ analysis, onChange }: CardProps) {
  return (
    <div className={CARD}>
      <p className={LABEL}>Tempo</p>
      <p className="mt-2 font-heading text-2xl font-extrabold text-[var(--color-ns-blue)] sm:text-3xl">
        {formatBpm(analysis)} <span className="text-base font-medium text-[var(--color-ns-muted)]">BPM</span>
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-ns-muted)]">
        {tempoNote(analysis)}
        {analysis.bpmStatus === "confirmed" && <ResetLink analysis={analysis} onChange={onChange} />}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {/* Halving or doubling "no tempo" means nothing; setting one by tapping still works. */}
        {hasTempo(analysis) && <HalfDoubleButtons bpm={analysis.bpm} onSet={(bpm) => onChange(withTempo(analysis, bpm))} />}
        <Link
          to="/practice"
          className="text-[0.75rem] font-semibold text-[var(--color-ns-purple-light)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
        >
          Tap it in Practice →
        </Link>
      </div>
    </div>
  );
}

/** Time signature: always the analyser's estimate. */
export function MeterCard({ analysis, onChange }: CardProps) {
  return (
    <div className={CARD}>
      <p className={LABEL}>Time Signature</p>
      <p className="mt-2 font-heading text-2xl font-extrabold text-[var(--color-ns-amber)] sm:text-3xl">{timeSignatureValue(analysis)}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-ns-muted)]">
        {timeSignatureNote(analysis)}
        {analysis.timeSignatureStatus === "confirmed" && <ResetLink analysis={analysis} onChange={onChange} />}
      </p>
    </div>
  );
}
