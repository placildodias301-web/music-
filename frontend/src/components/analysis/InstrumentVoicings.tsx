import { useMemo, useState } from "react";
import {
  chordFullName,
  chordMidiNotes,
  getGuitarVoicings,
  getUkuleleShape,
  parseChordSymbol,
  spellChord,
  GUITAR_TUNING,
  UKULELE_TUNING,
} from "../../lib/chordTheory";
import type { ParsedChord } from "../../lib/chordTheory";
import { playChordLive, playStrummedShape } from "../../lib/playChord";
import { chordColors, isVoiceableChord } from "../../lib/chordSync";
import { useNotation } from "../../lib/useNotation";
import { useSettings } from "../../lib/settings/settingsContext";
import type { Instrument } from "../../lib/settings/model";
import { GuitarChordDiagram } from "../GuitarChordDiagram";
import { UkuleleChordDiagram } from "../UkuleleChordDiagram";
import { PianoRoll } from "../PianoRoll";

export type InstrumentView = "guitar" | "ukulele" | "piano";

/** Primary instrument setting → the view that serves it (no bass or vocal diagrams yet). */
const VIEW_FOR: Record<Instrument, InstrumentView> = { guitar: "guitar", ukulele: "ukulele", piano: "piano", bass: "guitar", vocals: "piano" };

function Unavailable({ chord, view, label }: { chord: string; view: InstrumentView; label: string }) {
  return (
    <div className="flex h-[150px] w-[150px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-ns-border-strong)] p-3 text-center">
      <span className="text-[0.6875rem] font-semibold text-[var(--color-ns-muted)]">No verified {view} shape</span>
      <span className="mt-1 text-[0.625rem] leading-snug text-[var(--color-ns-dim)]">
        Wilsify won't guess a fingering for {label || chord}.
      </span>
    </div>
  );
}

function Diagram({ symbol, parsed, view, voicingIndex }: { symbol: string; parsed: ParsedChord | null; view: InstrumentView; voicingIndex: number }) {
  if (!parsed) return <Unavailable chord={symbol} view={view} label={symbol} />;
  if (view === "guitar") {
    const voicings = getGuitarVoicings(parsed);
    if (!voicings.length) return <Unavailable chord={symbol} view={view} label={symbol} />;
    return <GuitarChordDiagram voicing={voicings[Math.min(voicingIndex, voicings.length - 1)]} />;
  }
  if (view === "ukulele") return <UkuleleChordDiagram frets={getUkuleleShape(parsed)} />;
  return <PianoRoll activePitchClasses={chordMidiNotes(parsed).map((m) => m % 12)} />;
}

interface InstrumentVoicingsProps {
  /** Unique chords in order of first appearance. */
  chords: string[];
  /** Key the chords are in (for notation: flats/sharps by key, sargam Sa). */
  songKey: string;
  /** Chord sounding right now (null when paused in a gap or no audio). */
  playingChord: string | null;
  /** Chord picked elsewhere on the page (e.g. the timeline). */
  selectedChord: string | null;
  onSelectChord: (chord: string) => void;
}

/**
 * Chord shapes for the song's chords on guitar, ukulele or piano. A focus
 * panel follows the chord that's playing (or the one picked); the grid
 * below shows every chord in the song. Shapes come from chordTheory's
 * verified open/barre tables and constrained fretboard search — when no
 * playable shape exists, the panel says so rather than drawing a guess.
 */
