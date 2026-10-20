import { displayState, outOfRangeSide, STATE_LABEL } from "../../lib/tuner/cents";
import type { TunerSnapshot } from "../../lib/tuner/engine";

/**
 * The detected-note readout. The big note is what is actually being played (nearest semitone, e.g. F#3);
 * the target string is shown separately beneath it, and the cents are measured against that target.
 */
export function TunerDisplay({
  snap,
  toneColor,
  locked,
  letters,
  octaveOf,
  isListening,
  showTarget,
}: {
  snap: TunerSnapshot;
  toneColor: string;
  locked: boolean;
  letters: (note: string) => string;
  octaveOf: (note: string) => string;
  isListening: boolean;
  /** Show the "Target: 110.00 Hz" line (hidden on a bare chromatic idle screen). */
  showTarget: boolean;
}) {
  const has = snap.pitchReliable && snap.frequency !== null && snap.detectedNote !== null && snap.cents !== null;
  const cents = snap.cents ?? 0;
  const sign = cents > 0.5 ? "+" : cents < -0.5 ? "−" : "±";
  const side = outOfRangeSide(has ? snap.cents : null);
  const state = has ? displayState(cents, snap.state) : null;
  return (
    <div className="relative -mt-2 text-center">
      <p
        className={`font-heading text-7xl font-black leading-none tracking-tight transition-[color,opacity] duration-200 sm:text-8xl ${snap.held ? "opacity-50" : ""}`}
        style={{ color: has ? (locked ? "var(--color-ns-mint)" : "var(--color-ns-text)") : "var(--color-ns-border-strong)" }}
      >
        {has && snap.detectedNote ? (
          <>
            {letters(snap.detectedNote)}
            <span className="align-baseline text-3xl font-bold text-[var(--color-ns-muted)] sm:text-4xl">{octaveOf(snap.detectedNote)}</span>
          </>
        ) : (
          "--"
        )}
      </p>
      <p className="mt-2 font-mono text-sm tabular-nums" style={{ color: has ? toneColor : "var(--color-ns-dim)" }}>
        {has ? `${snap.frequency!.toFixed(1)} Hz · ${sign}${Math.abs(cents).toFixed(Math.abs(cents) < 10 ? 1 : 0)} cents` : isListening ? "Listening…" : "Mic off"}
      </p>
      {has && state && (
        <p className="mt-1 text-xs font-bold tracking-widest" style={{ color: toneColor }}>
          {side !== 0 ? (side < 0 ? "TOO LOW" : "TOO HIGH") : locked || state === "in-tune" ? "IN TUNE ✓" : STATE_LABEL[state]}
        </p>
      )}
      {has && showTarget && snap.targetFrequency !== null && snap.targetNote !== null && (
        <p className="mt-0.5 font-mono text-[0.6875rem] tabular-nums text-[var(--color-ns-dim)]">
          Target {letters(snap.targetNote)}
          {octaveOf(snap.targetNote)} · {snap.targetFrequency.toFixed(2)} Hz
        </p>
      )}
    </div>
  );
}

/** Developer panel (off by default): the numbers behind the reading. */
export function TunerDebugPanel({ snap, mode, micInfo }: { snap: TunerSnapshot; mode: string; micInfo?: string | null }) {
  const f = (v: number | null, d = 2) => (v === null ? "—" : v.toFixed(d));
  const rows: [string, string][] = [
    ["Raw frequency", `${f(snap.rawFrequency)} Hz`],
    ["Smoothed frequency", `${f(snap.frequency)} Hz`],
    ["Detected MIDI", f(snap.detectedMidi, 2)],
    ["Detected note", snap.detectedNote ?? "—"],
    ["Chromatic cents", f(snap.chromaticCents, 2)],
    ["Target note", snap.targetNote ?? "—"],
    ["Target frequency", `${f(snap.targetFrequency)} Hz`],
    ["Cents vs target", f(snap.cents, 2)],
    ["Pitch reliable", snap.pitchReliable ? "yes" : "no"],
    ["Microphone", micInfo ?? "—"],
    ["RMS", snap.rms.toFixed(4)],
    ["Noise floor", snap.noiseFloor.toFixed(4)],
    ["Pitch confidence", snap.confidence.toFixed(2)],
    ["Selected / auto string", snap.targetIndex === null ? `— (${mode})` : `#${snap.targetIndex + 1} ${snap.targetNote} (${mode})`],
    ["Stable frames", String(snap.stableFrames)],
  ];
  return (
    <dl className="relative mx-auto mt-4 grid max-w-sm grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-3 font-mono text-[0.6875rem] text-[var(--color-ns-muted)]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt>{k}</dt>
          <dd className="text-right tabular-nums text-[var(--color-ns-text)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
