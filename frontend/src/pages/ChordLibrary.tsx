import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";
import {
  ALL_CHORD_SYMBOLS,
  CHORD_CATEGORIES,
  CHORD_QUALITIES,
  NOTE_NAMES,
  chordFullName,
  chordMidiNotes,
  enharmonicRoot,
  GUITAR_TUNING,
  getGuitarVoicings,
  getUkuleleShape,
  parseChordSymbol,
  qualityForSuffix,
  spellChord,
  UKULELE_TUNING,
  type ChordCategory,
  type ParsedChord,
} from "../lib/chordTheory";
import { GuitarChordDiagram } from "../components/GuitarChordDiagram";
import { UkuleleChordDiagram } from "../components/UkuleleChordDiagram";
import { PianoRoll } from "../components/PianoRoll";
import { playChordLive, playStrummedShape } from "../lib/playChord";

type View = "guitar" | "ukulele" | "piano";

const ALL_CHORDS: ParsedChord[] = ALL_CHORD_SYMBOLS.map(parseChordSymbol);

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
  const [view, setView] = useState<View>("guitar");
  const [searchParams] = useSearchParams();
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
  const [category, setCategory] = useState<ChordCategory | "all">("all");

  const searching = query.trim().length > 0;

  const filtered = useMemo(() => {
    if (searching) {
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
    const byFilter = ALL_CHORDS.filter(
      (c) => (root === "all" || c.root === root) && (category === "all" || c.quality.category === category)
    );
    if (!alphabetical) return byFilter;
    const fromA = (pc: number) => (pc - A_PC + 12) % 12;
    return byFilter.sort((a, b) => fromA(a.root) - fromA(b.root));
  }, [query, searching, root, category, alphabetical]);

  const qualitiesPerCategory = (cat: ChordCategory) => CHORD_QUALITIES.filter((q) => q.category === cat).length;
  const totalFor = (cat: ChordCategory | "all") =>
    (cat === "all" ? CHORD_QUALITIES.length : qualitiesPerCategory(cat)) * (root === "all" ? 12 : 1);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-amber)]">
          Interactive Reference & Diagrams
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-4xl">
          Chord Reference Library
        </h1>
        <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-[var(--color-ns-muted)]">
          {ALL_CHORD_SYMBOLS.length} chords — {CHORD_QUALITIES.length} chord types across all 12 root keys, with interactive fingerings for guitar, ukulele, piano roll voicings, and real-time audio playback.
        </p>
      </div>

      {/* Toolbar: View Switcher + Search */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1">
          {(["guitar", "ukulele", "piano"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition-all ${
                view === v
                  ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                  : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
              }`}
            >
              {v}
            </button>
          ))}
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
            placeholder="Search chord (e.g. Bbm7, F#9, sus4)…"
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

      {/* Filters — Root Note & Chord Type */}
      <div className={`mb-6 space-y-3 transition-opacity ${searching ? "pointer-events-none opacity-40" : ""}`} aria-disabled={searching}>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Root note">
          <span className="mr-1 w-16 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
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
                {flat && <span className="ml-1 text-[10px] opacity-60">{flat}</span>}
              </FilterPill>
            );
          })}
          <button
            type="button"
            aria-pressed={alphabetical}
            onClick={() => setAlphabetical((v) => !v)}
            title={alphabetical ? "Back to normal order (C → B)" : "Sort alphabetically (A → G)"}
            className={`ml-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${
              alphabetical
                ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/15 text-[var(--color-ns-amber)]"
                : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            {alphabetical ? "A → G ✓" : "A → G"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chord type">
          <span className="mr-1 w-16 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
            Type
          </span>
          {(["all", ...CHORD_CATEGORIES] as const).map((cat) => (
            <FilterPill key={cat} selected={category === cat} onClick={() => setCategory(cat)}>
              {cat === "all" ? "All types" : cat}
              <span className="ml-1.5 text-[10px] opacity-60">{totalFor(cat)}</span>
            </FilterPill>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-[var(--color-ns-muted)]" aria-live="polite">
        {searching
          ? `${filtered.length} ${filtered.length === 1 ? "chord match" : "chords match"} “${query.trim()}”`
          : `Showing ${filtered.length} of ${ALL_CHORD_SYMBOLS.length} chords`}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-12 text-center text-sm text-[var(--color-ns-muted)]">
          No chords match “{query.trim()}”. Try a root plus type like <span className="font-semibold text-[var(--color-ns-text)]">Ebmaj7</span> or{" "}
          <span className="font-semibold text-[var(--color-ns-text)]">Gsus4</span>.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((chord) => (
            <ChordCard key={chord.label} chord={chord} view={view} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  selected,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
        selected
          ? "border border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)] font-bold shadow-sm"
          : "border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function ChordCard({ chord, view }: { chord: ParsedChord; view: View }) {
  const [voicingIndex, setVoicingIndex] = useState(0);
  const voicings = view === "guitar" ? getGuitarVoicings(chord) : [];
  const voicing = voicings[voicingIndex % Math.max(voicings.length, 1)];
  const notes = spellChord(chord);

  return (
    <div className="group flex flex-col items-center justify-between rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 sm:p-5 shadow-sm transition-all hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]">
      <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)] sm:text-xl">
        {chord.label.replace("#", "♯")}
      </h3>
      <p className="text-center text-[11px] capitalize text-[var(--color-ns-muted)]">
        {chordFullName(chord).replace("#", "♯")}
      </p>

      <div className="my-3 flex flex-1 items-center justify-center">
        {view === "guitar" && voicing && <GuitarChordDiagram voicing={voicing} />}
        {view === "ukulele" && <UkuleleChordDiagram frets={getUkuleleShape(chord)} />}
        {view === "piano" && <PianoRoll activePitchClasses={chordMidiNotes(chord).map((m) => m % 12)} />}
      </div>

      {view === "guitar" && voicings.length > 1 && (
        <div className="mb-2.5 flex items-center gap-1.5" role="group" aria-label={`${chord.label} voicings`}>
          {voicings.map((v, i) => (
            <button
              key={v.frets.join(",")}
              type="button"
              aria-label={`Voicing ${i + 1}: ${v.name}`}
              aria-pressed={i === voicingIndex}
              onClick={() => setVoicingIndex(i)}
              className={`h-2 rounded-full transition-all ${
                i === voicingIndex ? "w-5 bg-[var(--color-ns-amber)]" : "w-2 bg-[var(--color-ns-border)] hover:bg-[var(--color-ns-border-strong)]"
              }`}
            />
          ))}
        </div>
      )}

      <p className="mb-3 text-center font-mono text-[11px] text-[var(--color-ns-muted)]">{notes.join(" · ")}</p>

      <button
        type="button"
        onClick={() => {
          if (view === "guitar" && voicing) playStrummedShape(voicing.frets, "guitar", GUITAR_TUNING);
          else if (view === "ukulele") playStrummedShape(getUkuleleShape(chord), "ukulele", UKULELE_TUNING);
          else playChordLive(chord);
        }}
        className="flex items-center gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-ns-muted)] transition-all hover:border-[var(--color-ns-amber)]/60 hover:text-[var(--color-ns-text)] hover:bg-[var(--color-ns-card)] active:scale-95"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--color-ns-amber)]">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Play Audio
      </button>
    </div>
  );
}