export function InstrumentVoicings({ chords, songKey, playingChord, selectedChord, onSelectChord }: InstrumentVoicingsProps) {
  const { settings } = useSettings();
  const notation = useNotation(songKey);
  const displayChord = notation.chord;
  const [view, setView] = useState<InstrumentView>(() => VIEW_FOR[settings.display.instrument]);
  const [follow, setFollow] = useState(true);
  const [voicingByChord, setVoicingByChord] = useState<Record<string, number>>({});

  const parsed = useMemo(
    () => Object.fromEntries(chords.map((c) => [c, isVoiceableChord(c) ? parseChordSymbol(c) : null])) as Record<string, ParsedChord | null>,
    [chords]
  );

  const focus = (follow && playingChord) || selectedChord || chords[0] || null;
  const focusIdx = focus ? chords.indexOf(focus) : -1;
  const focusParsed = focus ? parsed[focus] ?? null : null;
  const guitarVoicings = focusParsed && view === "guitar" ? getGuitarVoicings(focusParsed) : [];
  const voicingIndex = focus ? voicingByChord[focus] ?? 0 : 0;

  function pick(chord: string) {
    // Picking by hand pauses "follow" so the panel doesn't jump away.
    if (playingChord) setFollow(false);
    onSelectChord(chord);
  }

  function step(delta: number) {
    if (!chords.length) return;
    const from = focusIdx < 0 ? 0 : focusIdx;
    pick(chords[(from + delta + chords.length) % chords.length]);
  }

  function hear() {
    if (!focusParsed) return;
    if (view === "guitar" && guitarVoicings.length) {
      playStrummedShape(guitarVoicings[Math.min(voicingIndex, guitarVoicings.length - 1)].frets, "guitar", GUITAR_TUNING);
    } else if (view === "ukulele") {
      playStrummedShape(getUkuleleShape(focusParsed), "ukulele", UKULELE_TUNING);
    } else {
      playChordLive(focusParsed);
    }
  }

  if (!chords.length) return null;

  return (
    <div className="mt-6 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">Interactive Instrument Voicings</h2>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
            Shapes for the {chords.length} unique chord{chords.length === 1 ? "" : "s"} in this track
            {playingChord ? " — following the song as it plays" : ""}
          </p>
          {notation.legend && <p className="mt-1 text-[0.6875rem] text-[var(--color-ns-muted)]">{notation.legend}</p>}
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1" role="tablist" aria-label="Instrument">
          {(["guitar", "ukulele", "piano"] as InstrumentView[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold capitalize transition-all ${
                view === v
                  ? "bg-[var(--color-ns-coral)] font-bold text-[var(--color-ns-ink)] shadow-sm"
                  : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Focus panel */}
      {focus && (
        <div className="grid gap-5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-4 sm:grid-cols-[auto_1fr] sm:p-5">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous chord"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            >
              ‹
            </button>
            <div className="flex min-h-[170px] min-w-[170px] items-center justify-center">
              <Diagram symbol={focus} parsed={focusParsed} view={view} voicingIndex={voicingIndex} />
            </div>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next chord"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            >
              ›
            </button>
          </div>

          <div className="flex min-w-0 flex-col justify-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-heading text-4xl font-extrabold" style={{ color: chordColors(focus).fg }}>
                {displayChord(focus)}
              </span>
              {focus === playingChord && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ns-purple)]/40 bg-[var(--color-ns-purple)]/15 px-2 py-0.5 text-[0.6562rem] font-semibold text-[var(--color-ns-purple-light)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-ns-purple-light)]" /> Playing now
                </span>
              )}
              <span className="text-[0.6875rem] text-[var(--color-ns-dim)]">
                {focusIdx + 1} / {chords.length}
              </span>
            </div>
            {focusParsed && (
              <>
                <p className="mt-1 text-sm capitalize text-[var(--color-ns-muted)]">{chordFullName(focusParsed).replace("#", "♯")}</p>
                <p className="mt-2 font-mono text-xs text-[var(--color-ns-text)]">{spellChord(focusParsed).join(" · ")}</p>
              </>
            )}

            {view === "guitar" && guitarVoicings.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {guitarVoicings.map((v, i) => (
                  <button
                    key={v.name + i}
                    type="button"
                    onClick={() => setVoicingByChord((prev) => ({ ...prev, [focus]: i }))}
                    className={`rounded-lg px-2.5 py-1 text-[0.6875rem] font-semibold transition-all ${
                      Math.min(voicingIndex, guitarVoicings.length - 1) === i
                        ? "bg-[var(--color-ns-coral)] text-[var(--color-ns-ink)]"
                        : "border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={hear}
                disabled={!focusParsed}
                className="btn-secondary py-1.5 text-xs"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Hear {view === "piano" ? "chord" : "strum"}
              </button>
              {playingChord && (
                <label className="inline-flex cursor-pointer items-center gap-2 text-[0.6875rem] font-medium text-[var(--color-ns-muted)]">
                  <input
                    type="checkbox"
                    checked={follow}
                    onChange={(e) => setFollow(e.target.checked)}
                    className="ns-check !h-4 !w-4"
                  />
                  Follow the song
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All chords in the song */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {chords.map((symbol) => {
          const isFocus = symbol === focus;
          const isPlaying = symbol === playingChord;
          return (
            <button
              key={symbol}
              type="button"
              onClick={() => pick(symbol)}
              aria-pressed={isFocus}
              className={`relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                isFocus
                  ? "border-[var(--color-ns-purple-light)] bg-[var(--color-ns-purple)]/10 shadow-[0_0_0_1px_rgba(139,92,246,0.5)]"
                  : "border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] hover:border-[var(--color-ns-border-strong)]"
              }`}
            >
              {isPlaying && (
                <span className="absolute right-2.5 top-2.5 h-2 w-2 animate-pulse rounded-full bg-[var(--color-ns-purple-light)]" aria-label="Playing now" />
              )}
              <span className="font-heading text-base font-bold" style={{ color: chordColors(symbol).fg }}>
                {displayChord(symbol)}
              </span>
              <Diagram symbol={symbol} parsed={parsed[symbol]} view={view} voicingIndex={voicingByChord[symbol] ?? 0} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
