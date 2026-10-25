import { useMemo } from "react";
import type { TargetString } from "../../lib/tuner/tunings";
import { Headstock, type HeadstockKind } from "./Headstock";

export interface InstrumentVisualizerProps {
  instrumentId: string;
  category: string;
  targets: TargetString[];
  selectedIndex: number;
  activeStringIndex: number | null;
  ringing: boolean;
  color: string;
  turn: "tighten" | "loosen" | null;
  locked: boolean;
  tunedSet: Set<number>;
  label: (note: string) => string;
  onSelect: (index: number) => void;
  frequency: number | null;
  isListening: boolean;
  cents: number | null;
  variantHead?: HeadKind;
  isAuto?: boolean;
}

type HeadKind = HeadstockKind;

/* ─────────────────────────────────────────────────────────────
 * 1. BOWED STRINGS VISUALIZER (Violin, Viola, Cello, Double Bass, Erhu)
 * ───────────────────────────────────────────────────────────── */
function BowedStringsVisualizer({
  targets,
  activeIndex,
  ringing,
  color,
  turn,
  locked,
  tunedSet,
  label,
  onSelect,
}: {
  targets: TargetString[];
  activeIndex: number | null;
  ringing: boolean;
  color: string;
  turn: "tighten" | "loosen" | null;
  locked: boolean;
  tunedSet: Set<number>;
  label: (note: string) => string;
  onSelect: (index: number) => void;
}) {
  const n = targets.length > 0 ? targets.length : 4;
  // Peg layout: 2 on left, 2 on right (for 4 strings), or evenly distributed
  const leftCount = Math.ceil(n / 2);

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <svg
        viewBox="0 0 280 340"
        className="mx-auto w-full max-w-[19rem] drop-shadow-md"
        role="group"
        aria-label="Orchestral fingerboard and tuning pegs"
      >
        <defs>
          <linearGradient id="fingerboardGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1a1a24" />
            <stop offset="50%" stopColor="#2a2a38" />
            <stop offset="100%" stopColor="#1a1a24" />
          </linearGradient>
          <filter id="glowFilter" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <style>{`
          @keyframes bowedVibrate {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-1.2px); }
            75% { transform: translateX(1.2px); }
          }
          .bowed-ringing {
            animation: bowedVibrate 80ms ease-in-out infinite;
          }
        `}</style>

        {/* Carved Scroll at Top */}
        <path
          d="M125 75 C115 50 110 32 128 20 C146 8 168 15 168 35 C168 52 152 60 142 50 C134 40 142 30 150 34"
          fill="none"
          stroke="var(--color-ns-purple-light)"
          strokeOpacity={0.6}
          strokeWidth={2.5}
        />

        {/* Pegbox Body */}
        <path
          d="M116 75 L112 185 L168 185 L164 75 Z"
          fill="var(--color-ns-raised)"
          stroke="var(--color-ns-border-strong)"
          strokeWidth={2}
        />
        {/* Pegbox Interior Hollow */}
        <rect x="122" y="85" width="36" height="90" rx="3" fill="#0d0d14" />

        {/* Ebony Nut */}
        <rect x="110" y="185" width="60" height="7" rx="1.5" fill="#3a3a4c" />

        {/* Ebony Fingerboard down to base */}
        <path
          d="M113 192 L102 335 L178 335 L167 192 Z"
          fill="url(#fingerboardGrad)"
          stroke="var(--color-ns-border-strong)"
          strokeWidth={1.5}
        />

        {/* Peg shafts & Tuning Knobs */}
        {targets.map((target, idx) => {
          const isLeft = idx < leftCount;
          const posIndex = isLeft ? idx : idx - leftCount;
          const stepY = 100 + posIndex * 34;
          const knobX = isLeft ? 48 : 232;
          const shaftInnerX = isLeft ? 122 : 158;
          const active = activeIndex === idx;
          const done = tunedSet.has(idx);
          const noteText = label(target.note.replace(/-?\d+$/, ""));

          return (
            <g
              key={target.id}
              onClick={() => onSelect(idx)}
              className="cursor-pointer group"
              role="button"
              tabIndex={0}
              aria-label={`String ${idx + 1}: ${noteText}`}
            >
              {/* Wooden shaft connecting knob through pegbox */}
              <line
                x1={knobX}
                y1={stepY}
                x2={shaftInnerX}
                y2={stepY}
                stroke="var(--color-ns-border-strong)"
                strokeWidth={5}
                strokeLinecap="round"
              />

              {/* Peg Knob Glow when active */}
              {active && (
                <circle
                  cx={knobX}
                  cy={stepY}
                  r={24}
                  fill={color}
                  opacity={locked ? 0.35 : 0.2}
                />
              )}

              {/* Peg Knob Button */}
              <circle
                cx={knobX}
                cy={stepY}
                r={18}
                fill={active ? color : "var(--color-ns-card)"}
                stroke={active ? color : done ? "var(--color-ns-mint)" : "var(--color-ns-border-strong)"}
                strokeWidth={2.2}
                className="transition-all duration-200 group-hover:scale-105"
              />
              <text
                x={knobX}
                y={stepY + 5}
                textAnchor="middle"
                fontSize={noteText.length > 2 ? 11 : 13}
                fontWeight={800}
                fill={active ? "var(--color-ns-ink)" : "var(--color-ns-text)"}
                fontFamily="var(--font-heading, inherit)"
              >
                {noteText}
              </text>

              {/* Tuned Checkmark badge */}
              {done && !active && (
                <g transform={`translate(${knobX + (isLeft ? -13 : 13)} ${stepY - 13})`}>
                  <circle r={6.5} fill="var(--color-ns-mint)" />
                  <path
                    d="M-2.5 0 L-0.8 2.2 L2.8 -2"
                    fill="none"
                    stroke="var(--color-ns-ink)"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                </g>
              )}

              {/* Direction Indicator */}
              {active && turn && (
                <text
                  x={knobX}
                  y={stepY + 30}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="bold"
                  fill={color}
                >
                  {turn === "tighten" ? "Tighten ↑" : "Loosen ↓"}
                </text>
              )}
            </g>
          );
        })}

        {/* Strings Running Along Fingerboard */}
        {targets.map((target, idx) => {
          const isLeft = idx < leftCount;
          const posIndex = isLeft ? idx : idx - leftCount;
          const stepY = 100 + posIndex * 34;
          const shaftInnerX = isLeft ? 130 + idx * 3 : 150 - (idx - leftCount) * 3;

          // Nut X coordinates spaced across nut
          const nutX = 120 + (idx / Math.max(1, n - 1)) * 40;
          // Bottom Bridge X coordinates spaced wider
          const bridgeX = 112 + (idx / Math.max(1, n - 1)) * 56;

          const active = activeIndex === idx;
          const done = tunedSet.has(idx);

          return (
            <g
              key={`bowed-str-${target.id}`}
              className={active && ringing ? "bowed-ringing" : undefined}
            >
              {/* String from peg shaft over nut */}
              <line
                x1={shaftInnerX}
                y1={stepY}
                x2={nutX}
                y2={185}
                stroke={active ? color : done ? "var(--color-ns-mint)" : "var(--color-ns-muted)"}
                strokeOpacity={active ? 1 : 0.4}
                strokeWidth={active ? 2.2 : 1.2}
              />
              {/* String down the length of fingerboard */}
              <line
                x1={nutX}
                y1={192}
                x2={bridgeX}
                y2={335}
                stroke={active ? color : done ? "var(--color-ns-mint)" : "var(--color-ns-muted)"}
                strokeOpacity={active ? 1 : done ? 0.75 : 0.45}
                strokeWidth={active ? 3 : 1.3 + (n - 1 - idx) * 0.4}
                filter={active && ringing ? "url(#glowFilter)" : undefined}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 2. HARP / SANTOOR VISUALIZER (Harp, Santoor, Dulcimer, Zither)
 * ───────────────────────────────────────────────────────────── */
function HarpSantoorVisualizer({
  targets,
  activeIndex,
  ringing,
  color,
  tunedSet,
  label,
  onSelect,
}: {
  targets: TargetString[];
  activeIndex: number | null;
  ringing: boolean;
  color: string;
  tunedSet: Set<number>;
  label: (note: string) => string;
  onSelect: (index: number) => void;
}) {
  const displayTargets = targets.length > 0 ? targets.slice(0, 24) : [];

  return (
    <div className="relative flex flex-col items-center justify-center select-none w-full">
      <svg
        viewBox="0 0 320 280"
        className="mx-auto w-full max-w-[21rem]"
        role="group"
        aria-label="Multi-string harp and santoor visualizer"
      >
        <defs>
          <linearGradient id="harpWood" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2c221e" />
            <stop offset="100%" stopColor="#181210" />
          </linearGradient>
        </defs>

        <style>{`
          @keyframes harpWave {
            0%, 100% { stroke-dashoffset: 0; }
            50% { stroke-dashoffset: 6; }
          }
          .harp-ringing {
            animation: harpWave 60ms linear infinite;
            stroke-dasharray: 4 2;
          }
        `}</style>

        {/* Resonator Soundbox Frame (Trapezoid / Soundboard) */}
        <polygon
          points="40,40 280,70 300,240 20,240"
          fill="url(#harpWood)"
          stroke="var(--color-ns-border-strong)"
          strokeWidth={2.5}
        />

        {/* Soundhole Rosettes */}
        <circle cx="100" cy="180" r="18" fill="#0d0d14" stroke="var(--color-ns-border)" strokeWidth={1.5} />
        <circle cx="220" cy="190" r="16" fill="#0d0d14" stroke="var(--color-ns-border)" strokeWidth={1.5} />

        {/* Bridges */}
        <line x1="45" y1="55" x2="275" y2="82" stroke="var(--color-ns-purple-light)" strokeOpacity={0.6} strokeWidth={4} strokeLinecap="round" />
        <line x1="28" y1="225" x2="292" y2="225" stroke="var(--color-ns-purple-light)" strokeOpacity={0.6} strokeWidth={4} strokeLinecap="round" />

        {/* Strings */}
        {displayTargets.map((target, idx) => {
          const count = displayTargets.length;
          const frac = count > 1 ? idx / (count - 1) : 0.5;
          const topX = 52 + frac * (268 - 52);
          const topY = 56 + frac * (82 - 56);
          const botX = 36 + frac * (284 - 36);
          const botY = 224;

          const active = activeIndex === idx;
          const done = tunedSet.has(idx);
          const noteText = label(target.note.replace(/-?\d+$/, ""));

          return (
            <g
              key={target.id}
              onClick={() => onSelect(idx)}
              className="cursor-pointer group"
              role="button"
              tabIndex={0}
              aria-label={`String ${idx + 1}: ${noteText}`}
            >
              {/* Laser-like Glow behind active string */}
              {active && (
                <line
                  x1={topX}
                  y1={topY}
                  x2={botX}
                  y2={botY}
                  stroke={color}
                  strokeWidth={9}
                  strokeOpacity={0.3}
                />
              )}

              {/* Physical String */}
              <line
                x1={topX}
                y1={topY}
                x2={botX}
                y2={botY}
                stroke={active ? color : done ? "var(--color-ns-mint)" : "var(--color-ns-border-strong)"}
                strokeOpacity={active ? 1 : done ? 0.8 : 0.5}
                strokeWidth={active ? 2.8 : 1.2}
                className={active && ringing ? "harp-ringing" : "transition-all duration-150"}
              />

              {/* Tuning Pin (Top) */}
              <circle
                cx={topX}
                cy={topY}
                r={active ? 4.5 : 2.5}
                fill={active ? color : "var(--color-ns-border)"}
              />

              {/* Bottom Hitch Pin / Hitch Bead */}
              <circle
                cx={botX}
                cy={botY}
                r={active ? 4.5 : 2.5}
                fill={active ? color : "var(--color-ns-border)"}
              />

              {/* Active Note Label Tag */}
              {active && (
                <g transform={`translate(${botX} ${botY + 22})`}>
                  <rect
                    x="-14"
                    y="-10"
                    width="28"
                    height="18"
                    rx="4"
                    fill={color}
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="900"
                    fill="var(--color-ns-ink)"
                  >
                    {noteText}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 3. KEYBOARD & MALLET VISUALIZER (Piano, Organ, Accordion, Keys, Mallet)
 * ───────────────────────────────────────────────────────────── */
function KeyboardMalletVisualizer({
  targets,
  activeIndex,
  ringing,
  color,
  tunedSet,
  label,
  onSelect,
  isMallet = false,
}: {
  targets: TargetString[];
  activeIndex: number | null;
  ringing: boolean;
  color: string;
  tunedSet: Set<number>;
  label: (note: string) => string;
  onSelect: (index: number) => void;
  isMallet?: boolean;
}) {
  // Render a clean 2-octave piano keyboard (24 keys) or mallet bars
  const whiteKeyPcs = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
  const isWhite = (pc: number) => whiteKeyPcs.includes(pc);

  const keyRange = useMemo(() => {
    const list: { midi: number; pc: number; isWhiteKey: boolean; targetIdx: number | null }[] = [];
    // Show 2 full octaves from C3 to B4 (MIDI 48 to 71) or centered on active target
    const centerMidi = targets[activeIndex ?? 0]?.midi ?? 60;
    const startMidi = Math.max(24, Math.floor((centerMidi - 12) / 12) * 12);
    for (let m = startMidi; m < startMidi + 24; m++) {
      const pc = ((m % 12) + 12) % 12;
      const tIdx = targets.findIndex((t) => t.midi === m);
      list.push({ midi: m, pc, isWhiteKey: isWhite(pc), targetIdx: tIdx >= 0 ? tIdx : null });
    }
    return list;
  }, [targets, activeIndex]);

  const whiteKeys = keyRange.filter((k) => k.isWhiteKey);
  const blackKeys = keyRange.filter((k) => !k.isWhiteKey);

  return (
    <div className="relative flex flex-col items-center justify-center select-none w-full">
      <svg
        viewBox="0 0 340 240"
        className="mx-auto w-full max-w-[21rem]"
        role="group"
        aria-label={isMallet ? "Mallet bars" : "Interactive piano keyboard"}
      >
        <defs>
          <filter id="keyGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Chassis Frame */}
        <rect
          x="10"
          y="20"
          width="320"
          height="195"
          rx="10"
          fill="var(--color-ns-raised)"
          stroke="var(--color-ns-border-strong)"
          strokeWidth={2}
        />

        {/* White Keys */}
        {whiteKeys.map((k, i) => {
          const w = 310 / whiteKeys.length;
          const x = 15 + i * w;
          const active = k.targetIdx !== null && activeIndex === k.targetIdx;
          const done = k.targetIdx !== null && tunedSet.has(k.targetIdx);

          return (
            <rect
              key={`w-key-${k.midi}`}
              x={x}
              y={30}
              width={w - 2}
              height={170}
              rx={3}
              fill={active ? color : done ? "rgba(16, 185, 129, 0.2)" : "#fafafa"}
              stroke={done ? "var(--color-ns-mint)" : "var(--color-ns-border-strong)"}
              strokeWidth={done ? 1.8 : 1}
              filter={active && ringing ? "url(#keyGlow)" : undefined}
              className="cursor-pointer transition-colors duration-150"
              onClick={() => k.targetIdx !== null && onSelect(k.targetIdx)}
            />
          );
        })}

        {/* Black Keys */}
        {blackKeys.map((k) => {
          const prevWhites = whiteKeys.filter((w) => w.midi < k.midi).length;
          const w = 310 / whiteKeys.length;
          const blackWidth = w * 0.65;
          const x = 15 + prevWhites * w - blackWidth / 2;
          const active = k.targetIdx !== null && activeIndex === k.targetIdx;

          return (
            <rect
              key={`b-key-${k.midi}`}
              x={x}
              y={30}
              width={blackWidth}
              height={110}
              rx={2}
              fill={active ? color : "#1e1e28"}
              stroke="#0a0a0f"
              strokeWidth={1.5}
              filter={active && ringing ? "url(#keyGlow)" : undefined}
              className="cursor-pointer transition-colors duration-150"
              onClick={() => k.targetIdx !== null && onSelect(k.targetIdx)}
            />
          );
        })}

        {/* Active Note Target Badge */}
        {activeIndex !== null && targets[activeIndex] && (
          <g transform="translate(170, 218)">
            <rect x="-42" y="-14" width="84" height="22" rx="6" fill="var(--color-ns-card)" stroke={color} strokeWidth={1.5} />
            <text x="0" y="2" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>
              {label(targets[activeIndex].note)} · {Math.round(targets[activeIndex].frequency)} Hz
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 4. WINDS & BRASS VISUALIZER (Trumpet, Sax, Flute, Clarinet, Harmonica)
 * ───────────────────────────────────────────────────────────── */
function WindBrassVisualizer({
  instrumentId,
  targets,
  activeIndex,
  ringing,
  color,
  label,
  onSelect,
}: {
  instrumentId: string;
  targets: TargetString[];
  activeIndex: number | null;
  ringing: boolean;
  color: string;
  label: (note: string) => string;
  onSelect: (index: number) => void;
}) {
  const isHarmonica = instrumentId === "harmonica";
  const isBrass = ["trumpet", "french-horn", "trombone", "tuba", "cornet", "euphonium"].includes(instrumentId);
  const activeNote = activeIndex !== null && targets[activeIndex] ? targets[activeIndex].note : "A4";

  return (
    <div className="relative flex flex-col items-center justify-center select-none w-full">
      <svg
        viewBox="0 0 320 260"
        className="mx-auto w-full max-w-[20rem]"
        role="group"
        aria-label="Wind and brass instrument visualizer"
      >
        <defs>
          <linearGradient id="brassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
        </defs>

        <style>{`
          @keyframes acousticWave {
            0% { transform: scale(0.9); opacity: 0.9; }
            100% { transform: scale(1.4); opacity: 0; }
          }
          .sound-ripple {
            animation: acousticWave 1.2s ease-out infinite;
            transform-origin: 260px 130px;
          }
        `}</style>

        {isHarmonica ? (
          /* 10-Hole Harmonica Grid */
          <g transform="translate(20, 70)">
            <rect x="0" y="0" width="280" height="90" rx="8" fill="#1c1917" stroke="var(--color-ns-border-strong)" strokeWidth={2} />
            <rect x="5" y="8" width="270" height="74" rx="4" fill="#292524" />
            {Array.from({ length: 10 }).map((_, h) => {
              const active = (activeIndex ?? 0) % 10 === h;
              return (
                <g key={`hole-${h}`} onClick={() => onSelect(h % targets.length)} className="cursor-pointer">
                  <rect
                    x={12 + h * 26}
                    y={22}
                    width={20}
                    height={46}
                    rx={3}
                    fill={active ? color : "#0c0a09"}
                    stroke={active ? color : "#44403c"}
                    strokeWidth={1.5}
                  />
                  <text x={22 + h * 26} y={16} textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--color-ns-muted)">
                    {h + 1}
                  </text>
                </g>
              );
            })}
          </g>
        ) : isBrass ? (
          /* 3-Valve Brass Silhouette (Trumpet / Cornet / Horn) */
          <g>
            {/* Leadpipe and Bell Tubing */}
            <path
              d="M40 130 L160 130 C200 130 220 110 260 90 L260 170 C220 150 200 130 160 130 Z"
              fill="url(#brassGrad)"
              opacity={0.85}
              stroke="#78350f"
              strokeWidth={2}
            />
            {/* 3 Piston Valves */}
            {[100, 130, 160].map((vx, i) => {
              const isValveDown = (activeIndex ?? 0) % 3 === i;
              return (
                <g key={`valve-${i}`} transform={`translate(${vx}, 80)`}>
                  <rect x="-8" y="0" width="16" height="75" rx="3" fill="#451a03" stroke="#f59e0b" strokeWidth={1.5} />
                  {/* Piston Button Top */}
                  <rect
                    x="-12"
                    y={isValveDown ? 14 : 0}
                    width="24"
                    height="12"
                    rx="3"
                    fill={isValveDown ? color : "#d97706"}
                    className="transition-all duration-150"
                  />
                  <text x="0" y={isValveDown ? 23 : 9} textAnchor="middle" fontSize="9" fontWeight="900" fill="#000">
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </g>
        ) : (
          /* Woodwind Tube with Tone Holes (Flute / Sax / Clarinet) */
          <g transform="translate(30, 115)">
            <rect x="0" y="0" width="260" height="26" rx="6" fill="#18181b" stroke="var(--color-ns-border-strong)" strokeWidth={2} />
            {[40, 75, 110, 145, 180, 215].map((hx, i) => {
              const active = (activeIndex ?? 0) % 6 === i;
              return (
                <circle
                  key={`hole-${i}`}
                  cx={hx}
                  cy={13}
                  r={8}
                  fill={active ? color : "#27272a"}
                  stroke={active ? color : "#52525b"}
                  strokeWidth={2}
                  className="cursor-pointer"
                />
              );
            })}
          </g>
        )}

        {/* Real-time Acoustic Wave Ripples when Audio Detected */}
        {ringing && (
          <g className="sound-ripple">
            <circle cx="260" cy="130" r="28" fill="none" stroke={color} strokeWidth={2.5} />
            <circle cx="260" cy="130" r="46" fill="none" stroke={color} strokeWidth={1.8} opacity={0.6} />
          </g>
        )}

        {/* Pitch Reading Ribbon */}
        <g transform="translate(160, 225)">
          <rect x="-55" y="-14" width="110" height="24" rx="7" fill="var(--color-ns-card)" stroke={color} strokeWidth={1.5} />
          <text x="0" y="2" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>
            {label(activeNote)} · Tone Intonation
          </text>
        </g>
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 5. PERCUSSION VISUALIZER (Timpani, Tabla, Mridangam, Drums)
 * ───────────────────────────────────────────────────────────── */
function PercussionVisualizer({
  targets,
  activeIndex,
  ringing,
  color,
  label,
  onSelect,
}: {
  targets: TargetString[];
  activeIndex: number | null;
  ringing: boolean;
  color: string;
  label: (note: string) => string;
  onSelect: (index: number) => void;
}) {
  const activeNote = activeIndex !== null && targets[activeIndex] ? targets[activeIndex].note : "D2";

  return (
    <div className="relative flex flex-col items-center justify-center select-none w-full">
      <svg
        viewBox="0 0 280 260"
        className="mx-auto w-full max-w-[18rem]"
        role="group"
        aria-label="Tuned drum head visualizer"
      >
        <defs>
          <radialGradient id="drumHead" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2c2724" />
            <stop offset="70%" stopColor="#1a1816" />
            <stop offset="100%" stopColor="#0f0e0c" />
          </radialGradient>
        </defs>

        {/* Outer Counterhoop Rim */}
        <circle cx="140" cy="120" r="95" fill="none" stroke="var(--color-ns-border-strong)" strokeWidth={8} />

        {/* Drum Membrane Head */}
        <circle cx="140" cy="120" r="90" fill="url(#drumHead)" stroke="#443a35" strokeWidth={2} />

        {/* Center Strike Spot */}
        <circle cx="140" cy="120" r="32" fill="#141210" stroke={ringing ? color : "#302b28"} strokeWidth={1.5} />

        {/* Perimeter Tuning Lugs (6 Lugs) */}
        {Array.from({ length: 6 }).map((_, i) => {
          const angle = (i * 60 * Math.PI) / 180;
          const lx = 140 + 95 * Math.cos(angle);
          const ly = 120 + 95 * Math.sin(angle);
          const active = (activeIndex ?? 0) % 6 === i;

          return (
            <g key={`lug-${i}`} onClick={() => onSelect(i % targets.length)} className="cursor-pointer">
              <circle cx={lx} cy={ly} r={active ? 10 : 7} fill={active ? color : "var(--color-ns-raised)"} stroke="var(--color-ns-border-strong)" strokeWidth={2} />
              <text x={lx} y={ly + 3} textAnchor="middle" fontSize="7" fontWeight="bold" fill={active ? "#000" : "var(--color-ns-muted)"}>
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Strike Ripple Animation */}
        {ringing && (
          <circle cx="140" cy="120" r="60" fill="none" stroke={color} strokeWidth={2} opacity={0.7} className="animate-ping" />
        )}

        {/* Note Badge */}
        <g transform="translate(140, 235)">
          <rect x="-45" y="-12" width="90" height="22" rx="6" fill="var(--color-ns-card)" stroke={color} strokeWidth={1.5} />
          <text x="0" y="3" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>
            {label(activeNote)} Head
          </text>
        </g>
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 6. MASTER DISPATCH COMPONENT (InstrumentVisualizer)
 * ───────────────────────────────────────────────────────────── */
export function InstrumentVisualizer({
  instrumentId,
  category,
  targets,
  activeStringIndex,
  ringing,
  color,
  turn,
  locked,
  tunedSet,
  label,
  onSelect,
  variantHead,
}: InstrumentVisualizerProps) {
  // Classification
  const isBowed = ["violin", "viola", "cello", "double-bass", "erhu", "sarangi"].includes(instrumentId);
  const isHarpOrSantoor = ["harp", "santoor", "zither", "dulcimer"].includes(instrumentId);
  const isKeyOrMallet = category === "keys" || category === "mallet" || ["piano", "keyboard", "organ", "accordion", "marimba", "xylophone", "vibraphone"].includes(instrumentId);
  const isWindOrBrass = category === "wind" || ["flute", "trumpet", "french-horn", "trombone", "tuba", "clarinet", "oboe", "sax", "harmonica"].some((w) => instrumentId.includes(w));
  const isPercussion = category === "percussion" || ["timpani", "tabla", "mridangam", "drum"].some((p) => instrumentId.includes(p));

  // 1. Bowed Orchestral Strings
  if (isBowed) {
    return (
      <BowedStringsVisualizer
        targets={targets}
        activeIndex={activeStringIndex}
        ringing={ringing}
        color={color}
        turn={turn}
        locked={locked}
        tunedSet={tunedSet}
        label={label}
        onSelect={onSelect}
      />
    );
  }

  // 2. Harp / Santoor / Dulcimer
  if (isHarpOrSantoor) {
    return (
      <HarpSantoorVisualizer
        targets={targets}
        activeIndex={activeStringIndex}
        ringing={ringing}
        color={color}
        tunedSet={tunedSet}
        label={label}
        onSelect={onSelect}
      />
    );
  }

  // 3. Piano, Keyboard, Organ, Mallets
  if (isKeyOrMallet) {
    return (
      <KeyboardMalletVisualizer
        targets={targets}
        activeIndex={activeStringIndex}
        ringing={ringing}
        color={color}
        tunedSet={tunedSet}
        label={label}
        onSelect={onSelect}
        isMallet={category === "mallet"}
      />
    );
  }

  // 4. Winds & Brass
  if (isWindOrBrass) {
    return (
      <WindBrassVisualizer
        instrumentId={instrumentId}
        targets={targets}
        activeIndex={activeStringIndex}
        ringing={ringing}
        color={color}
        label={label}
        onSelect={onSelect}
      />
    );
  }

  // 5. Percussion Drums
  if (isPercussion) {
    return (
      <PercussionVisualizer
        targets={targets}
        activeIndex={activeStringIndex}
        ringing={ringing}
        color={color}
        label={label}
        onSelect={onSelect}
      />
    );
  }

  // 6. Plucked Fretted Strings Headstock (Guitar, Bass, Ukulele, Banjo, Mandolin, Sitar, Oud, Bouzouki, etc.)
  const headUnits = targets.map((t) => ({ note: t.note, freq: t.frequency }));
  return (
    <Headstock
      kind={variantHead ?? (targets.length <= 4 ? "bass" : "acoustic")}
      strings={headUnits}
      label={label}
      activeIndex={activeStringIndex}
      ringing={ringing}
      color={color}
      turn={turn}
      locked={locked}
      tuned={(idx) => tunedSet.has(idx)}
      onSelect={onSelect}
    />
  );
}
