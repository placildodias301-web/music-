import { useState, useMemo, useEffect } from "react";
import { InstrumentPicker } from "../instruments/InstrumentPicker";
import { SettingsSelect } from "../settings/SettingsSelect";
import { chordInstruments, findDefinition } from "../../lib/instruments/definitions";
import { bassOptions, buildChordModel, chordTunings, tuningChoices, type ChordModel, type ChordSettings } from "../../lib/chords/model";
import { playModel, playModelArpeggio, playPlayedString, stringVoiceFor } from "../../lib/chords/play";
import { inversionName } from "../../lib/chords/theory";
import { ChordDiagram } from "./ChordDiagram";
import {
  NOTE_NAMES,
  CHORD_QUALITIES,
  CHORD_CATEGORIES,
  parseChordSymbol,
  slashChord,
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
import { usePlayback } from "./usePlayback";
import { describeVoicing } from "../../lib/chords/describe";

export interface ChordExplorerViewProps {
  initialChordSymbol?: string;
  onChordSelect?: (chord: ParsedChord) => void;
  /** Instrument, tuning and inversion — shared with the All chords tab. */
  settings: ChordSettings;
  onSettingsChange: (next: ChordSettings) => void;
}

/** Frets drawn per instrument (real instruments have different neck lengths); violin-family positions are semitones from the nut. */
const FRETS_FOR: Record<string, number> = { ukulele: 15, cavaquinho: 17, mandolin: 20, banjo: 22, balalaika: 15, violin: 14, viola: 14, cello: 14 };

/** Shapes a fretted or bass model offers, as plain name + frets pairs. */
function shapesOf(model: ChordModel | null): { name: string; frets: (number | null)[] }[] {
  if (!model) return [];
  if (model.kind === "fretted") return model.shapes.map((sh) => ({ name: sh.name, frets: sh.frets }));
  if (model.kind === "bass") return bassOptions(model);
  return [];
}

const noteWithOctave = (midi: number) => `${NOTE_NAMES[((midi % 12) + 12) % 12].replace("#", "♯")}${Math.floor(midi / 12) - 1}`;

export function ChordExplorerView({ initialChordSymbol = "C", settings, onSettingsChange }: ChordExplorerViewProps) {
  // Instrument selection (shared with the All chords tab)
  const definition = findDefinition(settings.definitionId) ?? findDefinition("guitar")!;
  const instrumentId = definition.id;
  const tuningOptions = useMemo(() => tuningChoices(definition), [definition]);
  const tuningValue = tuningOptions.find((t) => t.id === settings.tuningId)?.id ?? tuningOptions[0]?.id ?? "";
  const tuningNote = useMemo(() => chordTunings(definition).find((t) => t.id === tuningValue)?.note, [definition, tuningValue]);
  const resolved = useMemo<ChordSettings>(() => ({ ...settings, definitionId: definition.id, tuningId: tuningValue || undefined }), [settings, definition.id, tuningValue]);

  // Chord selection
  const [root, setRoot] = useState<number>(0); // 0 = C
  const [suffix, setSuffix] = useState<string>(""); // "" = major
  const [voicingIndex, setVoicingIndex] = useState<number>(0);
  const [useFlats, setUseFlats] = useState<boolean>(false);
  const [activeCategory, setActiveCategory] = useState<ChordCategory>("Triads");
  // Slash chord: pitch class of a bass note other than the root (null = root position).
  const [bassPc, setBassPc] = useState<number | null>(null);
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
      setBassPc(parsed.slashBass !== undefined && parsed.slashBass !== parsed.root ? parsed.slashBass : null);
    }
  }, [initialChordSymbol]);

  // Current parsed chord
  const currentQuality = useMemo(
    () => CHORD_QUALITIES.find((q) => q.suffix === suffix) || CHORD_QUALITIES[0],
    [suffix]
  );

  const parsedChord = useMemo<ParsedChord>(
    () =>
      bassPc !== null && bassPc !== root
        ? slashChord(root, currentQuality, bassPc)
        : { root, quality: currentQuality, label: `${NOTE_NAMES[root]}${currentQuality.suffix}` },
    [root, currentQuality, bassPc]
  );

  // Deep musical analysis
  const chordAnalysis = useMemo<ChordAnalysis>(() => analyzeChord(parsedChord), [parsedChord]);

  const hasInversions = definition.chordRenderer === "keyboard" || definition.chordRenderer === "mallet" || definition.chordRenderer === "accordion";

  // One model per (chord, instrument, tuning, inversion): fretted/bass get the full workbench, everything else its own view.
  const model = useMemo(() => buildChordModel(parsedChord, definition, resolved), [parsedChord, definition, resolved]);
  const fretted = model && (model.kind === "fretted" || model.kind === "bass") ? model : null;
  const voiceName = stringVoiceFor(instrumentId);
  // Strands per string/course (mandolin pairs, 12-string octaves): every strand sounds, and every strand is drawn.
  const courseOffsets = fretted?.tuning.offsets;
  const currentTuning = useMemo(
    () => ({ midi: fretted?.tuning.midi ?? [40, 45, 50, 55, 59, 64], stringNames: fretted?.stringNames ?? ["E", "A", "D", "G", "B", "E"] }),
    [fretted],
  );

  // Every physical string for the full board: a 12-string guitar has 12 (octave and unison pairs), a mandolin 8.
  const board = useMemo(() => {
    const offsets = fretted?.tuning.offsets ?? currentTuning.midi.map(() => [0]);
    return {
      midi: currentTuning.midi.flatMap((m, i) => (offsets[i] ?? [0]).map((o) => m + o)),
      names: currentTuning.stringNames.flatMap((n, i) => (offsets[i] ?? [0]).map(() => n)),
      expand: (frets: (number | null)[]) => frets.flatMap((f, i) => (offsets[i] ?? [0]).map(() => f)),
    };
  }, [fretted, currentTuning]);

  // Available voicings for current chord
  const voicings = useMemo(() => shapesOf(model), [model]);

  const activeVoicing = useMemo(() => {
    const idx = voicingIndex % Math.max(voicings.length, 1);
    return voicings[idx] || voicings[0] || { name: "No playable shape", frets: currentTuning.midi.map(() => null as number | null) };
  }, [voicings, voicingIndex, currentTuning.midi]);

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
        fingeringResult,
        parsedChord
      ),
    [activeVoicing.frets, currentTuning.midi, parsedChord, fingeringResult]
  );

  // How this shape makes the chord (read from the same per-string analysis the table shows)
  const voicingExplanation = useMemo(() => describeVoicing(playedStrings, parsedChord, currentTuning.stringNames), [playedStrings, parsedChord, currentTuning.stringNames]);

  // Step-by-step guidance
  const practiceGuidance = useMemo(
    () =>
      getPracticeGuidance(
        activeVoicing.frets,
        fingeringResult,
        (voiceName === "bass" || voiceName === "ukulele" ? voiceName : "guitar"),
        currentTuning.stringNames
      ),
    [activeVoicing.frets, fingeringResult, voiceName, currentTuning.stringNames]
  );

  // Currently inspected note
  const selectedNoteInfo = useMemo(() => {
    if (selectedStringIndex === null) return null;
    return playedStrings[selectedStringIndex] || null;
  }, [selectedStringIndex, playedStrings]);

  const handleSelectString = (index: number) => {
    setSelectedStringIndex(index);
    const str = playedStrings[index];
    if (str) void playPlayedString(str, { instrumentId, totalStrings: playedStrings.length, courses: courseOffsets }).catch(() => {});
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
              Explore chords, understand their notes, and learn exactly how to play them on {definition.name}.
            </p>
          </div>

          {/* Instrument selector: every instrument the Chords page knows */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full min-w-[11rem] sm:w-56">
              <InstrumentPicker
                label="Instrument"
                variant="field"
                value={definition.id}
                definitions={chordInstruments()}
                onChange={(id) => {
                  onSettingsChange({ definitionId: id, tuningId: undefined, inversion: 0 });
                  setSelectedStringIndex(null);
                  setVoicingIndex(0);
                }}
              />
            </div>
            {tuningOptions.length > 1 && (
              <div className="w-full sm:w-56">
                <SettingsSelect
                  variant="field"
                  label={definition.id === "harp" ? "Harp type" : definition.id === "harmonica" ? "Harmonica key" : "Tuning"}
                  value={tuningValue}
                  options={tuningOptions.map((t) => ({ value: t.id, label: t.name }))}
                  onChange={(v) => {
                    onSettingsChange({ ...settings, tuningId: v });
                    setSelectedStringIndex(null);
                    setVoicingIndex(0);
                  }}
                />
              </div>
            )}
            {hasInversions && (
              <div role="group" aria-label="Inversion" className="flex gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1">
                {Array.from({ length: 4 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    title={inversionName(i)}
                    aria-pressed={settings.inversion === i}
                    onClick={() => onSettingsChange({ ...settings, inversion: i })}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${settings.inversion === i ? "bg-[var(--color-ns-amber)] font-bold text-[var(--color-ns-ink)]" : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"}`}
                  >
                    {i === 0 ? "Root" : `${i}${i === 1 ? "st" : i === 2 ? "nd" : "rd"}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {(tuningNote || definition.caveat || definition.chordCaveat) && (
          <p className="mt-3 text-[0.6875rem] leading-relaxed text-[var(--color-ns-muted)]">
            {[tuningNote, definition.caveat, definition.chordCaveat].filter(Boolean).join(" ")}
          </p>
        )}

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
                    setBassPc(null);
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
                  setBassPc(null);
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
                  setBassPc(null);
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

      {/* ─── BASS NOTE (slash chords / inversions) ─── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-5 py-3 shadow-sm">
        <span className="w-14 text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">Bass:</span>
        {[{ pc: null as number | null, label: "Root" }, ...currentQuality.tones.filter(([semi]) => semi > 0 && semi < 12).map(([semi]) => ({ pc: (root + semi) % 12, label: "" }))].map((opt) => {
          const names = chordAnalysis.notes;
          const idx = opt.pc === null ? 0 : currentQuality.tones.findIndex(([semi]) => (root + semi) % 12 === opt.pc);
          const text = opt.pc === null ? "Root" : `/${names[idx] ?? NOTE_NAMES[opt.pc]}`;
          const selected = opt.pc === null ? bassPc === null : bassPc === opt.pc;
          return (
            <button
              key={opt.pc ?? "root"}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setBassPc(opt.pc);
                setVoicingIndex(0);
                setSelectedStringIndex(null);
              }}
              className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition-colors ${
                selected
                  ? "border border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/20 font-bold text-[var(--color-ns-amber)]"
                  : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
              }`}
            >
              {text}
            </button>
          );
        })}
        <span className="text-[0.6875rem] text-[var(--color-ns-dim)]">Put another chord tone in the bass for a slash chord / inversion.</span>
      </div>

      {/* ─── CURRENT CHORD HERO TITLE ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="font-heading text-3xl font-extrabold text-[var(--color-ns-amber)] sm:text-4xl">
            {chordAnalysis.symbol.replace(/#/g, "♯")}
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

      {fretted && voicings.length === 0 && (
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-8 text-center text-sm text-[var(--color-ns-muted)]">
          No playable {parsedChord.label} shape was found on {definition.name} in {fretted.tuning.name}. Try another tuning or instrument — the chord theory below still applies.
        </div>
      )}
      {fretted && voicings.length === 0 && (
        <FretboardExplorer
          chord={parsedChord}
          tuningMidi={board.midi}
          stringNames={board.names}
          activeShapeFrets={board.midi.map(() => null)}
          instrument={instrumentId}
          numFrets={FRETS_FOR[instrumentId] ?? 24}
          fretless={definition.fretless}
        />
      )}

      {fretted && voicings.length > 0 ? (
        <>
      {/* ─── TWO-COLUMN WORKBENCH ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (Diagram + Inspector) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Interactive Chord Diagram Card */}
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--color-ns-border)] pb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
                  {definition.fretless ? "Fingerboard Voicing" : "Fretboard Voicing"}
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
                courses={fretted?.kind === "fretted" && fretted.courses ? fretted.tuning.offsets : undefined}
                fretless={definition.fretless}
                caption={definition.fretless ? "Finger placement (no frets)" : activeVoicing.name}
                dotDisplayMode={dotMode}
              />
            </div>

            {/* Fingering legend */}
            <div className="border-t border-[var(--color-ns-border)]/60 pt-3 text-center text-[0.6875rem] text-[var(--color-ns-muted)]">
              <span className="font-semibold text-[var(--color-ns-text)]">Fingering: </span>
              1 = Index · 2 = Middle · 3 = Ring · 4 = Pinky
              {definition.fretless && <span className="mt-1 block text-[var(--color-ns-dim)]">No frets: dots show roughly where each finger lands; the exact spot is found by ear.</span>}
            </div>
          </div>

          {/* Note Inspector Card */}
          <NoteInspectorCard
            selectedNote={selectedNoteInfo}
            onClearSelection={() => setSelectedStringIndex(null)}
            instrument={instrumentId}
            courses={courseOffsets}
            fretless={definition.fretless}
            totalStrings={playedStrings.length}
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
            instrumentName={instrumentId}
            courses={courseOffsets}
            fretless={definition.fretless}
          />

          {/* Music Theory & Construction */}
          <ChordTheoryCard analysis={chordAnalysis} voicing={fretted && voicings.length > 0 ? voicingExplanation : undefined} />
        </div>
      </div>

      {/* ─── FULL 24-FRET EXPLORER ─── */}
      <FretboardExplorer
        chord={parsedChord}
        tuningMidi={board.midi}
        stringNames={board.names}
        activeShapeFrets={board.expand(activeVoicing.frets)}
        onNoteClick={handleFretboardNoteClick}
        instrument={instrumentId}
        numFrets={FRETS_FOR[instrumentId] ?? 24}
        fretless={definition.fretless}
      />

      {/* ─── PRACTICE & AUDIO PLAYBACK PANEL ─── */}
      <ChordPracticePanel
        chord={parsedChord}
        frets={activeVoicing.frets}
        tuningMidi={currentTuning.midi}
        courses={courseOffsets}
        fingering={fingeringResult}
        guidance={practiceGuidance}
        instrument={instrumentId}
      />
        </>
      ) : model && model.kind !== "fretted" && model.kind !== "bass" ? (
        <OtherInstrumentWorkbench model={model} analysis={chordAnalysis} />
      ) : null}
      {fretted && voicings.length === 0 && <ChordTheoryCard analysis={chordAnalysis} />}
    </div>
  );
}

