/**
 * The editable sheet (what /api/sheet/generate returns as `model`) and the edits the Sheet Music
 * editor makes on it. Positions and lengths are in quarter notes from the start of bar 1. Every
 * function returns a new model; the page keeps the old ones for undo and asks /api/sheet/render
 * to redraw the MusicXML.
 */

export interface SheetNote {
  start: number;
  end: number;
  midi: number;
}
export interface SheetChord {
  start: number;
  end: number;
  name: string;
}
export interface SheetModel {
  title: string;
  bpm: number;
  beatsPerBar: number;
  key: string;
  notes: SheetNote[];
  chords: SheetChord[];
}

/** alphaTab counts 960 ticks per quarter note. */
export const TICKS_PER_QUARTER = 960;
export const LOWEST = 21; // A0
export const HIGHEST = 108; // C8
const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
// Tonic pitch class of keys written with flats (F major ... Gb major; D minor ... Eb minor).
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1, 6]);
const FLAT_MINORS = new Set([2, 7, 0, 5, 10, 3]);
const CHORD_RE = /^[A-G][#b]?(m|maj7|m7|7|dim|dim7|aug|sus2|sus4|m7b5|6|m6|9|add9)?$/;

/** Where a clicked beat sits, in quarter notes from bar 1 (every bar has the same length). */
export function positionOf(barIndex: number, displayStartTicks: number, beatsPerBar: number): number {
  return barIndex * beatsPerBar + displayStartTicks / TICKS_PER_QUARTER;
}

export function noteName(midi: number, flats = false): string {
  return `${(flats ? FLATS : SHARPS)[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Whether a key ("Eb Major", "G# Minor"), moved by `transpose` semitones, is written with flats. */
export function isFlatKey(key: string, transpose = 0): boolean {
  const m = /^([A-G])([#b]?)\s+(major|minor)/i.exec(key.trim());
  if (!m) return false;
  const pc = (SHARPS.indexOf(m[1]) + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + transpose + 24) % 12;
  return (m[3].toLowerCase() === "minor" ? FLAT_MINORS : FLAT_MAJORS).has(pc);
}

export function isChordName(name: string): boolean {
  return CHORD_RE.test(name.trim());
}

/** Index of the note sounding at `pos` (a tied note counts as one note), or -1 for a rest. */
export function noteAt(model: SheetModel, pos: number): number {
  return model.notes.findIndex((n) => n.start <= pos + 1e-6 && pos < n.end - 1e-6);
}

export function chordAt(model: SheetModel, pos: number): SheetChord | undefined {
  return model.chords.find((c) => c.start <= pos + 1e-6 && pos < c.end - 1e-6);
}

const withNotes = (model: SheetModel, notes: SheetNote[]): SheetModel => ({
  ...model,
  notes: notes.filter((n) => n.end - n.start > 1e-6).sort((a, b) => a.start - b.start),
});

export function shiftPitch(model: SheetModel, index: number, semitones: number): SheetModel {
  return withNotes(
    model,
    model.notes.map((n, i) => (i === index ? { ...n, midi: Math.max(LOWEST, Math.min(HIGHEST, n.midi + semitones)) } : n)),
  );
}

/** New length for a note. Notes it now runs into are shortened or removed, like any notation editor. */
export function setLength(model: SheetModel, index: number, quarters: number): SheetModel {
  const target = model.notes[index];
  if (!target) return model;
  const end = target.start + quarters;
  const notes = model.notes
    .map((n, i) => (i === index ? { ...n, end } : n))
    .filter((n, i) => i === index || !(n.start >= target.start && n.start < end));
  return withNotes(model, notes);
}

export function deleteNote(model: SheetModel, index: number): SheetModel {
  return withNotes(model, model.notes.filter((_, i) => i !== index));
}

/** A new note in a rest: up to `quarters` long, but never into the next note. */
export function addNote(model: SheetModel, pos: number, midi: number, quarters = 1): SheetModel {
  const next = model.notes.filter((n) => n.start > pos).reduce((m, n) => Math.min(m, n.start), Infinity);
  const end = Math.min(pos + quarters, next);
  return withNotes(model, [...model.notes, { start: pos, end, midi }]);
}

/** The pitch for a note added at `pos`: the note before it, else G4. */
export function pitchNear(model: SheetModel, pos: number): number {
  const before = model.notes.filter((n) => n.start < pos);
  return before.length ? before[before.length - 1].midi : 67;
}

/**
 * Rename the chord at `pos`, add one starting there (until the next chord or the end of the bar),
 * or remove it when `name` is empty.
 */
export function setChord(model: SheetModel, pos: number, name: string): SheetModel {
  const clean = name.trim();
  const current = chordAt(model, pos);
  let chords = model.chords;
  if (!clean) {
    chords = chords.filter((c) => c !== current);
  } else if (current && current.start === pos) {
    chords = chords.map((c) => (c === current ? { ...c, name: clean } : c));
  } else {
    const barEnd = (Math.floor(pos / model.beatsPerBar) + 1) * model.beatsPerBar;
    const next = chords.filter((c) => c.start > pos).reduce((m, c) => Math.min(m, c.start), Infinity);
    chords = chords.map((c) => (c === current ? { ...c, end: pos } : c));
    chords = [...chords, { start: pos, end: Math.min(next, current ? current.end : barEnd), name: clean }];
  }
  return { ...model, chords: chords.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start) };
}
