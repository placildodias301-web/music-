/**
 * Chord model: ONE function turns (chord, instrument, tuning, inversion) into plain data that a renderer draws.
 * The theory (notes, formula, inversions) is shared; only the "kind" of model differs per instrument family,
 * and `rendererFor` (lib/instruments/definitions.ts) decides which one an instrument gets — no if/else per instrument.
 */

import { chordIntervals, NOTE_NAMES, slashToneIndex, spellChord, type ParsedChord } from "../chordTheory";
import { findDefinition, rendererFor, type ChordRenderer, type InstrumentDefinition } from "../instruments/definitions";
import { harpNeedsForNotes, harpStrings, LEVER_HARP_RANGE, NATURAL_STATE, PEDAL_HARP_RANGE, type HarpAccidentals, type HarpLetter, type HarpNeed } from "../tuner/harp";
import { noteToMidi } from "../tuner/notes";
import { findInstrument, tuningUnits, tuningsFor } from "../tuner/tunings";
import { localStorageStore } from "../tuner/customTunings";
import type { TunerString } from "../tuner/types";
import { clampInversion, formulaText, inversionCount, inversionName, invertedNotes } from "./theory";
import {
  bassArpeggio,
  bassChordShapes,
  bassDyads,
  guitar7Shapes,
  guitar8Shapes,
  guitarShapesFor,
  stringShapes,
  ukuleleShapesFor,
  type ArpeggioStep,
  type BassDyad,
  type StringShape,
} from "./stringShapes";

/* ─── Tunings a chord can be shown in ─── */

export interface ChordTuning {
  id: string;
  name: string;
  /** MIDI of each course/string in the instrument's string order — the notes the shape search works on. */
  midi: number[];
  /** Every physical string (12-string and mandolin pairs), for playback. */
  allMidi: number[];
  /** Per course, the semitone offsets of its strings from the fundamental: [0] for a lone string, [0, 12] for a 12-string octave pair. */
  offsets: number[][];
  /** Index of a drone string that always rings open (5-string banjo's high string). */
  drone?: number;
  note?: string;
  /** "Bass 4 string" etc. — used to group long lists. */
  group?: string;
}

/** Instruments whose chord page offers every size/string-count of the tuner's instrument, not just one. */
const ALL_VARIANT_INSTRUMENTS = new Set(["bass", "banjo", "balalaika", "double-bass", "bouzouki"]);

const noteNameOf = (s: TunerString) => s.note.replace(/-?\d+$/, "");

export function chordTunings(def: InstrumentDefinition): ChordTuning[] {
  if (!def.tuner) return [];
  const inst = findInstrument(def.tuner.instrumentId);
  if (!inst || inst.variants[0]?.layout === "harp") return [];
  const variants = ALL_VARIANT_INSTRUMENTS.has(def.id) ? inst.variants : inst.variants.filter((v) => v.id === (def.tuner!.variantId ?? inst.variants[0].id));
  const multi = variants.length > 1;
  // Tunings the player saved on the Tuner page are chord tunings too: the same preset list, built-in and custom.
  const customs = localStorageStore.load();
  return variants.flatMap((variant) =>
    tuningsFor(variant, customs).map((preset) => {
      const units = tuningUnits(preset);
      // A course's fundamental is its lowest string; the other string (octave or unison) only doubles it.
      const midi = units.map((u) => Math.min(...u.stringIndexes.map((i) => preset.strings[i].midi)));
      return {
        id: `${variant.id}:${preset.id}`,
        name: multi ? `${variant.name} · ${preset.name}` : preset.name,
        midi,
        allMidi: preset.strings.map((s) => s.midi),
        offsets: units.map((u, k) => u.stringIndexes.map((i) => preset.strings[i].midi - midi[k])),
        drone: variant.id === "banjo-5" ? 0 : undefined,
        note: preset.note,
        group: variant.name,
      };
    }),
  );
}

/** The tuning / harp-type / harmonica-key choices the Chords page offers for an instrument (empty when it has none). */
export function tuningChoices(def: InstrumentDefinition): { id: string; name: string }[] {
  if (def.id === "harp") return HARP_CHORD_TYPES.map((t) => ({ id: t.id, name: t.name }));
  if (def.id === "harmonica") return HARMONICA_KEYS.map((k) => ({ id: k.id, name: k.name }));
  return chordTunings(def).map((t) => ({ id: t.id, name: t.name }));
}

