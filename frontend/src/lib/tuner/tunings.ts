/**
 * Instrument and tuning data — configuration only, no processing logic.
 * Sources: standard tunings from the usual references (guitar, bass, ukulele and orchestral strings are
 * common knowledge; 12-string pairs from Wikipedia "Twelve-string guitar"; balalaika from Wikipedia
 * "Balalaika"; cavaquinho from Wikipedia "Cavaquinho"). Anything whose octave is by convention rather
 * than documented is marked in a comment.
 */

import { TUNER_CONFIG } from "./config";
import { DEFAULT_CUSTOM_RANGE, LEVER_HARP_RANGE, PEDAL_HARP_RANGE, harpPresets } from "./harp";
import { midiToFrequency, noteToMidi, octaveOfMidi } from "./notes";
import type {
  CustomTuning, HeadKind, PairRelation, TunerInstrument, TunerLayout, TunerString, TunerVariant, TuningCategory, TuningPreset,
} from "./types";

/** Build strings from "E2 A2 D3 …" (physical order). Throws on a bad note — data is checked by tests. */
export function stringsFromNotes(presetId: string, notes: string[], pairs?: { pairId: string; relation: PairRelation; course: number }[]): TunerString[] {
  return notes.map((note, i) => {
    const midi = noteToMidi(note);
    if (midi === null) throw new Error(`Bad note "${note}" in ${presetId}`);
    const pair = pairs?.[i];
    return {
      id: `${presetId}-s${i + 1}`,
      displayNumber: notes.length - i,
      note,
      octave: octaveOfMidi(midi),
      midi,
      course: pair ? pair.course : i + 1,
      pairId: pair?.pairId,
      pairRelation: pair?.relation,
    };
  });
}

function preset(id: string, name: string, category: TuningCategory, notes: string, note?: string): TuningPreset {
  return { id, name, category, ...(note ? { note } : {}), strings: stringsFromNotes(id, notes.split(" ")) };
}

/** Paired courses: each entry is [note, note] for one course. */
function coursePreset(id: string, name: string, category: TuningCategory, courses: [string, string][], relations: PairRelation[]): TuningPreset {
  const notes: string[] = [];
  const pairs: { pairId: string; relation: PairRelation; course: number }[] = [];
  courses.forEach((c, ci) => {
    c.forEach((n) => {
      notes.push(n);
      pairs.push({ pairId: `${id}-c${ci + 1}`, relation: relations[ci], course: ci + 1 });
    });
  });
  return { id, name, category, strings: stringsFromNotes(id, notes, pairs) };
}

function variant(id: string, name: string, stringCount: number, head: HeadKind, tunings: TuningPreset[], layout: TunerLayout = "headstock", courseCount = stringCount): TunerVariant {
  return { id, name, stringCount, courseCount, layout, head, tunings };
}

/* ─── Guitar (6) ─── */
const GUITAR6: TuningPreset[] = [
  preset("standard", "Standard E", "standard", "E2 A2 D3 G3 B3 E4"),
  preset("drop-d", "Drop D", "drop", "D2 A2 D3 G3 B3 E4"),
  preset("double-drop-d", "Double Drop D", "drop", "D2 A2 D3 G3 B3 D4"),
  preset("dadgad", "DADGAD / D Modal", "alternate", "D2 A2 D3 G3 A3 D4"),
  preset("drop-c-sharp", "Drop C#", "drop", "C#2 G#2 C#3 F#3 A#3 D#4"),
  preset("drop-c", "Drop C", "drop", "C2 G2 C3 F3 A3 D4"),
  preset("drop-b", "Drop B", "drop", "B1 F#2 B2 E3 G#3 C#4"),
  preset("drop-a", "Drop A", "drop", "A1 E2 A2 D3 F#3 B3"),
  preset("open-c", "Open C", "open", "C2 G2 C3 G3 C4 E4"),
  preset("open-d", "Open D", "open", "D2 A2 D3 F#3 A3 D4"),
  preset("open-dm", "Open Dm", "open", "D2 A2 D3 F3 A3 D4"),
  preset("open-e", "Open E", "open", "E2 B2 E3 G#3 B3 E4"),
  preset("open-em", "Open Em", "open", "E2 B2 E3 G3 B3 E4"),
  preset("open-f", "Open F", "open", "C2 F2 C3 F3 A3 F4"),
  preset("open-g", "Open G", "open", "D2 G2 D3 G3 B3 D4"),
  preset("open-a", "Open A", "open", "E2 A2 C#3 E3 A3 E4"),
  preset("open-am", "Open Am", "open", "E2 A2 E3 A3 C4 E4"),
  preset("half-step-down", "Half Step Down / Eb Standard", "down", "Eb2 Ab2 Db3 Gb3 Bb3 Eb4"),
  preset("whole-step-down", "Whole Step Down / D Standard", "down", "D2 G2 C3 F3 A3 D4"),
  preset("half-step-up", "Half Step Up", "up", "F2 Bb2 Eb3 Ab3 C4 F4"),
  preset("whole-step-up", "Whole Step Up", "up", "F#2 B2 E3 A3 C#4 F#4"),
  preset("all-fourths", "All Fourths", "alternate", "E2 A2 D3 G3 C4 F4"),
  preset("new-standard", "New Standard Tuning", "alternate", "C2 G2 D3 A3 E4 G4"),
];

