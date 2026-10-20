import type { KeyboardEvent } from "react";

/**
 * The instrument's head, drawn in Wilsify's own line style, with one tappable
 * tuning peg per string. The peg of the string being tuned lights up in the
 * tuner's colour and shows which way to turn it; tuned strings get a check.
 *
 * Peg order follows the real instruments (viewed from the front, nut at the
 * bottom): a 3+3 guitar has low E nearest the nut on the left; inline heads
 * (electric, bass) have the lowest string nearest the nut; a violin has D/G
 * on the left and A/E on the right.
 */

export type HeadstockKind = "acoustic" | "electric" | "bass" | "violin" | "mandolin" | "inline" | "split";

type FixedKind = "acoustic" | "electric" | "bass" | "violin" | "mandolin";

interface Peg {
  /** Index into the strings array (0 = lowest string). */
  string: number;
  side: "left" | "right";
  /** Where the string wraps the post, on the head. */
  post: [number, number];
  /** The peg/knob the player turns, outside the head. */
  knob: [number, number];
}

interface Layout {
  outline: string;
  pegs: Peg[];
  /** x of each string at the nut, lowest string first. */
  nut: number[];
  nutY: number;
  /** Optional extra decoration (violin scroll). */
  scroll?: boolean;
}

const VIEW_W = 300;
const VIEW_H = 340;

function side(string: number, s: "left" | "right", y: number, postX: number, knobX: number): Peg {
  return { string, side: s, post: [postX, y], knob: [knobX, y] };
}

const LAYOUTS: Record<FixedKind, Layout> = {
  acoustic: {
    outline: "M104 330 L98 250 C94 200 84 120 82 70 C80 42 112 26 150 30 C188 26 220 42 218 70 C216 120 206 200 202 250 L196 330 Z",
    pegs: [
      side(2, "left", 82, 112, 42), side(1, "left", 156, 110, 42), side(0, "left", 230, 106, 42),
      side(3, "right", 82, 188, 258), side(4, "right", 156, 190, 258), side(5, "right", 230, 194, 258),
    ],
    nut: [125, 135, 145, 155, 165, 175],
    nutY: 330,
  },
  electric: {
    outline: "M112 330 L112 270 C112 220 100 160 98 100 C96 60 112 30 146 26 C176 22 196 40 190 70 C184 100 176 120 178 160 C180 200 188 240 188 330 Z",
    pegs: [5, 4, 3, 2, 1, 0].map((s, i) => side(s, "left", 52 + i * 44, 116, 46)),
    nut: [128, 137, 146, 155, 164, 173],
    nutY: 330,
  },
  bass: {
    outline: "M114 330 L114 268 C112 210 102 150 100 96 C98 56 116 30 150 28 C182 26 200 46 192 80 C186 108 180 140 182 180 C184 226 186 262 186 330 Z",
    pegs: [3, 2, 1, 0].map((s, i) => side(s, "left", 70 + i * 62, 120, 46)),
    nut: [132, 144, 156, 168],
    nutY: 330,
  },
  violin: {
    outline: "M132 330 L128 150 C126 120 124 104 126 96 L174 96 C176 104 174 120 172 150 L168 330 Z",
    pegs: [side(1, "left", 140, 132, 52), side(0, "left", 214, 132, 52), side(2, "right", 177, 168, 248), side(3, "right", 251, 168, 248)],
    nut: [141, 147, 153, 159],
    nutY: 330,
    scroll: true,
  },
  mandolin: {
    outline: "M110 330 L104 260 C100 210 92 140 92 96 C92 60 120 40 150 42 C180 40 208 60 208 96 C208 140 200 210 196 260 L190 330 Z",
    pegs: [side(1, "left", 120, 118, 46), side(0, "left", 220, 114, 46), side(2, "right", 120, 182, 254), side(3, "right", 220, 186, 254)],
    nut: [133, 145, 157, 169],
    nutY: 330,
  },
};

const EVEN = (n: number, from: number, to: number) => Array.from({ length: n }, (_, i) => (n === 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1)));

