import type { RefObject } from "react";
import type { SongSection } from "../../lib/song/model";
import { SettingsSelect } from "../settings/SettingsSelect";

export const SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;

interface Props {
  audioRef: RefObject<HTMLAudioElement | null>;
  speed: number;
  onSpeed: (s: number) => void;
  sections: SongSection[];
  loopSectionId: string | null;
  onLoopSection: (id: string | null) => void;
  disabled: boolean;
}

/** Speed (50–100%) and section looping for practising. Needs audio. */
export function PracticeMode({ audioRef, speed, onSpeed, sections, loopSectionId, onLoopSection, disabled }: Props) {
  const apply = (s: number) => {
    const a = audioRef.current;
    if (a) {
      a.playbackRate = s;
      // Keep the pitch while slowing down (default in modern browsers; set explicitly for older ones).
      (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    }
    onSpeed(s);
  };
  const timed = sections.filter((s) => s.startTime !== null && s.endTime !== null);
  const slower = SPEEDS.filter((s) => s < speed).pop();
  return (
    <div className={`space-y-2 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3 ${disabled ? "opacity-50" : ""}`}>
      <p className="text-xs font-semibold text-[var(--color-ns-muted)]">Practice</p>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button key={s} type="button" disabled={disabled} onClick={() => apply(s)} aria-pressed={speed === s} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${speed === s ? "border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)]/15 text-[var(--color-ns-amber)]" : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)]"}`}>
            {Math.round(s * 100)}%
          </button>
        ))}
        <button type="button" disabled={disabled || slower === undefined} onClick={() => slower !== undefined && apply(slower)} className="rounded-lg border border-[var(--color-ns-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-ns-muted)] disabled:opacity-40">
          Slow down
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-[var(--color-ns-muted)]">
        <span>Loop section</span>
        <div className="w-40">
          <SettingsSelect
            variant="field"
            label="Loop section"
            disabled={disabled || !timed.length}
            value={loopSectionId ?? ""}
            options={[{ value: "", label: "Off" }, ...timed.map((s) => ({ value: s.id, label: s.name }))]}
            onChange={(v) => onLoopSection(v || null)}
          />
        </div>
      </div>
    </div>
  );
}
