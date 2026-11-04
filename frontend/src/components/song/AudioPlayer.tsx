import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { formatTime } from "../../lib/chordSync";
import type { PlaybackClock } from "../../lib/usePlaybackClock";

/** Speeds offered on the transport bar (the Practice panel keeps its finer slow-down steps). */
const PLAYER_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;
const SKIP_SECONDS = 5;

interface Props {
  audioRef: RefObject<HTMLAudioElement | null>;
  src: string | null;
  clock: PlaybackClock;
  fallbackDuration: number;
  speed?: number;
  onSpeed?: (s: number) => void;
  /** Name of the section playing now, shown on the bar so it stays visible while the sheet scrolls. */
  sectionName?: string | null;
}

const iconBtn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-ns-border)] text-xs font-bold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]";

/** Transport bar driven by the shared playback clock (the same clock the chord sheet follows). */
export function AudioPlayer({ audioRef, src, clock, fallbackDuration, speed = 1, onSpeed, sectionName }: Props) {
  const [t, setT] = useState(0);
  const [volume, setVolume] = useState(1);
  useEffect(() => clock.subscribe((x) => setT((p) => (Math.abs(p - x) >= 0.1 ? x : p))), [clock]);
  const duration = clock.duration || fallbackDuration;

  if (!src) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-ns-border)] p-3 text-xs text-[var(--color-ns-muted)]">
        <strong className="text-[var(--color-ns-text)]">Audio playback unavailable.</strong> No audio is loaded for this song (saved songs keep the analysis, not the audio file). Re-attach the file to play along — the chord sheet below still works.
      </div>
    );
  }
  const skip = (d: number) => clock.seek(Math.min(Math.max(clock.getCurrentTime() + d, 0), duration || 0));
  const changeVolume = (v: number) => {
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3 shadow-md">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button type="button" onClick={() => skip(-SKIP_SECONDS)} aria-label={`Back ${SKIP_SECONDS} seconds`} title={`Back ${SKIP_SECONDS}s`} className={iconBtn}>
        −{SKIP_SECONDS}
      </button>
      <button type="button" onClick={clock.toggle} aria-label={clock.isPlaying ? "Pause" : "Play"} className="h-10 w-10 shrink-0 rounded-full bg-[var(--color-ns-purple)] text-white shadow-[var(--shadow-primary)]">
        {clock.isPlaying ? "❚❚" : "▶"}
      </button>
      <button type="button" onClick={() => skip(SKIP_SECONDS)} aria-label={`Forward ${SKIP_SECONDS} seconds`} title={`Forward ${SKIP_SECONDS}s`} className={iconBtn}>
        +{SKIP_SECONDS}
      </button>
      <div className="flex min-w-[12rem] flex-1 items-center gap-2">
        <span className="w-12 text-right text-xs tabular-nums text-[var(--color-ns-muted)]">{formatTime(t)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={0.05}
          value={Math.min(t, duration || 0)}
          onChange={(e) => clock.seek(Number(e.target.value))}
          aria-label="Playback position"
          className="min-w-0 flex-1"
        />
        <span className="w-12 text-xs tabular-nums text-[var(--color-ns-dim)]">{formatTime(duration)}</span>
      </div>
      {sectionName && (
        <span className="rounded-md border border-[var(--color-ns-purple-light)]/40 bg-[var(--color-ns-purple)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ns-purple-light)]" aria-live="polite">
          {sectionName}
        </span>
      )}
      <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-ns-dim)]">
        Vol
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => changeVolume(Number(e.target.value))} aria-label="Volume" className="w-20" />
      </label>
      {onSpeed && (
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-ns-dim)]">
          Speed
          <select
            value={String(speed)}
            onChange={(e) => onSpeed(Number(e.target.value))}
            aria-label="Playback speed"
            className="rounded-md border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-1.5 py-1 text-xs font-semibold text-[var(--color-ns-text)]"
          >
            {[...new Set([...PLAYER_SPEEDS, speed])].sort((a, b) => a - b).map((s) => (
              <option key={s} value={String(s)}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      )}
      {clock.error && <span className="w-full text-xs text-[var(--color-ns-red)]">{clock.error}</span>}
    </div>
  );
}
