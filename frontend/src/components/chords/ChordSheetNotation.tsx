import { useMemo, useState } from "react";
import { NOTE_NAMES, type ParsedChord } from "../../lib/chordTheory";
import { playSinglePitch, stopAllAudio } from "../../lib/chords/play";

export interface SheetNote {
  midi: number;
  pitchName: string;
  octave: number;
  intervalLabel: string;
  stringIndex?: number;
  fret?: number;
  finger?: number;
  role: "root" | "third" | "fifth" | "seventh" | "extension";
}

export type StaffClef = "auto" | "treble" | "bass" | "grand";

const LETTER_BY_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // C=0, D=1, E=2, F=3, G=4, A=5, B=6
const ACCIDENTAL_BY_PC = ["", "♯", "", "♯", "", "", "♯", "", "♯", "", "♯", ""];

export function midiToStaffStep(midi: number): { step: number; accidental: string; name: string } {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const letter = LETTER_BY_PC[pc];
  const accidental = ACCIDENTAL_BY_PC[pc];
  const step = octave * 7 + letter;
  const name = `${NOTE_NAMES[pc].replace("#", "♯")}${octave}`;
  return { step, accidental, name };
}

const ROLE_COLORS: Record<SheetNote["role"], { fill: string; stroke: string; bg: string }> = {
  root: { fill: "#f59e0b", stroke: "#d97706", bg: "rgba(245, 158, 11, 0.15)" },
  third: { fill: "#10b981", stroke: "#059669", bg: "rgba(16, 185, 129, 0.15)" },
  fifth: { fill: "#0ea5e9", stroke: "#0284c7", bg: "rgba(14, 165, 233, 0.15)" },
  seventh: { fill: "#a855f7", stroke: "#9333ea", bg: "rgba(168, 85, 247, 0.15)" },
  extension: { fill: "#ec4899", stroke: "#db2777", bg: "rgba(236, 72, 153, 0.15)" },
};

