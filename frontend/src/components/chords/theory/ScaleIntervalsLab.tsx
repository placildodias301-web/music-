import { useState, useMemo } from "react";
import { NOTE_NAMES } from "../../../lib/chordTheory";
import { playSinglePitch, stopAllAudio } from "../../../lib/chords/play";
import { getAllScales, spellScaleTheoretically, type ScaleDefinition } from "../../../lib/theory/scales";
import { CustomSelect } from "../../CustomSelect";

export interface IntervalEntry {
  semitones: number;
  shortName: string;
  fullName: string;
  inversion: string;
  consonance: "Perfect Consonance" | "Imperfect Consonance" | "Mild Dissonance" | "Sharp Dissonance";
  songReference: string;
  emotion: string;
}

export const COMPLETE_INTERVALS: IntervalEntry[] = [
  { semitones: 0, shortName: "P1", fullName: "Perfect Unison", inversion: "P8 (Octave)", consonance: "Perfect Consonance", songReference: "Same Note repeated", emotion: "Complete identity, rest" },
  { semitones: 1, shortName: "m2", fullName: "Minor Second (Half Step)", inversion: "M7 (Major Seventh)", consonance: "Sharp Dissonance", songReference: "Jaws Theme, Für Elise opening", emotion: "Maximum tension, menacing, claustrophobic" },
  { semitones: 2, shortName: "M2", fullName: "Major Second (Whole Step)", inversion: "m7 (Minor Seventh)", consonance: "Mild Dissonance", songReference: "Happy Birthday, Frère Jacques", emotion: "Stepwise motion, gentle momentum" },
  { semitones: 3, shortName: "m3", fullName: "Minor Third", inversion: "M6 (Major Sixth)", consonance: "Imperfect Consonance", songReference: "Greensleeves, Smoke on the Water", emotion: "Melancholic, bluesy, introspective" },
  { semitones: 4, shortName: "M3", fullName: "Major Third", inversion: "m6 (Minor Sixth)", consonance: "Imperfect Consonance", songReference: "When the Saints Go Marching In, Kumbaya", emotion: "Bright, joyful, foundational warmth" },
  { semitones: 5, shortName: "P4", fullName: "Perfect Fourth", inversion: "P5 (Perfect Fifth)", consonance: "Perfect Consonance", songReference: "Here Comes the Bride, Amazing Grace", emotion: "Anthemic, stately, preparatory suspension" },
  { semitones: 6, shortName: "TT", fullName: "Tritone (Dim 5th / Aug 4th)", inversion: "TT (Self-Inverting)", consonance: "Sharp Dissonance", songReference: "The Simpsons Theme, Maria (West Side Story)", emotion: "Instability, devil in music (Diabolus in Musica)" },
  { semitones: 7, shortName: "P5", fullName: "Perfect Fifth", inversion: "P4 (Perfect Fourth)", consonance: "Perfect Consonance", songReference: "Star Wars Theme, Twinkle Twinkle Little Star", emotion: "Heroic, open, hollow power chord clarity" },
  { semitones: 8, shortName: "m6", fullName: "Minor Sixth", inversion: "M3 (Major Third)", consonance: "Imperfect Consonance", songReference: "The Entertainer, Conquest of Paradise", emotion: "Bittersweet, dramatic tragedy" },
  { semitones: 9, shortName: "M6", fullName: "Major Sixth", inversion: "m3 (Minor Third)", consonance: "Imperfect Consonance", songReference: "NBC Chime, My Bonnie Lies Over the Ocean", emotion: "Sweet nostalgia, warm optimism" },
  { semitones: 10, shortName: "m7", fullName: "Minor Seventh", inversion: "M2 (Major Second)", consonance: "Mild Dissonance", songReference: "Somewhere (West Side Story), The Winner Takes It All", emotion: "Dominant yearning, soul, blues desire" },
  { semitones: 11, shortName: "M7", fullName: "Major Seventh", inversion: "m2 (Minor Second)", consonance: "Sharp Dissonance", songReference: "Take On Me (chorus leap), Superman Theme", emotion: "Dreamy longing, ethereal jazz sophistication" },
  { semitones: 12, shortName: "P8", fullName: "Perfect Octave", inversion: "P1 (Unison)", consonance: "Perfect Consonance", songReference: "Somewhere Over the Rainbow", emotion: "Pure acoustic resonance, completeness" },
  { semitones: 13, shortName: "♭9", fullName: "Minor Ninth (Compound m2)", inversion: "M7", consonance: "Sharp Dissonance", songReference: "Flamenco Phrygian dominant leaps", emotion: "Exotic tension, dark alter dominant color" },
  { semitones: 14, shortName: "9", fullName: "Major Ninth (Compound M2)", inversion: "m7", consonance: "Mild Dissonance", songReference: "Every Breath You Take (riff 9ths)", emotion: "Lush pop clarity, open expansive jazz extension" },
  { semitones: 15, shortName: "♯9", fullName: "Augmented Ninth (Hendrix)", inversion: "M6", consonance: "Sharp Dissonance", songReference: "Purple Haze (Hendrix Chord E7#9)", emotion: "Gritty blues bite, psychedelic clash" },
  { semitones: 17, shortName: "11", fullName: "Perfect Eleventh (Compound P4)", inversion: "P5", consonance: "Mild Dissonance", songReference: "Maiden Voyage (Herbie Hancock)", emotion: "Modern quartal suspended floating color" },
  { semitones: 18, shortName: "♯11", fullName: "Augmented Eleventh (Lydian)", inversion: "TT", consonance: "Mild Dissonance", songReference: "The Simpsons opening chord", emotion: "Ethereal space, cosmic cinematic shimmer" },
  { semitones: 20, shortName: "♭13", fullName: "Minor Thirteenth (Compound m6)", inversion: "M3", consonance: "Mild Dissonance", songReference: "Jazz Altered dominant cadence", emotion: "Heartbreaking bebop tension" },
  { semitones: 21, shortName: "13", fullName: "Major Thirteenth (Compound M6)", inversion: "m3", consonance: "Imperfect Consonance", songReference: "Steely Dan, Bill Evans voicings", emotion: "Peak sophistication, vibrant harmonic richness" },
];

