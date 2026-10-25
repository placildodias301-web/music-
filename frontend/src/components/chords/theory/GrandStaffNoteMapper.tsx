import { useState, useMemo } from "react";
import { chordInstruments, findDefinition, type InstrumentDefinition } from "../../../lib/instruments/definitions";
import { NOTE_NAMES } from "../../../lib/chordTheory";
const SHARP_TO_FLAT_MAP: Record<string, string> = { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" };
import { playSinglePitch, stopAllAudio } from "../../../lib/chords/play";
import { CustomSelect } from "../../CustomSelect";

export type ClefType = "grand" | "treble" | "bass" | "alto" | "tenor";

export interface NoteFingerLocation {
  stringName: string;
  stringIndex: number;
  fret: number;
  lhFinger: number; // 0 = open, 1 = index, 2 = middle, 3 = ring, 4 = pinky
  rhFinger: "p" | "i" | "m" | "a";
}

// Indian classical Sargam mapping by pitch class (relative to C)
const SARGAM_MAP = [
  "Sa (सा)",
  "Komal Re (॒रे)",
  "Shuddha Re (रे)",
  "Komal Ga (॒ग)",
  "Shuddha Ga (ग)",
  "Shuddha Ma (म)",
  "Teevra Ma (म॑)",
  "Pa (प)",
  "Komal Dha (॒ध)",
  "Shuddha Dha (ध)",
  "Komal Ni (॒नि)",
  "Shuddha Ni (नि)",
];

// Western Solfège mapping by pitch class
const SOLFEGE_MAP = [
  "Do",
  "Di / Ra",
  "Re",
  "Ri / Me",
  "Mi",
  "Fa",
  "Fi / Se",
  "Sol",
  "Si / Le",
  "La",
  "Li / Te",
  "Ti",
];

// German Helmholtz mapping
function getHelmholtz(midi: number, pcName: string): string {
  const octave = Math.floor(midi / 12) - 1;
  const baseLetter = pcName.replace("#", "is").replace("b", "es");
  if (octave >= 6) return `${baseLetter.toLowerCase()}''' (${octave})`;
  if (octave === 5) return `${baseLetter.toLowerCase()}''`;
  if (octave === 4) return `${baseLetter.toLowerCase()}' (One-line / Middle)`;
  if (octave === 3) return `${baseLetter.toLowerCase()} (Small)`;
  if (octave === 2) return `${baseLetter.toUpperCase()} (Great)`;
  if (octave === 1) return `${baseLetter.toUpperCase()}, (Contra)`;
  return `${baseLetter.toUpperCase()},, (Sub-contra)`;
}

// Trumpet standard fingering for pitch
function getTrumpetFingering(midi: number): { valves: string; partial: string } {
  // Written pitch for Bb trumpet is 2 semitones higher
  const writtenMidi = midi + 2;
  const pc = writtenMidi % 12;
  // Fundamental range around C4 to C6
  switch (pc) {
    case 0: return { valves: writtenMidi <= 60 ? "Open (0)" : "Open (0)", partial: "1st / 4th Harmonic" }; // C
    case 1: return { valves: "1 - 2 - 3", partial: "Low fundamental" }; // C#
    case 2: return { valves: writtenMidi < 65 ? "1 - 3" : "1", partial: "2nd / 4th Harmonic" }; // D
    case 3: return { valves: "2 - 3", partial: "2nd / 4th Harmonic" }; // Eb
    case 4: return { valves: "1 - 2", partial: "3rd / 5th Harmonic" }; // E
    case 5: return { valves: "1", partial: "3rd / 5th Harmonic" }; // F
    case 6: return { valves: "2", partial: "3rd / 5th Harmonic" }; // F#
    case 7: return { valves: "Open (0)", partial: "3rd / 6th Harmonic" }; // G
    case 8: return { valves: "2 - 3", partial: "4th / 6th Harmonic" }; // Ab
    case 9: return { valves: "1 - 2", partial: "4th / 6th Harmonic" }; // A
    case 10: return { valves: "1", partial: "4th / 7th Harmonic" }; // Bb
    case 11: return { valves: "2", partial: "4th / 7th Harmonic" }; // B
    default: return { valves: "Open (0)", partial: "Harmonic partial" };
  }
}

// Harmonica 10-hole Richter mapping (in Key of C)
function getHarmonicaHole(midi: number): { hole: number; action: "Blow" | "Draw" } | null {
  const map: Record<number, { hole: number; action: "Blow" | "Draw" }> = {
    60: { hole: 1, action: "Blow" }, // C4
    62: { hole: 1, action: "Draw" }, // D4
    64: { hole: 2, action: "Blow" }, // E4
    67: { hole: 2, action: "Draw" }, // G4
    71: { hole: 3, action: "Draw" }, // B4
    72: { hole: 4, action: "Blow" }, // C5
    74: { hole: 4, action: "Draw" }, // D5
    76: { hole: 5, action: "Blow" }, // E5
    77: { hole: 5, action: "Draw" }, // F5
    79: { hole: 6, action: "Blow" }, // G5
    81: { hole: 6, action: "Draw" }, // A5
    83: { hole: 7, action: "Draw" }, // B5
    84: { hole: 7, action: "Blow" }, // C6
    86: { hole: 8, action: "Draw" }, // D6
    88: { hole: 8, action: "Blow" }, // E6
    89: { hole: 9, action: "Draw" }, // F6
    91: { hole: 9, action: "Blow" }, // G6
    93: { hole: 10, action: "Draw" }, // A6
    95: { hole: 10, action: "Draw" }, // B6
    96: { hole: 10, action: "Blow" }, // C7
  };
  return map[midi] ?? null;
}

export function GrandStaffNoteMapper({
  currentInstrumentId = "guitar",
  onSelectInstrument,
}: {
  currentInstrumentId?: string;
  onSelectInstrument?: (id: string) => void;
}) {
  const [clef, setClef] = useState<ClefType>("grand");
  const [activeMidi, setActiveMidi] = useState<number>(60); // Middle C (C4)
  const [selectedInstId, setSelectedInstId] = useState<string>(currentInstrumentId);
  const [playing, setPlaying] = useState<boolean>(false);

  const definition = useMemo<InstrumentDefinition>(() => {
    return findDefinition(selectedInstId) ?? findDefinition("guitar")!;
  }, [selectedInstId]);

  const activePitchClass = ((activeMidi % 12) + 12) % 12;
  const activeOctave = Math.floor(activeMidi / 12) - 1;
  const activeNoteName = NOTE_NAMES[activePitchClass];
  const flatName = SHARP_TO_FLAT_MAP[activeNoteName] ?? activeNoteName;
  const frequencyHz = 440 * Math.pow(2, (activeMidi - 69) / 12);

  // Sound playback
  const handlePlayNote = (midi = activeMidi) => {
    stopAllAudio();
    setPlaying(true);
    void playSinglePitch(midi, definition.id).then(() => {
      setTimeout(() => setPlaying(false), 500);
    });
  };

  // Find all frets and strings on selected fretted instrument for this exact pitch
  const frettedLocations = useMemo<NoteFingerLocation[]>(() => {
    // Standard tunings for instruments
    const tuningMap: Record<string, { names: string[]; midis: number[] }> = {
      guitar: { names: ["E2", "A2", "D3", "G3", "B3", "E4"], midis: [40, 45, 50, 55, 59, 64] },
      "acoustic-guitar": { names: ["E2", "A2", "D3", "G3", "B3", "E4"], midis: [40, 45, 50, 55, 59, 64] },
      "electric-guitar": { names: ["E2", "A2", "D3", "G3", "B3", "E4"], midis: [40, 45, 50, 55, 59, 64] },
      bass: { names: ["E1", "A1", "D2", "G2"], midis: [28, 33, 38, 43] },
      ukulele: { names: ["G4", "C4", "E4", "A4"], midis: [67, 60, 64, 69] },
      mandolin: { names: ["G3", "D4", "A4", "E5"], midis: [55, 62, 69, 76] },
      banjo: { names: ["G4", "D3", "G3", "B3", "D4"], midis: [67, 50, 55, 59, 62] },
      violin: { names: ["G3", "D4", "A4", "E5"], midis: [55, 62, 69, 76] },
      viola: { names: ["C3", "G3", "D4", "A4"], midis: [48, 55, 62, 69] },
      cello: { names: ["C2", "G2", "D3", "A3"], midis: [36, 43, 50, 57] },
    };

    const cur = tuningMap[definition.id] ?? tuningMap.guitar;
    const maxFret = 22;
    const results: NoteFingerLocation[] = [];

    cur.midis.forEach((openMidi, stringIndex) => {
      const fret = activeMidi - openMidi;
      if (fret >= 0 && fret <= maxFret) {
        // Finger estimation based on fret
        const lhFinger = fret === 0 ? 0 : ((fret - 1) % 4) + 1;
        const rhFinger: "p" | "i" | "m" | "a" = stringIndex < 3 ? "p" : stringIndex === 3 ? "i" : stringIndex === 4 ? "m" : "a";
        results.push({
          stringName: cur.names[stringIndex],
          stringIndex,
          fret,
          lhFinger,
          rhFinger,
        });
      }
    });

    return results;
  }, [definition.id, activeMidi]);

  // Standard piano fingerings
  const pianoFingerings = useMemo(() => {
    const pc = activePitchClass;
    // Standard C Major scale fingering positions for hands
    const rhFingers = [1, 1, 2, 2, 3, 4, 4, 5, 5, 1, 2, 3];
    const lhFingers = [5, 5, 4, 4, 3, 2, 2, 1, 1, 3, 2, 1];
    return {
      rh: rhFingers[pc] ?? 1,
      lh: lhFingers[pc] ?? 1,
    };
  }, [activePitchClass]);

  // Trumpet fingering
  const trumpetInfo = useMemo(() => getTrumpetFingering(activeMidi), [activeMidi]);

  // Harmonica info
  const harmonicaInfo = useMemo(() => getHarmonicaHole(activeMidi), [activeMidi]);

  // Notes on staff to render interactively
  // Range from C2 (36) to C6 (84)
  const staffNotesRange = useMemo(() => {
    // Generate step positions for clickable notes on staff
    const notes: { midi: number; name: string; octave: number; staffStep: number }[] = [];
    const stepLetters = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
    for (let m = 36; m <= 84; m++) {
      const pc = m % 12;
      const oct = Math.floor(m / 12) - 1;
      const step = oct * 7 + stepLetters[pc];
      notes.push({
        midi: m,
        name: NOTE_NAMES[pc],
        octave: oct,
        staffStep: step,
      });
    }
    return notes;
  }, []);

  return (
    <div className="space-y-6">
      {/* ─── HEADER & INSTRUMENT / CLEF SELECTOR ─── */}
      <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-ns-border)] pb-4">
          <div>
            <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)] sm:text-xl">
              Grand Staff & Note-To-Finger Mapper
            </h3>
            <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
              Click any note on the staff to inspect its complete acoustic identity, solfège, sargam, and exact fingerings on {definition.name}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Clef selector */}
            <div className="flex rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-xs">
              {(
                [
                  ["grand", "Grand Staff"],
                  ["treble", "Treble (G)"],
                  ["bass", "Bass (F)"],
                  ["alto", "Alto (C)"],
                  ["tenor", "Tenor (C)"],
                ] as const
              ).map(([c, label]) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setClef(c)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
                    clef === c
                      ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                      : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Instrument selector */}
            <div className="w-48">
              <CustomSelect
                value={definition.id}
                onChange={(v) => {
                  const id = String(v);
                  setSelectedInstId(id);
                  onSelectInstrument?.(id);
                }}
                options={chordInstruments().map((inst) => ({
                  value: inst.id,
                  label: inst.name,
                }))}
              />
            </div>
          </div>
        </div>

        {/* ─── INTERACTIVE SVG GRAND STAFF ─── */}
        <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-4">
          <svg viewBox="0 0 900 240" className="w-full max-w-4xl mx-auto block select-none">
            {/* Clef labels & background lines */}
            {clef === "grand" || clef === "treble" ? (
              <g id="treble-lines">
                <text x="20" y="70" fill="#f59e0b" fontSize="38" fontFamily="serif" fontWeight="bold">𝄞</text>
                <text x="60" y="32" fill="#71717a" fontSize="10" fontFamily="sans-serif">Treble Clef (G4 = 2nd line)</text>
                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={`tr-${i}`}
                    x1="60"
                    y1={45 + i * 10}
                    x2="880"
                    y2={45 + i * 10}
                    stroke="#3f3f46"
                    strokeWidth="1.5"
                  />
                ))}
              </g>
            ) : null}

            {clef === "grand" || clef === "bass" ? (
              <g id="bass-lines">
                <text x="20" y={clef === "grand" ? 175 : 100} fill="#0ea5e9" fontSize="32" fontFamily="serif" fontWeight="bold">𝄢</text>
                <text x="60" y={clef === "grand" ? 135 : 60} fill="#71717a" fontSize="10" fontFamily="sans-serif">Bass Clef (F3 = 4th line)</text>
                {[0, 1, 2, 3, 4].map((i) => {
                  const baseY = clef === "grand" ? 150 : 75;
                  return (
                    <line
                      key={`ba-${i}`}
                      x1="60"
                      y1={baseY + i * 10}
                      x2="880"
                      y2={baseY + i * 10}
                      stroke="#3f3f46"
                      strokeWidth="1.5"
                    />
                  );
                })}
              </g>
            ) : null}

            {clef === "alto" || clef === "tenor" ? (
              <g id="c-clef-lines">
                <text x="20" y="85" fill="#a855f7" fontSize="32" fontFamily="serif" fontWeight="bold">𝄡</text>
                <text x="60" y="32" fill="#71717a" fontSize="10" fontFamily="sans-serif">
                  {clef === "alto" ? "Alto Clef (Middle C on 3rd line)" : "Tenor Clef (Middle C on 4th line)"}
                </text>
                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={`c-${i}`}
                    x1="60"
                    y1={45 + i * 10}
                    x2="880"
                    y2={45 + i * 10}
                    stroke="#3f3f46"
                    strokeWidth="1.5"
                  />
                ))}
              </g>
            ) : null}

            {/* Clickable Notes Grid along the staff */}
            {staffNotesRange
              .filter((n) => {
                if (clef === "treble") return n.midi >= 57 && n.midi <= 84;
                if (clef === "bass") return n.midi >= 36 && n.midi <= 62;
                return n.midi >= 40 && n.midi <= 80;
              })
              .map((n, idx, arr) => {
                const total = arr.length;
                const x = 90 + (idx / Math.max(total - 1, 1)) * 770;
                const isSelected = activeMidi === n.midi;

                // Vertical staff coordinate calculation based on staffStep
                // Reference: Middle C (C4, step 28, midi 60)
                let y = 115;
                if (clef === "grand") {
                  if (n.midi >= 60) {
                    // Treble: C4 = 95, E4 = 85, G4 = 75, B4 = 65, D5 = 55, F5 = 45
                    y = 95 - (n.staffStep - 28) * 5;
                  } else {
                    // Bass: C4 = 135, A3 = 145, F3 = 155, D3 = 165, B2 = 175, G2 = 185
                    y = 135 + (28 - n.staffStep) * 5;
                  }
                } else if (clef === "treble") {
                  y = 95 - (n.staffStep - 28) * 5;
                } else if (clef === "bass") {
                  y = 65 + (28 - n.staffStep) * 5;
                } else if (clef === "alto") {
                  y = 65 - (n.staffStep - 28) * 5;
                } else if (clef === "tenor") {
                  y = 75 - (n.staffStep - 28) * 5;
                }

                const isSharp = n.name.includes("#");
                const isMiddleC = n.midi === 60;

                return (
                  <g
                    key={n.midi}
                    className="cursor-pointer transition-transform hover:scale-110"
                    onClick={() => {
                      setActiveMidi(n.midi);
                      handlePlayNote(n.midi);
                    }}
                  >
                    {/* Middle C Ledger line */}
                    {isMiddleC && (
                      <line
                        x1={x - 10}
                        y1={y}
                        x2={x + 10}
                        y2={y}
                        stroke={isSelected ? "#f59e0b" : "#71717a"}
                        strokeWidth="2"
                      />
                    )}

                    {/* Ledger lines for extreme high/low */}
                    {y < 40 && (
                      <line x1={x - 8} y1={35} x2={x + 8} y2={35} stroke="#52525b" strokeWidth="1.5" />
                    )}
                    {y > 195 && (
                      <line x1={x - 8} y1={200} x2={x + 8} y2={200} stroke="#52525b" strokeWidth="1.5" />
                    )}

                    {/* Notehead */}
                    <ellipse
                      cx={x}
                      cy={y}
                      rx={isSelected ? 6.5 : 5}
                      ry={isSelected ? 4.8 : 3.8}
                      transform={`rotate(-25 ${x} ${y})`}
                      fill={isSelected ? "#f59e0b" : isSharp ? "#a855f7" : "#e4e4e7"}
                      stroke={isSelected ? "#d97706" : "none"}
                      strokeWidth={isSelected ? 2 : 0}
                    />

                    {/* Sharp Accidental if needed */}
                    {isSharp && (
                      <text
                        x={x - 8}
                        y={y + 3}
                        fill={isSelected ? "#f59e0b" : "#a855f7"}
                        fontSize="9"
                        fontWeight="bold"
                        textAnchor="end"
                      >
                        ♯
                      </text>
                    )}

                    {/* Pitch Label */}
                    <text
                      x={x}
                      y={y + (y > 120 ? 16 : -12)}
                      fill={isSelected ? "#f59e0b" : "#71717a"}
                      fontSize={isSelected ? "9" : "7.5"}
                      fontWeight={isSelected ? "bold" : "normal"}
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {n.name}{n.octave}
                    </text>
                  </g>
                );
              })}
          </svg>
        </div>

        {/* Note selection buttons & slider */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
              Quick Pitch:
            </span>
            <div className="flex flex-wrap gap-1">
              {[
                { label: "C3 (Low C)", midi: 48 },
                { label: "E3", midi: 52 },
                { label: "A3", midi: 57 },
                { label: "C4 (Middle C)", midi: 60 },
                { label: "E4", midi: 64 },
                { label: "G4", midi: 67 },
                { label: "A4 (440Hz)", midi: 69 },
                { label: "C5 (High C)", midi: 72 },
              ].map((p) => (
                <button
                  key={p.midi}
                  type="button"
                  onClick={() => {
                    setActiveMidi(p.midi);
                    handlePlayNote(p.midi);
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeMidi === p.midi
                      ? "border border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)] font-bold"
                      : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => handlePlayNote(activeMidi)}
            disabled={playing}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              playing
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)]"
                : "border border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/10 text-[var(--color-ns-amber)] hover:bg-[var(--color-ns-amber)] hover:text-[var(--color-ns-ink)]"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Play Pitch ({activeNoteName}{activeOctave})
          </button>
        </div>
      </div>

      {/* ─── TWO-COLUMN NOTE IDENTITY & INSTRUMENT FINGERINGS ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Note Identity & Universal Theory */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--color-ns-border)] pb-3">
              <div>
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                  Complete Note Profile
                </span>
                <h4 className="font-heading text-2xl font-black text-[var(--color-ns-amber)]">
                  {activeNoteName}{activeOctave}
                  {flatName !== activeNoteName && (
                    <span className="ml-2 text-base font-normal text-[var(--color-ns-muted)]">
                      / {flatName}{activeOctave}
                    </span>
                  )}
                </h4>
              </div>
              <span className="font-mono text-xs font-bold text-[var(--color-ns-text)]">
                MIDI #{activeMidi} · {frequencyHz.toFixed(2)} Hz
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 p-3">
                <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Western Solfège</span>
                <p className="mt-1 font-heading text-sm font-bold text-[var(--color-ns-text)]">
                  {SOLFEGE_MAP[activePitchClass]}
                </p>
                <span className="text-[0.6875rem] text-[var(--color-ns-dim)]">Fixed-Do reference</span>
              </div>

              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 p-3">
                <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Indian Classical Sargam</span>
                <p className="mt-1 font-heading text-sm font-bold text-[var(--color-ns-amber)]">
                  {SARGAM_MAP[activePitchClass]}
                </p>
                <span className="text-[0.6875rem] text-[var(--color-ns-dim)]">Carnatic & Hindustani Swara</span>
              </div>

              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 p-3">
                <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Helmholtz / German</span>
                <p className="mt-1 font-mono text-sm font-bold text-[var(--color-ns-text)]">
                  {getHelmholtz(activeMidi, activeNoteName)}
                </p>
                <span className="text-[0.6875rem] text-[var(--color-ns-dim)]">Classical European score notation</span>
              </div>

              <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 p-3">
                <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Enharmonic Spellings</span>
                <p className="mt-1 font-mono text-sm font-bold text-[var(--color-ns-text)]">
                  {activeNoteName} · {flatName}
                  {activeNoteName === "C" ? " · B♯ · D𝄫" : activeNoteName === "F#" ? " · G♭ · E𝄪" : ""}
                </p>
                <span className="text-[0.6875rem] text-[var(--color-ns-dim)]">Equivalent pitch frequencies</span>
              </div>
            </div>

            {/* Scale Degree / Harmonic Meaning */}
            <div className="mt-4 border-t border-[var(--color-ns-border)]/60 pt-4">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                Harmonic Function & Emotional Meaning
              </span>
              <div className="mt-2.5 space-y-2 text-xs leading-relaxed text-[var(--color-ns-text)]">
                <div className="flex gap-2">
                  <span className="font-bold text-[var(--color-ns-amber)]">As Root (1):</span>
                  <span>Provides absolute gravitational stability and tonal resting point. The harmonic foundation.</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-emerald-400">As 3rd (♭3 / 3):</span>
                  <span>Determines major vs. minor emotional character. Major 3rd yields bright warmth; Minor 3rd yields dark melancholia.</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-sky-400">As 5th (5 / ♭5):</span>
                  <span>Perfect 5th reinforces acoustic resonance; diminished 5th (tritone) introduces maximum harmonic tension.</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-purple-400">As 7th (♭7 / 7):</span>
                  <span>Guide tone essential for resolution. Minor 7th drives dominant pull; Major 7th adds lush jazz serenity.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: How to Play This Exact Note on Your Selected Instrument */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--color-ns-border)] pb-3">
              <div>
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                  Instrument Fingering Map
                </span>
                <h4 className="font-heading text-base font-bold text-[var(--color-ns-text)]">
                  Playing {activeNoteName}{activeOctave} on {definition.name}
                </h4>
              </div>
              <span className="rounded-full bg-[var(--color-ns-border-strong)] px-2.5 py-0.5 text-[0.6875rem] font-semibold text-[var(--color-ns-muted)]">
                {definition.chordRenderer}
              </span>
            </div>

            {/* 1. Fretted Instruments (Guitar, Bass, Ukulele, Mandolin, Banjo) */}
            {frettedLocations.length > 0 ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-[var(--color-ns-muted)]">
                  Found on <span className="font-bold text-[var(--color-ns-amber)]">{frettedLocations.length} string positions</span> at this exact octave:
                </p>

                <div className="space-y-2">
                  {frettedLocations.map((loc, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 px-3.5 py-2.5 text-xs transition-colors hover:border-[var(--color-ns-amber)]/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-ns-border)] font-mono font-bold text-[var(--color-ns-text)]">
                          {loc.stringIndex + 1}
                        </span>
                        <div>
                          <span className="font-bold text-[var(--color-ns-text)]">
                            {loc.stringName} string
                          </span>
                          <span className="ml-2 font-mono font-bold text-[var(--color-ns-amber)]">
                            {loc.fret === 0 ? "Open String (Fret 0)" : `Fret ${loc.fret}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-right">
                        <span className="rounded bg-[var(--color-ns-card)] px-2 py-0.5 text-[0.6875rem] text-[var(--color-ns-muted)]">
                          LH Finger: <strong className="text-[var(--color-ns-text)]">{loc.lhFinger === 0 ? "0 (Open)" : loc.lhFinger}</strong>
                        </span>
                        <span className="rounded bg-[var(--color-ns-card)] px-2 py-0.5 text-[0.6875rem] text-[var(--color-ns-muted)]">
                          RH: <strong className="text-[var(--color-ns-text)]">{loc.rhFinger}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-[var(--color-ns-border)]/60 bg-[var(--color-ns-bg)] p-2.5 text-[0.6875rem] text-[var(--color-ns-dim)]">
                  <strong>Right-Hand notation:</strong> p = Thumb (Pulgar) · i = Index · m = Middle · a = Ring (Anular)
                </div>
              </div>
            ) : null}

            {/* 2. Piano / Keyboard */}
            {definition.chordRenderer === "keyboard" || definition.chordRenderer === "mallet" ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-4">
                  <span className="text-[0.6875rem] font-bold uppercase text-[var(--color-ns-muted)]">88-Key Keyboard Location</span>
                  <p className="mt-1 text-xs text-[var(--color-ns-text)]">
                    Key #{activeMidi - 20} of 88 (MIDI {activeMidi}).
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-[var(--color-ns-border)]/60 pt-2 text-xs">
                    <div>
                      <span className="text-[0.6875rem] text-[var(--color-ns-muted)]">Right-Hand Scale Finger: </span>
                      <strong className="text-[var(--color-ns-amber)]">{pianoFingerings.rh}</strong>
                    </div>
                    <div>
                      <span className="text-[0.6875rem] text-[var(--color-ns-muted)]">Left-Hand Scale Finger: </span>
                      <strong className="text-[var(--color-ns-amber)]">{pianoFingerings.lh}</strong>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* 3. Trumpet / Brass */}
            {definition.id === "trumpet" && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-4">
                  <span className="text-[0.6875rem] font-bold uppercase text-[var(--color-ns-muted)]">Trumpet Valve Combination</span>
                  <p className="mt-1 font-heading text-lg font-bold text-[var(--color-ns-amber)]">
                    {trumpetInfo.valves}
                  </p>
                  <span className="text-xs text-[var(--color-ns-dim)]">Harmonic Partial: {trumpetInfo.partial}</span>
                </div>
              </div>
            )}

            {/* 4. Harmonica */}
            {definition.id === "harmonica" && (
              <div className="mt-4 space-y-3">
                {harmonicaInfo ? (
                  <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-4">
                    <span className="text-[0.6875rem] font-bold uppercase text-[var(--color-ns-muted)]">10-Hole Diatonic (C)</span>
                    <p className="mt-1 font-heading text-lg font-bold text-[var(--color-ns-amber)]">
                      Hole {harmonicaInfo.hole} · {harmonicaInfo.action}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-ns-muted)]">
                    This exact pitch requires note bending or falls outside standard 10-hole Richter range.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