/** A head drawn for any number of pegs: "inline" = all on one side, "split" = half on each side. */
function genericLayout(kind: "inline" | "split", n: number): Layout {
  const nutX = EVEN(n, 125, 175);
  if (kind === "inline") {
    const step = Math.min(44, 244 / Math.max(1, n - 1));
    return {
      outline: "M112 330 L112 270 C112 220 100 160 98 100 C96 60 112 30 146 26 C176 22 196 40 190 70 C184 100 176 120 178 160 C180 200 188 240 188 330 Z",
      pegs: Array.from({ length: n }, (_, i) => side(i, "left", 52 + (n - 1 - i) * step, 116, 46)),
      nut: nutX,
      nutY: 330,
    };
  }
  const left = Math.ceil(n / 2);
  const right = n - left;
  const ly = EVEN(left, 82, 230);
  const ry = EVEN(right, 82, 230);
  return {
    outline: "M104 330 L98 250 C94 200 84 120 82 70 C80 42 112 26 150 30 C188 26 220 42 218 70 C216 120 206 200 202 250 L196 330 Z",
    pegs: [
      ...Array.from({ length: left }, (_, k) => side(left - 1 - k, "left", ly[k], 112 - k * 2, 42)),
      ...Array.from({ length: right }, (_, k) => side(left + k, "right", ry[k], 188 + k * 2, 258)),
    ],
    nut: nutX,
    nutY: 330,
  };
}

function layoutFor(kind: HeadstockKind, n: number): Layout {
  return kind === "inline" || kind === "split" ? genericLayout(kind, n) : LAYOUTS[kind];
}

export interface HeadstockProps {
  kind: HeadstockKind;
  /** One entry per peg (a string, or a course of paired strings), in the instrument's order. */
  strings: { note: string; freq: number }[];
  /** How a note name is shown (follows the notation setting). */
  label: (note: string) => string;
  /** String currently being tuned, if any. */
  activeIndex: number | null;
  /** The mic hears the active string right now (strings shimmer). */
  ringing: boolean;
  /** Colour for the active string/peg (from the tuner's state). */
  color: string;
  /** Which way to turn the active peg, or null when in tune / idle. */
  turn: "tighten" | "loosen" | null;
  locked: boolean;
  tuned: (index: number) => boolean;
  onSelect: (index: number) => void;
}