/* ─── 7-string guitar: add more presets here ─── */
const GUITAR7: TuningPreset[] = [
  preset("standard", "Standard (B)", "standard", "B1 E2 A2 D3 G3 B3 E4"),
  preset("drop-a", "Drop A", "drop", "A1 E2 A2 D3 G3 B3 E4"),
];

/* ─── 12-string: E A D G courses are octave pairs (low string first), B and E are unisons ─── */
const GUITAR12: TuningPreset[] = [
  coursePreset(
    "standard", "Standard E", "standard",
    [["E2", "E3"], ["A2", "A3"], ["D3", "D4"], ["G3", "G4"], ["B3", "B3"], ["E4", "E4"]],
    ["octave", "octave", "octave", "octave", "unison", "unison"],
  ),
  coursePreset(
    "half-step-down", "Half Step Down", "down",
    [["Eb2", "Eb3"], ["Ab2", "Ab3"], ["Db3", "Db4"], ["Gb3", "Gb4"], ["Bb3", "Bb3"], ["Eb4", "Eb4"]],
    ["octave", "octave", "octave", "octave", "unison", "unison"],
  ),
];

/* ─── Bass ─── */
const BASS4: TuningPreset[] = [
  preset("standard", "Standard", "standard", "E1 A1 D2 G2"),
  preset("drop-d", "Drop D", "drop", "D1 A1 D2 G2"),
  preset("half-step-down", "Half Step Down", "down", "Eb1 Ab1 Db2 Gb2"),
  preset("whole-step-down", "Whole Step Down", "down", "D1 G1 C2 F2"),
  preset("drop-c", "Drop C", "drop", "C1 G1 C2 F2"),
  preset("tenor", "Tenor (A D G C)", "alternate", "A1 D2 G2 C3"),
];
const BASS5: TuningPreset[] = [
  preset("standard", "Standard (B)", "standard", "B0 E1 A1 D2 G2"),
  preset("high-c", "High C", "alternate", "E1 A1 D2 G2 C3"),
  preset("drop-a", "Drop A", "drop", "A0 E1 A1 D2 G2"),
];
const BASS6: TuningPreset[] = [preset("standard", "Standard (B–C)", "standard", "B0 E1 A1 D2 G2 C3")];

/* ─── Ukulele: re-entrant, so the 4th string is NOT the lowest pitch in High-G ─── */
const UKULELE: TuningPreset[] = [
  preset("standard", "Standard (High G)", "standard", "G4 C4 E4 A4"),
  preset("low-g", "Low G", "alternate", "G3 C4 E4 A4"),
  preset("d-tuning", "D Tuning", "alternate", "A4 D4 F#4 B4"),
  preset("baritone", "Baritone", "alternate", "D3 G3 B3 E4"),
];