export function findChordTuning(def: InstrumentDefinition, tuningId: string | undefined): ChordTuning | undefined {
  const all = chordTunings(def);
  return all.find((t) => t.id === tuningId) ?? all[0];
}

/** Open-string note names of a tuning, in order, for labelling the diagram. */
export function tuningNoteNames(def: InstrumentDefinition, tuning: ChordTuning): string[] {
  const inst = findInstrument(def.tuner!.instrumentId)!;
  const [variantId, presetId] = tuning.id.split(":");
  const variantOf = inst.variants.find((v) => v.id === variantId);
  const preset = variantOf ? tuningsFor(variantOf, localStorageStore.load()).find((p) => p.id === presetId) : undefined;
  if (!preset) return [];
  return tuningUnits(preset).map((u) => noteNameOf(preset.strings[u.stringIndexes[0]]));
}

/* ─── The models ─── */

interface Base {
  chord: ParsedChord;
  definition: InstrumentDefinition;
  /** Spelled chord notes in root position, e.g. C E G. */
  notes: string[];
  formula: string;
  inversion: number;
  inversionLabel: string;
  inversionCount: number;
}

export interface FrettedModel extends Base {
  kind: "fretted";
  tuning: ChordTuning;
  stringNames: string[];
  shapes: StringShape[];
  /** Strings shown as pairs (12-string, mandolin) — playback doubles them. */
  courses: boolean;
}

export interface BassModel extends Base {
  kind: "bass";
  tuning: ChordTuning;
  stringNames: string[];
  dyads: BassDyad[];
  shapes: StringShape[];
  arpeggio: ArpeggioStep[];
}

export interface KeyedNote {
  midi: number;
  name: string;
}

export interface KeyboardModel extends Base {
  kind: "keyboard";
  /** Notes in the chosen inversion, lowest first. */
  keys: KeyedNote[];
}

export interface MalletModel extends Base {
  kind: "mallet";
  keys: KeyedNote[];
}

export interface HarpModel extends Base {
  kind: "harp";
  rangeName: string;
  strings: (TunerString & { letter: HarpLetter; inChord: boolean })[];
  needs: HarpNeed[];
  conflict: HarpLetter | null;
  /** Strings that cannot be altered on this harp (pedal harp's fixed C1, D1, G7) yet would need to be. */
  blocked: string[];
}

export interface AccordionModel extends Base {
  kind: "accordion";
  keys: KeyedNote[];
  stradella: StradellaPick | null;
}

export interface WindModel extends Base {
  kind: "wind";
  /** Chord tones in the instrument's range, lowest first — the pitches that actually sound (an arpeggio, as wind instruments play one note at a time). */
  sounding: KeyedNote[];
  /** Transposing instruments only: the chord as it is written on the player's part. */
  written: { label: string; notes: string[]; instrumentPitch: string } | null;
  rangeLow: string;
  rangeHigh: string;
}

export interface HarmonicaHole {
  hole: number;
  blow: KeyedNote;
  draw: KeyedNote;
  blowInChord: boolean;
  drawInChord: boolean;
}

export interface HarmonicaGroup {
  direction: "blow" | "draw";
  /** First and last hole of a run of neighbouring holes that all sound chord tones. */
  from: number;
  to: number;
  notes: KeyedNote[];
}

export interface HarmonicaModel extends Base {
  kind: "harmonica";
  harpKey: string;
  holes: HarmonicaHole[];
  groups: HarmonicaGroup[];
}

export type ChordModel = FrettedModel | BassModel | KeyboardModel | MalletModel | HarpModel | AccordionModel | WindModel | HarmonicaModel;

export interface ChordSettings {
  definitionId: string;
  tuningId?: string;
  inversion: number;
}

/* ─── Accordion left hand (standard Stradella) ─── */

/** Bass columns run in fifths: …Eb Bb F C G D A E B… (a standard layout; real accordions vary in size and row count). */
export const STRADELLA_COLUMNS = ["Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#"];
export const STRADELLA_ROWS = ["Counter-bass", "Bass", "Major", "Minor", "Seventh", "Diminished"] as const;
export type StradellaRow = (typeof STRADELLA_ROWS)[number];
const COLUMN_PC: Record<string, number> = { Eb: 3, Bb: 10, F: 5, C: 0, G: 7, D: 2, A: 9, E: 4, B: 11, "F#": 6 };

