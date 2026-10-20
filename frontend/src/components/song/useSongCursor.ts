import { useEffect, useRef, useState } from "react";
import type { PlaybackClock } from "../../lib/usePlaybackClock";
import type { SongSection } from "../../lib/song/model";
import { lineAt } from "../../lib/song/sections";

export interface SongCursor {
  lineId: string | null;
  sectionId: string | null;
  /** `time` of the chord event sounding now (matches ChordEvent.time). */
  chordTime: number | null;
  chord: string | null;
  prevChord: string | null;
  nextChord: string | null;
}

const NONE: SongCursor = { lineId: null, sectionId: null, chordTime: null, chord: null, prevChord: null, nextChord: null };

/**
 * Follows the playback clock and reports the current line / chord — but only
 * re-renders when one of them changes (not on every animation frame).
 */
export function useSongCursor(clock: PlaybackClock, sections: SongSection[]): SongCursor {
  const [cursor, setCursor] = useState<SongCursor>(NONE);
  const last = useRef<SongCursor>(NONE);

  useEffect(() => {
    const flat = sections.flatMap((s) => s.lines.flatMap((l) => l.chords));
    const update = (t: number) => {
      const hit = lineAt(sections, t);
      let next: SongCursor = NONE;
      if (hit) {
        const chord = [...hit.line.chords].reverse().find((c) => t >= c.time) ?? hit.line.chords[0] ?? null;
        const i = chord ? flat.findIndex((c) => c === chord) : -1;
        next = {
          lineId: hit.line.id,
          sectionId: hit.section.id,
          chordTime: chord?.time ?? null,
          chord: chord?.originalChord ?? null,
          prevChord: i > 0 ? flat[i - 1].originalChord : null,
          nextChord: i >= 0 && i + 1 < flat.length ? flat[i + 1].originalChord : null,
        };
      }
      const p = last.current;
      if (p.lineId !== next.lineId || p.chordTime !== next.chordTime) {
        last.current = next;
        setCursor(next);
      }
    };
    update(clock.getCurrentTime());
    return clock.subscribe(update);
  }, [clock, sections]);

  return cursor;
}
