import { useState } from "react";
import type { ChordModel } from "../../lib/chords/model";
import type { ChordAnalysis } from "../../lib/chords/analysis";
import { playSinglePitch, stopAllAudio } from "../../lib/chords/play";

export type OtherModel = Exclude<ChordModel, { kind: "fretted" } | { kind: "bass" }>;

const ROLE_COLORS: Record<string, { fill: string; border: string; text: string }> = {
  root: { fill: "#f59e0b", border: "#d97706", text: "#000" },
  third: { fill: "#10b981", border: "#059669", text: "#000" },
  fifth: { fill: "#0ea5e9", border: "#0284c7", text: "#fff" },
  seventh: { fill: "#a855f7", border: "#9333ea", text: "#fff" },
  extension: { fill: "#ec4899", border: "#db2777", text: "#fff" },
};

export function NonFrettedWorkbench({
  model,
  analysis,
}: {
  model: OtherModel;
  analysis: ChordAnalysis;
}) {
  const [selectedNoteMidi, setSelectedNoteMidi] = useState<number | null>(null);

  const handlePlayPitch = (midi: number) => {
    stopAllAudio();
    setSelectedNoteMidi(midi);
    void playSinglePitch(midi, model.definition.id);
  };

  return (
    <div className="space-y-6">
      {/* ─── 1. KEYBOARD / PIANO / ORGAN / MALLETS ─── */}
      {(model.kind === "keyboard" || model.kind === "mallet") && (
        <KeyboardPianoRollExplorer
          model={model}
          analysis={analysis}
          selectedNoteMidi={selectedNoteMidi}
          onKeyClick={handlePlayPitch}
        />
      )}

      {/* ─── 2. WINDS & BRASS: VALVE / KEY FINGERING & TRANSPOSITION ─── */}
      {model.kind === "wind" && (
        <WindBrassWorkbench
          model={model}
          analysis={analysis}
          selectedNoteMidi={selectedNoteMidi}
          onToneClick={handlePlayPitch}
        />
      )}

      {/* ─── 3. HARP: STRING & LEVER/PEDAL MAP ─── */}
      {model.kind === "harp" && (
        <HarpWorkbench model={model} onStringClick={handlePlayPitch} />
      )}

      {/* ─── 4. ACCORDION: STRADELLA BASS & TREBLE MAP ─── */}
      {model.kind === "accordion" && (
        <AccordionWorkbench
          model={model}
          analysis={analysis}
          selectedNoteMidi={selectedNoteMidi}
          onKeyClick={handlePlayPitch}
        />
      )}

      {/* ─── 5. HARMONICA: 10-HOLE RICHTER MAP ─── */}
      {model.kind === "harmonica" && (
        <HarmonicaWorkbench model={model} onHoleClick={handlePlayPitch} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 1. MULTI-OCTAVE PIANO ROLL EXPLORER (Keyboard & Mallets)
 * ───────────────────────────────────────────────────────────── */
function KeyboardPianoRollExplorer({
  model,
  analysis,
  selectedNoteMidi,
  onKeyClick,
}: {
  model: Extract<OtherModel, { kind: "keyboard" } | { kind: "mallet" }>;
  analysis: ChordAnalysis;
  selectedNoteMidi: number | null;
  onKeyClick: (midi: number) => void;
}) {
  // Octaves C3 to C6 (MIDI 48 to 84 = 37 white and black keys)
  const startMidi = 48; // C3
  const endMidi = 84; // C6
  const whiteKeyWidth = 22;
  const whiteKeyHeight = 95;
  const blackKeyWidth = 13;
  const blackKeyHeight = 60;

  // Active chord tones set & map
  const rootPc = analysis.parsed.root;
  const chordTonesMap = new Map<number, { name: string; role: string; fingerRH?: number; fingerLH?: number }>();
  const chordPcs = new Set(analysis.intervals.map((int) => (rootPc + int.semitones) % 12));

  // Finger assignment for voicing
  model.keys.forEach((k, i) => {
    const pc = ((k.midi % 12) + 12) % 12;
    const match = analysis.intervals.find((int) => (rootPc + int.semitones) % 12 === pc);
    const semitone = match ? match.semitones : 0;
    const role =
      semitone === 0
        ? "root"
        : semitone === 3 || semitone === 4
        ? "third"
        : semitone === 7 || semitone === 6 || semitone === 8
        ? "fifth"
        : semitone === 10 || semitone === 11
        ? "seventh"
        : "extension";

    // Standard keyboard fingerings for 3 or 4-note voicings
    const n = model.keys.length;
    const fingerRH = n === 3 ? (i === 0 ? 1 : i === 1 ? 3 : 5) : n === 4 ? (i === 0 ? 1 : i === 1 ? 2 : i === 2 ? 3 : 5) : i + 1;
    const fingerLH = n === 3 ? (i === 0 ? 5 : i === 1 ? 3 : 1) : n === 4 ? (i === 0 ? 5 : i === 1 ? 4 : i === 2 ? 2 : 1) : 5 - i;

    chordTonesMap.set(k.midi, { name: k.name, role, fingerRH, fingerLH });
  });

  const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);

  // Generate white keys
  const whiteKeys: { midi: number; x: number }[] = [];
  let currentX = 10;
  for (let m = startMidi; m <= endMidi; m++) {
    if (!isBlackKey(m)) {
      whiteKeys.push({ midi: m, x: currentX });
      currentX += whiteKeyWidth;
    }
  }

  // Black keys positions relative to white keys
  const blackKeys: { midi: number; x: number }[] = [];
  for (let m = startMidi; m <= endMidi; m++) {
    if (isBlackKey(m)) {
      const prevWhite = whiteKeys.find((w) => w.midi === m - 1);
      if (prevWhite) {
        blackKeys.push({ midi: m, x: prevWhite.x + whiteKeyWidth - blackKeyWidth / 2 });
      }
    }
  }

  const svgWidth = currentX + 15;

  return (
    <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-3">
        <div>
          <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
            Multi-Octave Keyboard & Piano Roll (C3–C6)
          </h4>
          <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
            All active keys highlighted with Left-Hand (LH) and Right-Hand (RH) fingerings (1=Thumb, 5=Pinky).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              stopAllAudio();
              model.keys.forEach((k) => playSinglePitch(k.midi, model.definition.id));
            }}
            aria-label={`Play ${model.chord.label} on ${model.definition.name}`}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] px-3 py-1 font-bold text-[var(--color-ns-ink)] shadow-sm hover:brightness-110"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Play Chord</span>
          </button>
          <span className="rounded-lg bg-[var(--color-ns-amber)]/10 px-2 py-1 text-[var(--color-ns-amber)] border border-[var(--color-ns-amber)]/20">
            Position: {model.inversionLabel}
          </span>
        </div>
      </div>

      {/* Piano Roll SVG */}
      <div className="flex justify-center overflow-x-auto py-2">
        <svg
          width={svgWidth}
          height={whiteKeyHeight + 35}
          viewBox={`0 0 ${svgWidth} ${whiteKeyHeight + 35}`}
          className="select-none"
        >
          {/* White Keys */}
          {whiteKeys.map((k) => {
            const tone = chordTonesMap.get(k.midi);
            const inChordAllOctaves = chordPcs.has(k.midi % 12);
            const isSelected = selectedNoteMidi === k.midi;

            return (
              <g
                key={`white-${k.midi}`}
                className="cursor-pointer"
                onClick={() => onKeyClick(k.midi)}
              >
                <rect
                  x={k.x}
                  y={10}
                  width={whiteKeyWidth - 1}
                  height={whiteKeyHeight}
                  rx={3}
                  fill={
                    isSelected
                      ? "#f59e0b"
                      : tone
                      ? ROLE_COLORS[tone.role]?.fill ?? "#f59e0b"
                      : inChordAllOctaves
                      ? "rgba(245, 158, 11, 0.2)"
                      : "#ffffff"
                  }
                  stroke="#333333"
                  strokeWidth="1"
                  className="transition-colors hover:brightness-110"
                />

                {/* Octave C Indicator */}
                {k.midi % 12 === 0 && (
                  <text
                    x={k.x + (whiteKeyWidth - 1) / 2}
                    y={whiteKeyHeight + 2}
                    fontSize="7"
                    fontFamily="monospace"
                    textAnchor="middle"
                    fill="#666"
                  >
                    C{Math.floor(k.midi / 12) - 1}
                  </text>
                )}

                {/* Fingering Badge on Voicing Keys */}
                {tone && (
                  <g>
                    <circle
                      cx={k.x + (whiteKeyWidth - 1) / 2}
                      cy={whiteKeyHeight - 12}
                      r={6}
                      fill="#000"
                      opacity={0.8}
                    />
                    <text
                      x={k.x + (whiteKeyWidth - 1) / 2}
                      y={whiteKeyHeight - 9}
                      fontSize="7.5"
                      fontWeight="bold"
                      textAnchor="middle"
                      fill="#fff"
                    >
                      {tone.fingerRH}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Black Keys */}
          {blackKeys.map((k) => {
            const tone = chordTonesMap.get(k.midi);
            const inChordAllOctaves = chordPcs.has(k.midi % 12);
            const isSelected = selectedNoteMidi === k.midi;

            return (
              <g
                key={`black-${k.midi}`}
                className="cursor-pointer"
                onClick={() => onKeyClick(k.midi)}
              >
                <rect
                  x={k.x}
                  y={10}
                  width={blackKeyWidth}
                  height={blackKeyHeight}
                  rx={2}
                  fill={
                    isSelected
                      ? "#f59e0b"
                      : tone
                      ? ROLE_COLORS[tone.role]?.fill ?? "#f59e0b"
                      : inChordAllOctaves
                      ? "#b45309"
                      : "#1e1e1e"
                  }
                  stroke="#000"
                  strokeWidth="1"
                  className="transition-colors hover:brightness-125"
                />

                {tone && (
                  <g>
                    <circle
                      cx={k.x + blackKeyWidth / 2}
                      cy={blackKeyHeight - 10}
                      r={5}
                      fill="#000"
                      opacity={0.85}
                    />
                    <text
                      x={k.x + blackKeyWidth / 2}
                      y={blackKeyHeight - 7.5}
                      fontSize="6.5"
                      fontWeight="bold"
                      textAnchor="middle"
                      fill="#fff"
                    >
                      {tone.fingerRH}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Fingering Details Table */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 pt-3 border-t border-[var(--color-ns-border)]">
        <div>
          <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Keys to press (Voicing):</span>
          <p className="font-mono font-bold text-[var(--color-ns-text)]">{model.keys.map((k) => k.name).join(" · ")}</p>
        </div>
        <div>
          <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Right-hand fingering (Thumb→Pinky):</span>
          <p className="font-mono font-bold text-emerald-400">
            {model.keys.map((k) => chordTonesMap.get(k.midi)?.fingerRH ?? 1).join(" · ")}
          </p>
        </div>
        <div>
          <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">LH Fingering (Pinky→Thumb):</span>
          <p className="font-mono font-bold text-sky-400">
            {model.keys.map((k) => chordTonesMap.get(k.midi)?.fingerLH ?? 5).join(" · ")}
          </p>
        </div>
        <div>
          <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Pitch Register:</span>
          <p className="font-mono text-[var(--color-ns-text)]">
            {model.keys[0]?.name} ({model.keys[0]?.midi}) → {model.keys[model.keys.length - 1]?.name} ({model.keys[model.keys.length - 1]?.midi})
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 2. WINDS & BRASS WORKBENCH (Valve / Tone-Hole Fingering Graphic)
 * ───────────────────────────────────────────────────────────── */
// Trumpet valve fingerings for chromatic pitch classes
const TRUMPET_VALVES: Record<number, [boolean, boolean, boolean]> = {
  0: [false, false, false], // C
  1: [true, true, true],    // C# / Db
  2: [true, false, true],   // D
  3: [false, true, true],   // D# / Eb
  4: [true, true, false],   // E
  5: [true, false, false],  // F
  6: [false, true, false],  // F# / Gb
  7: [false, false, false], // G
  8: [false, true, true],   // G# / Ab
  9: [true, true, false],   // A
  10: [true, false, false], // A# / Bb
  11: [false, true, false], // B
};

// Woodwind 6-hole tone map
const WOODWIND_HOLES: Record<number, boolean[]> = {
  0: [true, true, true, true, true, true],   // C
  2: [true, true, true, true, true, false],  // D
  4: [true, true, true, true, false, false], // E
  5: [true, true, true, false, false, false],// F
  7: [true, true, false, false, false, false],// G
  9: [true, false, false, false, false, false],// A
  11: [false, false, false, false, false, false],// B
};

function WindBrassWorkbench({
  model,
  analysis: _analysis,
  selectedNoteMidi,
  onToneClick,
}: {
  model: Extract<OtherModel, { kind: "wind" }>;
  analysis: ChordAnalysis;
  selectedNoteMidi: number | null;
  onToneClick: (midi: number) => void;
}) {
  const isBrass = ["trumpet", "cornet", "euphonium", "french-horn"].includes(model.definition.id);
  const activeTone = model.sounding.find((s) => s.midi === selectedNoteMidi) ?? model.sounding[0];

  const pc = activeTone ? ((activeTone.midi % 12) + 12) % 12 : 0;
  const trumpetState = TRUMPET_VALVES[pc] ?? [false, false, false];
  const woodwindState = WOODWIND_HOLES[pc] ?? [true, true, true, false, false, false];

  return (
    <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-3">
        <div>
          <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
            {model.definition.name} Instrument Fingering Diagram & Transposition
          </h4>
          <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
            {model.definition.id === "harmonica"
              ? "Standard diatonic, 10 holes (Richter tuning). Shows blow and draw notes for each chord tone."
              : "Monophonic winds arpeggiate chord tones. Click any note to inspect its valve/key combination."}
          </p>
        </div>
        <span className="rounded-lg bg-sky-500/10 px-2.5 py-0.5 text-xs font-bold text-sky-400 border border-sky-500/20">
          Range: {model.rangeLow} – {model.rangeHigh}
        </span>
      </div>

      {/* Arpeggio Notes Strip */}
      <div className="mb-4">
        <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)] mb-1.5">
          Chord Tones in Range (Click to change fingering view):
        </span>
        <div className="flex flex-wrap gap-2">
          {model.sounding.map((tone) => {
            const isSelected = activeTone?.midi === tone.midi;
            return (
              <button
                key={tone.midi}
                type="button"
                onClick={() => onToneClick(tone.midi)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                  isSelected
                    ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                    : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-amber)]/50 hover:text-[var(--color-ns-text)]"
                }`}
              >
                <span>{tone.name}</span>
                <span className="text-[0.625rem] opacity-75 font-mono">({tone.midi})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Fingering Visual Graphic */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Valve / Hole Graphic */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-4">
          <span className="text-xs font-bold text-[var(--color-ns-text)] mb-3">
            {isBrass ? "3-Piston Valve Action" : "Tone-Hole Finger Placement"} for{" "}
            <span className="text-[var(--color-ns-amber)]">{activeTone?.name}</span>
          </span>

          {isBrass ? (
            <div className="flex items-center gap-4 py-2">
              {[0, 1, 2].map((valveIdx) => {
                const isDown = trumpetState[valveIdx];
                return (
                  <div key={valveIdx} className="flex flex-col items-center gap-1.5">
                    <span className="text-[0.625rem] font-bold text-[var(--color-ns-muted)]">
                      V{valveIdx + 1}
                    </span>
                    <div
                      className={`flex h-12 w-8 items-center justify-center rounded-full border-2 transition-all ${
                        isDown
                          ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] shadow-[0_0_10px_rgba(229,169,60,0.4)]"
                          : "border-[var(--color-ns-border-strong)] bg-transparent"
                      }`}
                    >
                      <span className={`text-[0.6875rem] font-bold ${isDown ? "text-[var(--color-ns-ink)]" : "text-[var(--color-ns-muted)]"}`}>
                        {isDown ? "DOWN" : "UP"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-2">
              {woodwindState.map((isClosed, hIdx) => (
                <div key={hIdx} className="flex flex-col items-center gap-1">
                  <span className="text-[0.55rem] text-[var(--color-ns-muted)]">H{hIdx + 1}</span>
                  <div
                    className={`h-6 w-6 rounded-full border-2 transition-all ${
                      isClosed
                        ? "border-sky-400 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.4)]"
                        : "border-[var(--color-ns-border-strong)] bg-transparent"
                    }`}
                  />
                  <span className="text-[0.55rem] font-semibold text-[var(--color-ns-muted)]">
                    {isClosed ? "Close" : "Open"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transposition & Part Reading */}
        <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-4 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
              Written vs. Concert Pitch Transposition
            </span>
            {model.written ? (
              <div className="mt-2 space-y-1.5 text-xs">
                <p>
                  <span className="font-semibold text-[var(--color-ns-text)]">Player Reads: </span>
                  <span className="font-mono font-bold text-emerald-400">{model.written.label}</span> ({model.written.notes.join(" · ")})
                </p>
                <p>
                  <span className="font-semibold text-[var(--color-ns-text)]">Actual Sounding: </span>
                  <span className="font-mono font-bold text-[var(--color-ns-amber)]">{model.chord.label}</span> ({model.notes.join(" · ")})
                </p>
                <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
                  Transposition: {model.definition.name} sounds {model.written.instrumentPitch} ({model.definition.transposition?.semitones ?? 0} semitones offset from concert pitch).
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--color-ns-muted)]">
                Concert Pitch Instrument (C): Notes sound exactly as written on sheet music without pitch transposition.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 3. HARP WORKBENCH (Pedal / Lever Strings Map)
 * ───────────────────────────────────────────────────────────── */
function HarpWorkbench({
  model,
  onStringClick,
}: {
  model: Extract<OtherModel, { kind: "harp" }>;
  onStringClick: (midi: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-3">
        <div>
          <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
            Harp String & Lever / Pedal Map
          </h4>
          <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
            Red = C strings · Black/Blue = F strings · Amber = Active chord strings.
          </p>
        </div>
        <span className="rounded-lg bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/20">
          {model.rangeName}
        </span>
      </div>

      {/* Lever States */}
      <div className="mb-4">
        <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
          Required Lever / Pedal Settings:
        </span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {model.needs.map((n) => (
            <span
              key={n.letter}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-2.5 py-1 text-xs font-mono font-bold text-[var(--color-ns-text)]"
            >
              <span>{n.letter}</span>
              <span className="text-[var(--color-ns-amber)]">
                {n.accidental === 1 ? "♯ (Sharp)" : n.accidental === -1 ? "♭ (Flat)" : "♮ (Natural)"}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Strings Visual Strip */}
      <div className="flex items-end gap-1.5 overflow-x-auto py-3 bg-[var(--color-ns-bg)] rounded-xl px-4 border border-[var(--color-ns-border)]">
        {model.strings.map((str, sIdx) => {
          const isC = str.letter === "C";
          const isF = str.letter === "F";
          const inChord = str.inChord;
          const height = 40 + (sIdx % 30) * 2.2;

          return (
            <div
              key={`harp-str-${sIdx}`}
              className="flex flex-col items-center gap-1 cursor-pointer group"
              onClick={() => onStringClick(str.midi)}
              title={`${str.note} (MIDI ${str.midi})`}
            >
              <div
                style={{ height: `${height}px` }}
                className={`w-2 rounded-full transition-all group-hover:scale-110 ${
                  inChord
                    ? "bg-[var(--color-ns-amber)] shadow-[0_0_8px_rgba(229,169,60,0.5)]"
                    : isC
                    ? "bg-rose-500"
                    : isF
                    ? "bg-sky-500"
                    : "bg-[var(--color-ns-border-strong)]"
                }`}
              />
              <span className={`text-[0.55rem] font-bold ${inChord ? "text-[var(--color-ns-amber)]" : "text-[var(--color-ns-muted)]"}`}>
                {str.letter}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 4. ACCORDION WORKBENCH (Stradella Bass Grid)
 * ───────────────────────────────────────────────────────────── */
const STRADELLA_ROWS = ["Counter-bass", "Bass", "Major", "Minor", "Seventh", "Diminished"] as const;
const STRADELLA_COLS = ["Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#"];

function AccordionWorkbench({
  model,
  analysis: _analysis,
  selectedNoteMidi: _selectedNoteMidi,
  onKeyClick: _onKeyClick,
}: {
  model: Extract<OtherModel, { kind: "accordion" }>;
  analysis: ChordAnalysis;
  selectedNoteMidi: number | null;
  onKeyClick: (midi: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-3">
        <div>
          <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
            Accordion Stradella Bass Button Matrix
          </h4>
          <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
            Circle of fifths bass & chord button matrix (Left Hand).
          </p>
        </div>
        {model.stradella && (
          <span className="rounded-lg bg-[var(--color-ns-amber)]/10 px-2.5 py-0.5 text-xs font-bold text-[var(--color-ns-amber)] border border-[var(--color-ns-amber)]/20">
            Target Button: {model.stradella.column} {model.stradella.row}
          </span>
        )}
      </div>

      {/* Button Matrix */}
      <div className="overflow-x-auto py-2">
        <div className="grid gap-1.5 min-w-[34rem]">
          {STRADELLA_ROWS.map((rowName) => (
            <div key={rowName} className="flex items-center gap-1.5">
              <span className="w-24 text-[0.6rem] font-bold text-[var(--color-ns-muted)] truncate">{rowName}</span>
              <div className="flex gap-1.5">
                {STRADELLA_COLS.map((colName) => {
                  const isMatch = model.stradella?.row === rowName && model.stradella?.column === colName;
                  return (
                    <div
                      key={`${rowName}-${colName}`}
                      className={`flex h-8 w-11 items-center justify-center rounded-lg border text-[0.625rem] font-bold transition-all ${
                        isMatch
                          ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-[0_0_10px_rgba(229,169,60,0.5)] scale-105"
                          : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)]"
                      }`}
                    >
                      {colName}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 5. HARMONICA WORKBENCH (10-Hole Diatonic Map)
 * ───────────────────────────────────────────────────────────── */
function HarmonicaWorkbench({
  model,
  onHoleClick,
}: {
  model: Extract<OtherModel, { kind: "harmonica" }>;
  onHoleClick: (midi: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-3">
        <div>
          <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
            10-Hole Diatonic Harmonica Map ({model.harpKey} Key)
          </h4>
          <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
            Blow notes (top row) vs. Draw notes (bottom row). Amber indicates chord tones.
          </p>
        </div>
        <span className="text-xs font-semibold text-[var(--color-ns-muted)]">
          {model.groups.length > 0 ? `${model.groups.length} playable hole groups` : "Diatonic arpeggio only"}
        </span>
      </div>

      <div className="overflow-x-auto py-2">
        <div className="grid grid-cols-10 gap-2 min-w-[32rem]">
          {model.holes.map((h) => (
            <div key={h.hole} className="flex flex-col items-center gap-1.5">
              {/* Blow Note */}
              <button
                type="button"
                onClick={() => onHoleClick(h.blow.midi)}
                className={`flex h-10 w-full flex-col items-center justify-center rounded-lg border text-xs transition-all ${
                  h.blowInChord
                    ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)] font-bold shadow-sm"
                    : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] opacity-50"
                }`}
              >
                <span className="text-[0.6562rem]">{h.blow.name}</span>
                <span className="text-[0.55rem] uppercase opacity-75">Blow</span>
              </button>

              {/* Hole Number */}
              <span className="text-xs font-bold text-[var(--color-ns-text)]">{h.hole}</span>

              {/* Draw Note */}
              <button
                type="button"
                onClick={() => onHoleClick(h.draw.midi)}
                className={`flex h-10 w-full flex-col items-center justify-center rounded-lg border text-xs transition-all ${
                  h.drawInChord
                    ? "border-sky-400 bg-sky-500/20 text-sky-400 font-bold shadow-sm"
                    : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] opacity-50"
                }`}
              >
                <span className="text-[0.6562rem]">{h.draw.name}</span>
                <span className="text-[0.55rem] uppercase opacity-75">Draw</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
