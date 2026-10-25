import { useState, useMemo, useEffect } from "react";
import { InstrumentPicker } from "../instruments/InstrumentPicker";
import { SettingsSelect } from "../settings/SettingsSelect";
import { chordInstruments, findDefinition } from "../../lib/instruments/definitions";
import { bassOptions, buildChordModel, chordTunings, tuningChoices, type ChordModel, type ChordSettings } from "../../lib/chords/model";
import { playPlayedString, stringVoiceFor } from "../../lib/chords/play";
import { inversionName } from "../../lib/chords/theory";
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
import { describeVoicing } from "../../lib/chords/describe";
import { ChordSheetNotation, type SheetNote } from "./ChordSheetNotation";
import { NonFrettedWorkbench, type OtherModel } from "./NonFrettedWorkbench";
import { VoiceLeadingCard } from "./VoiceLeadingCard";

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

/** Classifies a voicing to determine its badge label, span, and category */
function classifyVoicing(name: string, frets: (number | null)[]): { badge: string; minFret: number; maxFret: number } {
  const played = frets.filter((f): f is number => typeof f === "number" && f >= 0);
  if (played.length === 0) return { badge: "Muted", minFret: 0, maxFret: 0 };
  const minFret = Math.min(...played);
  const maxFret = Math.max(...played);
  const hasOpen = played.includes(0);

  let badge = `Pos ${minFret}`;
  const lower = name.toLowerCase();
  if (lower.includes("open") || (hasOpen && minFret === 0 && maxFret <= 4)) {
    badge = "Open Position";
  } else if (lower.includes("barre")) {
    badge = `Barre Pos ${minFret}`;
  } else if (lower.includes("drop-2") || lower.includes("drop 2")) {
    badge = "Drop-2";
  } else if (lower.includes("shell")) {
    badge = "Shell";
  } else if (minFret >= 7) {
    badge = `Upper Neck (${minFret}fr)`;
  } else if (minFret >= 3) {
    badge = `Mid Neck (${minFret}fr)`;
  }
  return { badge, minFret, maxFret };
}