const VIOLIN: TuningPreset[] = [preset("standard", "Standard", "standard", "G3 D4 A4 E5")];
const VIOLA: TuningPreset[] = [preset("standard", "Standard", "standard", "C3 G3 D4 A4")];
const CELLO: TuningPreset[] = [preset("standard", "Standard", "standard", "C2 G2 D3 A3")];

/* ─── Mandolin: 4 courses of two unison strings ─── */
const MANDOLIN: TuningPreset[] = [
  coursePreset(
    "standard", "Standard", "standard",
    [["G3", "G3"], ["D4", "D4"], ["A4", "A4"], ["E5", "E5"]],
    ["unison", "unison", "unison", "unison"],
  ),
];

/* ─── Banjo (5-string): string order is 5th (high drone) first, so pitch does NOT rise with position ─── */
const BANJO: TuningPreset[] = [
  preset("open-g", "Open G (standard)", "standard", "G4 D3 G3 B3 D4"),
  preset("double-c", "Double C", "alternate", "G4 C3 G3 C4 D4"),
  preset("sawmill", "Sawmill / G Modal", "alternate", "G4 D3 G3 C4 D4"),
  preset("open-d", "Open D", "open", "F#4 D3 F#3 A3 D4"),
  preset("drop-c", "Drop C", "drop", "G4 C3 G3 B3 D4"),
];

/* ─── 4-string banjos (tenor and plectrum are tuned from the low string up; there is no drone) ─── */
const BANJO4: TuningPreset[] = [
  preset("tenor", "Tenor (C G D A)", "standard", "C3 G3 D4 A4"),
  preset("irish-tenor", "Irish tenor (G D A E)", "alternate", "G2 D3 A3 E4"),
  preset("plectrum", "Plectrum (C G B D)", "alternate", "C3 G3 B3 D4"),
];

/* ─── Balalaika: several sizes, each with its own range. Source: Wikipedia "Balalaika" / "Stringed instrument
   tunings". The two lower strings of the usual 3-string balalaika are in unison, so string order is not strictly
   rising. ─── */
const BALALAIKA_PRIMA: TuningPreset[] = [
  preset("prima", "Prima (E E A)", "standard", "E4 E4 A4"),
  preset("guitar-style", "Prima, guitar style (G B D)", "alternate", "G3 B3 D4", "The three highest strings of the Russian guitar. Classically trained players usually avoid it."),
  preset("folk-d", "Prima, folk (D F# A)", "alternate", "D4 F#4 A4"),
  preset("folk-c", "Prima, folk (C E G)", "alternate", "C4 E4 G4"),
  preset("domra", "Prima, domra style (E A D)", "alternate", "E4 A4 D5"),
];
const BALALAIKA_SECUNDA: TuningPreset[] = [preset("secunda", "Secunda (A A D)", "standard", "A3 A3 D4")];
const BALALAIKA_ALTO: TuningPreset[] = [preset("alto", "Alto (E E A)", "standard", "E3 E3 A3")];
const BALALAIKA_BASS: TuningPreset[] = [
  preset("bass", "Bass (E A D)", "standard", "E2 A2 D3"),
  preset("bass-orchestral", "Bass, old orchestral (E A E)", "alternate", "E2 A2 E3"),
];
const BALALAIKA_CONTRABASS: TuningPreset[] = [
  preset("contrabass", "Contrabass (E A D)", "standard", "E1 A1 D2"),
  preset("contrabass-orchestral", "Contrabass, old orchestral (E A E)", "alternate", "E1 A1 E2"),
];
const BALALAIKA_PICCOLO: TuningPreset[] = [
  preset("piccolo", "Piccolo (B E A)", "standard", "B4 E5 A5"),
  preset("piccolo-orchestral", "Piccolo, old orchestral (E A E)", "alternate", "E4 A4 E5"),
];

/* ─── Cavaquinho: regional tunings differ, so each is its own preset. Source: Wikipedia "Cavaco" (note names)
   and "Stringed instrument tunings" (D4 G4 B4 D5 for the Brazilian tuning). The octaves of the Portuguese
   tunings are NOT given by those sources and are assumed from the stated lowest string — check yours. ─── */
