import { useMemo, useState } from "react";
import { GuitarChordDiagram } from "../GuitarChordDiagram";
import { PianoRoll } from "../PianoRoll";
import { chordFullName, chordIntervals, chordNoteNames, getGuitarVoicings, parseChordSymbol } from "../../lib/chordTheory";
import { displayChord } from "../../lib/chordSync";
import { playChordLive } from "../../lib/playChord";

type Tab = "guitar" | "piano" | "theory";
const INTERVAL_NAMES = ["root", "♭2", "2", "♭3", "3", "4", "♭5", "5", "♯5", "6", "♭7", "7"];

interface Props {
  /** Chord as played (after transpose/capo). */
  chord: string;
  /** Chord as it sounds when a capo is used (shown when different). */
  concert?: string;
  onAskWhy?: (chord: string) => void;
  onClose: () => void;
}

/** Guitar / Piano / Theory view of the chord the user clicked. Built on the existing chord library. */
export function ChordPanel({ chord, concert, onAskWhy, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("guitar");
  const [voicing, setVoicing] = useState(0);
  const parsed = useMemo(() => parseChordSymbol(chord), [chord]);
  const voicings = useMemo(() => getGuitarVoicings(parsed), [parsed]);
  const notes = chordNoteNames(parsed);
  const pcs = useMemo(() => chordIntervals(parsed).map((i) => (parsed.root + i) % 12), [parsed]);
  const intervals = chordIntervals(parsed);
  const bass = /\/([A-G][#b♯♭]?)$/.exec(chord)?.[1];

  return (
    <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4" role="region" aria-label={`${chord} chord`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-2xl font-bold text-[var(--color-ns-text)]">{displayChord(chord)}</p>
          <p className="text-xs text-[var(--color-ns-muted)]">{chordFullName(parsed)}</p>
          {concert && concert !== chord && <p className="mt-1 text-xs text-[var(--color-ns-amber)]">Sounds as {displayChord(concert)} (capo)</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close chord panel" className="rounded-md px-2 py-1 text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]">✕</button>
      </div>
      <div role="tablist" className="mb-3 flex gap-1">
        {(["guitar", "piano", "theory"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize ${tab === t ? "bg-[var(--color-ns-purple)]/25 text-[var(--color-ns-text)]" : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "guitar" && (
        <div className="flex flex-col items-center gap-2">
          {voicings[voicing] ? <GuitarChordDiagram voicing={voicings[voicing]} /> : <p className="text-xs text-[var(--color-ns-muted)]">No guitar shape available.</p>}
          {voicings.length > 1 && (
            <div className="flex flex-wrap justify-center gap-1">
              {voicings.map((v, i) => (
                <button key={v.name + i} onClick={() => setVoicing(i)} aria-pressed={voicing === i} className={`rounded-md border px-2 py-0.5 text-[11px] ${voicing === i ? "border-[var(--color-ns-amber)]/60 text-[var(--color-ns-amber)]" : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)]"}`}>
                  {v.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === "piano" && <PianoRoll activePitchClasses={pcs} />}
      {tab === "theory" && (
        <div className="space-y-2 text-sm text-[var(--color-ns-text)]">
          <p>
            <span className="text-[var(--color-ns-muted)]">Notes: </span>
            <strong>{notes.join(" ")}</strong>
            {bass && <span className="text-[var(--color-ns-muted)]"> · bass note {bass}</span>}
          </p>
          <p className="text-xs text-[var(--color-ns-muted)]">Intervals from the root: {intervals.map((i) => INTERVAL_NAMES[i % 12]).join(" · ")}</p>
          {onAskWhy && (
            <button onClick={() => onAskWhy(chord)} className="rounded-lg border border-[var(--color-ns-purple)]/50 bg-[var(--color-ns-purple)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--color-ns-purple-light)]">
              Ask Wilsify AI why {displayChord(chord)} is used here
            </button>
          )}
        </div>
      )}
      <button onClick={() => playChordLive(parsed)} className="mt-3 w-full rounded-lg border border-[var(--color-ns-border)] py-1.5 text-xs font-semibold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]">
        ▶ Hear this chord
      </button>
    </div>
  );
}
