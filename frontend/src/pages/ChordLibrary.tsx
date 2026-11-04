import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CHORD_CATEGORIES,
  NOTE_NAMES,
  SHARP_ROOTS,
  FLAT_ROOTS,
  BOTH_ROOTS,
  chordFullName,
  enharmonicRoot,
  parseChordSymbol,
  qualityForSuffix,
  slashChordsForRoot,
  SLASH_CHORDS_PER_ROOT,
  type EnharmonicMode,
  type ChordCategory,
  type ParsedChord,
} from "../lib/chordTheory";
import { ChordCard, FilterPill } from "../components/chords/ChordCard";
import { SettingsSelect } from "../components/settings/SettingsSelect";
import { InstrumentPicker } from "../components/instruments/InstrumentPicker";
import {
  chordTunings,
  getPlayableChordsForInstrument,
  loadChordSettings,
  saveChordSettings,
  tuningChoices,
  type ChordSettings,
} from "../lib/chords/model";
import { getAudioEngineMode, setAudioEngineMode, type AudioEngineMode } from "../lib/chords/play";
import { inversionName } from "../lib/chords/theory";
import { chordInstruments, findDefinition } from "../lib/instruments/definitions";
import { syncChordsToTuner } from "../lib/instruments/activeInstrument";
import { ChordFamilyPanel } from "../components/chords/ChordFamilyPanel";
import { ChordExplorerView } from "../components/chords/ChordExplorerView";
import { TheoryExplorer } from "../components/theory/TheoryExplorer";
import { SingleNoteOrchestralView, type OrchestralViewMode } from "../components/chords/SingleNoteOrchestralView";

type Tab = "explorer" | "library" | "family" | "theory";

/** Slash chords / inversions on one root (C/E, C/G, Cmaj7/B…), generated from the same quality formulas. */
const SLASH_BY_ROOT: ParsedChord[][] = Array.from({ length: 12 }, (_, pc) => slashChordsForRoot(pc));