const CAVAQUINHO: TuningPreset[] = [
  preset("brazilian", "Brazilian (D G B D)", "standard", "D4 G4 B4 D5"),
  preset("brazilian-solo", "Brazilian solo (D G B E)", "alternate", "D4 G4 B4 E5", "Common for solo parts in Brazil."),
  preset("portuguese", "Portuguese (C G A D)", "alternate", "C4 G4 A4 D5", "Octaves assumed (C lowest, not re-entrant). Confirm on your instrument."),
  preset("portuguese-old", "Portuguese old (D A B E)", "alternate", "D5 A4 B4 E5", "Re-entrant: A is the lowest string. Octaves assumed."),
];

export const INSTRUMENTS: TunerInstrument[] = [
  {
    id: "guitar",
    family: "Guitar",
    blurb: "Acoustic, electric, 7 and 12 string",
    variants: [
      variant("acoustic-6", "Acoustic · 6 string", 6, "acoustic", GUITAR6),
      variant("electric-6", "Electric · 6 string", 6, "electric", GUITAR6),
      variant("guitar-7", "7 string", 7, "inline", GUITAR7),
      variant("guitar-12", "12 string", 12, "acoustic", GUITAR12, "courses", 6),
    ],
  },
  {
    id: "bass",
    family: "Bass",
    blurb: "4, 5 and 6 string",
    variants: [
      variant("bass-4", "4 string", 4, "bass", BASS4),
      variant("bass-5", "5 string", 5, "inline", BASS5),
      variant("bass-6", "6 string", 6, "inline", BASS6),
    ],
  },
  { id: "ukulele", family: "Ukulele", blurb: "G C E A", variants: [variant("ukulele-4", "4 string", 4, "split", UKULELE)] },
  { id: "violin", family: "Violin", blurb: "G D A E", variants: [variant("violin-4", "4 string", 4, "violin", VIOLIN)] },
  { id: "viola", family: "Viola", blurb: "C G D A", variants: [variant("viola-4", "4 string", 4, "violin", VIOLA)] },
  { id: "cello", family: "Cello", blurb: "C G D A", variants: [variant("cello-4", "4 string", 4, "violin", CELLO)] },
  { id: "mandolin", family: "Mandolin", blurb: "G D A E · 4 courses", variants: [variant("mandolin-8", "8 string (4 courses)", 8, "mandolin", MANDOLIN, "courses", 4)] },
  {
    id: "banjo",
    family: "Banjo",
    blurb: "5 string, high drone",
    variants: [variant("banjo-5", "5 string", 5, "inline", BANJO), variant("banjo-4", "4 string (tenor / plectrum)", 4, "inline", BANJO4)],
  },
  {
    id: "balalaika",
    family: "Balalaika",
    blurb: "Prima and other sizes",
    variantLabel: "Size",
    variants: [
      variant("balalaika-3", "Prima", 3, "inline", BALALAIKA_PRIMA),
      variant("balalaika-secunda", "Secunda", 3, "inline", BALALAIKA_SECUNDA),
      variant("balalaika-alto", "Alto", 3, "inline", BALALAIKA_ALTO),
      variant("balalaika-bass", "Bass", 3, "inline", BALALAIKA_BASS),
      variant("balalaika-contrabass", "Contrabass", 3, "inline", BALALAIKA_CONTRABASS),
      variant("balalaika-piccolo", "Piccolo", 3, "inline", BALALAIKA_PICCOLO),
    ],
  },
  { id: "cavaquinho", family: "Cavaquinho", blurb: "D G B D", variants: [variant("cavaquinho-4", "4 string", 4, "split", CAVAQUINHO)] },
  {
    id: "harp",
    family: "Harp",
    blurb: "Lever, pedal or custom",
    variantLabel: "Harp type",
    variants: [
      variant("lever-34", "Lever / Celtic · 34 strings", LEVER_HARP_RANGE.count, "inline", harpPresets(LEVER_HARP_RANGE), "harp"),
      variant("pedal-47", "Pedal / Concert · 47 strings", PEDAL_HARP_RANGE.count, "inline", harpPresets(PEDAL_HARP_RANGE), "harp"),
      variant("harp-custom", "Custom harp", DEFAULT_CUSTOM_RANGE.count, "inline", harpPresets(DEFAULT_CUSTOM_RANGE), "harp"),
    ],
  },
];

