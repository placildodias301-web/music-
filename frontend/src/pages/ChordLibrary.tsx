import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ALL_CHORD_SYMBOLS,
  CHORD_CATEGORIES,
  CHORD_QUALITIES,
  NOTE_NAMES,
  chordFullName,
  enharmonicRoot,
  parseChordSymbol,
  qualityForSuffix,
  slashChordsForRoot,
  SLASH_CHORDS_PER_ROOT,
  type ChordCategory,
  type ParsedChord,
} from "../lib/chordTheory";
import { ChordCard, FilterPill } from "../components/chords/ChordCard";
import { SettingsSelect } from "../components/settings/SettingsSelect";
import { InstrumentPicker } from "../components/instruments/InstrumentPicker";
import { chordTunings, loadChordSettings, saveChordSettings, tuningChoices, type ChordSettings } from "../lib/chords/model";
import { inversionName } from "../lib/chords/theory";
import { chordInstruments, findDefinition } from "../lib/instruments/definitions";
import { syncChordsToTuner } from "../lib/instruments/activeInstrument";
import { ChordFamilyPanel } from "../components/chords/ChordFamilyPanel";
import { ChordExplorerView } from "../components/chords/ChordExplorerView";

type Tab = "explorer" | "library" | "family";

const ALL_CHORDS: ParsedChord[] = ALL_CHORD_SYMBOLS.map(parseChordSymbol);

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
const ROOTS_FROM_C = Array.from({ length: 12 }, (_, i) => i);
const ROOTS_FROM_A = Array.from({ length: 12 }, (_, i) => (A_PC + i) % 12);

