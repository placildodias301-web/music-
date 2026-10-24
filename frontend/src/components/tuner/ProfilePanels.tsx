import type { ReactNode } from "react";
import type { HistoryEntry, Stability } from "../../lib/tuner/history";
import type { InstrumentTunerProfile, TransposeOption } from "../../lib/tuner/instrumentProfile";
import { summariseLugs, type LugReading, type TimpaniDrum } from "../../lib/tuner/percussionPitch";
import type { PianoReference } from "../../lib/tuner/percussionPitch";
import type { TunerSnapshot } from "../../lib/tuner/engine";
import type { TuningPreset } from "../../lib/tuner/types";

const card = "relative mb-3 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3.5 py-3 text-xs text-[var(--color-ns-muted)]";
const label = "text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-dim)]";
const select =
  "w-full rounded-lg border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] px-2.5 py-1.5 text-sm text-[var(--color-ns-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]";
const btn =
  "rounded-lg border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] px-3 py-1.5 text-xs font-bold text-[var(--color-ns-text)] transition-colors hover:border-[var(--color-ns-purple-light)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]";

/** Which tuner this is, in a line, with how the detector listens to this kind of instrument. */
export function TunerTypeBanner({ profile }: { profile: InstrumentTunerProfile }) {
  return (
    <div className={card} data-tuner-type={profile.tunerType}>
      <p className="font-bold text-[var(--color-ns-text)]">{profile.ui.headline}</p>
      <p className="mt-0.5 leading-relaxed">{profile.ui.description}</p>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[var(--color-ns-purple-light)]">How it listens to this instrument</summary>
        <p className="mt-1 leading-relaxed">{profile.detectionNote}</p>
      </details>
    </div>
  );
}

