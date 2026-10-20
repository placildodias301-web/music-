import { useState, useMemo, useEffect } from "react";
import {
  NOTE_NAMES,
  CHORD_QUALITIES,
  CHORD_CATEGORIES,
  parseChordSymbol,
  getGuitarVoicings,
  type ParsedChord,
  type ChordCategory,
} from "../../lib/chordTheory";
import { assignFingers, type FingeringResult } from "../../lib/chords/fingering";
import {
  analyzeChord,
  analyzePlayedStrings,
  type ChordAnalysis,
  type PlayedStringAnalysis,
} from "../../lib/chords/analysis";
import { getPracticeGuidance } from "../../lib/chords/instructions";
import { InteractiveChordDiagram } from "./InteractiveChordDiagram";
import { StringInfoTable } from "./StringInfoTable";
import { NoteInspectorCard } from "./NoteInspectorCard";
import { ChordTheoryCard } from "./ChordTheoryCard";
import { FretboardExplorer } from "./FretboardExplorer";
import { ChordPracticePanel } from "./ChordPracticePanel";
import { playSingleNote } from "../../lib/playChord";

export interface ChordExplorerViewProps {
  initialChordSymbol?: string;
  onChordSelect?: (chord: ParsedChord) => void;
}

const PRESET_TUNINGS: Record<string, { name: string; midi: number[]; stringNames: string[] }> = {
  "guitar-standard": {
    name: "Standard (E A D G B E)",
    midi: [40, 45, 50, 55, 59, 64],
    stringNames: ["E", "A", "D", "G", "B", "E"],
  },
  "guitar-drop-d": {
    name: "Drop D (D A D G B E)",
    midi: [38, 45, 50, 55, 59, 64],
    stringNames: ["D", "A", "D", "G", "B", "E"],
  },
  "guitar-dadgad": {
    name: "DADGAD (D A D G A D)",
    midi: [38, 45, 50, 55, 57, 62],
    stringNames: ["D", "A", "D", "G", "A", "D"],
  },
  "guitar-open-g": {
    name: "Open G (D G D G B D)",
    midi: [38, 43, 50, 55, 59, 62],
    stringNames: ["D", "G", "D", "G", "B", "D"],
  },
  "guitar-open-c": {
    name: "Open C (C G C G C E)",
    midi: [36, 43, 48, 55, 60, 64],
    stringNames: ["C", "G", "C", "G", "C", "E"],
  },
  "guitar-drop-c": {
    name: "Drop C (C G C F A D)",
    midi: [36, 43, 48, 53, 57, 62],
    stringNames: ["C", "G", "C", "F", "A", "D"],
  },
  "bass-4": {
    name: "Standard Bass 4-Str (E A D G)",
    midi: [28, 33, 38, 43],
    stringNames: ["E", "A", "D", "G"],
  },
  "bass-5": {
    name: "Standard Bass 5-Str (B E A D G)",
    midi: [23, 28, 33, 38, 43],
    stringNames: ["B", "E", "A", "D", "G"],
  },
  "ukulele-standard": {
    name: "Standard Ukulele (G C E A)",
    midi: [67, 60, 64, 69],
    stringNames: ["G", "C", "E", "A"],
  },
};

