import { useEffect, useRef, useState } from "react";
import { SettingsSelect } from "../settings/SettingsSelect";
import { announcePlay, useStopWhenOthersPlay } from "../../lib/audioBus";
import { fmtTime } from "../../lib/stemJob";
import type { StemFile } from "../../lib/stemJob";
import { PlayIcon } from "./ThemedAudio";

const ID = "ab-compare";

/**
 * A/B: the original song and one stem play in lock-step; the A/B switch only changes which one you hear,
 * so you can flip between them mid-song without losing your place.
 */
export function AbCompare({ originalUrl, stems }: { originalUrl: string; stems: StemFile[] }) {
  const [stemId, setStemId] = useState(stems[0]?.id ?? "");
  const [side, setSide] = useState<"A" | "B">("B");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const a = useRef<HTMLAudioElement | null>(null);
  const b = useRef<HTMLAudioElement | null>(null);
  const sideRef = useRef(side);
  const stem = stems.find((s) => s.id === stemId) ?? stems[0];

  useEffect(() => {
    sideRef.current = side;
    if (a.current) a.current.muted = side !== "A";
    if (b.current) b.current.muted = side !== "B";
  }, [side]);

  // (Re)build the two players when the song or the chosen stem changes; keep the playhead and play state.
  useEffect(() => {
    if (!stem) return;
    const el1 = new Audio(originalUrl);
    const el2 = new Audio(stem.url);
    el1.preload = el2.preload = "auto";
    el1.muted = sideRef.current !== "A";
    el2.muted = sideRef.current !== "B";
    const prev = a.current;
    const resumeAt = prev ? prev.currentTime : 0;
    const wasPlaying = prev ? !prev.paused : false;
    a.current = el1;
    b.current = el2;
    const meta = () => {
      const d = Math.min(...[el1.duration, el2.duration].filter((n) => Number.isFinite(n)));
      setDuration(Number.isFinite(d) ? d : 0);
    };
    el1.addEventListener("loadedmetadata", meta);
    el2.addEventListener("loadedmetadata", meta);
    const end = () => {
      el1.pause();
      el2.pause();
      el1.currentTime = el2.currentTime = 0;
      setPlaying(false);
      setTime(0);
    };
    el1.addEventListener("ended", end);
    el2.addEventListener("ended", end);
    if (resumeAt) el1.currentTime = el2.currentTime = resumeAt;
    if (wasPlaying) void Promise.all([el1.play(), el2.play()]).catch(() => setPlaying(false));
    return () => {
      el1.pause();
      el2.pause();
      el1.removeAttribute("src");
      el2.removeAttribute("src");
      el1.load();
      el2.load();
    };
  }, [originalUrl, stem]);

  // While playing: follow the original's clock and keep the stem locked to it.
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      const x = a.current;
      const y = b.current;
      if (!x || !y) return;
      setTime(x.currentTime);
      if (Math.abs(x.currentTime - y.currentTime) > 0.08) y.currentTime = x.currentTime;
    }, 150);
    return () => window.clearInterval(t);
  }, [playing]);

  const stop = () => {
    a.current?.pause();
    b.current?.pause();
    setPlaying(false);
  };
  useStopWhenOthersPlay(ID, stop);

  const toggle = () => {
    if (playing) return stop();
    const x = a.current;
    const y = b.current;
    if (!x || !y) return;
    announcePlay(ID);
    y.currentTime = x.currentTime;
    void Promise.all([x.play(), y.play()]).then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const seek = (t: number) => {
    if (a.current) a.current.currentTime = t;
    if (b.current) b.current.currentTime = t;
    setTime(t);
  };

  if (!stem) return null;
  const options = stems.map((s) => ({ value: s.id, label: s.label }));

  return (
    <div className="mb-3 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] p-3" role="group" aria-label="A/B compare">
      <h3 className="mb-0.5 text-sm font-semibold text-[var(--color-ns-text)]">A/B compare</h3>
      <p className="mb-3 text-xs text-[var(--color-ns-muted)]">Pick a stem, press play, then flip between the original and the stem — they stay in sync.</p>

      <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <SettingsSelect variant="field" label="Stem to compare" value={stem.id} options={options} onChange={setStemId} />
        <div role="group" aria-label="Which one you hear" className="inline-flex overflow-hidden rounded-xl border border-[var(--color-ns-border-strong)]">
          {(["A", "B"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              onClick={() => setSide(s)}
              className={`min-w-[7.5rem] px-4 py-2.5 text-sm font-semibold transition-colors ${
                side === s ? "bg-[var(--color-ns-purple)] text-white" : "bg-[var(--color-ns-raised)] text-[var(--color-ns-text)] hover:bg-[var(--color-ns-hover)]"
              }`}
            >
              {s === "A" ? "A · Original" : "B · Stem"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause comparison" : "Play comparison"}
          className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--color-ns-purple)] text-white shadow-[var(--shadow-primary)] hover:bg-[var(--color-ns-purple-light)]"
        >
          <PlayIcon playing={playing} />
        </button>
        <span className="w-[5.5rem] flex-none text-xs tabular-nums text-[var(--color-ns-muted)]">
          {fmtTime(time)} / {fmtTime(duration)}
        </span>
        <input
          type="range"
          aria-label="Comparison position"
          className="stem-slider min-w-0 flex-1"
          min={0}
          max={duration || 1}
          step={0.05}
          value={Math.min(time, duration || 1)}
          disabled={!duration}
          style={{ ["--fill" as string]: `${duration ? (time / duration) * 100 : 0}%` }}
          onChange={(e) => seek(Number(e.target.value))}
        />
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-[var(--color-ns-muted)]">
        Now hearing: <strong className="text-[var(--color-ns-text)]">{side === "A" ? "the original song" : stem.label}</strong>
      </p>
    </div>
  );
}
