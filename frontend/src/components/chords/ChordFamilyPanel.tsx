import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { parseChordSymbol, qualityForSuffix, type ParsedChord, type EnharmonicMode } from "../../lib/chordTheory";
import {
  chordFamily,
  ALL_TONIC_ENTRIES,
  SCALE_FAMILIES,
  triadCounts,
  type FamilyChord,
  type HarmonicFunction,
  type Progression,
  type ScaleFamilyCategory,
} from "../../lib/chordFamily";
import { buildChordModel, type ChordSettings } from "../../lib/chords/model";
import { playModel } from "../../lib/chords/play";
import { findDefinition } from "../../lib/instruments/definitions";
import { ChordCard, FilterPill } from "./ChordCard";

/** "Bb" → "B♭", "F#m7b5" → "F♯m7b5", "bVII" → "♭VII", "#iv" → "♯iv". */
function pretty(text: string): string {
  if (!text) return "";
  return text
    .replace(/^([A-G])#/, "$1♯")
    .replace(/^([A-G])b/, "$1♭")
    .replace(/^b([ivIV])/, "♭$1")
    .replace(/^#([ivIV])/, "♯$1")
    .replace(/ ([A-G])#/g, " $1♯")
    .replace(/ ([A-G])b/g, " $1♭")
    .replace(/\/([A-G])#/g, "/$1♯")
    .replace(/\/([A-G])b/g, "/$1♭");
}

function toParsed(chord: FamilyChord): ParsedChord {
  const quality = qualityForSuffix(chord.suffix) ?? {
    suffix: chord.suffix,
    name: chord.name,
    category: "Triads",
    tones: [[0, 1], [4, 3], [7, 5]],
    optional: [],
  };
  return { root: chord.root, quality, label: chord.name };
}

const FUNCTION_STYLE: Record<HarmonicFunction, { text: string; bg: string; border: string }> = {
  tonic: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  subdominant: {
    text: "text-[var(--color-ns-amber)]",
    bg: "bg-[var(--color-ns-amber)]/10",
    border: "border-[var(--color-ns-amber)]/30",
  },
  dominant: {
    text: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
  },
};

type DiatonicChordView = "triads" | "sevenths" | "ninths";

export function ChordFamilyPanel({
  settings,
  onExploreChord,
}: {
  settings: ChordSettings;
  onExploreChord?: (symbol: string) => void;
}) {
  const [scaleCategory, setScaleCategory] = useState<ScaleFamilyCategory>("Core Major & Minor");
  const [scaleId, setScaleId] = useState<string>("major");
  const [tonic, setTonic] = useState("C");
  const [enharmonicMode, setEnharmonicMode] = useState<EnharmonicMode>("both");
  const [diatonicView, setDiatonicView] = useState<DiatonicChordView>("triads");
  const [selected, setSelected] = useState<FamilyChord | null>(null);

  // Audio Sequencer Player State
  const [playingProgression, setPlayingProgression] = useState<{ id: string; step: number } | null>(null);
  const playTimerRef = useRef<number | null>(null);

  const family = useMemo(() => chordFamily(tonic, scaleId), [tonic, scaleId]);
  const current = selected ?? family.triads[0] ?? { name: "C", numeral: "I", root: 0, suffix: "" };

  // Stop progression audio timer when unmounting or changing key/scale
  useEffect(() => {
    return () => {
      if (playTimerRef.current !== null) {
        window.clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [tonic, scaleId]);

  function stopProgression() {
    if (playTimerRef.current !== null) {
      window.clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    setPlayingProgression(null);
  }

  function handlePlayProgression(prog: Progression) {
    if (playingProgression?.id === prog.name) {
      stopProgression();
      return;
    }
    stopProgression();

    const definition = findDefinition(settings.definitionId) ?? findDefinition("guitar");
    if (!definition || prog.chords.length === 0) return;

    let step = 0;
    const chords = prog.chords;

    function runStep() {
      if (step >= chords.length) {
        setPlayingProgression(null);
        return;
      }
      const c = chords[step];
      setSelected(c);
      const parsed = toParsed(c);
      const def = definition ?? findDefinition("guitar");
      if (def) {
        const model = buildChordModel(parsed, def, settings);
        if (model) playModel(model);
      }

      setPlayingProgression({ id: prog.name, step });
      step++;
      playTimerRef.current = window.setTimeout(runStep, 1050);
    }

    runStep();
  }

  function selectChord(chord: FamilyChord) {
    setSelected(chord);
    const definition = findDefinition(settings.definitionId) ?? findDefinition("guitar");
    const model = definition ? buildChordModel(toParsed(chord), definition, settings) : null;
    if (model) playModel(model);
  }

  function goToKey(nextTonic: string, nextScaleId = scaleId) {
    stopProgression();
    setTonic(nextTonic);
    setScaleId(nextScaleId);
    setSelected(null);
  }

  const { sharps, flats } = family.signature;
  const accidentals = sharps.length ? sharps : flats;
  const signature = accidentals.length
    ? `${accidentals.length} ${sharps.length ? "sharp" : "flat"}${accidentals.length > 1 ? "s" : ""}: ${accidentals.map(pretty).join(" ")}`
    : "No sharps or flats";

  const counts = triadCounts(family.triads);
  const countText = [
    counts.major && `${counts.major} major`,
    counts.minor && `${counts.minor} minor`,
    counts.diminished && `${counts.diminished} diminished`,
    counts.augmented && `${counts.augmented} augmented`,
  ]
    .filter(Boolean)
    .join(" · ");

  // Category filters for scale selection
  const scalesInCategory = useMemo(() => {
    return SCALE_FAMILIES.filter((s) => s.category === scaleCategory);
  }, [scaleCategory]);

  const diatonicChords = diatonicView === "triads" ? family.triads : diatonicView === "sevenths" ? family.sevenths : family.ninths;

  // Group active diatonic chords by function
  const functionalGroups = useMemo(() => {
    const tonicGrp: FamilyChord[] = [];
    const subdominantGrp: FamilyChord[] = [];
    const dominantGrp: FamilyChord[] = [];

    diatonicChords.forEach((c) => {
      if (c.function === "tonic") tonicGrp.push(c);
      else if (c.function === "subdominant") subdominantGrp.push(c);
      else dominantGrp.push(c);
    });

    return { tonicGrp, subdominantGrp, dominantGrp };
  }, [diatonicChords]);

  const tonicChoices = useMemo(() => {
    return ALL_TONIC_ENTRIES.map((entry) => {
      const label = enharmonicMode === "sharps" ? entry.sharp : enharmonicMode === "flats" ? entry.flat : entry.label;
      const value = enharmonicMode === "flats" ? entry.flat : entry.sharp;
      return { pc: entry.pc, label: pretty(label), value };
    });
  }, [enharmonicMode]);

  return (
    <div>
      {/* 1. Scale Family Category & Mode Selector */}
      <div className="mb-6 space-y-3">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Scale Category">
          <span className="mr-1 w-16 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
            Category
          </span>
          {(["Core Major & Minor", "7 Diatonic Modes", "Harmonic & Melodic Modes", "Contemporary & Symmetric"] as ScaleFamilyCategory[]).map(
            (cat) => (
              <FilterPill
                key={cat}
                selected={scaleCategory === cat}
                onClick={() => {
                  setScaleCategory(cat);
                  const firstInCat = SCALE_FAMILIES.find((s) => s.category === cat);
                  if (firstInCat) setScaleId(firstInCat.id);
                }}
              >
                <span>{cat}</span>
              </FilterPill>
            )
          )}
        </div>

        {/* Specific Modes in Category */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Scale or Mode">
          <span className="mr-1 w-16 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
            Mode
          </span>
          {scalesInCategory.map((s) => (
            <FilterPill key={s.id} selected={scaleId === s.id} onClick={() => setScaleId(s.id)}>
              <span>{s.name}</span>
            </FilterPill>
          ))}
        </div>

        {/* Tonic & Enharmonic Row */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Key Tonic">
          <span className="mr-1 w-16 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
            Tonic
          </span>
          {tonicChoices.map((t) => {
            const isSelected = parseChordSymbol(tonic).root === t.pc;
            return (
              <FilterPill
                key={`${t.pc}-${t.value}`}
                selected={isSelected}
                onClick={() => goToKey(t.value)}
              >
                {t.label}
              </FilterPill>
            );
          })}

          {/* Enharmonic display selector */}
          <div className="ml-2 flex items-center gap-1 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-0.5">
            {(["sharps", "flats", "both"] as EnharmonicMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setEnharmonicMode(mode)}
                className={`rounded px-2 py-0.5 text-[0.625rem] font-semibold transition-all ${
                  enharmonicMode === mode
                    ? "bg-[var(--color-ns-amber)] font-bold text-[var(--color-ns-ink)] shadow-sm"
                    : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                }`}
              >
                {mode === "sharps" ? "♯ Sharps" : mode === "flats" ? "♭ Flats" : "Both"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-5">
          {/* Scale / Mode Hero Banner & Facts */}
          <section className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/10 px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-[var(--color-ns-amber)]">
                  {family.scaleFamily.category}
                </span>
                <h2 className="mt-1 font-heading text-xl font-bold text-[var(--color-ns-text)]">
                  {pretty(tonic)} {family.scaleFamily.name}
                </h2>
              </div>
              <div className="text-right">
                <span className="block font-mono text-xs font-semibold text-[var(--color-ns-muted)]">
                  Scale Formula: {family.scale.map(pretty).join(" · ")}
                </span>
              </div>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-[var(--color-ns-muted)]">
              {family.scaleFamily.description}
            </p>

            {/* Characteristic Note & Chord Badges */}
            {(family.scaleFamily.characteristicNote || family.scaleFamily.characteristicChord) && (
              <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-[var(--color-ns-border)]">
                {family.scaleFamily.characteristicNote && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300">
                    <span className="text-[0.6562rem] font-bold uppercase tracking-wider opacity-75">Characteristic Note:</span>
                    <span className="font-semibold">{family.scaleFamily.characteristicNote}</span>
                  </span>
                )}
                {family.scaleFamily.characteristicChord && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                    <span className="text-[0.6562rem] font-bold uppercase tracking-wider opacity-75">Characteristic Chord:</span>
                    <span className="font-semibold">{family.scaleFamily.characteristicChord}</span>
                  </span>
                )}
              </div>
            )}
          </section>

          {/* Quick Facts Grid */}
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
            <Fact label="Key signature" value={signature} />
            <Fact
              label={`Relative ${family.relative.mode}`}
              value={pretty(family.relative.name)}
              onClick={() => goToKey(family.relative.tonic, family.relative.mode === "minor" ? "natural_minor" : "major")}
            />
            <Fact
              label={`Parallel ${family.parallel.mode}`}
              value={pretty(family.parallel.name)}
              onClick={() => goToKey(family.parallel.tonic, family.parallel.mode === "minor" ? "natural_minor" : "major")}
            />
            <Fact label="Diatonic triads" value={`${family.triads.length} chords`} note={countText} />
          </div>

          {/* 2. Diatonic Family Grouped by Harmonic Function */}
          <Section
            title="Diatonic Chord Family & Harmonic Functions"
            subtitle="Chords grouped into the three primary functional pillars of Western and modal harmony."
            rightAction={
              <div className="flex items-center gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1">
                {(["triads", "sevenths", "ninths"] as DiatonicChordView[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDiatonicView(v)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      diatonicView === v
                        ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                        : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                    }`}
                  >
                    {v === "triads" ? "Triads" : v === "sevenths" ? "7th Chords" : "9th & Extensions"}
                  </button>
                ))}
              </div>
            }
          >
            <div className="grid gap-3.5 md:grid-cols-3">
              {/* Pillar 1: Tonic */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-heading text-xs font-bold uppercase tracking-wider text-emerald-400">
                    🏠 Tonic Function
                  </span>
                  <span className="text-[0.625rem] text-[var(--color-ns-muted)]">Home · Stability</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {functionalGroups.tonicGrp.map((c, i) => (
                    <ChordChip
                      key={`tonic-${i}`}
                      chord={c}
                      selected={current.name === c.name}
                      onClick={() => selectChord(c)}
                    />
                  ))}
                </div>
              </div>

              {/* Pillar 2: Subdominant / Predominant */}
              <div className="rounded-xl border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/5 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-ns-amber)]">
                    🚶 Predominant Function
                  </span>
                  <span className="text-[0.625rem] text-[var(--color-ns-muted)]">Motion · Departure</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {functionalGroups.subdominantGrp.map((c, i) => (
                    <ChordChip
                      key={`subdom-${i}`}
                      chord={c}
                      selected={current.name === c.name}
                      onClick={() => selectChord(c)}
                    />
                  ))}
                </div>
              </div>

              {/* Pillar 3: Dominant */}
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-heading text-xs font-bold uppercase tracking-wider text-rose-400">
                    ⚡ Dominant Function
                  </span>
                  <span className="text-[0.625rem] text-[var(--color-ns-muted)]">Tension · Pull</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {functionalGroups.dominantGrp.map((c, i) => (
                    <ChordChip
                      key={`dom-${i}`}
                      chord={c}
                      selected={current.name === c.name}
                      onClick={() => selectChord(c)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* 3. Secondary Dominants & Leading-Tone Chords */}
          <Section
            title="Secondary Dominants & Leading-Tone Chords"
            subtitle="Dominant 7th and diminished 7th chords that temporarily tonicize each diatonic scale degree."
          >
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--color-ns-text)]">
                  Secondary Dominant 7ths (V7/x)
                </p>
                <ChipRow>
                  {family.secondaryDominants.map((c, i) => (
                    <ChordChip
                      key={`sec-dom-${i}`}
                      chord={c}
                      selected={current.name === c.name}
                      onClick={() => selectChord(c)}
                    />
                  ))}
                </ChipRow>
              </div>

              {family.secondaryLeadingTones.length > 0 && (
                <div className="pt-2 border-t border-[var(--color-ns-border)]">
                  <p className="mb-1.5 text-xs font-semibold text-[var(--color-ns-text)]">
                    Secondary Leading-Tone Diminished 7ths (vii°7/x)
                  </p>
                  <ChipRow>
                    {family.secondaryLeadingTones.map((c, i) => (
                      <ChordChip
                        key={`sec-lt-${i}`}
                        chord={c}
                        selected={current.name === c.name}
                        onClick={() => selectChord(c)}
                      />
                    ))}
                  </ChipRow>
                </div>
              )}
            </div>
          </Section>

          {/* 4. Borrowed Chords (Modal Interchange) */}
          <Section
            title="Borrowed Chords (Modal Interchange)"
            subtitle={`Colourful harmonic substitutions borrowed from parallel modes to create unexpected emotional lifts.`}
          >
            <ChipRow>
              {family.allBorrowed.map((c, i) => (
                <ChordChip
                  key={`borrowed-${i}`}
                  chord={c}
                  selected={current.name === c.name}
                  onClick={() => selectChord(c)}
                />
              ))}
            </ChipRow>
          </Section>

          {/* 5. Tritone Substitutions */}
          <Section
            title="Tritone Substitutions (subV7)"
            subtitle="Chromatic dominant 7th chords that share the identical 3rd and 7th tritone guide-tones and resolve down by half-step."
          >
            <ChipRow>
              {family.tritoneSubs.map((c, i) => (
                <ChordChip
                  key={`tritone-${i}`}
                  chord={c}
                  selected={current.name === c.name}
                  onClick={() => selectChord(c)}
                />
              ))}
            </ChipRow>
          </Section>

          {/* 6. Interactive Cadences & Progression Player */}
          <Section
            title="Interactive Progressions & Cadences"
            subtitle="Tap 'Play Progression' to hear the chords sequentially with live visual tracking, or click any chord to inspect its diagram."
          >
            <div className="space-y-4">
              {family.allProgressions.map((p) => {
                const isPlaying = playingProgression?.id === p.name;
                return (
                  <div
                    key={p.name}
                    className={`rounded-xl border p-3 transition-colors ${
                      isPlaying
                        ? "border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)]/5"
                        : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]"
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-heading text-xs font-bold text-[var(--color-ns-text)] sm:text-sm">
                          {p.name}
                        </span>
                        {p.category && (
                          <span className="ml-2 rounded-full border border-[var(--color-ns-border)] px-2 py-0.5 text-[0.625rem] font-medium text-[var(--color-ns-muted)]">
                            {p.category}
                          </span>
                        )}
                        {p.description && (
                          <p className="mt-0.5 text-[0.6875rem] text-[var(--color-ns-muted)]">
                            {p.description}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePlayProgression(p)}
                        className={`flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all ${
                          isPlaying
                            ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-sm"
                            : "border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 text-[var(--color-ns-amber)] hover:bg-[var(--color-ns-amber)] hover:text-[var(--color-ns-ink)]"
                        }`}
                      >
                        <span>{isPlaying ? "⏹ Stop" : "▶ Play Progression"}</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {p.chords.map((c, i) => {
                        const isChordActive = isPlaying && playingProgression?.step === i;
                        return (
                          <div key={`${p.name}-${i}`} className="relative">
                            <ChordChip
                              chord={c}
                              selected={current.name === c.name}
                              isStepActive={isChordActive}
                              onClick={() => selectChord(c)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Classical Cadences */}
              <div className="pt-3 border-t border-[var(--color-ns-border)]">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                  Standard Classical & Gospel Cadences
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {family.cadences.map((cad) => {
                    const isPlaying = playingProgression?.id === cad.name;
                    return (
                      <div
                        key={cad.name}
                        className="flex flex-col justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div>
                            <span className="font-heading text-xs font-bold text-[var(--color-ns-text)]">
                              {cad.name}
                            </span>
                            <p className="text-[0.625rem] text-[var(--color-ns-muted)]">
                              {cad.description}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePlayProgression(cad)}
                            className="text-xs font-bold text-[var(--color-ns-amber)] hover:underline"
                          >
                            {isPlaying ? "Stop ⏹" : "Play ▶"}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          {cad.chords.map((c, idx) => (
                            <ChordChip
                              key={`${cad.name}-${idx}`}
                              chord={c}
                              selected={current.name === c.name}
                              isStepActive={isPlaying && playingProgression?.step === idx}
                              onClick={() => selectChord(c)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>

          {/* 7. Passing Chords & Capo Helper */}
          <Section
            title="Passing Chords"
            subtitle={`Chords that carry you from one chord to the next in ${pretty(family.key.name)}.`}
          >
            <div className="space-y-3">
              {family.passing.map((p) => (
                <div key={p.name}>
                  <p className="mb-1 text-xs font-semibold text-[var(--color-ns-text)]">{pretty(p.name)}</p>
                  <p className="mb-1.5 text-xs text-[var(--color-ns-muted)]">{p.note}</p>
                  <ChipRow>
                    {p.chords.map((c, idx) => (
                      <ChordChip
                        key={`${p.name}-${idx}`}
                        chord={c}
                        selected={current.name === c.name}
                        onClick={() => selectChord(c)}
                      />
                    ))}
                  </ChipRow>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Capo Helper" subtitle="Easier open-chord shapes that sound in this key.">
            <ul className="space-y-2 text-xs text-[var(--color-ns-muted)]">
              {family.capo.map((o) => (
                <li key={o.shapes} className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-3 py-2">
                  {o.capo === 0 ? (
                    <>
                      Play in shapes of <Strong>{o.shapes}</Strong> with <Strong>no capo</Strong> — it already is {pretty(o.sounds)}.
                    </>
                  ) : (
                    <>
                      Play in shapes of <Strong>{o.shapes}</Strong> with <Strong>capo {o.capo}</Strong> to sound in <Strong>{pretty(o.sounds)}</Strong>.
                    </>
                  )}
                </li>
              ))}
              {family.capo.length === 0 && <li>No open-chord key is within 7 frets of this one.</li>}
            </ul>
          </Section>
        </div>

        {/* Aside: Sticky Chord Card Preview */}
        <aside className="order-first lg:order-none">
          <div className="lg:sticky lg:top-24 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
                {pretty(current.numeral)} in {pretty(family.key.name)}
              </p>
              {onExploreChord && (
                <button
                  type="button"
                  onClick={() => onExploreChord(current.name)}
                  className="text-xs font-bold text-[var(--color-ns-amber)] hover:underline"
                >
                  Explore in Tab 3 →
                </button>
              )}
            </div>

            <ChordCard
              key={current.name}
              chord={toParsed(current)}
              settings={settings}
              onExplore={(c) => onExploreChord?.(c.label)}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function ChordChip({
  chord,
  selected,
  isStepActive,
  onClick,
}: {
  chord: FamilyChord;
  selected: boolean;
  isStepActive?: boolean;
  onClick: () => void;
}) {
  const funcStyle = chord.function ? FUNCTION_STYLE[chord.function] : null;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      title={chord.note ?? (chord.function ? `${chord.function} function` : undefined)}
      className={`group relative flex min-w-[4.75rem] flex-col items-center rounded-xl border px-3 py-2 transition-all ${
        isStepActive
          ? "ring-2 ring-[var(--color-ns-amber)] border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/25 scale-105 shadow-[0_0_12px_rgba(229,169,60,0.5)] z-10"
          : selected
          ? "border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)]/15 shadow-sm"
          : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]"
      }`}
    >
      {isStepActive && (
        <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-ns-amber)] text-[0.55rem] text-[var(--color-ns-ink)] font-bold animate-pulse">
          🔊
        </span>
      )}
      <span className="font-mono text-[0.6875rem] text-[var(--color-ns-muted)]">{pretty(chord.numeral)}</span>
      <span className="font-heading text-sm font-bold text-[var(--color-ns-text)] sm:text-base group-hover:text-[var(--color-ns-amber)] transition-colors">
        {pretty(chord.name)}
      </span>
      {chord.function && funcStyle && (
        <span className={`text-[0.6rem] font-semibold capitalize ${funcStyle.text}`}>{chord.function}</span>
      )}
      {chord.note && (
        <span className="mt-0.5 max-w-[8.5rem] text-center text-[0.59rem] leading-tight text-[var(--color-ns-dim)] truncate">
          {pretty(chord.note)}
        </span>
      )}
    </button>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Section({
  title,
  subtitle,
  rightAction,
  children,
}: {
  title: string;
  subtitle: string;
  rightAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-base font-bold text-[var(--color-ns-text)]">{title}</h2>
          <p className="mt-0.5 text-xs text-[var(--color-ns-muted)]">{subtitle}</p>
        </div>
        {rightAction}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, note, onClick }: { label: string; value: string; note?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="block text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">{label}</span>
      <span className="mt-1 block font-heading text-sm font-bold text-[var(--color-ns-text)]">{value}</span>
      {note && <span className="mt-0.5 block text-[0.6875rem] text-[var(--color-ns-muted)]">{note}</span>}
      {onClick && <span className="mt-0.5 block text-[0.6875rem] text-[var(--color-ns-amber)]">Open this key →</span>}
    </>
  );
  const cls = "rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 text-left shadow-sm";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-all hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-[var(--color-ns-text)]">{children}</span>;
}
