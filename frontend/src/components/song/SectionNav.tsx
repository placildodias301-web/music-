import type { SongSection } from "../../lib/song/model";

interface Props {
  sections: SongSection[];
  currentId: string | null;
  onJump: (section: SongSection) => void;
}

/** [Intro] [Verse 1] [Chorus] … — scrolls to the section and, when audio is loaded, plays from it. */
export function SectionNav({ sections, currentId, onJump }: Props) {
  if (sections.length < 2) return null;
  return (
    <nav aria-label="Song sections" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {sections.map((s) => {
        const current = s.id === currentId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onJump(s)}
            aria-current={current ? "true" : undefined}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              current
                ? "border-[var(--color-ns-purple-light)]/60 bg-[var(--color-ns-purple)]/20 text-[var(--color-ns-text)]"
                : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </nav>
  );
}