export interface StradellaPick {
  column: string;
  row: StradellaRow;
}

/** The single Stradella chord button that sounds this chord, or null when the layout has none (most extended chords). */
export function stradellaFor(chord: ParsedChord): StradellaPick | null {
  const BY_SUFFIX: Record<string, StradellaRow> = { "": "Major", m: "Minor", "7": "Seventh", dim7: "Diminished" };
  const row: StradellaRow | null = BY_SUFFIX[chord.quality.suffix] ?? null;
  if (!row) return null;
  if (row === "Diminished") {
    // A diminished-7th button is named for one of its four notes; the same four notes repeat every minor third.
    const col = STRADELLA_COLUMNS.find((c) => (COLUMN_PC[c] - chord.root + 12) % 3 === 0);
    return col ? { column: col, row } : null;
  }
  const column = STRADELLA_COLUMNS.find((c) => COLUMN_PC[c] === chord.root);
  return column ? { column, row } : null;
}

/* ─── Wind instruments ─── */

/** How a written root is spelled on a transposing instrument's part (F♯ rather than G♭; the usual key-signature-friendly names). */
const WRITTEN_ROOT = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** The chord a transposing player reads: every pitch moves up `semitones`, and the symbol is respelled to match. */
export function writtenChord(chord: ParsedChord, semitones: number): ParsedChord {
  const root = (chord.root + semitones) % 12;
  return { root, quality: chord.quality, label: `${WRITTEN_ROOT[root]}${chord.quality.suffix}` };
}

function buildWind(b: Base): WindModel {
  const def = b.definition;
  const low = noteToMidi(def.range?.low ?? "C4") ?? 60;
  const high = noteToMidi(def.range?.high ?? "C6") ?? 84;
  const offsets = chordIntervals(b.chord);
  const names = b.notes;
  // Start the arpeggio on the lowest root in the range, then drop an octave if the top would leave it.
  let start = low + ((b.chord.root - low) % 12 + 12) % 12;
  while (start - 12 >= low && Math.max(...offsets) + start > high) start -= 12;
  const sounding = offsets
    .map((o, i) => ({ midi: start + o, name: names[i] }))
    .filter((n) => n.midi >= low && n.midi <= high)
    .sort((x, y) => x.midi - y.midi);
  const t = def.transposition;
  let written: WindModel["written"] = null;
  if (t) {
    const w = writtenChord(b.chord, t.semitones);
    written = { label: w.label, notes: spellChord(w), instrumentPitch: t.label };
  }
  return { ...b, kind: "wind", sounding, written, rangeLow: def.range?.low ?? "", rangeHigh: def.range?.high ?? "" };
}

/* ─── Harmonica (10-hole diatonic, Richter tuning) ─── */

/** Sounding MIDI of each hole on a C harmonica. */
const HARMONICA_BLOW_C = [60, 64, 67, 72, 76, 79, 84, 88, 91, 96];
const HARMONICA_DRAW_C = [62, 67, 71, 74, 77, 81, 83, 86, 89, 93];

export const HARMONICA_KEYS = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"].map((name, i) => ({ id: name, name: `${name} harmonica`, semitone: i }));