/** A typed slash chord like "C/E", "Am7/G" or "D/F#": any known quality over any bass note. */
function typedSlashChord(query: string): ParsedChord | null {
  const m = /^([A-Ga-g][#b♯♭]?)\s*(.*?)\s*\/\s*([A-Ga-g][#b♯♭]?)$/.exec(query.trim().replace(/♯/g, "#").replace(/♭/g, "b"));
  if (!m || !qualityForSuffix(m[2])) return null;
  const cap = (n: string) => n[0].toUpperCase() + n.slice(1);
  return parseChordSymbol(`${cap(m[1])}${m[2]}/${cap(m[3])}`);
}

/** Parses a typed query like "Bbm7", "C#ø" or "f maj7" into an exact chord, if it is one. */
function exactChordFor(query: string): { root: number; suffix: string } | null {
  const match = /^([A-Ga-g])([#b♯♭]?)\s*(.*)$/.exec(query.trim());
  if (!match) return null;
  const quality = qualityForSuffix(match[3]);
  if (!quality) return null;
  const letterPc: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = match[2] === "#" || match[2] === "♯" ? 1 : match[2] ? -1 : 0;
  return { root: (letterPc[match[1].toUpperCase()] + acc + 12) % 12, suffix: quality.suffix };
}

/** All the names a chord can be searched by: sharp/flat spellings, suffix aliases and its full name. */
function searchNames(chord: ParsedChord): string[] {
  const roots = [NOTE_NAMES[chord.root], enharmonicRoot(chord.root)?.replace("♭", "b")].filter(Boolean) as string[];
  const suffixes = [chord.quality.suffix, ...(chord.quality.aliases ?? [])];
  return [...roots.flatMap((r) => suffixes.map((s) => `${r}${s}`.toLowerCase())), chordFullName(chord).toLowerCase()];
}

// Optional alphabetical order: root pills and the "All" listing run A → G♯ instead of C → B.
const A_PC = 9;

export function ChordLibrary() {
  const [chordSettings, setChordSettings] = useState<ChordSettings>(loadChordSettings);
  const definition = findDefinition(chordSettings.definitionId) ?? findDefinition("guitar")!;
  const tunings = useMemo(() => chordTunings(definition), [definition]);
  const tuningOptions = tuningChoices(definition);
  const tuningValue = tuningOptions.find((t) => t.id === chordSettings.tuningId)?.id ?? tuningOptions[0]?.id ?? "";
  const tuningNote = tunings.find((t) => t.id === tuningValue)?.note;
  const hasInversions = definition.chordRenderer === "keyboard" || definition.chordRenderer === "mallet" || definition.chordRenderer === "accordion";
  const isFretted = definition.chordDisplayMode === "fretboard" || (definition.chordDisplayMode === "strings" && !definition.fretless);

  const [audioEngineState, setAudioEngineState] = useState<AudioEngineMode>(getAudioEngineMode);

  const update = (next: ChordSettings) => {
    setChordSettings(next);
    saveChordSettings(next);
    syncChordsToTuner(next);
  };

  const cardSettings = useMemo<ChordSettings>(
    () => ({ ...chordSettings, definitionId: definition.id, tuningId: tuningValue || undefined }),
    [chordSettings, definition.id, tuningValue]
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "theory" ? "theory" : tabParam === "explorer" ? "explorer" : tabParam === "family" ? "family" : "library";
  const [selectedChordSymbol, setSelectedChordSymbol] = useState<string>(searchParams.get("chord") ?? "C");

  const setTab = (next: Tab) =>
    setSearchParams(
      (params) => {
        if (next === "library") {
          params.delete("tab");
        } else {
          params.set("tab", next);
        }
        return params;
      },
      { replace: true }
    );

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const urlQuery = searchParams.get("q");
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== null) setQuery(urlQuery);
  }

  const [root, setRoot] = useState<number | "all">(0);
  const [alphabetical, setAlphabetical] = useState(false);
  const [category, setCategory] = useState<ChordCategory | "all" | "major" | "minor" | "slash">("all");
  const [enharmonicMode, setEnharmonicMode] = useState<EnharmonicMode>("both");
  const [orchestralMode, setOrchestralMode] = useState<OrchestralViewMode>("single_notes");

  const isWindOrBrass = definition.category === "wind" || definition.chordRenderer === "wind";
  const isBowedString = definition.id === "violin" || definition.id === "viola" || definition.id === "cello" || definition.id === "double-bass";
  const showOrchestralSingleView = isWindOrBrass || (isBowedString && (orchestralMode === "single_notes" || orchestralMode === "arpeggios"));

  // Musical categorization helpers
  const isMajorChord = (c: ParsedChord) => c.quality.tones.some(([semi]) => semi === 4) && !c.quality.tones.some(([semi]) => semi === 3);
  const isMinorChord = (c: ParsedChord) => c.quality.tones.some(([semi]) => semi === 3);

  // Instrument-authentic playable chords matrix
  const playableChords = useMemo(
    () => getPlayableChordsForInstrument(definition, tuningValue),
    [definition, tuningValue]
  );

  const searching = query.trim().length > 0;

  const filtered = useMemo(() => {
    let list: ParsedChord[];
    if (category === "major") {
      list = playableChords.filter((c) => (root === "all" || c.root === root) && isMajorChord(c));
    } else if (category === "minor") {
      list = playableChords.filter((c) => (root === "all" || c.root === root) && isMinorChord(c));
    } else if (category === "slash") {
      list = root === "all" ? SLASH_BY_ROOT.flat() : SLASH_BY_ROOT[root];
    } else {
      list = playableChords.filter(
        (c) =>
          (root === "all" || c.root === root) &&
          (category === "all" || c.quality.category === category)
      );
    }

    if (searching) {
      const slash = typedSlashChord(query);
      if (slash) return [slash];
      const q = query.trim().replace(/♯/g, "#").replace(/♭/g, "b");
      const exact = exactChordFor(q);
      const lower = q.toLowerCase();

      // Search matches within active list (or fallback across playable chords)
      let matches = list.filter(
        (c) =>
          (exact && c.root === exact.root && c.quality.suffix === exact.suffix) ||
          searchNames(c).some((n) => n.startsWith(lower) || (lower.length > 2 && n.includes(lower)))
      );

      // If active category/root produced no matches, broaden to any playable chord matching root
      if (matches.length === 0 && (root !== "all" || category !== "all")) {
        matches = playableChords.filter(
          (c) =>
            (root === "all" || c.root === root) &&
            searchNames(c).some((n) => n.startsWith(lower) || (lower.length > 2 && n.includes(lower)))
        );
      }

      if (matches.length === 0) {
        matches = playableChords.filter((c) =>
          searchNames(c).some((n) => n.startsWith(lower) || (lower.length > 2 && n.includes(lower)))
        );
      }

      return matches.sort((a, b) => {
        const ea = exact && a.root === exact.root && a.quality.suffix === exact.suffix ? 0 : 1;
        const eb = exact && b.root === exact.root && b.quality.suffix === exact.suffix ? 0 : 1;
        return ea - eb;
      });
    }

    if (!alphabetical) return list;
    const fromA = (pc: number) => (pc - A_PC + 12) % 12;
    return [...list].sort((a, b) => fromA(a.root) - fromA(b.root));
  }, [playableChords, query, searching, root, category, alphabetical]);

  const totalFor = (cat: ChordCategory | "all" | "major" | "minor" | "slash") => {
    if (cat === "slash") return (root === "all" ? 12 : 1) * SLASH_CHORDS_PER_ROOT;
    const chordsInScope = root === "all" ? playableChords : playableChords.filter((c) => c.root === root);
    if (cat === "all") return chordsInScope.length;
    if (cat === "major") return chordsInScope.filter(isMajorChord).length;
    if (cat === "minor") return chordsInScope.filter(isMinorChord).length;
    return chordsInScope.filter((c) => c.quality.category === cat).length;
  };

  const rootsList = useMemo(() => {
    const list = enharmonicMode === "flats" ? FLAT_ROOTS : enharmonicMode === "sharps" ? SHARP_ROOTS : BOTH_ROOTS;
    const items = list.map((label, pc) => ({
      pc,
      label: label.replace(/#/g, "♯").replace(/b/g, "♭"),
    }));
    if (!alphabetical) return items;
    return items.sort((a, b) => ((a.pc - A_PC + 12) % 12) - ((b.pc - A_PC + 12) % 12));
  }, [enharmonicMode, alphabetical]);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-6 sm:px-6 sm:pt-10 md:px-8">
      {/* Workspace Header */}
      <div className="mb-6 flex flex-col justify-between gap-3 border-b border-[var(--color-ns-border)] pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl font-semibold tracking-tight text-[var(--color-ns-text)]">
            {isWindOrBrass ? "Notes & Arpeggio Library" : "Chords & Notes Library"}
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-[var(--color-ns-muted)]">
            {isWindOrBrass
              ? `Explore playable chromatic notes, valve/finger positions, frequencies in Hz, and broken chord arpeggios on ${definition.name}.`
              : "Explore authentic chords, understand their notes, and learn exactly how to play them across guitars, bass, ukulele, keyboards and more."}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex w-fit gap-1.5 rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1" role="tablist" aria-label="Chord views">
        {([
          ["library", "All chords"],
          ["family", "Chord family"],
          ["explorer", "Chord Workbench"],
          ["theory", "Music Theory Lab"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
              tab === t
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "theory" ? (
        <TheoryExplorer
          currentInstrumentId={definition.id}
          onNavigateToTab={(targetTab, chordOrKey) => {
            if (targetTab === "library") {
              if (typeof chordOrKey === "number") setRoot(chordOrKey);
              setTab("library");
            } else if (targetTab === "family") {
              setTab("family");
            } else if (targetTab === "explorer") {
              if (typeof chordOrKey === "string") setSelectedChordSymbol(chordOrKey);
              setTab("explorer");
            }
          }}
        />
      ) : tab === "explorer" ? (
        <ChordExplorerView initialChordSymbol={selectedChordSymbol} settings={chordSettings} onSettingsChange={update} />
      ) : tab === "family" ? (
        <ChordFamilyPanel
          settings={cardSettings}
          onExploreChord={(symbol) => {
            setSelectedChordSymbol(symbol);
            setTab("explorer");
          }}
        />
      ) : (
        <>
          {/* Toolbar: Instrument, Tuning, Capo, Handedness, Voicing Filter, Audio Mode & Search */}
          <div className="mb-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* 1. Instrument Picker */}
                <div className="w-full min-w-[12rem] sm:w-56">
                  <InstrumentPicker
                    label="Instrument"
                    variant="field"
                    value={definition.id}
                    definitions={chordInstruments()}
                    onChange={(id) => update({ ...chordSettings, definitionId: id, tuningId: undefined, inversion: 0 })}
                  />
                </div>

                {/* 2. Tuning Selector */}
                {tuningOptions.length > 1 && (
                  <div className="w-full sm:w-52">
                    <SettingsSelect
                      variant="field"
                      label={definition.id === "harp" ? "Harp type" : definition.id === "harmonica" ? "Harmonica key" : "Tuning"}
                      value={tuningValue}
                      options={tuningOptions.map((t) => ({ value: t.id, label: t.name }))}
                      onChange={(v) => update({ ...chordSettings, tuningId: v })}
                    />
                  </div>
                )}

                {/* 3. Capo Selector */}
                {isFretted && (
                  <div className="w-32">
                    <SettingsSelect
                      variant="field"
                      label="Capo"
                      value={String(chordSettings.capo ?? 0)}
                      options={[
                        { value: "0", label: "No Capo" },
                        ...Array.from({ length: 12 }, (_, i) => ({
                          value: String(i + 1),
                          label: `Capo ${i + 1}`,
                        })),
                      ]}
                      onChange={(v) => update({ ...chordSettings, capo: Number(v) })}
                    />
                  </div>
                )}

                {/* 4. Handedness Toggle */}
                {isFretted && (
                  <button
                    type="button"
                    onClick={() => update({ ...chordSettings, leftHanded: !chordSettings.leftHanded })}
                    title={chordSettings.leftHanded ? "Switch to Right-Handed diagrams" : "Switch to Left-Handed mirrored diagrams"}
                    className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all ${
                      chordSettings.leftHanded
                        ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)] font-bold shadow-sm"
                        : "border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
                      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
                      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                    </svg>
                    <span>{chordSettings.leftHanded ? "Left-Hand" : "Right-Hand"}</span>
                  </button>
                )}

                {/* 5. Voicing Filter */}
                {isFretted && (
                  <div className="w-44">
                    <SettingsSelect
                      variant="field"
                      label="Voicings"
                      value={chordSettings.voicingFilter ?? "all"}
                      options={[
                        { value: "all", label: "All Voicings" },
                        { value: "open", label: "Open / Beginner Only" },
                        { value: "barre", label: "Barre Chords Only" },
                        { value: "jazz", label: "Jazz / Drop Voicings" },
                      ]}
                      onChange={(v) => update({ ...chordSettings, voicingFilter: v as any })}
                    />
                  </div>
                )}

                {/* Inversions for keys/accordion */}
                {hasInversions && (
                  <div role="group" aria-label="Inversion" className="flex gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1">
                    {Array.from({ length: 4 }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        title={inversionName(i)}
                        aria-pressed={chordSettings.inversion === i}
                        onClick={() => update({ ...chordSettings, inversion: i })}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          chordSettings.inversion === i
                            ? "bg-[var(--color-ns-amber)] font-bold text-[var(--color-ns-ink)]"
                            : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                        }`}
                      >
                        {i === 0 ? "Root" : `${i}${i === 1 ? "st" : i === 2 ? "nd" : "rd"}`}
                      </button>
                    ))}
                  </div>
                )}

                {/* 6. Dual-Engine Audio Mode Toggle Badge */}
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = audioEngineState === "samples" ? "physical" : "samples";
                    setAudioEngineMode(nextMode);
                    setAudioEngineState(nextMode);
                    update({ ...chordSettings, audioMode: nextMode });
                  }}
                  title="Click to toggle between Studio Sampled Audio (FluidR3_GM) and Physical Synthesis"
                  className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all ${
                    audioEngineState === "samples"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      : "border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20"
                  }`}
                >
                  <span className="flex h-2 w-2 rounded-full animate-pulse bg-current" />
                  <span>{audioEngineState === "samples" ? "Studio Sampled Audio" : "Physical Model Audio"}</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ns-muted)]"
                >
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search all chords"
                  placeholder="Search chord (e.g. Bbm7, F#9, sus4, C/E)…"
                  className="h-9 w-full rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] pl-9 pr-8 text-xs text-[var(--color-ns-text)] focus:border-[var(--color-ns-amber)]/60 focus:outline-none transition-all placeholder:text-[var(--color-ns-muted)]"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="mb-4 text-[0.6875rem] leading-relaxed text-[var(--color-ns-muted)]">
            {tuningNote && <>{tuningNote} </>}
            {definition.caveat && <>{definition.caveat} </>}
            {definition.chordCaveat && <>{definition.chordCaveat} </>}
            {audioEngineState === "samples"
              ? `Playback engine: Studio multi-sampled real instruments with stereo panning and dynamic velocity.`
              : `Playback engine: Physical Karplus-Strong string synthesis and additive FM modeling.`}
          </p>

          {/* Filters — Root Note & Chord Type (Never frozen during search) */}
          <div className="mb-6 space-y-3">
            {/* Orchestral Bowed Strings View Mode Switcher */}
            {isBowedString && (
              <div className="flex flex-wrap items-center gap-2 rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)] pl-1">
                  Orchestral Mode:
                </span>
                <div className="flex gap-1">
                  {(
                    [
                      ["double_stops", "Double-Stops & Chords"],
                      ["single_notes", "Single Notes & Fingerboard"],
                      ["arpeggios", "Chord Arpeggios"],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setOrchestralMode(m)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                        orchestralMode === m
                          ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                          : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Root Note Row with Jitter-Free Accidental and Sort Controls */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Root note">
              <span className="mr-1 w-14 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
                Root
              </span>
              <FilterPill selected={root === "all"} onClick={() => setRoot("all")}>
                All
              </FilterPill>
              {rootsList.map((r) => {
                const hasAccidental = r.label.includes("♯") || r.label.includes("♭") || r.label.includes("#") || r.label.includes("b");
                return (
                  <button
                    key={`${r.pc}-${r.label}`}
                    type="button"
                    aria-pressed={root === r.pc}
                    onClick={() => setRoot(r.pc)}
                    className={`inline-flex h-8 items-center justify-center rounded-full px-2.5 text-xs font-medium transition-all text-center ${
                      hasAccidental ? "min-w-[70px]" : "min-w-[36px]"
                    } ${
                      root === r.pc
                        ? "border border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-semibold shadow-sm"
                        : "border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)] hover:bg-[var(--color-ns-raised)]"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}

              {/* Anchored right-aligned stationary container for Accidental & A->G controls */}
              <div className="ml-auto shrink-0 flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-0.5">
                  {(["sharps", "flats", "both"] as EnharmonicMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setEnharmonicMode(mode)}
                      className={`rounded-full px-2 py-0.5 text-[0.625rem] font-semibold transition-all ${
                        enharmonicMode === mode
                          ? "bg-[var(--color-ns-amber)] font-bold text-[var(--color-ns-ink)] shadow-sm"
                          : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                      }`}
                    >
                      {mode === "sharps" ? "♯ Sharps" : mode === "flats" ? "♭ Flats" : "Both"}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  aria-pressed={alphabetical}
                  onClick={() => setAlphabetical((v) => !v)}
                  title={alphabetical ? "Back to normal chromatic order (C → B)" : "Sort alphabetically (A → G)"}
                  className={`rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold transition-all ${
                    alphabetical
                      ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/15 text-[var(--color-ns-amber)]"
                      : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                  }`}
                >
                  {alphabetical ? "A → G ✓" : "A → G"}
                </button>
              </div>
            </div>

            {/* Type Filter Row with Dedicated Major and Minor Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Chord type">
              <span className="mr-1 w-14 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
                Type
              </span>
              <FilterPill selected={category === "all"} onClick={() => setCategory("all")}>
                All types
                <span className="ml-1.5 text-[0.625rem] opacity-60">{totalFor("all")}</span>
              </FilterPill>
              <FilterPill selected={category === "major"} onClick={() => setCategory("major")}>
                Major
                <span className="ml-1.5 text-[0.625rem] opacity-60">{totalFor("major")}</span>
              </FilterPill>
              <FilterPill selected={category === "minor"} onClick={() => setCategory("minor")}>
                Minor
                <span className="ml-1.5 text-[0.625rem] opacity-60">{totalFor("minor")}</span>
              </FilterPill>
              {CHORD_CATEGORIES.map((cat) => (
                <FilterPill key={cat} selected={category === cat} onClick={() => setCategory(cat)}>
                  {cat}
                  <span className="ml-1.5 text-[0.625rem] opacity-60">{totalFor(cat)}</span>
                </FilterPill>
              ))}
              <FilterPill selected={category === "slash"} onClick={() => setCategory("slash")}>
                Slash / inversions
                <span className="ml-1.5 text-[0.625rem] opacity-60">{totalFor("slash")}</span>
              </FilterPill>
            </div>
          </div>

          {/* Orchestral Single Notes View or Chord Card Grid */}
          {showOrchestralSingleView ? (
            <SingleNoteOrchestralView
              definition={definition}
              selectedRoot={root}
              viewMode={orchestralMode}
              onModeChange={setOrchestralMode}
              onExploreChord={(symbol) => {
                setSelectedChordSymbol(symbol);
                setTab("explorer");
              }}
            />
          ) : (
            <>
              <p className="mt-3 mb-4 pt-2 scroll-mt-20 text-xs text-[var(--color-ns-muted)]" aria-live="polite">
                {searching
                  ? `${filtered.length} ${filtered.length === 1 ? "chord match" : "chords match"} “${query.trim()}”`
                  : category === "slash"
                    ? `Showing ${filtered.length} slash chords — each tone of the chord in the bass`
                    : `Showing ${filtered.length} of ${playableChords.length} authentic ${definition.name} chords`}
              </p>

              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-12 text-center text-sm text-[var(--color-ns-muted)]">
                  No chords match “{query.trim()}”. Try a root plus type like <span className="font-semibold text-[var(--color-ns-text)]">Ebmaj7</span>,{" "}
                  <span className="font-semibold text-[var(--color-ns-text)]">Gsus4</span> or a slash chord like <span className="font-semibold text-[var(--color-ns-text)]">C/E</span>.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4">
                  {filtered.map((chord) => (
                    <ChordCard
                      key={chord.label}
                      chord={chord}
                      settings={cardSettings}
                      onExplore={(c) => {
                        setSelectedChordSymbol(c.label);
                        setTab("explorer");
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
