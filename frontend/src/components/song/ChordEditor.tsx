import { useState } from "react";
import { displayChord, formatTime } from "../../lib/chordSync";
import { isValidChordName, roundTime, type ChordEdit, type EditedSegment } from "../../lib/song/chordEdits";

interface Props {
  /** The timeline as displayed (analysis + corrections so far). */
  timeline: EditedSegment[];
  editCount: number;
  lowConfidence: number;
  /** Playback time, offered as the default for "Add chord". */
  currentTime: () => number;
  onEdit: (edit: ChordEdit) => void;
  onUndo: () => void;
  onReset: () => void;
  onClose: () => void;
}

const field = "rounded-md border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-2 py-1 text-xs text-[var(--color-ns-text)]";

function ChordRow({ seg, uncertain, onEdit }: { seg: EditedSegment; uncertain: boolean; onEdit: (e: ChordEdit) => void }) {
  const [name, setName] = useState(seg.chord);
  const [time, setTime] = useState(String(roundTime(seg.start)));
  const [error, setError] = useState<string | null>(null);
  const commitName = () => {
    const next = name.trim();
    if (next === seg.chord) return setError(null);
    if (!isValidChordName(next)) return setError("Use a chord name like G, Em, C7 or F#m7.");
    setError(null);
    onEdit({ op: "set", at: roundTime(seg.start), chord: next });
  };
  const commitTime = () => {
    const t = Number(time);
    if (!Number.isFinite(t) || t < 0) return setTime(String(roundTime(seg.start)));
    if (roundTime(t) !== roundTime(seg.start)) onEdit({ op: "move", at: roundTime(seg.start), to: t });
  };
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-[var(--color-ns-border)]/60 py-1.5 last:border-0">
      <label className="flex items-center gap-1 text-[11px] text-[var(--color-ns-dim)]">
        <span className="sr-only">Start time (seconds) for {seg.chord} at {formatTime(seg.start)}</span>
        <input
          type="number"
          min={0}
          step={0.1}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onBlur={commitTime}
          onKeyDown={(e) => e.key === "Enter" && commitTime()}
          className={`${field} w-20 tabular-nums`}
        />
        s
      </label>
      <label className="flex items-center gap-1">
        <span className="sr-only">Chord at {formatTime(seg.start)}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && commitName()}
          className={`${field} w-20 font-heading font-bold`}
        />
      </label>
      {seg.edited && <span className="text-[10px] font-semibold text-[var(--color-ns-mint)]">edited</span>}
      {uncertain && !seg.edited && (
        <span className="text-[10px] font-semibold text-[var(--color-ns-amber)]" title={seg.alternative ? `Could also be ${displayChord(seg.alternative)}` : undefined}>
          low confidence{seg.alternative ? ` · or ${displayChord(seg.alternative)}?` : ""}
        </span>
      )}
      <button
        type="button"
        onClick={() => onEdit({ op: "remove", at: roundTime(seg.start) })}
        aria-label={`Remove ${seg.chord} at ${formatTime(seg.start)}`}
        className="ml-auto rounded-md px-2 py-0.5 text-xs text-[var(--color-ns-muted)] hover:text-[var(--color-ns-red)]"
      >
        Remove
      </button>
      {error && <span className="w-full text-[11px] text-[var(--color-ns-red)]">{error}</span>}
    </li>
  );
}

/**
 * Correct the detected chords: rename, move, remove or add a chord. Edits are
 * stored apart from the analysis, so "Reset" always gets the original back.
 */
export function ChordEditor({ timeline, editCount, lowConfidence, currentTime, onEdit, onUndo, onReset, onClose }: Props) {
  const [addTime, setAddTime] = useState(() => String(roundTime(currentTime())));
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const add = () => {
    const t = Number(addTime);
    if (!Number.isFinite(t) || t < 0) return setAddError("Enter a start time in seconds.");
    if (!isValidChordName(addName)) return setAddError("Use a chord name like G, Em, C7 or F#m7.");
    setAddError(null);
    onEdit({ op: "add", at: roundTime(t), chord: addName.trim() });
    setAddName("");
  };
  return (
    <section aria-label="Edit chords" className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-sm font-bold text-[var(--color-ns-text)]">Edit chords</h2>
        <span className="text-[11px] text-[var(--color-ns-dim)]">
          Names are in the original key (before transpose and capo). Your corrections are kept separately — the analysis itself is never changed.
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onUndo} disabled={!editCount} className="rounded-md border border-[var(--color-ns-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-ns-muted)] disabled:opacity-40">
            Undo
          </button>
          <button type="button" onClick={onReset} disabled={!editCount} className="rounded-md border border-[var(--color-ns-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-ns-muted)] disabled:opacity-40">
            Reset to analysis{editCount ? ` (${editCount})` : ""}
          </button>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--color-ns-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-ns-muted)]">
            Done
          </button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--color-ns-border)] p-2">
        <span className="text-xs font-semibold text-[var(--color-ns-muted)]">Add chord</span>
        <label className="flex items-center gap-1 text-[11px] text-[var(--color-ns-dim)]">
          at
          <input type="number" min={0} step={0.1} value={addTime} onChange={(e) => setAddTime(e.target.value)} aria-label="New chord start time (seconds)" className={`${field} w-20 tabular-nums`} />
          s
        </label>
        <button type="button" onClick={() => setAddTime(String(roundTime(currentTime())))} className="text-[11px] text-[var(--color-ns-purple-light)] underline">
          use playback time
        </button>
        <input value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="e.g. Em" aria-label="New chord name" className={`${field} w-20 font-heading font-bold`} />
        <button type="button" onClick={add} className="btn-secondary px-3 py-1 text-xs">
          Add
        </button>
        {addError && <span className="w-full text-[11px] text-[var(--color-ns-red)]">{addError}</span>}
      </div>
      <ol className="max-h-80 overflow-y-auto pr-1">
        {timeline.map((seg) => (
          <ChordRow key={`${seg.start}-${seg.chord}`} seg={seg} uncertain={(seg.confidence ?? 1) < lowConfidence} onEdit={onEdit} />
        ))}
      </ol>
    </section>
  );
}
