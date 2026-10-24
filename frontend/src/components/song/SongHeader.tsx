import { useState } from "react";
import type { AnalysisResult } from "../../lib/api";
import { displayKey } from "../../lib/chordSync";
import { explainDifficulty } from "../../lib/song/difficulty";
import { DIFFICULTY_BADGES, DEFAULT_DIFFICULTY_BADGE, describeKeyConfidence, formatBpm, tempoNote, timeSignatureNote, timeSignatureValue } from "../../lib/analysisDisplay";

interface Props {
  title: string;
  artist: string | null;
  analysis: AnalysisResult;
  /** Key after transpose. */
  key_: string;
  capo: number;
  transpose: number;
}

export function SongHeader({ title, artist, analysis, key_, capo, transpose }: Props) {
  const [why, setWhy] = useState(false);
  const diff = explainDifficulty(analysis);
  const badge = DIFFICULTY_BADGES[diff.label] ?? DEFAULT_DIFFICULTY_BADGE;
  const conf = describeKeyConfidence(analysis);
  const stat = "rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-2";
  return (
    <header className="mb-4">
      <h1 className="font-heading text-2xl font-bold text-[var(--color-ns-text)] sm:text-3xl">{title}</h1>
      <p className="text-sm text-[var(--color-ns-muted)]">{artist ?? "Artist not set"}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className={stat}>
          <p className="text-[11px] text-[var(--color-ns-dim)]">Key{transpose ? ` (${transpose > 0 ? "+" : ""}${transpose})` : ""}</p>
          <p className="font-heading text-lg font-bold text-[var(--color-ns-text)]">{displayKey(key_)}</p>
          {conf && <p className={`text-[11px] ${conf.className}`}>{conf.label}</p>}
        </div>
        <div className={stat}>
          <p className="text-[11px] text-[var(--color-ns-dim)]">BPM</p>
          <p className="font-heading text-lg font-bold text-[var(--color-ns-text)]">{formatBpm(analysis)}</p>
          <p className="text-[11px] text-[var(--color-ns-muted)]">{tempoNote(analysis)}</p>
        </div>
        <div className={stat}>
          <p className="text-[11px] text-[var(--color-ns-dim)]">Time</p>
          <p className="font-heading text-lg font-bold text-[var(--color-ns-text)]">{timeSignatureValue(analysis)}</p>
          <p className="text-[11px] text-[var(--color-ns-muted)]">{timeSignatureNote(analysis)}</p>
        </div>
        <div className={stat}>
          <p className="text-[11px] text-[var(--color-ns-dim)]">Capo</p>
          <p className="font-heading text-lg font-bold text-[var(--color-ns-text)]">{capo === 0 ? "None" : capo}</p>
        </div>
        <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} className={`${stat} text-left`} style={{ borderColor: badge.border }}>
          <p className="text-[11px] text-[var(--color-ns-dim)]">Difficulty</p>
          <p className="font-heading text-lg font-bold" style={{ color: badge.text }}>{diff.label}</p>
          <p className="text-[11px] text-[var(--color-ns-muted)]">{why ? "Hide why" : "Why?"}</p>
        </button>
      </div>
      {why && (
        <ul className="mt-2 list-disc space-y-0.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] py-3 pl-8 pr-4 text-xs text-[var(--color-ns-muted)]">
          {diff.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
    </header>
  );
}
