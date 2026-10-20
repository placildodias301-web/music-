import { chordColors, displayChord } from "../../lib/chordSync";

interface ChordBadgeProps {
  /** The text to show (already transposed / simplified). */
  label: string;
  /** Used only for the colour, so a chord keeps its colour while it is transposed. */
  colorKey: string;
  active?: boolean;
  /** Low-confidence detection: shown with a dotted underline and a hint. */
  uncertain?: boolean;
  selected?: boolean;
  fontSize: number;
  title?: string;
  onClick?: () => void;
}

/** One chord above its lyric. A real button: keyboard reachable, announces its state. */
export function ChordBadge({ label, colorKey, active, uncertain, selected, fontSize, title, onClick }: ChordBadgeProps) {
  const c = chordColors(colorKey);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={selected}
      data-active={active || undefined}
      className="chord-badge rounded-md px-1.5 font-heading font-bold leading-tight focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        fontSize,
        // Now-playing: a solid filled pill with a glow, impossible to miss. "Selected" (chord panel) is only a dashed outline.
        color: active ? "light-dark(#ffffff, #0b1020)" : c.fg,
        background: active ? c.fg : "transparent",
        boxShadow: active ? `0 0 0 3px ${c.bg}, 0 0 16px ${c.fg}` : undefined,
        outline: selected && !active ? `1.5px dashed ${c.border}` : undefined,
        outlineOffset: selected && !active ? -1 : undefined,
        transform: active ? "scale(1.18)" : undefined,
        transition: "transform 120ms ease, background-color 120ms ease, box-shadow 120ms ease",
        textDecoration: uncertain ? "underline dotted" : undefined,
        textUnderlineOffset: 3,
      }}
    >
      {displayChord(label)}
    </button>
  );
}
