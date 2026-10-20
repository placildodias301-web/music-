import { useCallback, useEffect, useRef, useState } from "react";
import type { StemFile } from "../../lib/stemJob";
import { fmtTime } from "../../lib/stemJob";
import { announcePlay, useStopWhenOthersPlay } from "../../lib/audioBus";
import { stemKind } from "../../lib/stemKinds";
import type { Kind } from "../../lib/stemKinds";

/** Moises-style mixer over the separated stem files: per-stem volume, mute and a shared speed. */

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;
/** Slider top in percent: above 100 boosts the stem (a Web Audio gain; <audio>.volume stops at 1). */
export const MAX_VOLUME = 200;

/** Linear gain for one stem (slider 0–MAX_VOLUME); a muted stem is silent. */
export function stemVolume(volume: number, muted: boolean): number {
  if (muted) return 0;
  return Math.min(MAX_VOLUME / 100, Math.max(0, volume / 100));
}

/**
 * Routes each <audio> through its own GainNode, then one limiter, so stems can
 * go above 100% without the mix clipping. Returns null where Web Audio is missing.
 */
function connectGains(list: HTMLAudioElement[]): { ctx: AudioContext; gains: GainNode[] } | null {
  if (typeof AudioContext === "undefined") return null;
  const ctx = new AudioContext();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);
  const gains = list.map((a) => {
    const g = ctx.createGain();
    ctx.createMediaElementSource(a).connect(g).connect(limiter);
    return g;
  });
  return { ctx, gains };
}

export { stemKind };

function KindIcon({ kind }: { kind: Kind }) {
  const p = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  switch (kind) {
    case "vocal":
      return (
        <svg {...p}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
        </svg>
      );
    case "drums":
      return (
        <svg {...p}>
          <ellipse cx="11" cy="14" rx="7" ry="3" />
          <path d="M4 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M14 4l-5 7M18 6l-6 5" />
        </svg>
      );
    case "bass":
    case "guitar":
      return (
        <svg {...p}>
          <path d="M9 21 14 8M14 8l1.5-4.5 3 1L17 9.5 14 8Z" />
          <circle cx="7" cy="17" r="3.5" />
        </svg>
      );
    case "keys":
      return (
        <svg {...p}>
          <rect x="3" y="6" width="18" height="12" rx="1.5" />
          <path d="M8 6v12M12 6v12M16 6v12" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <path d="M4 12h2M8 8v8M12 4v16M16 8v8M20 12h-2" />
        </svg>
      );
  }
}

const MIXER_ID = "stem-mixer";

