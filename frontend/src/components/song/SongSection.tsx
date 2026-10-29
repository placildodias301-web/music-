import type { ChordEvent, SongSection as Section } from "../../lib/song/model";
import { ChordLyricLine, type LineRenderOptions } from "./ChordLyricLine";

interface Props {
  section: Section;
  options: LineRenderOptions;
  render: (c: string) => string;
  activeLineId: string | null;
  activeChordTime: number | null;
  activeWordIndex?: number | null;
  selectedChord: string | null;
  lowConfidence: number;
  canSeek: boolean;
  looping: boolean;
  onSeek: (t: number) => void;
  onChord: (c: ChordEvent) => void;
  onLoop: (section: Section) => void;
}

export function SongSection({
  section,
  options,
  render,
  activeLineId,
  activeChordTime,
  activeWordIndex,
  selectedChord,
  lowConfidence,
  canSeek,
  looping,
  onSeek,
  onChord,
  onLoop,
}: Props) {
  const timed = section.startTime !== null;
  return (
    <section data-section-id={section.id} aria-label={section.name} className="mb-7">
      <div className="mb-2 flex items-center gap-3">
        <span className="inline-flex items-center rounded-lg border border-[var(--color-ns-purple-light)]/30 bg-[var(--color-ns-purple)]/10 px-2.5 py-1 font-heading text-xs font-bold uppercase tracking-widest text-[var(--color-ns-purple-light)] shadow-sm">
          [{section.name}]
        </span>
        {section.nameSource === "inferred" && (
          <span
            className="text-[10px] font-semibold text-[var(--color-ns-dim)]"
            title="Named from how the song repeats — rename by adding a [Section] header to your lyrics"
          >
            (estimated)
          </span>
        )}
        {timed && canSeek && (
          <button
            type="button"
            onClick={() => onLoop(section)}
            aria-pressed={looping}
            title="Loop this section"
            className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
              looping
                ? "border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)]/15 text-[var(--color-ns-amber)]"
                : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            ↻ {looping ? "Looping" : "Loop"}
          </button>
        )}
      </div>
      <div className="space-y-1">
        {section.lines.map((line) => (
          <ChordLyricLine
            key={line.id}
            line={line}
            options={options}
            render={render}
            isActiveLine={activeLineId === line.id}
            activeChordTime={activeLineId === line.id ? activeChordTime : null}
            activeWordIndex={activeLineId === line.id ? activeWordIndex : null}
            selectedChord={selectedChord}
            lowConfidence={lowConfidence}
            canSeek={canSeek}
            onSeek={onSeek}
            onChord={onChord}
          />
        ))}
      </div>
    </section>
  );
}