export function Headstock({ kind, strings, label, activeIndex, ringing, color, turn, locked, tuned, onSelect }: HeadstockProps) {
  const layout = layoutFor(kind, strings.length);
  const pegs = layout.pegs.filter((p) => p.string < strings.length);

  function onKey(e: KeyboardEvent, index: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(index);
    }
  }

  return (
    <svg viewBox={`-14 0 ${VIEW_W + 28} ${VIEW_H}`} className="mx-auto w-full max-w-[18rem]" role="group" aria-label="Tuning pegs — choose a string">
      <style>{`
        @keyframes ws-string-shimmer { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-0.7px) } 75% { transform: translateX(0.7px) } }
        .ws-ringing { animation: ws-string-shimmer 90ms linear infinite; }
        @keyframes ws-turn { from { transform: rotate(0deg) } to { transform: rotate(var(--ws-turn-deg)) } }
        .ws-turn-arrow { transform-box: fill-box; transform-origin: center; animation: ws-turn 1.1s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) { .ws-ringing, .ws-turn-arrow { animation: none } }
        html[data-reduce-motion="true"] .ws-ringing, html[data-reduce-motion="true"] .ws-turn-arrow { animation: none }
      `}</style>

      {/* Head */}
      <path d={layout.outline} fill="var(--color-ns-raised)" stroke="var(--color-ns-purple-light)" strokeOpacity={0.55} strokeWidth={2} />
      {layout.scroll && (
        <g fill="none" stroke="var(--color-ns-purple-light)" strokeOpacity={0.55} strokeWidth={2}>
          <path d="M126 96 C116 80 112 52 132 38 C152 24 182 34 182 58 C182 78 162 84 152 72 C144 62 152 50 162 54" fill="var(--color-ns-raised)" />
        </g>
      )}
      {/* Nut */}
      <rect x={layout.nut[0] - 10} y={layout.nutY - 6} width={layout.nut[layout.nut.length - 1] - layout.nut[0] + 20} height={6} rx={2} fill="var(--color-ns-border-strong)" />

      {/* Peg shafts (behind the knobs) */}
      {pegs.map((p) => (
        <line key={`shaft-${p.string}`} x1={p.post[0]} y1={p.post[1]} x2={p.knob[0]} y2={p.knob[1]} stroke="var(--color-ns-border-strong)" strokeWidth={5} strokeLinecap="round" />
      ))}

      {/* Strings: post → nut */}
      {pegs.map((p) => {
        const active = activeIndex === p.string;
        const done = tuned(p.string);
        return (
          <g key={`string-${p.string}`} className={active && ringing ? "ws-ringing" : undefined}>
            <line
              x1={p.post[0]}
              y1={p.post[1]}
              x2={layout.nut[p.string]}
              y2={layout.nutY}
              stroke={active ? color : done ? "var(--color-ns-mint)" : "var(--color-ns-muted)"}
              strokeOpacity={active ? 1 : done ? 0.7 : 0.45}
              strokeWidth={active ? 2.4 : 1.4 + (strings.length - p.string) * 0.12}
            />
            <circle cx={p.post[0]} cy={p.post[1]} r={4.5} fill="var(--color-ns-bg)" stroke={active ? color : "var(--color-ns-border-strong)"} strokeWidth={2} />
          </g>
        );
      })}

      {/* Knobs = buttons */}
      {pegs.map((p) => {
        const active = activeIndex === p.string;
        const done = tuned(p.string);
        const [x, y] = p.knob;
        const note = strings[p.string].note;
        // Arrow on the outer side of the knob; it sweeps the way to turn.
        const outward = p.side === "left" ? -1 : 1;
        const deg = turn === "tighten" ? -40 * outward : 40 * outward;
        return (
          <g
            key={`peg-${p.string}`}
            role="button"
            tabIndex={0}
            aria-label={`${label(note)}${note.match(/-?\d+$/)?.[0] ?? ""} string${done ? ", tuned" : ""}${active && turn ? `, ${turn}` : ""}. Play reference tone`}
            aria-pressed={active}
            onClick={() => onSelect(p.string)}
            onKeyDown={(e) => onKey(e, p.string)}
            className="cursor-pointer outline-none [&:focus-visible>circle.ws-knob]:stroke-[var(--color-ns-purple-light)]"
          >
            {active && <circle cx={x} cy={y} r={27} fill={color} opacity={locked ? 0.3 : 0.18} />}
            <circle
              className="ws-knob"
              cx={x}
              cy={y}
              r={20}
              fill={active ? color : "var(--color-ns-card)"}
              stroke={active ? color : done ? "var(--color-ns-mint)" : "var(--color-ns-border-strong)"}
              strokeWidth={2.5}
            />
            <text
              x={x}
              y={y + 5}
              textAnchor="middle"
              fontSize={label(note).length > 2 ? 11 : 15}
              fontWeight={800}
              fill={active ? "var(--color-ns-ink)" : "var(--color-ns-text)"}
              style={{ fontFamily: "var(--font-heading, inherit)" }}
            >
              {label(note)}
            </text>
            {done && !active && (
              <g transform={`translate(${x + outward * 15} ${y - 15})`}>
                <circle r={7} fill="var(--color-ns-mint)" />
                <path d="M-3 0 L-1 2.5 L3.2 -2.5" fill="none" stroke="var(--color-ns-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
            {active && turn && (
              <g className="ws-turn-arrow" style={{ ["--ws-turn-deg" as string]: `${deg}deg` }}>
                <path
                  d={`M${x + outward * 24} ${y - 14} A28 28 0 0 ${p.side === "left" ? 0 : 1} ${x + outward * 24} ${y + 14}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
                {turn === "tighten" ? (
                  <path d={`M${x + outward * 24} ${y - 14} l${outward * 7} -1 M${x + outward * 24} ${y - 14} l${outward * 1} 7`} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
                ) : (
                  <path d={`M${x + outward * 24} ${y + 14} l${outward * 7} 1 M${x + outward * 24} ${y + 14} l${outward * 1} -7`} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
                )}
              </g>
            )}
          </g>
        );
      })}

      {/* "Tighten" / "Loosen" caption under the active peg */}
      {(() => {
        const p = pegs.find((q) => q.string === activeIndex);
        if (!p || !turn) return null;
        return (
          <text x={p.knob[0]} y={p.knob[1] + 40} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
            {turn === "tighten" ? "Tighten" : "Loosen"}
          </text>
        );
      })()}
    </svg>
  );
}