export function ScaleIntervalsLab() {
  const [subTab, setSubTab] = useState<"intervals" | "scales">("scales");

  // Interval State
  const [rootPc, setRootPc] = useState<number>(0); // 0 = C
  const [selectedIntervalIndex, setSelectedIntervalIndex] = useState<number>(7); // P5 default
  const [playingInterval, setPlayingInterval] = useState<boolean>(false);

  // Scale State
  const [scaleRoot, setScaleRoot] = useState<string>("C");
  const [selectedScaleId, setSelectedScaleId] = useState<string>("major");
  const [playingScale, setPlayingScale] = useState<boolean>(false);

  const activeInterval = COMPLETE_INTERVALS[selectedIntervalIndex] ?? COMPLETE_INTERVALS[0];
  const rootMidi = 60 + rootPc; // C4 + root
  const targetMidi = rootMidi + activeInterval.semitones;
  const targetPc = targetMidi % 12;

  // Scales list
  const allScales = useMemo(() => getAllScales(), []);
  const activeScale = useMemo<ScaleDefinition>(
    () => allScales.find((s) => s.id === selectedScaleId) ?? allScales[0],
    [allScales, selectedScaleId]
  );

  const spelledNotes = useMemo(() => {
    try {
      return spellScaleTheoretically(scaleRoot, activeScale);
    } catch {
      return activeScale.intervals.map((semi) => NOTE_NAMES[(0 + semi) % 12]);
    }
  }, [scaleRoot, activeScale]);

  // Audio: Play Interval
  const handlePlayInterval = async (type: "melodic-up" | "melodic-down" | "harmonic") => {
    stopAllAudio();
    setPlayingInterval(true);

    try {
      if (type === "melodic-up") {
        void playSinglePitch(rootMidi, "piano");
        await new Promise((r) => setTimeout(r, 600));
        void playSinglePitch(targetMidi, "piano");
      } else if (type === "melodic-down") {
        void playSinglePitch(targetMidi, "piano");
        await new Promise((r) => setTimeout(r, 600));
        void playSinglePitch(rootMidi, "piano");
      } else {
        void playSinglePitch(rootMidi, "piano");
        void playSinglePitch(targetMidi, "piano");
      }
    } catch {
      // Fallback
    } finally {
      setTimeout(() => setPlayingInterval(false), 900);
    }
  };

  // Audio: Play Full Scale
  const handlePlayScale = async () => {
    stopAllAudio();
    setPlayingScale(true);

    try {
      const rootOffset = NOTE_NAMES.indexOf(scaleRoot.replace("b", "#") as any) >= 0
        ? NOTE_NAMES.indexOf(scaleRoot.replace("b", "#") as any)
        : 0;
      const baseMidi = 60 + rootOffset;

      // Ascending
      for (const semi of activeScale.intervals) {
        void playSinglePitch(baseMidi + semi, "piano");
        await new Promise((r) => setTimeout(r, 260));
      }
      // Top octave note
      void playSinglePitch(baseMidi + 12, "piano");
      await new Promise((r) => setTimeout(r, 380));

      // Descending
      const reversed = [...activeScale.intervals].reverse();
      for (const semi of reversed) {
        void playSinglePitch(baseMidi + semi, "piano");
        await new Promise((r) => setTimeout(r, 240));
      }
    } catch {
      // Fallback
    } finally {
      setPlayingScale(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-4">
        <div>
          <h3 className="font-heading text-lg font-bold text-[var(--color-ns-text)] sm:text-xl">
            Intervals, Scales & Modes Laboratory
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">
            Explore harmonic distances, ear-training song associations, and 35+ scales with keyboard and neck fingerings.
          </p>
        </div>

        <div className="flex rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-xs">
          <button
            type="button"
            onClick={() => setSubTab("scales")}
            className={`rounded-lg px-4 py-1.5 font-bold transition-all ${
              subTab === "scales"
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            Scale & Mode Encyclopedia (35+ Scales)
          </button>
          <button
            type="button"
            onClick={() => setSubTab("intervals")}
            className={`rounded-lg px-4 py-1.5 font-bold transition-all ${
              subTab === "intervals"
                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            Intervals & Ear Training Lab
          </button>
        </div>
      </div>

      {/* ─── 1. SCALE ENCYCLOPEDIA (35+ Scales) ─── */}
      {subTab === "scales" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-ns-border)] pb-4">
              {/* Root selector */}
              <div>
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                  Scale Tonic:
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {NOTE_NAMES.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setScaleRoot(name)}
                      className={`h-7 px-2.5 rounded-lg font-mono text-xs font-bold transition-all ${
                        scaleRoot === name
                          ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-black shadow-sm"
                          : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scale selector */}
              <div className="w-full sm:w-72">
                <span className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                  Choose Scale / Mode:
                </span>
                <CustomSelect
                  value={selectedScaleId}
                  onChange={(v) => setSelectedScaleId(String(v))}
                  options={allScales.map((s) => ({
                    value: s.id,
                    label: s.name,
                    group: s.category,
                  }))}
                />
              </div>
            </div>

            {/* Active Scale Profile Hero */}
            <div className="mt-5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-3">
                <div>
                  <h4 className="font-heading text-2xl font-black text-[var(--color-ns-amber)]">
                    {scaleRoot} {activeScale.name}
                  </h4>
                  <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
                    {activeScale.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handlePlayScale}
                  disabled={playingScale}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all ${
                    playingScale
                      ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)]"
                      : "border-[var(--color-ns-amber)] bg-[var(--color-ns-card)] text-[var(--color-ns-amber)] hover:bg-[var(--color-ns-amber)] hover:text-[var(--color-ns-ink)]"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  {playingScale ? "Playing Scale..." : "Play Scale Audio"}
                </button>
              </div>

              {/* Theoretical Spelled Notes */}
              <div className="mt-4">
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                  Scale Degrees & Notes:
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {spelledNotes.map((note, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col items-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-4 py-2"
                    >
                      <span className="font-mono text-lg font-black text-[var(--color-ns-amber)]">
                        {note}
                      </span>
                      <span className="text-[0.6875rem] font-bold text-[var(--color-ns-muted)]">
                        {activeScale.formula[idx] ?? `+${activeScale.intervals[idx]}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Guitar Box Position / Piano Fingerings Info */}
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3.5">
                  <span className="font-heading font-bold text-[var(--color-ns-text)]">
                    🎸 Guitar Box & Position Fingerings:
                  </span>
                  <p className="mt-1 leading-relaxed text-[var(--color-ns-muted)]">
                    Standard 5-box CAGED pattern system applies. Root on 6th string (E) anchors Box 1; root on 5th string (A) anchors Box 3. Use strict alternate picking (Down-Up) or 3-Notes-Per-String (3NPS) economy picking.
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3.5">
                  <span className="font-heading font-bold text-[var(--color-ns-text)]">
                    🎹 Piano RH / LH Scale Fingerings:
                  </span>
                  <p className="mt-1 leading-relaxed text-[var(--color-ns-muted)]">
                    Right Hand: 1 - 2 - 3 (Thumb under) - 1 - 2 - 3 - 4 - 5.<br />
                    Left Hand: 5 - 4 - 3 - 2 - 1 (3rd finger cross) - 3 - 2 - 1.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. INTERVALS & EAR TRAINING LAB ─── */}
      {subTab === "intervals" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-ns-border)] pb-4">
              <div>
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                  Interval Tonic:
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {NOTE_NAMES.map((name, i) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setRootPc(i)}
                      className={`h-7 px-2.5 rounded-lg font-mono text-xs font-bold transition-all ${
                        rootPc === i
                          ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-black"
                          : "border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handlePlayInterval("melodic-up")}
                  disabled={playingInterval}
                  className="rounded-xl border border-[var(--color-ns-amber)] bg-[var(--color-ns-card)] px-3 py-1.5 text-xs font-bold text-[var(--color-ns-amber)] hover:bg-[var(--color-ns-amber)] hover:text-[var(--color-ns-ink)]"
                >
                  ▶ Melodic (Up)
                </button>
                <button
                  type="button"
                  onClick={() => handlePlayInterval("melodic-down")}
                  disabled={playingInterval}
                  className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-1.5 text-xs font-bold text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)]"
                >
                  ◀ Melodic (Down)
                </button>
                <button
                  type="button"
                  onClick={() => handlePlayInterval("harmonic")}
                  disabled={playingInterval}
                  className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-1.5 text-xs font-bold text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)]"
                >
                  ♫ Harmonic (Together)
                </button>
              </div>
            </div>

            {/* Active Interval Card */}
            <div className="mt-5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-amber)]">
                    {activeInterval.shortName} ({activeInterval.semitones} semitones)
                  </span>
                  <h4 className="font-heading text-2xl font-black text-[var(--color-ns-text)]">
                    {activeInterval.fullName}
                  </h4>
                  <div className="mt-1 font-mono text-base font-bold text-[var(--color-ns-amber)]">
                    {NOTE_NAMES[rootPc]} → {NOTE_NAMES[targetPc]}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-4 py-2 text-right">
                  <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Rule of 9 Inversion</span>
                  <p className="font-mono text-sm font-bold text-[var(--color-ns-text)]">
                    {activeInterval.inversion}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3">
                  <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Consonance Class</span>
                  <p className="mt-1 font-semibold text-[var(--color-ns-text)]">{activeInterval.consonance}</p>
                </div>
                <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3">
                  <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Song Ear-Training Hook</span>
                  <p className="mt-1 font-semibold text-[var(--color-ns-amber)]">{activeInterval.songReference}</p>
                </div>
                <div className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3">
                  <span className="text-[0.625rem] font-bold uppercase text-[var(--color-ns-muted)]">Emotional Vibe</span>
                  <p className="mt-1 font-semibold text-[var(--color-ns-text)]">{activeInterval.emotion}</p>
                </div>
              </div>
            </div>

            {/* Interval Selector Strip */}
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {COMPLETE_INTERVALS.map((item, idx) => (
                <button
                  key={item.shortName}
                  type="button"
                  onClick={() => setSelectedIntervalIndex(idx)}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                    selectedIntervalIndex === idx
                      ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/10 ring-1 ring-[var(--color-ns-amber)]"
                      : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] hover:border-[var(--color-ns-amber)]/40"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-heading font-black text-sm text-[var(--color-ns-text)]">
                      {item.shortName}
                    </span>
                    <span className="font-mono text-[0.625rem] text-[var(--color-ns-muted)]">
                      {item.semitones}st
                    </span>
                  </div>
                  <span className="mt-1 line-clamp-1 text-[0.6875rem] font-medium text-[var(--color-ns-muted)]">
                    {item.fullName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
