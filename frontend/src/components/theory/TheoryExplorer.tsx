import { useState, useMemo } from "react";
import {
  createNote,
  getEnharmonicSpellings,
  type NoteSpelling,
} from "../../lib/theory/notes";
import {
  intervalBetween,
  invertInterval,
} from "../../lib/theory/intervals";
import { GrandStaffNoteMapper } from "../chords/theory/GrandStaffNoteMapper";
import { NotationEncyclopedia } from "../chords/theory/NotationEncyclopedia";
import { ScaleIntervalsLab } from "../chords/theory/ScaleIntervalsLab";
import { HarmonyBridge } from "../chords/theory/HarmonyBridge";

export type TheoryMainTab =
  | "staff_mapper"
  | "notation_encyclopedia"
  | "scale_intervals"
  | "harmony_bridge"
  | "pitch_calculator";

export interface TheoryExplorerProps {
  currentInstrumentId?: string;
  onNavigateToTab?: (tab: "library" | "family" | "explorer", chordOrKey?: string | number) => void;
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const ACCIDENTALS = [
  { label: "♮ Natural", val: "" },
  { label: "♯ Sharp", val: "#" },
  { label: "♭ Flat", val: "b" },
  { label: "𝄪 Double Sharp", val: "##" },
  { label: "𝄫 Double Flat", val: "bb" },
];
const OCTAVES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export function TheoryExplorer({
  currentInstrumentId = "guitar",
  onNavigateToTab,
}: TheoryExplorerProps) {
  const [activeTab, setActiveTab] = useState<TheoryMainTab>("staff_mapper");

  // State for Pitch & Interval Calculator
  const [noteLetter, setNoteLetter] = useState<string>("C");
  const [noteAcc, setNoteAcc] = useState<string>("");
  const [noteOctave, setNoteOctave] = useState<number>(4);

  const [intNoteA, setIntNoteA] = useState<string>("C4");
  const [intNoteB, setIntNoteB] = useState<string>("G4");

  const activeNote = useMemo(() => {
    try {
      const sp: NoteSpelling = {
        letter: noteLetter as any,
        accidental: (noteAcc === "#" ? "♯" : noteAcc === "b" ? "♭" : noteAcc === "##" ? "𝄪" : noteAcc === "bb" ? "𝄫" : "") as any,
        alteration: noteAcc === "##" ? 2 : noteAcc === "#" ? 1 : noteAcc === "b" ? -1 : noteAcc === "bb" ? -2 : 0,
        octave: noteOctave,
      };
      return createNote(sp);
    } catch {
      return createNote("C4");
    }
  }, [noteLetter, noteAcc, noteOctave]);

  const enharmonics = useMemo(() => {
    return getEnharmonicSpellings(activeNote.spelling);
  }, [activeNote]);

  const calculatedInterval = useMemo(() => {
    try {
      return intervalBetween(intNoteA, intNoteB);
    } catch {
      return null;
    }
  }, [intNoteA, intNoteB]);

  const invertedInterval = useMemo(() => {
    if (!calculatedInterval) return null;
    try {
      return invertInterval(calculatedInterval);
    } catch {
      return null;
    }
  }, [calculatedInterval]);

  return (
    <div className="space-y-6">
      {/* ─── MAIN CONSERVATORY THEORY NAVIGATION ─── */}
      <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-3">
          <div>
            <h2 className="font-heading text-xl font-bold text-[var(--color-ns-text)] sm:text-2xl">
              Music Theory Laboratory & Encyclopedia
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
              Berklee, ABRSM & Jazz Theory conservatory reference: grand staff, sheet notation, rhythm, 35+ scales, and voice leading.
            </p>
          </div>
        </div>

        {/* Top-Level Tabs */}
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              { id: "staff_mapper", label: "🎼 Grand Staff & Note Mapper" },
              { id: "notation_encyclopedia", label: "📖 Notation & Rhythm Encyclopedia" },
              { id: "scale_intervals", label: "📏 Intervals, Scales & Modes (35+)" },
              { id: "harmony_bridge", label: "🔄 Harmony & Circle of 5ths Bridge" },
              { id: "pitch_calculator", label: "⚙️ Pitch & Interval Calculator" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === t.id
                  ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                  : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-amber)]/50 hover:text-[var(--color-ns-text)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── MODULE 1: GRAND STAFF & NOTE-TO-FINGER MAPPER ─── */}
      {activeTab === "staff_mapper" && (
        <GrandStaffNoteMapper
          currentInstrumentId={currentInstrumentId}
          onSelectInstrument={(id) => onNavigateToTab?.("explorer", id)}
        />
      )}

      {/* ─── MODULE 2: NOTATION & RHYTHM ENCYCLOPEDIA ─── */}
      {activeTab === "notation_encyclopedia" && <NotationEncyclopedia />}

      {/* ─── MODULE 3: INTERVALS, SCALES & MODES LAB ─── */}
      {activeTab === "scale_intervals" && <ScaleIntervalsLab />}

      {/* ─── MODULE 4: HARMONY & CIRCLE OF FIFTHS BRIDGE ─── */}
      {activeTab === "harmony_bridge" && (
        <HarmonyBridge onNavigateToTab={onNavigateToTab} />
      )}

      {/* ─── MODULE 5: PITCH & INTERVAL CALCULATOR ─── */}
      {activeTab === "pitch_calculator" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Scientific Pitch Builder */}
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-ns-amber)]">
              Scientific Pitch Builder
            </h3>
            <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
              Build exact pitch notation with diatonic letters, accidentals, and octaves.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-[0.6875rem] font-bold uppercase text-[var(--color-ns-muted)]">
                  Diatonic Letter
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {LETTERS.map((ltr) => (
                    <button
                      key={ltr}
                      onClick={() => setNoteLetter(ltr)}
                      className={`h-9 w-9 rounded-lg font-mono text-sm font-bold transition-all ${
                        noteLetter === ltr
                          ? "bg-[var(--color-ns-amber)] text-black"
                          : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-muted)]"
                      }`}
                    >
                      {ltr}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[0.6875rem] font-bold uppercase text-[var(--color-ns-muted)]">
                  Accidental
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ACCIDENTALS.map((acc) => (
                    <button
                      key={acc.val}
                      onClick={() => setNoteAcc(acc.val)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                        noteAcc === acc.val
                          ? "bg-[var(--color-ns-amber)] text-black"
                          : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-muted)]"
                      }`}
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[0.6875rem] font-bold uppercase text-[var(--color-ns-muted)]">
                  Octave
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {OCTAVES.map((oct) => (
                    <button
                      key={oct}
                      onClick={() => setNoteOctave(oct)}
                      className={`h-8 w-8 rounded-lg font-mono text-xs font-bold transition-all ${
                        noteOctave === oct
                          ? "bg-[var(--color-ns-amber)] text-black"
                          : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-muted)]"
                      }`}
                    >
                      {oct}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2 border-t border-[var(--color-ns-border)]/60 pt-4 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 px-4 py-2.5">
                <span className="text-[var(--color-ns-muted)]">Pitch:</span>
                <span className="font-mono text-lg font-bold text-[var(--color-ns-amber)]">
                  {activeNote.scientificName}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 px-4 py-2.5">
                <span className="text-[var(--color-ns-muted)]">Frequency:</span>
                <span className="font-mono font-bold text-[var(--color-ns-text)]">
                  {activeNote.pitch.frequencyHz.toFixed(2)} Hz
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 px-4 py-2.5">
                <span className="text-[var(--color-ns-muted)]">Enharmonics:</span>
                <span className="font-mono font-semibold text-[var(--color-ns-text)]">
                  {enharmonics.join(", ")}
                </span>
              </div>
            </div>
          </div>

          {/* Interval Calculator */}
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-ns-amber)]">
              Two-Pitch Interval Calculator
            </h3>
            <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
              Compute exact interval distance, compound classification, and inversions.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="text-[0.6875rem] font-bold uppercase text-[var(--color-ns-muted)]">
                  Note 1
                </label>
                <input
                  type="text"
                  value={intNoteA}
                  onChange={(e) => setIntNoteA(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-2 font-mono text-sm font-bold text-[var(--color-ns-text)] focus:border-[var(--color-ns-amber)] focus:outline-none"
                  placeholder="e.g. C4"
                />
              </div>
              <div>
                <label className="text-[0.6875rem] font-bold uppercase text-[var(--color-ns-muted)]">
                  Note 2
                </label>
                <input
                  type="text"
                  value={intNoteB}
                  onChange={(e) => setIntNoteB(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-2 font-mono text-sm font-bold text-[var(--color-ns-text)] focus:border-[var(--color-ns-amber)] focus:outline-none"
                  placeholder="e.g. G4"
                />
              </div>
            </div>

            {calculatedInterval && (
              <div className="mt-5 space-y-2 border-t border-[var(--color-ns-border)]/60 pt-4 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 px-4 py-2.5">
                  <span className="text-[var(--color-ns-muted)]">Interval:</span>
                  <span className="font-heading text-base font-bold text-[var(--color-ns-amber)]">
                    {calculatedInterval.fullName} ({calculatedInterval.shortName})
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 px-4 py-2.5">
                  <span className="text-[var(--color-ns-muted)]">Distance:</span>
                  <span className="font-mono font-bold text-[var(--color-ns-text)]">
                    {calculatedInterval.semitones} semitones
                  </span>
                </div>
                {invertedInterval && (
                  <div className="flex items-center justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/70 px-4 py-2.5">
                    <span className="text-[var(--color-ns-muted)]">Inversion:</span>
                    <span className="font-mono font-bold text-[var(--color-ns-text)]">
                      {invertedInterval.fullName} ({invertedInterval.shortName})
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