function buildHarmonica(b: Base, tuningId: string | undefined): HarmonicaModel {
  const key = HARMONICA_KEYS.find((k) => k.id === tuningId) ?? HARMONICA_KEYS[0];
  // Low keys (G and below the next octave) are made an octave down, so G harmonica starts on G3, not G4.
  const shift = key.semitone <= 6 ? key.semitone : key.semitone - 12;
  const chordPcs = new Set(chordIntervals(b.chord).map((o) => (b.chord.root + o) % 12));
  const nameByPc = new Map<number, string>(chordIntervals(b.chord).map((o, i) => [(b.chord.root + o) % 12, b.notes[i]]));
  const keyed = (midi: number): KeyedNote => ({ midi, name: nameByPc.get(midi % 12) ?? NOTE_NAMES[midi % 12].replace("#", "♯") });
  const holes: HarmonicaHole[] = HARMONICA_BLOW_C.map((blow, i) => {
    const bm = blow + shift;
    const dm = HARMONICA_DRAW_C[i] + shift;
    return { hole: i + 1, blow: keyed(bm), draw: keyed(dm), blowInChord: chordPcs.has(bm % 12), drawInChord: chordPcs.has(dm % 12) };
  });
  const groups: HarmonicaGroup[] = [];
  for (const direction of ["blow", "draw"] as const) {
    const inChord = (h: HarmonicaHole) => (direction === "blow" ? h.blowInChord : h.drawInChord);
    let i = 0;
    while (i < holes.length) {
      if (!inChord(holes[i])) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < holes.length && inChord(holes[j + 1])) j++;
      const notes = holes.slice(i, j + 1).map((h) => h[direction]);
      if (j > i && new Set(notes.map((n) => n.midi % 12)).size >= 2) groups.push({ direction, from: holes[i].hole, to: holes[j].hole, notes });
      i = j + 1;
    }
  }
  groups.sort((a, c) => new Set(c.notes.map((n) => n.midi % 12)).size - new Set(a.notes.map((n) => n.midi % 12)).size || c.notes.length - a.notes.length);
  return { ...b, kind: "harmonica", harpKey: key.id, holes, groups };
}

/* ─── Builder ─── */

function base(chord: ParsedChord, definition: InstrumentDefinition, inversion: number): Base {
  const inv = clampInversion(chord, inversion);
  return { chord, definition, notes: spellChord(chord), formula: formulaText(chord), inversion: inv, inversionLabel: inversionName(inv), inversionCount: inversionCount(chord) };
}

const HARP_RANGES = { lever: LEVER_HARP_RANGE, pedal: PEDAL_HARP_RANGE };

/** Harp type ids shown in the Chords tuning selector (lever vs pedal; both follow the chord's needs, not a key). */
export const HARP_CHORD_TYPES = [
  { id: "lever", name: "Lever / Celtic harp (C2–A6)" },
  { id: "pedal", name: "Pedal / Concert harp (C1–G7)" },
];

function buildHarp(b: Base, tuningId: string | undefined): HarpModel {
  const type = tuningId === "pedal" ? "pedal" : "lever";
  const range = HARP_RANGES[type];
  const { needs, conflict } = harpNeedsForNotes(b.notes);
  const acc: HarpAccidentals = { ...NATURAL_STATE };
  for (const n of needs) acc[n.letter] = n.accidental;
  const fixed = new Set(range.fixedNatural ?? []);
  const blocked: string[] = [];
  const strings = harpStrings(range, acc, "chord").map((s) => {
    const letter = s.note[0] as HarpLetter;
    const natural = `${letter}${s.note.replace(/^[A-G][#b]?/, "")}`;
    const wanted = needs.find((n) => n.letter === letter);
    if (fixed.has(natural) && wanted && wanted.accidental !== 0) blocked.push(natural);
    return { ...s, letter, inChord: !!wanted && !(fixed.has(natural) && wanted.accidental !== 0) };
  });
  return { ...b, kind: "harp", rangeName: HARP_CHORD_TYPES.find((t) => t.id === type)!.name, strings, needs, conflict, blocked };
}

function frettedFor(renderer: ChordRenderer, chord: ParsedChord, tuning: ChordTuning): StringShape[] {
  switch (renderer) {
    case "guitar":
    case "guitar12":
      return guitarShapesFor(chord, tuning.midi);
    case "guitar7":
      return guitar7Shapes(chord, tuning.midi);
    case "guitar8":
      return guitar8Shapes(chord, tuning.midi);
    case "ukulele":
      return ukuleleShapesFor(chord, tuning.midi);
    default:
      return stringShapes(chord, tuning.midi, { drone: tuning.drone, count: 3 });
  }
}

/** Renderers whose strings come in pairs (12-string, mandolin, bouzouki, charango, tres). */
const COURSE_RENDERERS = new Set<ChordRenderer>(["guitar12", "mandolin", "bouzouki", "charango", "tres"]);

