import { useState, useMemo } from "react";
import type { InstrumentDefinition } from "../../lib/instruments/definitions";
import { NOTE_NAMES, CHORD_QUALITIES } from "../../lib/chordTheory";
import { playSampledChord } from "../../lib/audio/soundfontPlayer";
import { playSinglePitch, stopAllAudio } from "../../lib/chords/play";

const SHARP_TO_FLAT_MAP: Record<string, string> = {
  "C#": "Db",
  "D#": "Eb",
  "F#": "Gb",
  "G#": "Ab",
  "A#": "Bb",
};

export type OrchestralViewMode = "single_notes" | "double_stops" | "arpeggios";

export interface OrchestralNoteItem {
  midi: number;
  noteName: string;
  octave: number;
  frequencyHz: number;
  writtenPitch?: { name: string; octave: number; label: string };
  violinFinger?: { stringName: string; position: string; finger: number };
  trumpetValves?: { valves: string; partial: string };
  tromboneSlide?: { position: number };
  woodwindFingering?: { keys: string };
}

// Valve combinations for 3-valve brass (Trumpet, Cornet, Euphonium, Tuba)
function getBrassValves(concertMidi: number, transpositionSemi = 2): { valves: string; partial: string } {
  const writtenMidi = concertMidi + transpositionSemi;
  const pc = ((writtenMidi % 12) + 12) % 12;
  const oct = Math.floor(writtenMidi / 12) - 1;

  let partial = "Fundamental";
  if (oct >= 5) partial = "5th/6th Partial";
  else if (oct === 4) partial = "3rd/4th Partial";
  else partial = "1st/2nd Partial";

  switch (pc) {
    case 0: return { valves: "Open (0)", partial }; // C
    case 1: return { valves: "1-2-3", partial }; // C#
    case 2: return { valves: writtenMidi < 62 ? "1-3" : "1", partial }; // D
    case 3: return { valves: "2-3", partial }; // Eb
    case 4: return { valves: "1-2", partial }; // E
    case 5: return { valves: "1", partial }; // F
    case 6: return { valves: "2", partial }; // F#
    case 7: return { valves: "Open (0)", partial }; // G
    case 8: return { valves: "2-3", partial }; // Ab
    case 9: return { valves: "1-2", partial }; // A
    case 10: return { valves: "1", partial }; // Bb
    case 11: return { valves: "2", partial }; // B
    default: return { valves: "Open (0)", partial };
  }
}

// Trombone 7 slide positions based on concert pitch
function getTrombonePosition(midi: number): { position: number } {
  const pc = ((midi % 12) + 12) % 12;
  // Fundamental positions on Bb tenor trombone
  const positions: Record<number, number> = {
    10: 1, // Bb
    9: 2,  // A
    8: 3,  // Ab
    7: 4,  // G
    6: 5,  // F#
    5: 6,  // F
    4: 7,  // E
    3: 1,  // Eb
    2: 2,  // D
    1: 3,  // Db
    0: 4,  // C
    11: 5, // B
  };
  return { position: positions[pc] ?? 1 };
}

// Bowed strings position & finger calculation
function getBowedStringFingering(
  midi: number,
  instId: string
): { stringName: string; position: string; finger: number } | null {
  // String definitions: low to high
  const stringsMap: Record<string, { names: string[]; midis: number[] }> = {
    violin: { names: ["G", "D", "A", "E"], midis: [55, 62, 69, 76] },
    viola: { names: ["C", "G", "D", "A"], midis: [48, 55, 62, 69] },
    cello: { names: ["C", "G", "D", "A"], midis: [36, 43, 50, 57] },
    "double-bass": { names: ["E", "A", "D", "G"], midis: [28, 33, 38, 43] },
    bass: { names: ["E", "A", "D", "G"], midis: [28, 33, 38, 43] },
  };

  const cur = stringsMap[instId] ?? stringsMap.violin;

  // Find the highest string that is <= midi
  let bestStringIdx = -1;
  for (let i = cur.midis.length - 1; i >= 0; i--) {
    if (midi >= cur.midis[i]) {
      bestStringIdx = i;
      break;
    }
  }

  if (bestStringIdx === -1) return null;

  const openMidi = cur.midis[bestStringIdx];
  const stringName = cur.names[bestStringIdx];
  const semitonesAboveOpen = midi - openMidi;

  if (semitonesAboveOpen === 0) {
    return { stringName, position: "Open String", finger: 0 };
  }

  if (semitonesAboveOpen <= 7) {
    const finger = semitonesAboveOpen <= 2 ? 1 : semitonesAboveOpen <= 4 ? 2 : semitonesAboveOpen <= 6 ? 3 : 4;
    return { stringName, position: "1st Position", finger };
  }

  if (semitonesAboveOpen <= 11) {
    const finger = ((semitonesAboveOpen - 4) % 4) + 1;
    return { stringName, position: "3rd Position", finger };
  }

  const finger = ((semitonesAboveOpen - 7) % 4) + 1;
  return { stringName, position: "5th Position", finger };
}

