import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { parseChordSymbol, qualityForSuffix, type ParsedChord } from "../../lib/chordTheory";
import {
  chordFamily,
  MAJOR_TONICS,
  MINOR_TONICS,
  triadCounts,
  type FamilyChord,
  type HarmonicFunction,
  type Mode,
} from "../../lib/chordFamily";
import { buildChordModel, type ChordSettings } from "../../lib/chords/model";
import { playModel } from "../../lib/chords/play";
import { findDefinition } from "../../lib/instruments/definitions";
import { ChordCard, FilterPill } from "./ChordCard";

/** "Bb" → "B♭", "F#m7b5" → "F♯m7b5", "bVII" → "♭VII" (only the accidental after a letter or before a numeral). */
function pretty(text: string): string {
  return text
    .replace(/^([A-G])#/, "$1♯")
    .replace(/^([A-G])b/, "$1♭")
    .replace(/^b([IV])/, "♭$1")
    .replace(/ ([A-G])#/g, " $1♯")
    .replace(/ ([A-G])b/g, " $1♭");
}

function toParsed(chord: FamilyChord): ParsedChord {
  return { root: chord.root, quality: qualityForSuffix(chord.suffix)!, label: chord.name };
}

/** The picker's spelling of a key tonic (F# major's relative is D# minor; the picker offers E♭ minor). */
function pickerTonic(tonic: string, mode: Mode): string {
  const pc = parseChordSymbol(tonic).root;
  const list = mode === "major" ? MAJOR_TONICS : MINOR_TONICS;
  return list.find((t) => parseChordSymbol(t).root === pc) ?? tonic;
}

const FUNCTION_STYLE: Record<HarmonicFunction, string> = {
  tonic: "text-[var(--color-ns-mint)]",
  subdominant: "text-[var(--color-ns-amber)]",
  dominant: "text-[var(--color-ns-coral)]",
};

export function ChordFamilyPanel({ settings }: { settings: ChordSettings }) {
  const [mode, setMode] = useState<Mode>("major");
  const [tonic, setTonic] = useState("G");
  const [setIndex, setSetIndex] = useState(0);
  const [selected, setSelected] = useState<FamilyChord | null>(null);
  const family = useMemo(() => chordFamily(tonic, mode), [tonic, mode]);

  const set = family.minorSets?.[setIndex] ?? { name: "Major", scale: family.scale, triads: family.triads, sevenths: family.sevenths, passing: family.passing };
  const current = selected ?? family.triads[0];

  function goToKey(nextTonic: string, nextMode: Mode) {
    setTonic(pickerTonic(nextTonic, nextMode));
    setMode(nextMode);
    setSetIndex(0);
    setSelected(null);
  }

  function open(chord: FamilyChord) {
    setSelected(chord);
    const definition = findDefinition(settings.definitionId);
    const model = definition ? buildChordModel(toParsed(chord), definition, settings) : null;
    if (model) playModel(model);
  }

  const chip = (chord: FamilyChord, i: number) => (
    <ChordChip key={`${chord.numeral}-${i}`} chord={chord} selected={current.name === chord.name} onClick={() => open(chord)} />
  );

  const { sharps, flats } = family.signature;
  const accidentals = sharps.length ? sharps : flats;
  const signature = accidentals.length
    ? `${accidentals.length} ${sharps.length ? "sharp" : "flat"}${accidentals.length > 1 ? "s" : ""}: ${accidentals.map(pretty).join(" ")}`
    : "No sharps or flats";
  const counts = triadCounts(set.triads);
  const countText = [
    counts.major && `${counts.major} major`,
    counts.minor && `${counts.minor} minor`,
    counts.diminished && `${counts.diminished} diminished`,
    counts.augmented && `${counts.augmented} augmented`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      {/* Key picker */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mode">
          <span className="mr-1 w-16 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">Mode</span>
          {(["major", "minor"] as Mode[]).map((m) => (
            <FilterPill key={m} selected={mode === m} onClick={() => goToKey(tonic, m)}>
              <span className="capitalize">{m}</span>
            </FilterPill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Key">
          <span className="mr-1 w-16 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">Key</span>
          {(mode === "major" ? MAJOR_TONICS : MINOR_TONICS).map((t) => (
            <FilterPill key={t} selected={tonic === t} onClick={() => goToKey(t, mode)}>
              {pretty(t)}
              {mode === "minor" && "m"}
            </FilterPill>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-5">
          {/* Key facts */}
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
            <Fact label="Key signature" value={signature} />
            <Fact
              label={`Relative ${family.relative.mode}`}
              value={pretty(family.relative.name)}
              onClick={() => goToKey(family.relative.tonic, family.relative.mode)}
            />
            <Fact
              label={`Parallel ${family.parallel.mode}`}
              value={pretty(family.parallel.name)}
              onClick={() => goToKey(family.parallel.tonic, family.parallel.mode)}
            />
            <Fact label="Diatonic triads" value="7 chords" note={countText} />
          </div>

          {family.minorSets && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Minor scale">
              <span className="mr-1 w-16 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">Scale</span>
              {family.minorSets.map((s, i) => (
                <FilterPill key={s.name} selected={setIndex === i} onClick={() => setSetIndex(i)}>
                  {s.name}
                </FilterPill>
              ))}
            </div>
          )}

          <Section title={`Diatonic triads — ${pretty(family.key.name)}`} subtitle={`${set.name} scale: ${set.scale.map(pretty).join(" · ")}`}>
            <ChipRow>{set.triads.map(chip)}</ChipRow>
            <FunctionLegend />
          </Section>

          <Section title="Diatonic sevenths" subtitle="The same chords with the next scale third stacked on top.">
            <ChipRow>{set.sevenths.map(chip)}</ChipRow>
          </Section>

          <Section
            title="Borrowed chords"
            subtitle={
              mode === "major"
                ? `Chords from ${pretty(family.parallel.name)} that songs in ${pretty(family.key.name)} borrow all the time.`
                : `Colour chords from ${pretty(family.parallel.name)}, plus the Neapolitan.`
            }
          >
            <ChipRow>{family.borrowed.map(chip)}</ChipRow>
          </Section>

          <Section title="Secondary dominants" subtitle="A dominant 7th that points to a chord other than the tonic.">
            <ChipRow>{family.secondaryDominants.map(chip)}</ChipRow>
          </Section>

          <Section title="Common progressions" subtitle="Tap any chord to see its chart and hear it.">
            <div className="space-y-4">
              {family.progressions.map((p) => (
                <div key={p.name}>
                  <p className="mb-2 text-xs font-semibold text-[var(--color-ns-text)]">{p.name}</p>
                  {p.chords.length === 12 ? (
                    <div className="grid max-w-md grid-cols-4 gap-2">{p.chords.map(chip)}</div>
                  ) : (
                    <ChipRow>{p.chords.map(chip)}</ChipRow>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Passing chords"
            subtitle={`Chords that carry you from one chord to the next in ${pretty(family.key.name)}${family.minorSets ? ` (${set.name.toLowerCase()} scale)` : ""}. Tap any chord to see its chart and hear it.`}
          >
            <div className="space-y-4">
              {set.passing.map((p) => (
                <div key={p.name}>
                  <p className="mb-1 text-xs font-semibold text-[var(--color-ns-text)]">{pretty(p.name)}</p>
                  <p className="mb-2 text-xs text-[var(--color-ns-muted)]">{p.note}</p>
                  <ChipRow>{p.chords.map(chip)}</ChipRow>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Capo helper" subtitle="Easier open-chord shapes that sound in this key.">
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

        {/* The chart of the chord picked above, from the Chord Library */}
        <aside className="order-first lg:order-none">
          <div className="lg:sticky lg:top-24">
            <p className="mb-2 text-[0.6562rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-muted)]">
              {pretty(current.numeral)} in {pretty(family.key.name)}
            </p>
            <ChordCard key={current.name} chord={toParsed(current)} settings={settings} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function ChordChip({ chord, selected, onClick }: { chord: FamilyChord; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      title={chord.note ?? (chord.function ? `${chord.function} function` : undefined)}
      className={`flex min-w-[4.75rem] flex-col items-center rounded-xl border px-3 py-2 transition-all ${
        selected
          ? "border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)]/15"
          : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]"
      }`}
    >
      <span className="font-mono text-[0.6875rem] text-[var(--color-ns-muted)]">{pretty(chord.numeral)}</span>
      <span className="font-heading text-sm font-bold text-[var(--color-ns-text)] sm:text-base">{pretty(chord.name)}</span>
      {chord.function && <span className={`text-[0.625rem] font-semibold capitalize ${FUNCTION_STYLE[chord.function]}`}>{chord.function}</span>}
      {chord.note && <span className="max-w-[9rem] text-center text-[0.625rem] leading-tight text-[var(--color-ns-dim)]">{pretty(chord.note)}</span>}
    </button>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4 shadow-sm sm:p-5">
      <h2 className="font-heading text-base font-bold text-[var(--color-ns-text)]">{title}</h2>
      <p className="mb-3 mt-0.5 text-xs text-[var(--color-ns-muted)]">{subtitle}</p>
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

function FunctionLegend() {
  return (
    <p className="mt-3 text-[0.6875rem] text-[var(--color-ns-muted)]">
      <span className={FUNCTION_STYLE.tonic}>Tonic</span> = home · <span className={FUNCTION_STYLE.subdominant}>Subdominant</span> = moves away ·{" "}
      <span className={FUNCTION_STYLE.dominant}>Dominant</span> = pulls back home
    </p>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-[var(--color-ns-text)]">{children}</span>;
}