export function ChordLibrary() {
  const [chordSettings, setChordSettings] = useState<ChordSettings>(loadChordSettings);
  const definition = findDefinition(chordSettings.definitionId) ?? findDefinition("guitar")!;
  const tunings = useMemo(() => chordTunings(definition), [definition]);
  const tuningOptions = tuningChoices(definition);
  const tuningValue = tuningOptions.find((t) => t.id === chordSettings.tuningId)?.id ?? tuningOptions[0]?.id ?? "";
  const tuningNote = tunings.find((t) => t.id === tuningValue)?.note;
  const hasInversions = definition.chordRenderer === "keyboard" || definition.chordRenderer === "mallet" || definition.chordRenderer === "accordion";
  const update = (next: ChordSettings) => {
    setChordSettings(next);
    saveChordSettings(next);
    syncChordsToTuner(next); // the Tuner follows the instrument and tuning chosen here
  };
  // Settings handed to every chord card: the tuning is resolved here so cards always agree with the selector.
  const cardSettings = useMemo<ChordSettings>(() => ({ ...chordSettings, definitionId: definition.id, tuningId: tuningValue || undefined }), [chordSettings, definition.id, tuningValue]);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  // Order: All chords, Chord family, Chord explorer — All chords is the landing tab.
  const tab: Tab = tabParam === "explorer" ? "explorer" : tabParam === "family" ? "family" : "library";
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

  // Follow new searches from the header bar while already on this page.
  const urlQuery = searchParams.get("q");
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== null) setQuery(urlQuery);
  }
  const [root, setRoot] = useState<number | "all">(0);
  const [alphabetical, setAlphabetical] = useState(false);
  const [category, setCategory] = useState<ChordCategory | "all" | "slash">("all");

  const searching = query.trim().length > 0;

  const filtered = useMemo(() => {
    if (searching) {
      const slash = typedSlashChord(query);
      if (slash) return [slash];
      const q = query.trim().replace(/♯/g, "#").replace(/♭/g, "b");
      const exact = exactChordFor(q);
      const lower = q.toLowerCase();
      const matches = ALL_CHORDS.filter(
        (c) =>
          (exact && c.root === exact.root && c.quality.suffix === exact.suffix) ||
          searchNames(c).some((n) => n.startsWith(lower) || (lower.length > 2 && n.includes(lower)))
      );
      // Put the exact chord first, e.g. "Am" → Am before Am7, Amaj7…
      return matches.sort((a, b) => {
        const ea = exact && a.root === exact.root && a.quality.suffix === exact.suffix ? 0 : 1;
        const eb = exact && b.root === exact.root && b.quality.suffix === exact.suffix ? 0 : 1;
        return ea - eb;
      });
    }
    const byFilter =
      category === "slash"
        ? (root === "all" ? SLASH_BY_ROOT.flat() : SLASH_BY_ROOT[root])
        : ALL_CHORDS.filter((c) => (root === "all" || c.root === root) && (category === "all" || c.quality.category === category));
    if (!alphabetical) return byFilter;
    const fromA = (pc: number) => (pc - A_PC + 12) % 12;
    return [...byFilter].sort((a, b) => fromA(a.root) - fromA(b.root));
  }, [query, searching, root, category, alphabetical]);

  const qualitiesPerCategory = (cat: ChordCategory) => CHORD_QUALITIES.filter((q) => q.category === cat).length;
  const totalFor = (cat: ChordCategory | "all" | "slash") =>
    (cat === "slash" ? SLASH_CHORDS_PER_ROOT : cat === "all" ? CHORD_QUALITIES.length : qualitiesPerCategory(cat)) * (root === "all" ? 12 : 1);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/10 px-3 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-ns-amber)]">
          Interactive Chord Explorer & Music Theory
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-4xl">
          Chord Explorer
        </h1>
        <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-[var(--color-ns-muted)]">
          Explore chords, understand their notes, and learn exactly how to play them across guitars, bass, ukulele, keyboards and more.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex w-fit gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1" role="tablist" aria-label="Chord views">
        {([
          ["library", "All chords"],
          ["family", "Chord family"],
          ["explorer", "Chord Explorer"],
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

      {tab === "explorer" ? (
        <ChordExplorerView initialChordSymbol={selectedChordSymbol} settings={chordSettings} onSettingsChange={update} />
      ) : tab === "family" ? (
        <ChordFamilyPanel settings={cardSettings} />
      ) : (
        <>
          {/* Toolbar: View Switcher + Search */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="w-full min-w-[11rem] sm:w-56">
                <InstrumentPicker
                  label="Instrument"
                  variant="field"
                  value={definition.id}
                  definitions={chordInstruments()}
                  onChange={(id) => update({ definitionId: id, tuningId: undefined, inversion: 0 })}
                />
              </div>
              {tuningOptions.length > 1 && (
                <div className="w-full sm:w-56">
                  <SettingsSelect
                    variant="field"
                    label={definition.id === "harp" ? "Harp type" : definition.id === "harmonica" ? "Harmonica key" : "Tuning"}
                    value={tuningValue}
                    options={tuningOptions.map((t) => ({ value: t.id, label: t.name }))}
                    onChange={(v) => update({ ...chordSettings, tuningId: v })}
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
                      aria-pressed={chordSettings.inversion === i}
                      onClick={() => update({ ...chordSettings, inversion: i })}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${chordSettings.inversion === i ? "bg-[var(--color-ns-amber)] font-bold text-[var(--color-ns-ink)]" : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"}`}
                    >
                      {i === 0 ? "Root" : `${i}${i === 1 ? "st" : i === 2 ? "nd" : "rd"}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

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
                className="input-base py-2 pl-9 pr-8 text-xs rounded-xl"
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

          <p className="mb-4 text-[0.6875rem] leading-relaxed text-[var(--color-ns-muted)]">
            {tuningNote && <>{tuningNote} </>}
            {definition.caveat && <>{definition.caveat} </>}
            {definition.chordCaveat && <>{definition.chordCaveat} </>}
            Playback is a plain reference tone, a simple string simulation or a synthetic wind voice for the chord’s notes — not a recording of a real {definition.name.toLowerCase()}.
          </p>

          {/* Filters — Root Note & Chord Type */}
          <div className={`mb-6 space-y-3 transition-opacity ${searching ? "pointer-events-none opacity-40" : ""}`} aria-disabled={searching}>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Root note">
              <span className="mr-1 w-16 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
                Root
              </span>
              <FilterPill selected={root === "all"} onClick={() => setRoot("all")}>
                All
              </FilterPill>
              {(alphabetical ? ROOTS_FROM_A : ROOTS_FROM_C).map((pc) => {
                const n = NOTE_NAMES[pc];
                const flat = enharmonicRoot(pc);
                return (
                  <FilterPill key={n} selected={root === pc} onClick={() => setRoot(pc)} title={flat ? `${n} / ${flat}` : n}>
                    {n.replace("#", "♯")}
                    {flat && <span className="ml-1 text-[0.625rem] opacity-60">{flat}</span>}
                  </FilterPill>
                );
              })}
              <button
                type="button"
                aria-pressed={alphabetical}
                onClick={() => setAlphabetical((v) => !v)}
                title={alphabetical ? "Back to normal order (C → B)" : "Sort alphabetically (A → G)"}
                className={`ml-1 rounded-lg border px-2.5 py-1 text-[0.6875rem] font-semibold transition-all ${
                  alphabetical
                    ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/15 text-[var(--color-ns-amber)]"
                    : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                }`}
              >
                {alphabetical ? "A → G ✓" : "A → G"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chord type">
              <span className="mr-1 w-16 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
                Type
              </span>
              {(["all", ...CHORD_CATEGORIES, "slash"] as const).map((cat) => (
                <FilterPill key={cat} selected={category === cat} onClick={() => setCategory(cat)}>
                  {cat === "all" ? "All types" : cat === "slash" ? "Slash / inversions" : cat}
                  <span className="ml-1.5 text-[0.625rem] opacity-60">{totalFor(cat)}</span>
                </FilterPill>
              ))}
            </div>
          </div>

          <p className="mb-4 text-xs text-[var(--color-ns-muted)]" aria-live="polite">
            {searching
              ? `${filtered.length} ${filtered.length === 1 ? "chord match" : "chords match"} “${query.trim()}”`
              : category === "slash"
                ? `Showing ${filtered.length} slash chords — each tone of the chord in the bass`
                : `Showing ${filtered.length} of ${ALL_CHORD_SYMBOLS.length} chords`}
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-12 text-center text-sm text-[var(--color-ns-muted)]">
              No chords match “{query.trim()}”. Try a root plus type like <span className="font-semibold text-[var(--color-ns-text)]">Ebmaj7</span>,{" "}
              <span className="font-semibold text-[var(--color-ns-text)]">Gsus4</span> or a slash chord like <span className="font-semibold text-[var(--color-ns-text)]">C/E</span>.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
    </div>
  );
}
