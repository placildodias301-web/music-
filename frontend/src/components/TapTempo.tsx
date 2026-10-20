import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { MAX_BPM, MIN_BPM, MIN_TAPS, TAP_RESET_MS, tapTempo } from "../lib/rhythm";

/** Small secondary button used next to tempo readouts (½×, 2×, Tap tempo, Use, Cancel). */
export const CHIP =
  "rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-2.5 py-1 text-[0.75rem] font-semibold text-[var(--color-ns-text)] transition-colors hover:border-[var(--color-ns-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)] disabled:cursor-not-allowed disabled:opacity-40";

/** Tap along to the song; the median gap between taps sets the tempo. Space or T taps too. */
export function TapPad({ onUse, onCancel }: { onUse: (bpm: number) => void; onCancel: () => void }) {
  const [taps, setTaps] = useState<number[]>([]);
  const padRef = useRef<HTMLButtonElement>(null);
  const bpm = tapTempo(taps);

  /** `at` = the event's timeStamp: when the finger/key went down, not when this code ran. */
  function tap(at: number) {
    const now = at;
    setTaps((prev) => (prev.length && now - prev[prev.length - 1] > TAP_RESET_MS ? [now] : [...prev, now].slice(-12)));
  }

  useEffect(() => {
    padRef.current?.focus();
  }, []);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if ((e.key === " " || e.key.toLowerCase() === "t") && !e.repeat) {
      e.preventDefault();
      tap(e.timeStamp);
    } else if (e.key === "Enter" && bpm) {
      e.preventDefault();
      onUse(bpm);
    }
  }

  return (
    <div onKeyDown={onKeyDown}>
      <button
        ref={padRef}
        type="button"
        onPointerDown={(e) => {
          e.preventDefault(); // tap on press, not release — tighter timing
          padRef.current?.focus();
          tap(e.timeStamp);
        }}
        onClick={(e) => {
          // Screen readers / switch access "activate" with a click and no
          // pointerdown (detail 0): count that as a tap too.
          if (e.detail === 0) tap(e.timeStamp);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.preventDefault(); // handled by the wrapper
        }}
        onKeyUp={(e) => {
          if (e.key === " ") e.preventDefault(); // Space taps on keydown; don't let keyup "click" again
        }}
        aria-label="Tap along to the beat"
        className="mt-2 flex h-16 w-full touch-manipulation select-none flex-col items-center justify-center rounded-xl border-2 border-[var(--color-ns-blue)]/50 bg-[var(--color-ns-blue)]/10 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)] active:scale-[0.98]"
      >
        <span className="font-heading text-2xl font-extrabold text-[var(--color-ns-blue)]">
          {bpm ? Math.round(bpm) : "Tap"}
          {bpm && <span className="ml-1 text-sm font-medium text-[var(--color-ns-muted)]">BPM</span>}
        </span>
      </button>
      <p className="mt-1.5 text-xs text-[var(--color-ns-muted)]" aria-live="polite">
        {bpm
          ? `${taps.length} taps · keep going to steady it`
          : taps.length
          ? `Keep tapping… (${MIN_TAPS - taps.length} more)`
          : "Play the song and tap on the beat — or press Space"}
      </p>
      <div className="mt-2 flex gap-1.5">
        <button type="button" className={CHIP} disabled={!bpm} onClick={() => bpm && onUse(bpm)}>
          {bpm ? `Use ${Math.round(bpm)} BPM` : "Use"}
        </button>
        <button type="button" className={CHIP} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The commonest tempo miss is half or double the real one: fix it in one tap. */
export function HalfDoubleButtons({ bpm, onSet }: { bpm: number; onSet: (bpm: number) => void }) {
  const half = bpm / 2;
  const double = bpm * 2;
  return (
    <span className="inline-flex gap-1.5" role="group" aria-label="Correct the tempo">
      <button
        type="button"
        className={CHIP}
        disabled={half < MIN_BPM}
        onClick={() => onSet(half)}
        title={`Half time: ${Math.round(half)} BPM`}
        aria-label={`Half time, ${Math.round(half)} BPM`}
      >
        ½×
      </button>
      <button
        type="button"
        className={CHIP}
        disabled={double > MAX_BPM}
        onClick={() => onSet(double)}
        title={`Double time: ${Math.round(double)} BPM`}
        aria-label={`Double time, ${Math.round(double)} BPM`}
      >
        2×
      </button>
    </span>
  );
}