export function buildChordModel(chord: ParsedChord, definition: InstrumentDefinition, settings: Pick<ChordSettings, "tuningId" | "inversion">): ChordModel | null {
  const renderer = rendererFor(definition);
  if (!renderer) return null;
  // A slash chord (C/E) IS an inversion when its bass is a chord tone; otherwise the bass is an extra low note.
  const toneIndex = slashToneIndex(chord);
  const b = base(chord, definition, chord.slashBass !== undefined && toneIndex >= 0 ? toneIndex : settings.inversion);
  const keysFor = (): KeyedNote[] => {
    const keys = invertedNotes(chord, b.inversion, 60);
    if (chord.slashBass !== undefined && toneIndex < 0) return [{ midi: 48 + chord.slashBass, name: NOTE_NAMES[chord.slashBass].replace("#", "♯") }, ...keys];
    return keys;
  };
  switch (renderer) {
    case "keyboard":
      return { ...b, kind: "keyboard", keys: keysFor() };
    case "mallet":
      return { ...b, kind: "mallet", keys: keysFor() };
    case "accordion":
      return { ...b, kind: "accordion", keys: keysFor(), stradella: stradellaFor(chord) };
    case "harp":
      return buildHarp(b, settings.tuningId);
    case "wind":
      return buildWind(b);
    case "harmonica":
      return buildHarmonica(b, settings.tuningId);
    default: {
      const tuning = findChordTuning(definition, settings.tuningId);
      if (!tuning) return null;
      const stringNames = tuningNoteNames(definition, tuning);
      if (renderer === "bass") {
        return { ...b, kind: "bass", tuning, stringNames, dyads: bassDyads(chord, tuning.midi), shapes: bassChordShapes(chord, tuning.midi), arpeggio: bassArpeggio(chord, tuning.midi) };
      }
      return { ...b, kind: "fretted", tuning, stringNames, shapes: frettedFor(renderer, chord, tuning), courses: COURSE_RENDERERS.has(renderer) };
    }
  }
}

/** Saved choice on the Chords page; falls back to Guitar. */
const KEY = "wilsify:chords-instrument";

export function loadChordSettings(): ChordSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<ChordSettings> | null;
    const def = findDefinition(v?.definitionId);
    if (v && def && def.chordDisplayMode !== "none") return { definitionId: def.id, tuningId: typeof v.tuningId === "string" ? v.tuningId : undefined, inversion: typeof v.inversion === "number" ? v.inversion : 0 };
  } catch {
    // fall through
  }
  return { definitionId: "guitar", inversion: 0 };
}

export function saveChordSettings(s: ChordSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // not remembered — fine
  }
}

/** Everything the Bass view can show as a "chord shape": two-note dyads first, then fuller shapes when they exist. */
export function bassOptions(model: BassModel): { name: string; frets: (number | null)[] }[] {
  return [
    ...model.dyads.map((d) => ({ name: d.name, frets: d.shape.frets })),
    ...model.shapes.map((s) => ({ name: `Chord · ${s.name}`, frets: s.frets })),
  ];
}

/** MIDI notes to play for a model — what the neutral tone or string voice sounds. */
export function modelMidi(model: ChordModel, shapeIndex = 0): number[] {
  switch (model.kind) {
    case "keyboard":
    case "mallet":
    case "accordion":
      return model.keys.map((k) => k.midi);
    case "wind":
      return model.sounding.map((k) => k.midi);
    case "harmonica":
      return model.groups[0]?.notes.map((k) => k.midi) ?? [];
    case "harp":
      return model.strings.filter((s) => s.inChord).map((s) => s.midi).filter((m) => m >= 48 && m <= 84).slice(0, 6);
    case "bass": {
      const opts = bassOptions(model);
      const o = opts[shapeIndex % Math.max(opts.length, 1)];
      return o ? o.frets.flatMap((f, i) => (f === null ? [] : [model.tuning.midi[i] + f])) : [];
    }
    case "fretted": {
      const shape = model.shapes[shapeIndex % Math.max(model.shapes.length, 1)];
      if (!shape) return [];
      // Paired courses (12-string octaves, mandolin unisons) sound every string of the course.
      return shape.frets.flatMap((f, i) => (f === null ? [] : model.tuning.offsets[i].map((o) => model.tuning.midi[i] + f + o)));
    }
  }
}

/** The bass arpeggio's notes in playing order. */
export function arpeggioMidi(model: BassModel): number[] {
  return model.arpeggio.map((a) => model.tuning.midi[a.string] + a.fret);
}