export function ChordExplorerView({ initialChordSymbol = "C" }: ChordExplorerViewProps) {
  // Instrument selection
  const [instrumentId, setInstrumentId] = useState<string>("guitar");
  const [tuningKey, setTuningKey] = useState<string>("guitar-standard");

  // Chord selection
  const [root, setRoot] = useState<number>(0); // 0 = C
  const [suffix, setSuffix] = useState<string>(""); // "" = major
  const [voicingIndex, setVoicingIndex] = useState<number>(0);
  const [useFlats, setUseFlats] = useState<boolean>(false);
  const [activeCategory, setActiveCategory] = useState<ChordCategory>("Triads");
  const [dotMode, setDotMode] = useState<"fingers" | "notes" | "intervals">("fingers");

  // Selected note inspector state
  const [selectedStringIndex, setSelectedStringIndex] = useState<number | null>(null);

  // Initialize from initialChordSymbol if provided
  useEffect(() => {
    if (initialChordSymbol) {
      const parsed = parseChordSymbol(initialChordSymbol);
      setRoot(parsed.root);
      setSuffix(parsed.quality.suffix);
      setActiveCategory(parsed.quality.category);
    }
  }, [initialChordSymbol]);

  // Current parsed chord
  const currentQuality = useMemo(
    () => CHORD_QUALITIES.find((q) => q.suffix === suffix) || CHORD_QUALITIES[0],
    [suffix]
  );

  const parsedChord = useMemo<ParsedChord>(
    () => ({
      root,
      quality: currentQuality,
      label: `${NOTE_NAMES[root]}${currentQuality.suffix}`,
    }),
    [root, currentQuality]
  );

  // Deep musical analysis
  const chordAnalysis = useMemo<ChordAnalysis>(() => analyzeChord(parsedChord), [parsedChord]);

  // Current tuning
  const currentTuning = useMemo(() => {
    if (instrumentId === "bass") {
      return PRESET_TUNINGS["bass-4"];
    }
    if (instrumentId === "ukulele") {
      return PRESET_TUNINGS["ukulele-standard"];
    }
    return PRESET_TUNINGS[tuningKey] || PRESET_TUNINGS["guitar-standard"];
  }, [instrumentId, tuningKey]);

  // Available voicings for current chord
  const voicings = useMemo(() => {
    return getGuitarVoicings(parsedChord);
  }, [parsedChord]);

  const activeVoicing = useMemo(() => {
    const idx = voicingIndex % Math.max(voicings.length, 1);
    return voicings[idx] || voicings[0] || { name: "Open Position", frets: [null, 3, 2, 0, 1, 0] };
  }, [voicings, voicingIndex]);

  // Fingering result for active voicing
  const fingeringResult = useMemo<FingeringResult>(
    () => assignFingers(activeVoicing.frets),
    [activeVoicing.frets]
  );

  // Played string analysis
  const playedStrings = useMemo<PlayedStringAnalysis[]>(
    () =>
      analyzePlayedStrings(
        activeVoicing.frets,
        currentTuning.midi,
        parsedChord.root,
        fingeringResult
      ),
    [activeVoicing.frets, currentTuning.midi, parsedChord.root, fingeringResult]
  );

  // Step-by-step guidance
  const practiceGuidance = useMemo(
    () =>
      getPracticeGuidance(
        activeVoicing.frets,
        fingeringResult,
        instrumentId as "guitar" | "bass" | "ukulele",
        currentTuning.stringNames
      ),
    [activeVoicing.frets, fingeringResult, instrumentId, currentTuning.stringNames]
  );

  // Currently inspected note
  const selectedNoteInfo = useMemo(() => {
    if (selectedStringIndex === null) return null;
    return playedStrings[selectedStringIndex] || null;
  }, [selectedStringIndex, playedStrings]);

  const handleSelectString = (index: number) => {
    setSelectedStringIndex(index);
    const str = playedStrings[index];
    if (str && str.midi !== null) {
      playSingleNote(str.midi, "guitar");
    }
  };

  const handleFretboardNoteClick = (info: {
    stringIndex: number;
    fret: number;
    note: string;
    midi: number;
    frequencyHz: number;
    isRoot: boolean;
  }) => {
    // If it corresponds to a string in the current voicing, select that string
    if (info.stringIndex < playedStrings.length) {
      setSelectedStringIndex(info.stringIndex);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── CONTROLS HEADER BAR ─── */}
      <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-ns-border)] pb-4">
          <div>
            <h2 className="font-heading text-xl font-bold text-[var(--color-ns-text)] sm:text-2xl">
              Chord Explorer
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
              Explore chords, understand their notes, and learn exactly how to play them.
            </p>
          </div>

          {/* Instrument Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
              Instrument:
            </span>
            <div className="flex items-center gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1">
              {[
                { id: "guitar", label: "🎸 Guitar" },
                { id: "bass", label: "🎸 Bass" },
                { id: "ukulele", label: "🪕 Ukulele" },
              ].map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => {
                    setInstrumentId(inst.id);
                    if (inst.id === "bass") setTuningKey("bass-4");
                    else if (inst.id === "ukulele") setTuningKey("ukulele-standard");
                    else setTuningKey("guitar-standard");
                    setSelectedStringIndex(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    instrumentId === inst.id
                      ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                      : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                  }`}
                >
                  {inst.label}
                </button>
              ))}
            </div>

            {/* Tuning Selector (for guitar) */}
            {instrumentId === "guitar" && (
              <select
                value={tuningKey}
                onChange={(e) => setTuningKey(e.target.value)}
                className="input-base rounded-xl py-1.5 text-xs text-[var(--color-ns-text)]"
              >
                {Object.entries(PRESET_TUNINGS)
                  .filter(([k]) => k.startsWith("guitar-"))
                  .map(([k, t]) => (
                    <option key={k} value={k}>
                      {t.name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        </div>

        {/* ─── ROOT NOTE SELECTOR ─── */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="w-14 text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
            Root:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {NOTE_NAMES.map((name, pc) => {
              const isSelected = root === pc;
              const displayNote = useFlats ? name.replace("#", "b") : name.replace("#", "♯");
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setRoot(pc);
                    setVoicingIndex(0);
                    setSelectedStringIndex(null);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    isSelected
                      ? "border border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                      : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-amber)]/50 hover:text-[var(--color-ns-text)]"
                  }`}
                >
                  {displayNote}
                </button>
              );
            })}

            {/* Sharps / Flats Toggle */}
            <button
              type="button"
              onClick={() => setUseFlats((f) => !f)}
              className="ml-2 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            >
              {useFlats ? "♭ Flats" : "♯ Sharps"}
            </button>
          </div>
        </div>

        {/* ─── CHORD CATEGORY TABS ─── */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-ns-border)]/60 pt-3">
          <span className="w-14 text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
            Type:
          </span>
          <div className="flex flex-wrap gap-1">
            {CHORD_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setActiveCategory(cat);
                  const firstOfCat = CHORD_QUALITIES.find((q) => q.category === cat);
                  if (firstOfCat) setSuffix(firstOfCat.suffix);
                  setVoicingIndex(0);
                }}
                className={`rounded-lg px-2.5 py-1 text-[0.6875rem] font-semibold transition-all ${
                  activeCategory === cat
                    ? "bg-[var(--color-ns-border-strong)] text-[var(--color-ns-text)] font-bold shadow-sm"
                    : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ─── QUALITIES IN SELECTED CATEGORY ─── */}
        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-16">
          {CHORD_QUALITIES.filter((q) => q.category === activeCategory).map((q) => {
            const isSelected = suffix === q.suffix;
            return (
              <button
                key={q.suffix}
                type="button"
                onClick={() => {
                  setSuffix(q.suffix);
                  setVoicingIndex(0);
                  setSelectedStringIndex(null);
                }}
                className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition-all ${
                  isSelected
                    ? "border border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)] font-bold shadow-sm"
                    : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
                }`}
              >
                <span className="font-heading font-bold">{q.suffix || "maj"}</span>
                <span className="ml-1 text-[0.625rem] opacity-70">({q.name})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── CURRENT CHORD HERO TITLE ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="font-heading text-3xl font-extrabold text-[var(--color-ns-amber)] sm:text-4xl">
            {chordAnalysis.symbol.replace("#", "♯")}
          </span>
          <div>
            <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
              {chordAnalysis.chordName}
            </h3>
            <p className="text-xs text-[var(--color-ns-muted)]">
              Formula:{" "}
              <span className="font-mono font-semibold text-[var(--color-ns-text)]">
                {chordAnalysis.formula}
              </span>{" "}
              · Notes:{" "}
              <span className="font-mono font-semibold text-[var(--color-ns-text)]">
                {chordAnalysis.notes.join(" · ")}
              </span>
            </p>
          </div>
        </div>

        {/* Voicing Navigator */}
        {voicings.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-ns-muted)]">
              Voicing {voicingIndex + 1} of {voicings.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setVoicingIndex((i) => (i - 1 + voicings.length) % voicings.length)
                }
                title="Previous voicing"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-xs text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)]"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => setVoicingIndex((i) => (i + 1) % voicings.length)}
                title="Next voicing"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-xs text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)]"
              >
                ▶
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── TWO-COLUMN WORKBENCH ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (Diagram + Inspector) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Interactive Chord Diagram Card */}
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--color-ns-border)] pb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
                  Fretboard Voicing
                </h4>
                <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
                  {activeVoicing.name}
                </p>
              </div>

              {/* Dot Label Mode Selector (Fingers / Notes / Intervals) */}
              <div className="flex items-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-[0.625rem]">
                {(
                  [
                    ["fingers", "Fingers"],
                    ["notes", "Notes"],
                    ["intervals", "Intervals"],
                  ] as const
                ).map(([m, l]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDotMode(m)}
                    className={`rounded-lg px-2 py-0.5 font-semibold transition-all ${
                      dotMode === m
                        ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                        : "text-[var(--color-ns-muted)]"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG Chord Diagram */}
            <div className="my-4 flex items-center justify-center">
              <InteractiveChordDiagram
                stringNames={currentTuning.stringNames}
                frets={activeVoicing.frets}
                playedStrings={playedStrings}
                selectedStringIndex={selectedStringIndex}
                onSelectString={handleSelectString}
                fingering={fingeringResult}
                caption={activeVoicing.name}
                dotDisplayMode={dotMode}
              />
            </div>

            {/* Fingering legend */}
            <div className="border-t border-[var(--color-ns-border)]/60 pt-3 text-center text-[0.6875rem] text-[var(--color-ns-muted)]">
              <span className="font-semibold text-[var(--color-ns-text)]">Fingering: </span>
              1 = Index · 2 = Middle · 3 = Ring · 4 = Pinky
            </div>
          </div>

          {/* Note Inspector Card */}
          <NoteInspectorCard
            selectedNote={selectedNoteInfo}
            onClearSelection={() => setSelectedStringIndex(null)}
          />
        </div>

        {/* Right Column (String Table + Music Theory) */}
        <div className="space-y-6 lg:col-span-7">
          {/* String Information Table */}
          <StringInfoTable
            playedStrings={playedStrings}
            selectedStringIndex={selectedStringIndex}
            onSelectString={handleSelectString}
            fingering={fingeringResult}
          />

          {/* Music Theory & Construction */}
          <ChordTheoryCard analysis={chordAnalysis} />
        </div>
      </div>

      {/* ─── FULL 24-FRET EXPLORER ─── */}
      <FretboardExplorer
        chord={parsedChord}
        tuningMidi={currentTuning.midi}
        stringNames={currentTuning.stringNames}
        activeShapeFrets={activeVoicing.frets}
        onNoteClick={handleFretboardNoteClick}
      />

      {/* ─── PRACTICE & AUDIO PLAYBACK PANEL ─── */}
      <ChordPracticePanel
        chord={parsedChord}
        frets={activeVoicing.frets}
        tuningMidi={currentTuning.midi}
        fingering={fingeringResult}
        guidance={practiceGuidance}
      />
    </div>
  );
}