export function TimpaniDrumPicker({ drums, value, onChange }: { drums: TimpaniDrum[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="relative mb-3" role="group" aria-label="Timpani drum">
      <span className={label}>Drum</span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {drums.map((d) => (
          <button key={d.id} type="button" aria-pressed={d.id === value} onClick={() => onChange(d.id)} className={`${btn} ${d.id === value ? "!border-[var(--color-ns-purple-light)] !bg-[var(--color-ns-purple)]/20" : ""}`}>
            {d.label}
            <span className="ml-1 font-normal text-[var(--color-ns-dim)]">
              {d.low.replace("b", "♭")}–{d.high.replace("b", "♭")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Pick a note and hear it in the timbre of the instrument being tuned. For instruments where there is no peg to tap. */
export function ReferenceBar({
  title = "Reference tone",
  notes,
  value,
  onChange,
  onPlay,
  onStop,
  format,
  hint,
}: {
  title?: string;
  notes: { note: string; midi: number }[];
  value: number;
  onChange: (midi: number) => void;
  onPlay: () => void;
  onStop: () => void;
  format: (note: string) => string;
  hint?: ReactNode;
}) {
  return (
    <div className={card} role="group" aria-label={title}>
      <p className={label}>{title}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <select className={select} aria-label="Reference note" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {notes.map((n) => (
            <option key={n.midi} value={n.midi}>
              {format(n.note)}
            </option>
          ))}
        </select>
        <button type="button" className={btn} onClick={onPlay} aria-label="Play reference tone">
          ▶ Play
        </button>
        <button type="button" className={btn} onClick={onStop} aria-label="Stop reference tone">
          ■
        </button>
      </div>
      {hint && <p className="mt-1.5 leading-relaxed text-[var(--color-ns-dim)]">{hint}</p>}
    </div>
  );
}

const bar = (v: number, color: string) => (
  <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-ns-border)]/60" aria-hidden="true">
    <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150" style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, background: color }} />
  </span>
);

const STABILITY_TEXT: Record<Stability, string> = { stable: "Stable", settling: "Settling", unsteady: "Unsteady", unknown: "—" };

/** Signal strength, detector confidence and pitch stability, always visible while listening. */
export function ReadoutBar({ snap, stability, stabilityDeviation }: { snap: TunerSnapshot; stability: Stability; stabilityDeviation: number | null }) {
  const signal = Math.min(1, snap.rms / 0.12);
  const heard = snap.pitchReliable;
  return (
    <dl className="relative mx-auto mt-3 grid max-w-sm grid-cols-3 gap-3 text-[0.6875rem]" aria-label="Signal readouts">
      <div>
        <dt className={label}>Signal</dt>
        <dd className="mt-1">{bar(signal, snap.tooQuiet ? "var(--color-ns-red)" : "var(--color-ns-mint)")}</dd>
      </div>
      <div>
        <dt className={label}>Confidence</dt>
        <dd className="mt-1">
          {bar(heard ? snap.confidence : 0, "var(--color-ns-purple-light)")}
          <span className="mt-0.5 block font-mono tabular-nums text-[var(--color-ns-muted)]">{heard ? `${Math.round(snap.confidence * 100)}%` : "—"}</span>
        </dd>
      </div>
      <div>
        <dt className={label}>Stability</dt>
        <dd className="mt-1 text-[var(--color-ns-muted)]" title={stabilityDeviation === null ? undefined : `±${stabilityDeviation.toFixed(1)} cents`}>
          {heard ? STABILITY_TEXT[stability] : "—"}
        </dd>
      </div>
    </dl>
  );
}

const TREND_TEXT: Record<HistoryEntry["trend"], string> = { improving: "Improving", worse: "Further away", steady: "Steady", first: "" };

/** Target, detected note, cents, time and trend for the last few readings. */
export function HistoryPanel({ rows, letters, onClear }: { rows: HistoryEntry[]; letters: (note: string) => string; onClear: () => void }) {
  if (!rows.length) return <p className="relative mt-3 text-center text-[0.6875rem] text-[var(--color-ns-dim)]">Your readings will build up here as you tune.</p>;
  const now = performance.now();
  return (
    <div className={`${card} mt-3 mb-0`}>
      <div className="flex items-center justify-between">
        <p className={label}>Tuning history</p>
        <button type="button" onClick={onClear} className="font-semibold text-[var(--color-ns-purple-light)] hover:underline">
          Clear
        </button>
      </div>
      <ol className="mt-1.5 space-y-1" aria-label="Recent readings">
        {rows.map((r) => (
          <li key={r.time} className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="w-14 text-[var(--color-ns-text)]">{r.target ? letters(r.target) : letters(r.detected)}</span>
            <span className={`w-20 ${r.inTune ? "text-[var(--color-ns-mint)]" : "text-[var(--color-ns-muted)]"}`}>
              {r.inTune ? "IN TUNE" : `${r.cents > 0 ? "+" : "−"}${Math.abs(r.cents).toFixed(Math.abs(r.cents) < 10 ? 1 : 0)} cents`}
            </span>
            <span className="flex-1 font-sans text-[var(--color-ns-dim)]">{TREND_TEXT[r.trend]}</span>
            <span className="text-[var(--color-ns-dim)]">{Math.max(0, Math.round((now - r.time) / 1000))}s ago</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Drum-head lug comparison. Honest about what one microphone can tell: pitch of each lug relative to the others, not tension. */
export function LugPanel({
  lugs,
  onCount,
  onRecord,
  onClear,
  current,
  letters,
  noteOf,
}: {
  lugs: LugReading[];
  onCount: (n: number) => void;
  onRecord: (index: number) => void;
  onClear: () => void;
  /** The pitch being heard right now (Hz), or null. */
  current: number | null;
  letters: (note: string) => string;
  noteOf: (hz: number) => string;
}) {
  const summary = summariseLugs(lugs);
  const verdict =
    summary.evenness === "even" ? "Approximately even around the head."
    : summary.evenness === "slightly-uneven" ? "Slightly uneven: check the lugs marked higher or lower."
    : summary.evenness === "uneven" ? "Uneven: some lugs are clearly higher or lower than others."
    : "Strike near each lug in turn and press its button to record it.";
  return (
    <div className={card} role="group" aria-label="Drum lugs">
      <div className="flex items-center justify-between">
        <p className={label}>Lugs</p>
        <label className="flex items-center gap-1.5">
          <span className="text-[var(--color-ns-dim)]">Lugs</span>
          <select className="rounded-md border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] px-1.5 py-0.5 text-xs text-[var(--color-ns-text)]" value={lugs.length} onChange={(e) => onCount(Number(e.target.value))} aria-label="Number of lugs">
            {[4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {lugs.map((l, i) => {
          const dev = summary.deviations[i];
          return (
            <li key={i}>
              <button type="button" className={`${btn} w-full`} disabled={current === null} onClick={() => onRecord(i)} aria-label={`Record lug ${i + 1}`}>
                Lug {i + 1}
              </button>
              <p className="mt-1 text-center font-mono tabular-nums text-[0.6875rem] text-[var(--color-ns-muted)]">
                {l.frequency === null ? "—" : `${letters(noteOf(l.frequency))} ${dev === null || Math.abs(dev) < 0.5 ? "" : dev > 0 ? "▲" : "▼"}${dev === null ? "" : `${Math.abs(dev).toFixed(0)}¢`}`}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 font-semibold text-[var(--color-ns-text)]" role="status">
        {verdict}
        {summary.spreadCents !== null && <span className="ml-1 font-normal text-[var(--color-ns-dim)]">(spread {summary.spreadCents.toFixed(0)} cents)</span>}
      </p>
      <p className="mt-1 leading-relaxed text-[var(--color-ns-dim)]">One microphone can compare the pitch near each lug, not measure its tension. Treat this as a guide to evening out the head.</p>
      <button type="button" onClick={onClear} className="mt-1.5 font-semibold text-[var(--color-ns-purple-light)] hover:underline">
        Clear lugs
      </button>
    </div>
  );
}

/** How the drone strings relate: each string's interval from the first Sa, in the ratio and cents a drone player listens for. */
export function DroneRelations({ preset, letters }: { preset: TuningPreset; letters: (note: string) => string }) {
  const sa = preset.strings.reduce((best, s) => (s.midi > best.midi && s.midi - best.midi < 12 ? s : best), preset.strings[0]);
  // Sa is the string that appears at least twice (the repeated tonic).
  const counts = new Map<number, number>();
  preset.strings.forEach((s) => counts.set(s.midi % 12, (counts.get(s.midi % 12) ?? 0) + 1));
  const saPc = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const saString = preset.strings.find((s) => s.midi % 12 === saPc) ?? sa;
  const NAMES: Record<number, string> = { 0: "Sa", 5: "Ma (fourth)", 7: "Pa (fifth)" };
  return (
    <div className={card} role="group" aria-label="Drone string relations">
      <p className={label}>Relation to Sa</p>
      <ul className="mt-1.5 space-y-1">
        {preset.strings.map((s) => {
          const semis = s.midi - saString.midi;
          const pc = ((semis % 12) + 12) % 12;
          const octaves = Math.round((semis - pc) / 12);
          const name = NAMES[pc] ?? `${pc} semitones above Sa`;
          const where = octaves === 0 ? "" : octaves < 0 ? `, ${Math.abs(octaves)} octave${Math.abs(octaves) > 1 ? "s" : ""} below` : `, ${octaves} octave${octaves > 1 ? "s" : ""} above`;
          return (
            <li key={s.id} className="flex justify-between gap-3">
              <span className="text-[var(--color-ns-text)]">
                String {s.displayNumber}: {letters(s.note.replace(/-?\d+$/, ""))}
                {s.note.match(/-?\d+$/)?.[0]}
              </span>
              <span>
                {name}
                {where}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 leading-relaxed text-[var(--color-ns-dim)]">Tune the strings against each other: Pa should sit a pure fifth (3:2) from Sa, and the Sa strings should ring in unison and octave.</p>
    </div>
  );
}

/** Choose the transposition (clarinet in B♭, A or C…) and see concert and written pitch side by side. */
export function TransposeControl({ options, value, onChange }: { options: TransposeOption[]; value: TransposeOption | null; onChange: (label: string) => void }) {
  if (options.length < 2) return null;
  return (
    <label className="relative mb-3 flex items-center gap-2 text-xs text-[var(--color-ns-muted)]">
      <span className={label}>Instrument in</span>
      <select className="rounded-md border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] px-2 py-1 text-xs text-[var(--color-ns-text)]" value={value?.label ?? options[0].label} onChange={(e) => onChange(e.target.value)} aria-label="Instrument transposition">
        {options.map((o) => (
          <option key={o.label} value={o.label}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ConcertWritten({ concert, written, label: transposeLabel }: { concert: string; written: string; label: string }) {
  return (
    <p className="relative mt-1 text-center font-mono text-[0.6875rem] tabular-nums text-[var(--color-ns-dim)]" aria-label="Concert and written pitch">
      Concert {concert} · Written {written} <span className="font-sans">({transposeLabel} instrument)</span>
    </p>
  );
}

/** Piano mode: what this is, and the octave comparison. */
export function PianoNotes({ reference, letters }: { reference: PianoReference; letters: (note: string) => string }) {
  return (
    <div className={card}>
      <p className="font-bold text-[var(--color-ns-text)]">Reference assistance, not professional piano tuning</p>
      <p className="mt-1 leading-relaxed">
        This compares the string you play with equal temperament at your reference pitch. Real pianos are tuned with slightly stretched octaves, which depend on the piano and are set by ear or by a technician, so a few cents off can be correct.
        {reference.stretchCents !== 0 && ` A stretch of ${reference.stretchCents > 0 ? "+" : ""}${reference.stretchCents} cents is applied to this note.`}
      </p>
      {reference.octaves.length > 0 && (
        <p className="mt-1.5 font-mono tabular-nums text-[var(--color-ns-dim)]">
          Octaves to compare by ear: {reference.octaves.map((o) => `${letters(o.note.replace(/-?\d+$/, ""))}${o.note.match(/-?\d+$/)?.[0]} ${o.frequency.toFixed(2)} Hz`).join(" · ")}
        </p>
      )}
    </div>
  );
}
