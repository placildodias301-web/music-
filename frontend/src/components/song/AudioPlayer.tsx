import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { formatTime } from "../../lib/chordSync";
import type { PlaybackClock } from "../../lib/usePlaybackClock";

interface Props {
  audioRef: RefObject<HTMLAudioElement | null>;
  src: string | null;
  clock: PlaybackClock;
  fallbackDuration: number;
}

/** Transport bar driven by the shared playback clock (the same clock the chord sheet follows). */
export function AudioPlayer({ audioRef, src, clock, fallbackDuration }: Props) {
  const [t, setT] = useState(0);
  useEffect(() => clock.subscribe((x) => setT((p) => (Math.abs(p - x) >= 0.1 ? x : p))), [clock]);
  const duration = clock.duration || fallbackDuration;

  if (!src) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-ns-border)] p-3 text-xs text-[var(--color-ns-muted)]">
        No audio is loaded for this song (saved songs keep the analysis, not the audio file). Open it from the Upload page to play along — the chord sheet below still works.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button type="button" onClick={clock.toggle} aria-label={clock.isPlaying ? "Pause" : "Play"} className="h-10 w-10 shrink-0 rounded-full bg-[var(--color-ns-purple)] text-white shadow-[var(--shadow-primary)]">
        {clock.isPlaying ? "❚❚" : "▶"}
      </button>
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
      {clock.error && <span className="text-xs text-[var(--color-ns-red)]">{clock.error}</span>}
    </div>
  );
}