export function ChordExplorerView({ initialChordSymbol = "C", settings, onSettingsChange, onChordSelect }: ChordExplorerViewProps) {
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

  const capoOffset = resolved.capo ?? 0;
  const effectiveTuningMidi = useMemo(
    () => (capoOffset > 0 ? currentTuning.midi.map((m) => m + capoOffset) : currentTuning.midi),
    [currentTuning.midi, capoOffset]
  );

  // Played string analysis
  const playedStrings = useMemo<PlayedStringAnalysis[]>(
    () =>
      analyzePlayedStrings(
        activeVoicing.frets,
        effectiveTuningMidi,
        parsedChord.root,
        fingeringResult,
        parsedChord
      ),
    [activeVoicing.frets, effectiveTuningMidi, parsedChord, fingeringResult]
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

  // Sheet Notes calculation for Live Staff & TAB notation
  const sheetNotes = useMemo<SheetNote[]>(() => {
    if (fretted && playedStrings.length > 0) {
      return playedStrings
        .filter((ps) => ps.action !== "muted" && ps.midi !== null)
        .map((ps) => {
          const midi = ps.midi!;
          const pc = ((midi % 12) + 12) % 12;
          const octave = Math.floor(midi / 12) - 1;
          const name = NOTE_NAMES[pc];
          const intervalLabel = ps.interval ? ps.interval.shortName : "R";
          const semitones = ps.interval ? ps.interval.semitones : 0;
          const role: SheetNote["role"] =
            semitones === 0
              ? "root"
              : semitones === 3 || semitones === 4
              ? "third"
              : semitones === 6 || semitones === 7 || semitones === 8
              ? "fifth"
              : semitones === 10 || semitones === 11
              ? "seventh"
              : "extension";

          return {
            midi,
            pitchName: name,
            octave,
            intervalLabel,
            stringIndex: ps.stringIndex,
            fret: ps.fret ?? undefined,
            finger: ps.finger ?? undefined,
            role,
          };
        });
    }

    if (model) {
      if (model.kind === "keyboard" || model.kind === "mallet" || model.kind === "accordion") {
        return model.keys.map((k) => {
          const pc = ((k.midi % 12) + 12) % 12;
          const octave = Math.floor(k.midi / 12) - 1;
          const rootPc = parsedChord.root;
          const match = chordAnalysis.intervals.find((int) => (rootPc + int.semitones) % 12 === pc);
          const semitones = match ? match.semitones : 0;
          const role: SheetNote["role"] =
            semitones === 0
              ? "root"
              : semitones === 3 || semitones === 4
              ? "third"
              : semitones === 7
              ? "fifth"
              : "seventh";
          return {
            midi: k.midi,
            pitchName: k.name,
            octave,
            intervalLabel: match ? match.shortName : "R",
            role,
          };
        });
      }
      if (model.kind === "wind") {
        return model.sounding.map((s) => {
          const pc = ((s.midi % 12) + 12) % 12;
          const octave = Math.floor(s.midi / 12) - 1;
          return {
            midi: s.midi,
            pitchName: NOTE_NAMES[pc],
            octave,
            intervalLabel: "Tone",
            role: "root" as const,
          };
        });
      }
    }
    return [];
  }, [fretted, playedStrings, model, parsedChord.root, chordAnalysis.intervals]);

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
    if (info.stringIndex < playedStrings.length) {
      setSelectedStringIndex(info.stringIndex);
    }
  };

  // Inspect chord from voice leading cards
  const handleInspectChord = (symbol: string) => {
    const parsed = parseChordSymbol(symbol);
    setRoot(parsed.root);
    setSuffix(parsed.quality.suffix);
    setActiveCategory(parsed.quality.category);
    setBassPc(parsed.slashBass !== undefined && parsed.slashBass !== parsed.root ? parsed.slashBass : null);
    setVoicingIndex(0);
    setSelectedStringIndex(null);
    onChordSelect?.(parsed);
  };

  return (
    <div className="space-y-6">
      {/* ─── CONTROLS HEADER BAR ─── */}
      <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-ns-border)] pb-4">
          <div>
            <h2 className="font-heading text-xl font-bold text-[var(--color-ns-text)] sm:text-2xl">
              Chord Workbench
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
              Explore chords, understand their notes, and learn exactly how to play them on {definition.name}.
            </p>
          </div>

          {/* Instrument selector */}
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
        {(tuningNote || definition.caveat || definition.chordCaveat || definition.id === "harmonica") && (
          <p className="mt-3 text-[0.6875rem] leading-relaxed text-[var(--color-ns-muted)]">
            {[tuningNote, definition.caveat, definition.chordCaveat, definition.id === "harmonica" ? "Configuration: diatonic, 10 holes (Richter)." : ""].filter(Boolean).join(" ")}
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

      {/* ─── ALL VOICINGS STRIP (Thumbnails & 1-Click Inspection) ─── */}
      {fretted && voicings.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
                All Available Voicings
              </span>
              <span className="rounded-full bg-[var(--color-ns-amber)]/20 px-2 py-0.5 text-[0.625rem] font-bold text-[var(--color-ns-amber)]">
                {voicings.length} shapes
              </span>
            </div>
            <span className="text-[0.6875rem] text-[var(--color-ns-muted)]">
              Click any voicing to inspect its fingering, sheet music & fretboard
            </span>
          </div>

          <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1 pt-0.5">
            {voicings.map((v, idx) => {
              const isSelected = (voicingIndex % voicings.length) === idx;
              const classification = classifyVoicing(v.name, v.frets);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setVoicingIndex(idx);
                    setSelectedStringIndex(null);
                  }}
                  className={`group relative flex shrink-0 flex-col items-start rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/10 ring-2 ring-[var(--color-ns-amber)]/40 shadow-sm"
                      : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] hover:border-[var(--color-ns-amber)]/50 hover:bg-[var(--color-ns-card)]"
                  }`}
                  style={{ minWidth: "155px" }}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span className="font-heading text-xs font-bold text-[var(--color-ns-text)]">
                      Shape #{idx + 1}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[0.625rem] font-bold ${
                        isSelected
                          ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)]"
                          : "bg-[var(--color-ns-border-strong)] text-[var(--color-ns-muted)]"
                      }`}
                    >
                      {classification.badge}
                    </span>
                  </div>

                  <p className="mt-1 line-clamp-1 text-[0.6875rem] text-[var(--color-ns-muted)] group-hover:text-[var(--color-ns-text)]">
                    {v.name}
                  </p>

                  {/* Compact fret notation pill */}
                  <div className="mt-2.5 flex items-center gap-1 font-mono text-[0.6875rem]">
                    {v.frets.map((f, stringIdx) => (
                      <span
                        key={stringIdx}
                        className={`flex h-5 w-5 items-center justify-center rounded text-[0.625rem] font-bold ${
                          f === null
                            ? "bg-neutral-800/60 text-neutral-500"
                            : f === 0
                            ? "bg-emerald-950/80 text-emerald-400"
                            : isSelected
                            ? "bg-[var(--color-ns-amber)]/30 text-[var(--color-ns-amber)]"
                            : "bg-[var(--color-ns-card)] text-[var(--color-ns-text)] border border-[var(--color-ns-border)]"
                        }`}
                      >
                        {f === null ? "x" : f}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {fretted && voicings.length === 0 && (
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-8 text-center text-sm text-[var(--color-ns-muted)]">
          No playable {parsedChord.label} shape was found on {definition.name} in {fretted.tuning.name}. Try another tuning or instrument — the chord theory below still applies.
        </div>
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
                    capo={resolved.capo}
                  />
                </div>

                {/* Fingering legend */}
                <div className="border-t border-[var(--color-ns-border)]/60 pt-3 text-center text-[0.6875rem] text-[var(--color-ns-muted)]">
                  <span className="font-semibold text-[var(--color-ns-text)]">Fingering: </span>
                  1 = Index · 2 = Middle · 3 = Ring · 4 = Pinky
                  {definition.fretless && (
                    <span className="mt-1 block text-[var(--color-ns-dim)]">
                      No frets: dots show roughly where each finger lands; the exact spot is found by ear.
                    </span>
                  )}
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

            {/* Right Column (String Table + Music Theory + Voice Leading) */}
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

              {/* Voice Leading & Chord Resolutions */}
              <VoiceLeadingCard
                chord={parsedChord}
                instrumentDefinition={definition}
                settings={resolved}
                onSelectChord={handleInspectChord}
              />
            </div>
          </div>

          {/* ─── LIVE SHEET MUSIC (STAFF NOTATION + SYNCHRONIZED TAB) ─── */}
          <ChordSheetNotation
            chord={parsedChord}
            notes={sheetNotes}
            isFretted={true}
            stringNames={currentTuning.stringNames}
          />

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
            capo={resolved.capo}
          />
        </>
      ) : model && model.kind !== "fretted" && model.kind !== "bass" ? (
        <div className="space-y-6">
          {/* Non-Fretted Live Sheet Music */}
          <ChordSheetNotation
            chord={parsedChord}
            notes={sheetNotes}
            isFretted={false}
          />

          {/* Full Interactive Non-Fretted Workbench */}
          <NonFrettedWorkbench model={model as OtherModel} analysis={chordAnalysis} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChordTheoryCard analysis={chordAnalysis} />
            <VoiceLeadingCard
              chord={parsedChord}
              instrumentDefinition={definition}
              settings={resolved}
              onSelectChord={handleInspectChord}
            />
          </div>
        </div>
      ) : null}

      {fretted && voicings.length === 0 && (
        <div className="space-y-6">
          <ChordSheetNotation chord={parsedChord} notes={sheetNotes} isFretted={false} />
          <ChordTheoryCard analysis={chordAnalysis} />
          <VoiceLeadingCard
            chord={parsedChord}
            instrumentDefinition={definition}
            settings={resolved}
            onSelectChord={handleInspectChord}
          />
        </div>
      )}
    </div>
  );
}
