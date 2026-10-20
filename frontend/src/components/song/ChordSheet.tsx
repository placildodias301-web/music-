import { useEffect, useRef } from "react";
import type { ChordEvent, SongSection as Section } from "../../lib/song/model";
import type { SongCursor } from "./useSongCursor";
import { SongSection } from "./SongSection";
import type { LineRenderOptions } from "./ChordLyricLine";

interface Props {
  sections: Section[];
  options: LineRenderOptions;
  render: (c: string) => string;
  cursor: SongCursor;
  playing: boolean;
  autoScroll: boolean;
  light: boolean;
  selectedChord: string | null;
  lowConfidence: number;
  canSeek: boolean;
  loopSectionId: string | null;
  onSeek: (t: number) => void;
  onChord: (c: ChordEvent) => void;
  onLoop: (s: Section) => void;
}

const USER_SCROLL_PAUSE_MS = 3500;
const MIN_GAP_MS = 900;

/**
 * The sheet itself, plus gentle auto-scroll: it only moves when the playing
 * line leaves a comfortable band of the screen, at most about once a second,
 * and stands still for a few seconds after the user scrolls by hand — so
 * it never jumps on every chord.
 */
export function ChordSheet(props: Props) {
  const { sections, cursor, playing, autoScroll, light, loopSectionId } = props;
  const root = useRef<HTMLDivElement>(null);
  const lastUser = useRef(0);
  const lastAuto = useRef(0);

  useEffect(() => {
    const mark = () => (lastUser.current = performance.now());
    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("touchmove", mark, { passive: true });
    window.addEventListener("keydown", (e) => ["ArrowUp", "ArrowDown", "PageUp", "PageDown", " "].includes(e.key) && mark());
    return () => {
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchmove", mark);
    };
  }, []);

  useEffect(() => {
    if (!autoScroll || !playing || !cursor.lineId) return;
    const now = performance.now();
    if (now - lastUser.current < USER_SCROLL_PAUSE_MS || now - lastAuto.current < MIN_GAP_MS) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(cursor.lineId)}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top > vh * 0.2 && r.bottom < vh * 0.7) return; // already comfortably visible
    lastAuto.current = now;
    window.scrollBy({ top: r.top - vh * 0.38, behavior: "smooth" });
  }, [cursor.lineId, autoScroll, playing]);

  return (
    <div
      ref={root}
      className="rounded-2xl border border-[var(--color-ns-border)] p-4 sm:p-6"
      style={{
        colorScheme: light ? "light" : "dark",
        background: light ? "#fbfaf7" : "var(--color-ns-card)",
        ["--color-ns-text" as string]: light ? "#16192b" : undefined,
        ["--color-ns-muted" as string]: light ? "#4b5470" : undefined,
        ["--color-ns-dim" as string]: light ? "#7a839c" : undefined,
        ["--color-ns-border" as string]: light ? "#dfe1ea" : undefined,
      }}
    >
      {sections.map((s) => (
        <SongSection
          key={s.id}
          section={s}
          options={props.options}
          render={props.render}
          activeLineId={cursor.sectionId === s.id ? cursor.lineId : null}
          activeChordTime={cursor.chordTime}
          selectedChord={props.selectedChord}
          lowConfidence={props.lowConfidence}
          canSeek={props.canSeek}
          looping={loopSectionId === s.id}
          onSeek={props.onSeek}
          onChord={props.onChord}
          onLoop={props.onLoop}
        />
      ))}
    </div>
  );
}