export function ChordSheetNotation({
  chord,
  notes,
  isFretted = false,
  stringNames = ["E", "A", "D", "G", "B", "E"],
  onNoteClick,
}: {
  chord: ParsedChord;
  notes: SheetNote[];
  isFretted?: boolean;
  stringNames?: string[];
  onNoteClick?: (note: SheetNote) => void;
}) {
  const [clefChoice, setClefChoice] = useState<StaffClef>("auto");
  const [hoveredMidi, setHoveredMidi] = useState<number | null>(null);

  // Auto-detect clef based on average pitch
  const effectiveClef: "treble" | "bass" | "grand" = useMemo(() => {
    if (clefChoice !== "auto") return clefChoice;
    if (notes.length === 0) return "treble";
    const minMidi = Math.min(...notes.map((n) => n.midi));
    const maxMidi = Math.max(...notes.map((n) => n.midi));
    if (minMidi < 55 && maxMidi > 64) return "grand";
    if (maxMidi < 60) return "bass";
    return "treble";
  }, [clefChoice, notes]);

  const handlePlaySingleNote = (note: SheetNote) => {
    stopAllAudio();
    void playSinglePitch(note.midi);
    onNoteClick?.(note);
  };

  // Staff dimensions
  const width = 560;
  const staffLeft = 70;
  const staffWidth = width - staffLeft - 30;
  const lineSpacing = 8;
  const noteRadius = 5.5;

  // Vertical staff coordinates
  // Treble top line = F5 (step = 38). Bottom line = E4 (step = 30).
  const trebleTopY = 35;
  const bassTopY = effectiveClef === "grand" ? 105 : 35;

  const staffHeight =
    effectiveClef === "grand"
      ? (isFretted ? 240 : 180)
      : isFretted
      ? 190
      : 120;

  // TAB coordinate layout
  const tabTopY = effectiveClef === "grand" ? 170 : 110;
  const tabLineSpacing = 10;
  const numStrings = stringNames.length;

  return (
    <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-3">
        <div>
          <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
            Standard Notation & Tablature
          </h4>
          <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
            Exact pitch representation with clef, interval color-coding, and synchronized TAB.
          </p>
        </div>

        {/* Clef Switcher */}
        <div className="flex items-center gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-[0.625rem]">
          {(["auto", "treble", "bass", "grand"] as StaffClef[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClefChoice(c)}
              className={`rounded-lg px-2.5 py-0.5 font-semibold capitalize transition-all ${
                clefChoice === c
                  ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                  : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
              }`}
            >
              {c === "auto" ? "Auto Clef" : c}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="flex justify-center overflow-x-auto py-1">
        <svg
          width={width}
          height={staffHeight}
          viewBox={`0 0 ${width} ${staffHeight}`}
          className="select-none text-[var(--color-ns-text)]"
          role="img"
          aria-label={`Sheet music staff for ${chord.label}`}
        >
          {/* ─── 1. TREBLE STAFF ─── */}
          {(effectiveClef === "treble" || effectiveClef === "grand") && (
            <g id="treble-staff">
              {/* Clef Symbol */}
              <text
                x={20}
                y={trebleTopY + 28}
                fontSize="38"
                fontFamily="serif"
                fill="currentColor"
                opacity={0.85}
              >
                𝄞
              </text>

              {/* 5 Staff lines */}
              {Array.from({ length: 5 }, (_, i) => {
                const y = trebleTopY + i * lineSpacing;
                return (
                  <line
                    key={`treble-line-${i}`}
                    x1={staffLeft}
                    y1={y}
                    x2={staffLeft + staffWidth}
                    y2={y}
                    stroke="var(--color-ns-border-strong, #666)"
                    strokeWidth="1.2"
                  />
                );
              })}

              {/* Staff bar lines at start and end */}
              <line
                x1={staffLeft}
                y1={trebleTopY}
                x2={staffLeft}
                y2={trebleTopY + 4 * lineSpacing}
                stroke="var(--color-ns-border-strong, #666)"
                strokeWidth="1.5"
              />
              <line
                x1={staffLeft + staffWidth}
                y1={trebleTopY}
                x2={staffLeft + staffWidth}
                y2={trebleTopY + 4 * lineSpacing}
                stroke="var(--color-ns-border-strong, #666)"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* ─── 2. BASS STAFF ─── */}
          {(effectiveClef === "bass" || effectiveClef === "grand") && (
            <g id="bass-staff">
              {/* Clef Symbol */}
              <text
                x={22}
                y={bassTopY + 24}
                fontSize="30"
                fontFamily="serif"
                fill="currentColor"
                opacity={0.85}
              >
                𝄢
              </text>

              {/* 5 Staff lines */}
              {Array.from({ length: 5 }, (_, i) => {
                const y = bassTopY + i * lineSpacing;
                return (
                  <line
                    key={`bass-line-${i}`}
                    x1={staffLeft}
                    y1={y}
                    x2={staffLeft + staffWidth}
                    y2={y}
                    stroke="var(--color-ns-border-strong, #666)"
                    strokeWidth="1.2"
                  />
                );
              })}

              {/* Staff bar lines */}
              <line
                x1={staffLeft}
                y1={bassTopY}
                x2={staffLeft}
                y2={bassTopY + 4 * lineSpacing}
                stroke="var(--color-ns-border-strong, #666)"
                strokeWidth="1.5"
              />
              <line
                x1={staffLeft + staffWidth}
                y1={bassTopY}
                x2={staffLeft + staffWidth}
                y2={bassTopY + 4 * lineSpacing}
                stroke="var(--color-ns-border-strong, #666)"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* Grand Staff Bracket & Connectors */}
          {effectiveClef === "grand" && (
            <path
              d={`M ${staffLeft - 8} ${trebleTopY} Q ${staffLeft - 18} ${(trebleTopY + bassTopY + 4 * lineSpacing) / 2} ${staffLeft - 8} ${bassTopY + 4 * lineSpacing}`}
              fill="none"
              stroke="var(--color-ns-border-strong, #666)"
              strokeWidth="2.5"
            />
          )}

          {/* ─── 3. NOTEHEADS ON STAFF ─── */}
          {notes.map((n, idx) => {
            const { step, accidental } = midiToStaffStep(n.midi);
            const isBass = effectiveClef === "bass" || (effectiveClef === "grand" && n.midi < 60);
            const topY = isBass ? bassTopY : trebleTopY;

            // Step references:
            // Treble top line F5 = step 38. Each step is half lineSpacing (4px).
            // Bass top line A3 = step 26.
            const refStep = isBass ? 26 : 38;
            const y = topY + (refStep - step) * (lineSpacing / 2);

            // Horizontal spacing
            const noteX = staffLeft + 45 + idx * 48;
            const colors = ROLE_COLORS[n.role];
            const isHovered = hoveredMidi === n.midi;

            // Ledger lines calculation
            // For Treble: top line is step 38, bottom line is step 30 (E4).
            // For Bass: top line is step 26, bottom line is step 18 (G2).
            const ledgerLines: number[] = [];
            if (!isBass) {
              if (step <= 28) {
                // C4 (step 28), A3 (step 26)...
                for (let s = 28; s >= step; s -= 2) {
                  ledgerLines.push(topY + (38 - s) * (lineSpacing / 2));
                }
              } else if (step >= 40) {
                // A5 (step 40)...
                for (let s = 40; s <= step; s += 2) {
                  ledgerLines.push(topY + (38 - s) * (lineSpacing / 2));
                }
              }
            } else {
              if (step >= 28) {
                // C4 (step 28)...
                for (let s = 28; s <= step; s += 2) {
                  ledgerLines.push(topY + (26 - s) * (lineSpacing / 2));
                }
              } else if (step <= 16) {
                // E2 (step 16)...
                for (let s = 16; s >= step; s -= 2) {
                  ledgerLines.push(topY + (26 - s) * (lineSpacing / 2));
                }
              }
            }

            return (
              <g
                key={`note-${n.midi}-${idx}`}
                className="cursor-pointer transition-transform"
                onClick={() => handlePlaySingleNote(n)}
                onMouseEnter={() => setHoveredMidi(n.midi)}
                onMouseLeave={() => setHoveredMidi(null)}
              >
                {/* Ledger Lines */}
                {ledgerLines.map((ly, lIdx) => (
                  <line
                    key={`ledger-${lIdx}`}
                    x1={noteX - 10}
                    y1={ly}
                    x2={noteX + 10}
                    y2={ly}
                    stroke="var(--color-ns-border-strong, #888)"
                    strokeWidth="1.2"
                  />
                ))}

                {/* Accidental */}
                {accidental && (
                  <text
                    x={noteX - 14}
                    y={y + 4}
                    fontSize="13"
                    fontWeight="bold"
                    fill="currentColor"
                  >
                    {accidental}
                  </text>
                )}

                {/* Notehead (Rotated ellipse for musical standard) */}
                <ellipse
                  cx={noteX}
                  cy={y}
                  rx={noteRadius * 1.15}
                  ry={noteRadius * 0.85}
                  transform={`rotate(-20 ${noteX} ${y})`}
                  fill={colors.fill}
                  stroke={isHovered ? "#fff" : colors.stroke}
                  strokeWidth={isHovered ? 2 : 1.2}
                  className="transition-all"
                />

                {/* Stem */}
                <line
                  x1={noteX + noteRadius * 0.9}
                  y1={y}
                  x2={noteX + noteRadius * 0.9}
                  y2={y - 24}
                  stroke="currentColor"
                  strokeWidth="1.2"
                />

                {/* Pitch Name + Interval Badge */}
                <text
                  x={noteX}
                  y={y - 28}
                  fontSize="8.5"
                  fontWeight="bold"
                  textAnchor="middle"
                  fill={colors.fill}
                >
                  {n.pitchName}
                </text>
                <text
                  x={noteX}
                  y={y + 16}
                  fontSize="7.5"
                  fontWeight="600"
                  textAnchor="middle"
                  fill="var(--color-ns-muted)"
                >
                  {n.intervalLabel}
                </text>

                {/* Fingering Number */}
                {n.finger !== undefined && n.finger > 0 && (
                  <text
                    x={noteX}
                    y={y + 25}
                    fontSize="7"
                    fontWeight="bold"
                    textAnchor="middle"
                    fill="#10b981"
                  >
                    T{n.finger}
                  </text>
                )}
              </g>
            );
          })}

          {/* ─── 4. SYNCHRONIZED TABLATURE (TAB) ─── */}
          {isFretted && (
            <g id="tab-staff">
              {/* TAB Label */}
              <text
                x={24}
                y={tabTopY + 14}
                fontSize="11"
                fontWeight="900"
                fontFamily="sans-serif"
                letterSpacing="1"
                fill="var(--color-ns-amber)"
              >
                T
              </text>
              <text
                x={24}
                y={tabTopY + 28}
                fontSize="11"
                fontWeight="900"
                fontFamily="sans-serif"
                letterSpacing="1"
                fill="var(--color-ns-amber)"
              >
                A
              </text>
              <text
                x={24}
                y={tabTopY + 42}
                fontSize="11"
                fontWeight="900"
                fontFamily="sans-serif"
                letterSpacing="1"
                fill="var(--color-ns-amber)"
              >
                B
              </text>

              {/* String Lines */}
              {Array.from({ length: numStrings }, (_, sIdx) => {
                const y = tabTopY + sIdx * tabLineSpacing;
                const stringName = stringNames[numStrings - 1 - sIdx] ?? "";
                return (
                  <g key={`tab-str-${sIdx}`}>
                    {/* String name indicator */}
                    <text
                      x={staffLeft - 10}
                      y={y + 3}
                      fontSize="7.5"
                      fontFamily="monospace"
                      textAnchor="end"
                      fill="var(--color-ns-muted)"
                    >
                      {stringName}
                    </text>
                    <line
                      x1={staffLeft}
                      y1={y}
                      x2={staffLeft + staffWidth}
                      y2={y}
                      stroke="var(--color-ns-border, #444)"
                      strokeWidth="1"
                    />
                  </g>
                );
              })}

              {/* Fret Numbers synchronized with notes */}
              {notes.map((n, idx) => {
                if (n.stringIndex === undefined || n.fret === undefined) return null;
                // High E is top line (sIdx = 0), low E is bottom line (sIdx = numStrings - 1)
                const stringLineIdx = numStrings - 1 - n.stringIndex;
                const y = tabTopY + stringLineIdx * tabLineSpacing;
                const noteX = staffLeft + 45 + idx * 48;
                const colors = ROLE_COLORS[n.role];

                return (
                  <g key={`tab-fret-${idx}`} className="cursor-pointer" onClick={() => handlePlaySingleNote(n)}>
                    {/* Alignment guide dashed line */}
                    <line
                      x1={noteX}
                      y1={tabTopY - 12}
                      x2={noteX}
                      y2={y}
                      stroke="var(--color-ns-border)"
                      strokeDasharray="2 2"
                      opacity={0.4}
                    />

                    {/* Fret number background pill */}
                    <rect
                      x={noteX - 7}
                      y={y - 6}
                      width={14}
                      height={12}
                      rx={3}
                      fill="var(--color-ns-card, #1e1e1e)"
                      stroke={colors.fill}
                      strokeWidth="1"
                    />

                    {/* Fret number text */}
                    <text
                      x={noteX}
                      y={y + 3.5}
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      fill={n.fret === 0 ? "#10b981" : colors.fill}
                    >
                      {n.fret}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {/* Legend & Note Role Pills */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-ns-border)]/60 pt-3 text-[0.6875rem]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[var(--color-ns-muted)]">Interval Color Legend:</span>
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-[#f59e0b] bg-[#f59e0b]/10">
            ● Root
          </span>
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-[#10b981] bg-[#10b981]/10">
            ● 3rd
          </span>
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-[#0ea5e9] bg-[#0ea5e9]/10">
            ● 5th
          </span>
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-[#a855f7] bg-[#a855f7]/10">
            ● 7th / Ext
          </span>
        </div>
        <span className="text-[0.625rem] text-[var(--color-ns-dim)]">
          Tap any notehead on the staff to hear its isolated pitch.
        </span>
      </div>
    </div>
  );
}