export function StemFileMixer({ stems }: { stems: StemFile[] }) {
  const audios = useRef<HTMLAudioElement[]>([]);
  const graph = useRef<{ ctx: AudioContext; gains: GainNode[] } | null>(null);
  const [volumes, setVolumes] = useState<number[]>(() => stems.map(() => 100));
  const [muted, setMuted] = useState<boolean[]>(() => stems.map(() => false));
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

  // One <audio> element per stem, created off-screen so they can be driven together.
  useEffect(() => {
    const list = stems.map((s) => {
      const a = new Audio();
      a.crossOrigin = "anonymous"; // stems come from the API origin; Web Audio needs CORS to read them
      a.preload = "auto";
      a.src = s.url;
      return a;
    });
    audios.current = list;
    graph.current = connectGains(list);
    const master = list[0];
    const onMeta = () => setDuration(Number.isFinite(master.duration) ? master.duration : 0);
    const onEnd = () => {
      list.forEach((a) => {
        a.pause();
        a.currentTime = 0;
      });
      setPlaying(false);
      setTime(0);
    };
    master.addEventListener("loadedmetadata", onMeta);
    master.addEventListener("ended", onEnd);
    if (master.readyState >= 1) onMeta();
    return () => {
      master.removeEventListener("loadedmetadata", onMeta);
      master.removeEventListener("ended", onEnd);
      list.forEach((a) => {
        a.pause();
        a.removeAttribute("src");
        a.load();
      });
      audios.current = [];
      void graph.current?.ctx.close();
      graph.current = null;
    };
  }, [stems]);

  // Apply volume / mute.
  useEffect(() => {
    audios.current.forEach((a, i) => {
      const v = stemVolume(volumes[i] ?? 100, muted[i] ?? false);
      const gain = graph.current?.gains[i];
      if (gain) gain.gain.value = v;
      else a.volume = Math.min(1, v); // no Web Audio: plain volume, no boost
    });
  }, [volumes, muted, stems]);

  // Apply speed to every stem (pitch is kept).
  useEffect(() => {
    audios.current.forEach((a) => {
      a.preservesPitch = true;
      a.playbackRate = speed;
    });
  }, [speed, stems]);

  // While playing: follow the master clock and pull any stem that drifts back into line.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const [master, ...rest] = audios.current;
      if (!master) return;
      setTime(master.currentTime);
      rest.forEach((a) => {
        if (Math.abs(a.currentTime - master.currentTime) > 0.08) a.currentTime = master.currentTime;
      });
    }, 150);
    return () => window.clearInterval(id);
  }, [playing]);

  const stop = useCallback(() => {
    audios.current.forEach((a) => a.pause());
    setPlaying(false);
  }, []);
  useStopWhenOthersPlay(MIXER_ID, stop);

  const toggle = () => {
    if (playing) return stop();
    announcePlay(MIXER_ID);
    void graph.current?.ctx.resume(); // browsers start an AudioContext suspended until a click
    const [master] = audios.current;
    if (!master) return;
    audios.current.forEach((a) => (a.currentTime = master.currentTime));
    void Promise.all(audios.current.map((a) => a.play())).catch(() => undefined);
    setPlaying(true);
  };

  const seek = (t: number) => {
    audios.current.forEach((a) => (a.currentTime = t));
    setTime(t);
  };

  const set =<T,>(arr: T[], i: number, v: T) => arr.map((x, j) => (j === i ? v : x));

  return (
    <div className="mb-3 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] p-3" aria-label="Stem mixer" role="group">
      <h3 className="mb-2 text-sm font-semibold text-[var(--color-ns-text)]">Mixer</h3>

      {/* transport */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause mix" : "Play mix"}
          className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--color-ns-purple)] text-white shadow-[var(--shadow-primary)] hover:bg-[var(--color-ns-purple-light)]"
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
          )}
        </button>
        <span className="w-10 text-right text-xs tabular-nums text-[var(--color-ns-muted)]">{fmtTime(time)}</span>
        <input
          type="range"
          aria-label="Mixer position"
          className="stem-slider min-w-0 flex-1"
          min={0}
          max={duration || 1}
          step={0.05}
          value={Math.min(time, duration || 1)}
          disabled={!duration}
          style={{ ["--fill" as string]: `${duration ? (time / duration) * 100 : 0}%` }}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="w-10 text-xs tabular-nums text-[var(--color-ns-muted)]">{fmtTime(duration)}</span>
      </div>

      {/* speed: one radio group, slow → fast */}
      <fieldset className="mt-3 flex flex-wrap items-center gap-2">
        <legend className="sr-only">Playback speed</legend>
        <span className="text-xs font-semibold text-[var(--color-ns-muted)]" aria-hidden="true">Speed</span>
        {SPEEDS.map((v) => (
          <label
            key={v}
            className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-semibold ${
              speed === v
                ? "border-[var(--color-ns-purple)] bg-[var(--color-ns-purple)] text-white"
                : "border-[var(--color-ns-border-strong)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-purple-light)]"
            }`}
          >
            <input type="radio" name="stem-speed" value={v} checked={speed === v} onChange={() => setSpeed(v)} className="sr-only" />
            {v === 1 ? "1× normal" : `${v}×`}
          </label>
        ))}
      </fieldset>

      {/* one row per stem */}
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {stems.map((s, i) => {
          return (
            <li key={s.id} className={`flex items-center gap-2.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-2.5 py-2 ${muted[i] ? "opacity-60" : ""}`}>
              <button
                type="button"
                aria-pressed={muted[i]}
                aria-label={`Mute ${s.label}`}
                title="Mute"
                onClick={() => setMuted(set(muted, i, !muted[i]))}
                className={`h-6 w-6 flex-none rounded-md text-[11px] font-bold ${muted[i] ? "bg-[var(--color-ns-red)] text-white" : "bg-[var(--color-ns-hover)] text-[var(--color-ns-muted)]"}`}
              >
                M
              </button>
              <span className="flex-none text-[var(--color-ns-purple-light)]" title={s.label}>
                <KindIcon kind={stemKind(s.id)} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-[var(--color-ns-text)]">{s.label}</span>
                  <span className="text-[11px] tabular-nums text-[var(--color-ns-muted)]">{volumes[i]}%</span>
                </div>
                <input
                  type="range"
                  className="stem-slider w-full"
                  aria-label={`${s.label} volume`}
                  min={0}
                  max={MAX_VOLUME}
                  value={volumes[i]}
                  style={{ ["--fill" as string]: `${(volumes[i] / MAX_VOLUME) * 100}%` }}
                  onChange={(e) => setVolumes(set(volumes, i, Number(e.target.value)))}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