/** Chromatic is not an instrument preset: it has no target strings. */
export const CHROMATIC_ID = "chromatic";

export interface TunerSelection {
  instrumentId: string; // an INSTRUMENTS id, or CHROMATIC_ID
  variantId: string;
  tuningId: string;
  /** Which entry of the instrument list was picked (Guitar vs Acoustic Guitar share tuning data; Piano vs Organ share the chromatic mode). */
  definitionId?: string;
}

export const DEFAULT_SELECTION: TunerSelection = { instrumentId: "guitar", variantId: "acoustic-6", tuningId: "standard" };

/** Tuning a variant starts on: the first preset, except harps (lever harps start in C major, pedal harps in C♭ with the pedals up). */
export function defaultTuningId(variant: TunerVariant): string {
  if (variant.layout === "harp") return variant.id === "pedal-47" ? "key-Cb" : "key-C";
  return variant.tunings[0].id;
}

export function findInstrument(id: string): TunerInstrument | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}

export function findVariant(instrumentId: string, variantId: string): TunerVariant | undefined {
  const inst = findInstrument(instrumentId);
  return inst?.variants.find((v) => v.id === variantId) ?? inst?.variants[0];
}

/** A tuning built from a user's saved note list. */
export function customToPreset(c: CustomTuning): TuningPreset {
  const base = findVariant(c.instrumentId, c.variantId)?.tunings[0]?.strings;
  // Keep the variant's course pairing so a 12-string custom tuning still draws six pegs.
  const pairs = base?.some((s) => s.pairId)
    ? base.map((s) => ({ pairId: `custom-${c.id}-c${s.course}`, relation: (s.pairRelation ?? "unison") as PairRelation, course: s.course ?? 1 }))
    : undefined;
  return { id: `custom-${c.id}`, name: c.name, category: "custom", strings: stringsFromNotes(`custom-${c.id}`, c.notes, pairs) };
}

export function tuningsFor(variant: TunerVariant, customs: CustomTuning[]): TuningPreset[] {
  const mine = customs.filter((c) => variant.id === c.variantId).map(customToPreset);
  return [...variant.tunings, ...mine];
}

export function findTuning(variant: TunerVariant, tuningId: string, customs: CustomTuning[]): TuningPreset {
  const all = tuningsFor(variant, customs);
  return all.find((t) => t.id === tuningId) ?? all[0];
}

/** One peg of the instrument: a course (or a lone string) and the strings it holds. */
export interface TuningUnit {
  index: number;
  course: number;
  stringIndexes: number[];
}

export function tuningUnits(preset: TuningPreset): TuningUnit[] {
  const order: number[] = [];
  const map = new Map<number, number[]>();
  preset.strings.forEach((s, i) => {
    const c = s.course ?? i + 1;
    if (!map.has(c)) {
      map.set(c, []);
      order.push(c);
    }
    map.get(c)!.push(i);
  });
  return order.map((course, index) => ({ index, course, stringIndexes: map.get(course)! }));
}

export interface TargetString extends TunerString {
  frequency: number;
}

/** Targets for the selected tuning at a given A4. */
export function targetsFor(preset: TuningPreset, a4: number): TargetString[] {
  return preset.strings.map((s) => ({ ...s, frequency: midiToFrequency(s.midi, a4) }));
}

/** Frequency window the detector should search for this tuning: well below the lowest string for a slack string (see `lowSlackSemitones`), above the highest for harmonics. */
export function detectionRange(preset: TuningPreset, a4: number): { fmin: number; fmax: number } {
  const freqs = preset.strings.map((s) => midiToFrequency(s.midi, a4));
  return { fmin: Math.max(24, Math.min(...freqs) * 2 ** (-TUNER_CONFIG.lowSlackSemitones / 12)), fmax: Math.min(4200, Math.max(...freqs) * 1.35) };
}

/** The Settings page's default guitar tuning id maps 1:1 onto preset ids (standard, drop-d, dadgad, open-g, half-step-down). */
export function presetIdFromSettings(settingsTuning: string): string {
  return settingsTuning;
}
