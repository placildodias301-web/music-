import { useMemo } from "react";
import type { TargetString } from "../../lib/tuner/tunings";

/**
 * A harp has too many strings for pegs, so they are laid out as note buttons grouped by octave, lowest octave first.
 * The string being played lights up; strings confirmed in tune get a tick. Tap one to hear it (and tune it by hand).
 */
export function HarpStrings({
  targets,
  activeIndex,
  tuned,
  ringing,
  color,
  locked,
  label,
  onSelect,
}: {
  targets: TargetString[];
  activeIndex: number | null;
  tuned: Set<number>;
  ringing: boolean;
  color: string;
  locked: boolean;
  label: (note: string) => string;
  onSelect: (index: number) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<number, { index: number; target: TargetString }[]>();
    targets.forEach((t, index) => {
      const octave = Number(/-?\d+$/.exec(t.note)?.[0] ?? 0);
      if (!map.has(octave)) map.set(octave, []);
      map.get(octave)!.push({ index, target: t });
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [targets]);

  return (
    <div className="max-h-[22rem] space-y-3 overflow-y-auto pr-1 md:max-h-[26rem]" role="group" aria-label="Harp strings, grouped by octave">
      {groups.map(([octave, items]) => (
        <div key={octave}>
          <p className="mb-1.5 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ns-dim)]">Octave {octave}</p>
          <div className="flex flex-wrap gap-1.5">
            {items.map(({ index, target }) => {
              const active = activeIndex === index;
              const isTuned = tuned.has(index);
              const text = label(target.note.replace(/-?\d+$/, ""));
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => onSelect(index)}
                  aria-pressed={active}
                  aria-label={`${text}${octave} string${isTuned ? ", tuned" : ""}${active ? ", selected" : ""}`}
                  className="relative flex h-10 min-w-[2.6rem] items-center justify-center rounded-lg border px-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
                  style={
                    active
                      ? { borderColor: color, background: `color-mix(in srgb, ${color} 22%, transparent)`, color: "var(--color-ns-text)", boxShadow: ringing || locked ? `0 0 12px ${color}` : undefined }
                      : isTuned
                      ? { borderColor: "var(--color-ns-mint)", color: "var(--color-ns-mint)" }
                      : { borderColor: "var(--color-ns-border)", color: "var(--color-ns-muted)" }
                  }
                >
                  {text}
                  {isTuned && (
                    <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-ns-mint)] text-[0.5rem] text-[var(--color-ns-ink)]">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
