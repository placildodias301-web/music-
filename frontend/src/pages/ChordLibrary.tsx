import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ALL_CHORD_SYMBOLS,
  CHORD_CATEGORIES,
  CHORD_QUALITIES,
  NOTE_NAMES,
  chordFullName,
  chordMidiNotes,
  enharmonicRoot,
  getGuitarVoicings,
  getUkuleleShape,
  parseChordSymbol,
  qualityForSuffix,
  spellChord,
  type ChordCategory,
  type ParsedChord,
} from "../lib/chordTheory";
import { GuitarChordDiagram } from "../components/GuitarChordDiagram";
import { UkuleleChordDiagram } from "../components/UkuleleChordDiagram";
import { PianoRoll } from "../components/PianoRoll";
import { playChordLive } from "../lib/playChord";

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

export function ChordLibrary() {
  const [view, setView] = useState<View>("guitar");
  const [query, setQuery] = useState("");
  const [root, setRoot] = useState<number | "all">(0);
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
    return ALL_CHORDS.filter(
      (c) => (root === "all" || c.root === root) && (category === "all" || c.quality.category === category)
    );
  }, [query, searching, root, category]);

  const qualitiesPerCategory = (cat: ChordCategory) => CHORD_QUALITIES.filter((q) => q.category === cat).length;
  const totalFor = (cat: ChordCategory | "all") =>
    (cat === "all" ? CHORD_QUALITIES.length : qualitiesPerCategory(cat)) * (root === "all" ? 12 : 1);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-light">
          Chord Dictionary & Diagrams
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-content sm:text-4xl">
          Chord Reference Library
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-content-muted">
          {ALL_CHORD_SYMBOLS.length} chords — {CHORD_QUALITIES.length} chord types in all 12 keys, from basic triads to
          altered jazz chords — with fingerings for guitar and ukulele, piano voicings and audio.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {(["guitar", "ukulele", "piano"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-all ${
                view === v
                  ? "bg-primary text-white shadow-[0_2px_12px_rgba(124,92,255,0.4)]"
                  : "border border-glass bg-white/[0.02] text-content-muted hover:border-glass-strong hover:text-content"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search all chords"
            placeholder="Search any chord (e.g. Bbm7, F#9, sus4)…"
            className="input-base py-2 pl-3 pr-8 text-xs"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-content-dim hover:text-content"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filters — ignored while searching, which always covers every chord. */}
      <div className={`mb-6 space-y-3 transition-opacity ${searching ? "pointer-events-none opacity-40" : ""}`} aria-disabled={searching}>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Root note">
          <span className="mr-1 w-16 text-[10.5px] font-bold uppercase tracking-[0.12em] text-content-dim">Root</span>
          <FilterPill selected={root === "all"} onClick={() => setRoot("all")}>
            All
          </FilterPill>
          {NOTE_NAMES.map((n, pc) => {
            const flat = enharmonicRoot(pc);
            return (
              <FilterPill key={n} selected={root === pc} onClick={() => setRoot(pc)} title={flat ? `${n} / ${flat}` : n}>
                {n.replace("#", "♯")}
                {flat && <span className="ml-1 text-[10px] opacity-60">{flat}</span>}
              </FilterPill>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chord type">
          <span className="mr-1 w-16 text-[10.5px] font-bold uppercase tracking-[0.12em] text-content-dim">Type</span>
          {(["all", ...CHORD_CATEGORIES] as const).map((cat) => (
            <FilterPill key={cat} selected={category === cat} onClick={() => setCategory(cat)}>
              {cat === "all" ? "All types" : cat}
              <span className="ml-1.5 text-[10px] opacity-60">{totalFor(cat)}</span>
            </FilterPill>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-content-dim" aria-live="polite">
        {searching
          ? `${filtered.length} ${filtered.length === 1 ? "chord matches" : "chords match"} “${query.trim()}”`
          : `Showing ${filtered.length} of ${ALL_CHORD_SYMBOLS.length} chords`}
      </p>

      {filtered.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-content-muted">
          No chord matches “{query.trim()}”. Try a root plus a type, like <span className="text-content">Ebmaj7</span> or{" "}
          <span className="text-content">Gsus4</span>.
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
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        selected
          ? "bg-primary/20 text-content ring-1 ring-primary/50"
          : "border border-glass bg-white/[0.02] text-content-muted hover:border-glass-strong hover:text-content"
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
    <div className="glass-card glass-card-hover flex flex-col items-center justify-between p-4 sm:p-5">
      <h3 className="font-heading text-lg font-bold text-content sm:text-xl">{chord.label.replace("#", "♯")}</h3>
      <p className="text-center text-[11px] capitalize text-content-dim">{chordFullName(chord).replace("#", "♯")}</p>

      <div className="my-2 flex flex-1 items-center justify-center">
        {view === "guitar" && voicing && <GuitarChordDiagram voicing={voicing} />}
        {view === "ukulele" && <UkuleleChordDiagram frets={getUkuleleShape(chord)} />}
        {view === "piano" && <PianoRoll activePitchClasses={chordMidiNotes(chord).map((m) => m % 12)} />}
      </div>

      {view === "guitar" && voicings.length > 1 && (
        <div className="mb-2 flex items-center gap-1.5" role="group" aria-label={`${chord.label} voicings`}>
          {voicings.map((v, i) => (
            <button
              key={v.frets.join(",")}
              type="button"
              aria-label={`Voicing ${i + 1}: ${v.name}`}
              aria-pressed={i === voicingIndex}
              onClick={() => setVoicingIndex(i)}
              className={`h-2 rounded-full transition-all ${
                i === voicingIndex ? "w-5 bg-primary-light" : "w-2 bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>
      )}

      <p className="mb-2 text-center font-mono text-[11px] text-content-muted">{notes.join(" · ")}</p>

      <button
        type="button"
        onClick={() => playChordLive(chord)}
        className="flex items-center gap-1.5 rounded-full border border-glass bg-white/[0.02] px-3 py-1 text-[11px] font-medium text-content-muted transition-all hover:border-primary/50 hover:bg-white/[0.06] hover:text-content active:scale-95"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Play Audio
      </button>
    </div>
  );
}
