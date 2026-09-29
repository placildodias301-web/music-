import { useState } from "react";
import { NOTE_NAMES, parseChordSymbol, getGuitarVoicings, getUkuleleShape, chordMidiNotes } from "../lib/chordTheory";
import { GuitarChordDiagram } from "../components/GuitarChordDiagram";
import { UkuleleChordDiagram } from "../components/UkuleleChordDiagram";
import { PianoRoll } from "../components/PianoRoll";
import { playChordLive } from "../lib/playChord";

type View = "guitar" | "ukulele" | "piano";

const ALL_CHORD_SYMBOLS = [
  ...NOTE_NAMES.map((n) => n),
  ...NOTE_NAMES.map((n) => `${n}m`),
];

export function ChordLibrary() {
  const [view, setView] = useState<View>("guitar");
  const [query, setQuery] = useState("");

  const filtered = ALL_CHORD_SYMBOLS.filter((symbol) =>
    symbol.toLowerCase().includes(query.trim().toLowerCase())
  );

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
          Static fingerings and audio voicings for all detectable major and minor chords across guitar, ukulele, and piano.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
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
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter chords by name"
            placeholder="Search chord (e.g. Am, G, F#m)…"
            className="input-base py-2 pl-3 pr-8 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-content-dim hover:text-content"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {filtered.map((symbol) => {
          const chord = parseChordSymbol(symbol);
          return (
            <div key={symbol} className="glass-card glass-card-hover flex flex-col items-center justify-between p-4 sm:p-5">
              <h3 className="font-heading text-lg sm:text-xl font-bold text-content">{symbol}</h3>

              <div className="my-2 flex flex-1 items-center justify-center">
                {view === "guitar" && <GuitarChordDiagram voicing={getGuitarVoicings(chord)[0]} />}
                {view === "ukulele" && <UkuleleChordDiagram frets={getUkuleleShape(chord)} />}
                {view === "piano" && (
                  <PianoRoll activePitchClasses={chordMidiNotes(chord).map((m) => m % 12)} />
                )}
              </div>

              <button
                type="button"
                onClick={() => playChordLive(chord)}
                className="mt-2 flex items-center gap-1.5 rounded-full border border-glass bg-white/[0.02] px-3 py-1 text-[11px] font-medium text-content-muted transition-all hover:border-primary/50 hover:bg-white/[0.06] hover:text-content active:scale-95"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Play Audio
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