export function SingleNoteOrchestralView({
  definition,
  selectedRoot,
  viewMode,
  onModeChange,
  onExploreChord,
}: {
  definition: InstrumentDefinition;
  selectedRoot: number | "all";
  viewMode: OrchestralViewMode;
  onModeChange: (mode: OrchestralViewMode) => void;
  onExploreChord?: (symbol: string) => void;
}) {
  const [playingMidi, setPlayingMidi] = useState<number | null>(null);

  const isBowed = definition.category === "orchestral" || definition.id === "bass";
  const isWind = definition.category === "wind";
  const transpositionSemi = definition.transposition?.semitones ?? 0;
  const transpositionLabel = definition.transposition?.label ?? "";

  // Note range for instrument
  const rangeBounds = useMemo(() => {
    // Parse range from definition.range or fallback defaults
    const defaults: Record<string, { min: number; max: number }> = {
      violin: { min: 55, max: 88 },      // G3 to E7
      viola: { min: 48, max: 81 },       // C3 to A6
      cello: { min: 36, max: 69 },       // C2 to A5
      "double-bass": { min: 28, max: 55 },// E1 to G4
      trumpet: { min: 54, max: 86 },     // F#3 to D6
      cornet: { min: 54, max: 86 },
      flute: { min: 60, max: 96 },       // C4 to C7
      piccolo: { min: 74, max: 108 },    // D5 to C8
      recorder: { min: 72, max: 98 },    // C5 to D7
      clarinet: { min: 50, max: 89 },    // D3 to F6
      oboe: { min: 58, max: 93 },        // Bb3 to A6
      bassoon: { min: 34, max: 63 },     // Bb1 to Eb4
      "alto-sax": { min: 49, max: 81 },  // Db3 to A5
      "tenor-sax": { min: 44, max: 76 }, // Ab2 to E5
      "soprano-sax": { min: 56, max: 88 },// Ab3 to E6
      trombone: { min: 40, max: 72 },    // E2 to C5
      "french-horn": { min: 35, max: 77 },// B1 to F5
      tuba: { min: 26, max: 53 },        // D1 to F3
      harmonica: { min: 60, max: 84 },   // C4 to C6
    };
    return defaults[definition.id] ?? { min: 48, max: 84 };
  }, [definition.id]);

  // Generate chromatic notes in instrument range
  const allNotes = useMemo<OrchestralNoteItem[]>(() => {
    const list: OrchestralNoteItem[] = [];
    for (let midi = rangeBounds.min; midi <= rangeBounds.max; midi++) {
      const pc = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;
      const noteName = NOTE_NAMES[pc];
      const frequencyHz = 440 * Math.pow(2, (midi - 69) / 12);

      let writtenPitch: OrchestralNoteItem["writtenPitch"] = undefined;
      if (transpositionSemi !== 0) {
        const wMidi = midi + transpositionSemi;
        const wPc = ((wMidi % 12) + 12) % 12;
        const wOct = Math.floor(wMidi / 12) - 1;
        writtenPitch = {
          name: NOTE_NAMES[wPc],
          octave: wOct,
          label: `${transpositionLabel} Instrument`,
        };
      }

      const violinFinger = isBowed ? getBowedStringFingering(midi, definition.id) ?? undefined : undefined;
      const trumpetValves = isWind && (definition.id.includes("trumpet") || definition.id.includes("cornet"))
        ? getBrassValves(midi, transpositionSemi)
        : undefined;
      const tromboneSlide = definition.id === "trombone" ? getTrombonePosition(midi) : undefined;

      list.push({
        midi,
        noteName,
        octave,
        frequencyHz,
        writtenPitch,
        violinFinger,
        trumpetValves,
        tromboneSlide,
      });
    }
    return list;
  }, [rangeBounds, isBowed, isWind, definition.id, transpositionSemi, transpositionLabel]);

  // Filter notes by selectedRoot
  const filteredNotes = useMemo(() => {
    if (selectedRoot === "all") return allNotes;
    return allNotes.filter((n) => ((n.midi % 12) + 12) % 12 === selectedRoot);
  }, [allNotes, selectedRoot]);

  // Handle playing single note
  const handlePlaySingleNote = async (midi: number) => {
    stopAllAudio();
    setPlayingMidi(midi);

    try {
      const playedSample = await playSampledChord(definition.id, [midi]);
      if (!playedSample) {
        void playSinglePitch(midi, definition.id);
      }
    } catch {
      void playSinglePitch(midi, definition.id);
    } finally {
      setTimeout(() => setPlayingMidi(null), 600);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── ORCHESTRAL / MONOPHONIC MODE SWITCHER ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 shadow-sm">
        <div>
          <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-amber)]">
            {isWind ? "Monophonic Wind & Brass Navigation" : "Orchestral Bowed String Navigation"}
          </span>
          <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)] sm:text-xl">
            {definition.name} Performance Modes
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
            {isWind
              ? "Winds and brass produce one sounding pitch at a time. Explore chromatic notes across octaves or arpeggiated broken chords."
              : "Bowed strings play expressive single notes, double-stops across adjacent strings, or rolled arpeggios."}
          </p>
        </div>

        <div className="flex rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-xs">
          <button
            type="button"
            onClick={() => onModeChange("single_notes")}
            className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
              viewMode === "single_notes"
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            🎵 Single Notes ({filteredNotes.length})
          </button>
          {isBowed && (
            <button
              type="button"
              onClick={() => onModeChange("double_stops")}
              className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
                viewMode === "double_stops"
                  ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                  : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
              }`}
            >
              🎻 Double-Stops (Dyads)
            </button>
          )}
          <button
            type="button"
            onClick={() => onModeChange("arpeggios")}
            className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
              viewMode === "arpeggios"
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            🎼 Broken Chord Arpeggios
          </button>
        </div>
      </div>

      {/* ─── 1. SINGLE NOTES GRID ─── */}
      {viewMode === "single_notes" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-[var(--color-ns-muted)]">
            <span>
              Showing {filteredNotes.length} chromatic notes from{" "}
              <strong className="text-[var(--color-ns-text)]">{allNotes[0]?.noteName}{allNotes[0]?.octave}</strong> to{" "}
              <strong className="text-[var(--color-ns-text)]">{allNotes[allNotes.length - 1]?.noteName}{allNotes[allNotes.length - 1]?.octave}</strong>.
            </span>
            {transpositionSemi !== 0 && (
              <span className="rounded-md bg-[var(--color-ns-amber)]/10 px-2 py-0.5 text-[0.6875rem] font-bold text-[var(--color-ns-amber)]">
                Transposing in {transpositionLabel} (+{transpositionSemi} semitones written)
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filteredNotes.map((item) => {
              const isPlaying = playingMidi === item.midi;
              const flatEquivalent = SHARP_TO_FLAT_MAP[item.noteName] ?? item.noteName;

              return (
                <div
                  key={item.midi}
                  className="group flex flex-col justify-between rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 shadow-sm transition-all hover:border-[var(--color-ns-amber)]/50 hover:bg-[var(--color-ns-bg)]"
                >
                  <div>
                    {/* Header: Note Name & Octave */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-heading text-2xl font-black text-[var(--color-ns-amber)]">
                          {item.noteName.replace("#", "♯")}{item.octave}
                        </h4>
                        {flatEquivalent !== item.noteName && (
                          <span className="text-[0.6875rem] text-[var(--color-ns-muted)]">
                            {flatEquivalent.replace("b", "♭")}{item.octave}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[0.625rem] text-[var(--color-ns-dim)]">
                        MIDI {item.midi}
                      </span>
                    </div>

                    {/* Exact Frequency */}
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-[0.6875rem] text-[var(--color-ns-muted)]">Frequency:</span>
                      <span className="font-mono text-xs font-bold text-[var(--color-ns-text)]">
                        {item.frequencyHz.toFixed(1)} Hz
                      </span>
                    </div>

                    {/* Written pitch for transposing instruments */}
                    {item.writtenPitch && (
                      <div className="mt-2 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-2.5 py-1.5 text-xs">
                        <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Written Note:</span>
                        <p className="font-mono font-bold text-[var(--color-ns-amber)]">
                          {item.writtenPitch.name.replace("#", "♯")}{item.writtenPitch.octave}
                        </p>
                      </div>
                    )}

                    {/* Bowed Strings: String & Position & Finger */}
                    {item.violinFinger && (
                      <div className="mt-2.5 space-y-1 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-2 text-[0.6875rem]">
                        <div className="flex justify-between">
                          <span className="text-[var(--color-ns-muted)]">String:</span>
                          <strong className="text-[var(--color-ns-text)]">{item.violinFinger.stringName} string</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--color-ns-muted)]">Position:</span>
                          <span className="text-[var(--color-ns-amber)] font-semibold">{item.violinFinger.position}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--color-ns-muted)]">Finger:</span>
                          <strong className="text-[var(--color-ns-text)]">{item.violinFinger.finger === 0 ? "0 (Open)" : `Finger ${item.violinFinger.finger}`}</strong>
                        </div>
                      </div>
                    )}

                    {/* Trumpet Valves */}
                    {item.trumpetValves && (
                      <div className="mt-2.5 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-2 text-xs">
                        <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Valves to Press:</span>
                        <p className="font-mono text-sm font-black text-[var(--color-ns-amber)]">
                          {item.trumpetValves.valves}
                        </p>
                        <span className="text-[0.625rem] text-[var(--color-ns-dim)]">{item.trumpetValves.partial}</span>
                      </div>
                    )}

                    {/* Trombone Slide Position */}
                    {item.tromboneSlide && (
                      <div className="mt-2.5 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-2 text-xs">
                        <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Slide Position:</span>
                        <p className="font-mono text-base font-black text-[var(--color-ns-amber)]">
                          Position {item.tromboneSlide.position}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Play Note Button */}
                  <div className="mt-4 border-t border-[var(--color-ns-border)]/60 pt-3">
                    <button
                      type="button"
                      onClick={() => handlePlaySingleNote(item.midi)}
                      disabled={isPlaying}
                      className={`flex w-full items-center justify-center gap-1.5 rounded-xl border py-1.5 text-xs font-bold transition-all ${
                        isPlaying
                          ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                          : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)] hover:text-[var(--color-ns-amber)]"
                      }`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      {isPlaying ? "Playing..." : `Play Note`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 2. BROKEN CHORD ARPEGGIOS ─── */}
      {viewMode === "arpeggios" && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-ns-muted)]">
            Essential broken-chord arpeggios playable across the physical range of {definition.name}.
          </p>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {CHORD_QUALITIES.slice(0, 12).map((quality) => {
              const rootPc = selectedRoot === "all" ? 0 : selectedRoot;
              const rootName = NOTE_NAMES[rootPc];
              const symbol = `${rootName}${quality.suffix}`;
              const chordTones = quality.tones.map(([semi, interval]) => {
                const notePc = (rootPc + semi) % 12;
                return { noteName: NOTE_NAMES[notePc], interval };
              });
              const arpeggioMidis = quality.tones
                .map(([semi]) => rangeBounds.min + ((rootPc - (rangeBounds.min % 12) + 12) % 12) + semi)
                .filter((m) => m >= rangeBounds.min && m <= rangeBounds.max);

              return (
                <div
                  key={quality.suffix}
                  className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
                        {symbol}
                      </h4>
                      <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
                        {quality.name}
                      </p>
                    </div>
                    {onExploreChord && (
                      <button
                        type="button"
                        onClick={() => onExploreChord(symbol)}
                        className="rounded-lg border border-[var(--color-ns-border)] px-2.5 py-1 text-[0.625rem] font-bold text-[var(--color-ns-muted)] hover:border-[var(--color-ns-amber)] hover:text-[var(--color-ns-amber)]"
                      >
                        Workbench →
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-xs">
                    {chordTones.map((t, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-[var(--color-ns-bg)] px-2 py-0.5 border border-[var(--color-ns-border)] text-[0.6875rem] text-[var(--color-ns-text)]"
                      >
                        {t.noteName} <span className="opacity-60 text-[0.6rem]">({t.interval})</span>
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 border-t border-[var(--color-ns-border)]/60 pt-3">
                    <button
                      type="button"
                      onClick={() => handlePlaySingleNote(arpeggioMidis[0] ?? rangeBounds.min)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] py-1.5 text-xs font-bold text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)] hover:text-[var(--color-ns-amber)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Play Chord Arpeggio
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