/* ─── Instruments without a fretboard: keys, mallets, accordion, harp, wind, harmonica ─── */

type OtherModel = Exclude<ChordModel, { kind: "fretted" } | { kind: "bass" }>;

function HowToPlay({ model }: { model: OtherModel }) {
  const rows: { label: string; value: string }[] = [];
  switch (model.kind) {
    case "keyboard":
    case "mallet": {
      const label = model.kind === "keyboard" ? "Keys to press" : "Bars to strike";
      rows.push({ label, value: model.keys.map((k) => noteWithOctave(k.midi)).join(" · ") });
      rows.push({ label: "Position", value: model.inversionLabel });
      if (model.kind === "keyboard") {
        const n = model.keys.length;
        const fingers = n === 2 ? "1 · 5" : n === 3 ? "1 · 3 · 5" : n === 4 ? "1 · 2 · 3 · 5" : "Spread across both hands";
        rows.push({ label: "Right-hand fingering", value: fingers + (n <= 4 ? " (thumb = 1, pinky = 5; low note to high)" : "") });
      } else {
        rows.push({ label: "Mallets", value: "Strike the lit bars together, or one after another for an arpeggio." });
      }
      break;
    }
    case "accordion": {
      rows.push({ label: "Right hand (keys)", value: model.keys.map((k) => noteWithOctave(k.midi)).join(" · ") });
      rows.push({ label: "Position", value: model.inversionLabel });
      rows.push({
        label: "Left hand (Stradella)",
        value: model.stradella
          ? `${model.stradella.row} button in the ${model.stradella.column} column`
          : "No single chord button — build it from bass and counter-bass buttons.",
      });
      break;
    }
    case "wind": {
      rows.push({
        label: "Notes to play (one at a time)",
        value: model.sounding.map((k) => noteWithOctave(k.midi)).join(" → ") || "None of the chord tones fall in this instrument's range.",
      });
      rows.push({ label: "Range", value: `${model.rangeLow} – ${model.rangeHigh}` });
      if (model.written) {
        rows.push({ label: `Written for ${model.written.instrumentPitch} instrument`, value: `${model.written.label} — ${model.written.notes.join(" · ")}` });
      }
      break;
    }
    case "harmonica": {
      rows.push({ label: "Harmonica", value: `${model.harpKey} diatonic, 10 holes` });
      if (model.groups.length === 0) rows.push({ label: "Hole groups", value: "No clean blow or draw hole group for this chord." });
      model.groups.slice(0, 4).forEach((g, i) =>
        rows.push({
          label: i === 0 ? "Best match" : "Alternative",
          value: `${g.direction === "blow" ? "Blow" : "Draw"} holes ${g.from}–${g.to} (${[...new Set(g.notes.map((n) => n.name))].join(" · ")})`,
        }),
      );
      break;
    }
    case "harp": {
      rows.push({ label: "Harp", value: model.rangeName });
      rows.push({
        label: "Lever / pedal settings",
        value: model.needs.length ? model.needs.map((n) => `${n.letter}${n.accidental === 1 ? "♯" : n.accidental === -1 ? "♭" : "♮"}`).join(" · ") : "All natural",
      });
      if (model.conflict) rows.push({ label: "Conflict", value: `${model.conflict} is needed with two different accidentals, so one harp setting cannot sound the whole chord.` });
      if (model.blocked.length) rows.push({ label: "Fixed strings", value: `${model.blocked.join(", ")} cannot be altered on this harp.` });
      rows.push({ label: "Strings to pluck", value: `${model.strings.filter((st) => st.inChord).length} chord strings across the range — the lit ones.` });
      break;
    }
  }
  return (
    <dl className="mt-3 space-y-2.5 text-xs">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <dt className="w-44 shrink-0 text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">{r.label}</dt>
          <dd className="font-mono font-semibold text-[var(--color-ns-text)]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function OtherInstrumentWorkbench({ model, analysis }: { model: OtherModel; analysis: ChordAnalysis }) {
  const playback = usePlayback();
  const playing = playback.playing;
  const play = () => playback.run(() => playModel(model, 0));
  const playOneByOne = () => playback.run(() => playModelArpeggio(model, 0));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-5">
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <h4 className="border-b border-[var(--color-ns-border)] pb-3 text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
            {model.definition.name} · {model.chord.label.replace("#", "♯")}
          </h4>
          <div className="my-4 flex items-center justify-center">
            <ChordDiagram model={model} shapeIndex={0} onShape={() => {}} />
          </div>
          <div className="flex justify-center border-t border-[var(--color-ns-border)]/60 pt-4">
            <button
              type="button"
              onClick={play}
              aria-label={`Play ${model.chord.label} on ${model.definition.name}`}
              className={`flex h-10 w-44 items-center justify-center gap-2 rounded-xl border border-[var(--color-ns-amber)] text-xs font-bold transition-colors ${
                playing ? "bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)]" : "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] hover:brightness-110"
              }`}
            >
              <span className="flex h-[14px] w-[14px] items-center justify-center">
                {playing ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-current" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </span>
              Play Chord
            </button>
            <button
              type="button"
              onClick={playOneByOne}
              aria-label={`Play the notes of ${model.chord.label} one by one on ${model.definition.name}`}
              className="ml-2 flex h-10 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-4 text-xs font-bold text-[var(--color-ns-text)] transition-shadow hover:shadow-[0_0_14px_rgba(255,176,32,0.45)]"
            >
              One by one
            </button>
            <button
              type="button"
              onClick={playback.stop}
              disabled={!playing}
              aria-label="Stop audio"
              className="ml-2 flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-4 text-xs font-bold text-[var(--color-ns-text)] transition-shadow hover:shadow-[0_0_14px_rgba(255,176,32,0.45)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
              Stop
            </button>
          </div>
          <p role="status" aria-live="polite" className={`mt-2 min-h-[1rem] text-center text-[0.6875rem] ${playback.status === "error" ? "text-[var(--color-ns-error,#f43f5e)]" : "text-[var(--color-ns-dim)]"}`}>
            {playback.status === "error" ? playback.error : ""}
          </p>
          <p className="mt-3 text-center text-[0.6875rem] text-[var(--color-ns-muted)]">
            A sound model of the {model.definition.name.toLowerCase()} playing these notes — not a recording.
          </p>
        </div>
      </div>
      <div className="space-y-6 lg:col-span-7">
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">How to play it on {model.definition.name}</h4>
          <HowToPlay model={model} />
        </div>
        <ChordTheoryCard analysis={analysis} />
      </div>
    </div>
  );
}
