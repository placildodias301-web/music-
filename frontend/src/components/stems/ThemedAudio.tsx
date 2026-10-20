import { useEffect, useRef, useState } from "react";
import { announcePlay, useStopWhenOthersPlay } from "../../lib/audioBus";
import { fmtTime } from "../../lib/stemJob";

/** The app's own audio player (purple play button, seek bar, time) instead of the browser's grey one. */
export function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l12-7.5z" />
    </svg>
  );
}

export function ThemedAudio({ id, src, label }: { id: string; src: string; label: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = new Audio();
    a.preload = "metadata";
    a.src = src;
    audio.current = a;
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onTime = () => setTime(a.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setTime(0);
      a.currentTime = 0;
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.pause();
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeAttribute("src");
      a.load();
      audio.current = null;
    };
  }, [src]);

  useStopWhenOthersPlay(id, () => {
    audio.current?.pause();
    setPlaying(false);
  });

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    announcePlay(id);
    void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
        className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--color-ns-purple)] text-white shadow-[var(--shadow-primary)] hover:bg-[var(--color-ns-purple-light)]"
      >
        <PlayIcon playing={playing} />
      </button>
      <span className="w-[5.5rem] flex-none text-xs tabular-nums text-[var(--color-ns-muted)]">
        {fmtTime(time)} / {fmtTime(duration)}
      </span>
      <input
        type="range"
        aria-label={`${label} position`}
        className="stem-slider min-w-0 flex-1"
        min={0}
        max={duration || 1}
        step={0.05}
        value={Math.min(time, duration || 1)}
        disabled={!duration}
        style={{ ["--fill" as string]: `${duration ? (time / duration) * 100 : 0}%` }}
        onChange={(e) => {
          const t = Number(e.target.value);
          if (audio.current) audio.current.currentTime = t;
          setTime(t);
        }}
      />
    </div>
  );
}
