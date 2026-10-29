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

function isPassingOrSlash(symbol: string): boolean {
  return symbol.includes("/") || /dim|aug|alt|sus2|b5|#5|add9/i.test(symbol);
}

/** One chord above its lyric. A real button: keyboard reachable, announces its state. */
export function ChordBadge({ label, colorKey, active, uncertain, selected, fontSize, title, onClick }: ChordBadgeProps) {
  const c = chordColors(colorKey);
  const isPassing = isPassingOrSlash(label) || isPassingOrSlash(colorKey);

  // Palette: Main chords: vibrant indigo/purple tone. Passing/slash/filler chords: distinct amber/cyan tone.
  const badgeColors = isPassing
    ? {
        fg: "light-dark(#b45309, #38bdf8)",
        bg: "light-dark(rgba(245, 158, 11, 0.12), rgba(56, 189, 248, 0.14))",
        border: "light-dark(rgba(245, 158, 11, 0.35), rgba(56, 189, 248, 0.4))",
        activeBg: "light-dark(#d97706, #0284c7)",
        activeGlow: "0 0 0 3px rgba(56, 189, 248, 0.25), 0 0 16px rgba(56, 189, 248, 0.6)",
      }
    : {
        fg: "light-dark(#6366f1, #a78bfa)",
        bg: "light-dark(rgba(99, 102, 241, 0.12), rgba(167, 139, 250, 0.14))",
        border: "light-dark(rgba(99, 102, 241, 0.3), rgba(167, 139, 250, 0.35))",
        activeBg: "light-dark(#4f46e5, #7c3aed)",
        activeGlow: "0 0 0 3px rgba(139, 92, 246, 0.25), 0 0 16px rgba(139, 92, 246, 0.6)",
      };

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={selected}
      data-active={active || undefined}
      className="chord-badge rounded-md px-1.5 font-bold leading-tight tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        fontSize,
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace",
        color: active ? "light-dark(#ffffff, #0b1020)" : badgeColors.fg,
        background: active ? badgeColors.activeBg : badgeColors.bg,
        border: `1px solid ${active ? "transparent" : badgeColors.border}`,
        boxShadow: active ? badgeColors.activeGlow : undefined,
        outline: selected && !active ? `1.5px dashed ${c.border}` : undefined,
        outlineOffset: selected && !active ? -1 : undefined,
        transform: active ? "scale(1.18)" : undefined,
        transition: "transform 120ms ease, background-color 120ms ease, box-shadow 120ms ease",
        textDecoration: uncertain ? "underline dotted" : undefined,
        textUnderlineOffset: 3,
      }}
    >
      {displayChord(label)}
      {uncertain && (
        <sup aria-hidden="true" className="ml-0.5 text-[0.65em] font-semibold opacity-70">
          ?
        </sup>
      )}
    </button>
  );
}
