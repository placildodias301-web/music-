/**
 * Playback for a chord model. Every instrument has its own sound model — NONE of them is a recording:
 *
 *  - plucked strings (guitars, ukulele, bass, mandolin, banjo, …): a physical string model, one voice per sounding string/strand
 *    (lib/audio/KarplusStrong.ts), strummed at that instrument's own speed;
 *  - everything else (bowed strings, winds, keys, mallets, accordion, harp): an instrument recipe — its spectrum, how it starts,
 *    vibrato, body resonance (lib/audio/synthVoices.ts) — so a violin, a flute and a piano don't sound alike.
 *
 * The notes played are always the notes drawn: strings come from the shape on screen, the rest from the model's own note list.
 */

import { arpeggioMidi, bassOptions, modelMidi, type ChordModel } from "./model";
import { audioEngine, playSynth, recipeForInstrument, type SynthMode } from "../audio";

type StringVoice = "guitar" | "bass" | "ukulele" | "mandolin" | "banjo";

const VOICE: Record<string, StringVoice> = {
  guitar: "guitar",
  "acoustic-guitar": "guitar",
  "electric-guitar": "guitar",
  "guitar-7": "guitar",
  "guitar-12": "guitar",
  bass: "bass",
  ukulele: "ukulele",
  cavaquinho: "ukulele",
  mandolin: "mandolin",
  balalaika: "mandolin",
  bouzouki: "mandolin",
  charango: "mandolin",
  cuatro: "ukulele",
  tres: "guitar",
  "classical-guitar": "guitar",
  "guitar-8": "guitar",
  "double-bass": "bass",
  banjo: "banjo",
};

/** The plucked-string voice the audio engine uses for an instrument (guitar for anything unlisted). */
export function stringVoiceFor(definitionId: string): StringVoice {
  return VOICE[definitionId] ?? "guitar";
}

/** Instruments whose sound is an instrument recipe rather than a plucked-string model. */
export function usesSynthVoice(definitionId: string): boolean {
  return !VOICE[definitionId] && recipeForInstrument(definitionId) !== undefined;
}

const EMPTY = { voices: [], durationSeconds: 0 };

/** Seconds between notes when an instrument plays its chord one note after another. */
const ARPEGGIO_GAP: Record<string, number> = { wind: 0.5, keys: 0.3, mallet: 0.25, plucked: 0.2, bowed: 0.55, reed: 0.5 };

function synthPlay(instrumentId: string, midis: number[], mode: SynthMode) {
  const recipe = recipeForInstrument(instrumentId);
  if (!recipe || !midis.length) return Promise.resolve({ notes: [], durationSeconds: 0 });
  return playSynth(recipe, midis, mode, ARPEGGIO_GAP[recipe.family] ?? 0.35);
}

function shapesOf(model: ChordModel): (number | null)[][] {
  if (model.kind === "fretted") return model.shapes.map((sh) => sh.frets);
  if (model.kind === "bass") return bassOptions(model).map((o) => o.frets);
  return [];
}

/** Plays the chord as the instrument plays it: strummed, rolled or struck, all notes overlapping. */
export function playModel(model: ChordModel, shapeIndex = 0) {
  const id = model.definition.id;
  // Instruments with their own sound model (violin family included): the notes of the shape/chord shown, together.
  if (usesSynthVoice(id)) return synthPlay(id, modelMidi(model, shapeIndex), "chord");

  // Plucked strings: ONE chord shape → every sounding string (and every strand of a paired course) → one voice each. The shape
  // played is exactly the shape drawn: for bass, the same option list the diagram steps through (two-note dyads first).
  if (model.kind === "fretted" || model.kind === "bass") {
    const shapes = shapesOf(model);
    const frets = shapes[shapeIndex % Math.max(shapes.length, 1)];
    if (!frets) return Promise.resolve(EMPTY);
    return audioEngine.playChord({
      frets,
      tuningMidi: model.tuning.midi,
      courses: model.tuning.offsets,
      instrument: stringVoiceFor(id),
      direction: "down",
    });
  }
  return Promise.resolve(EMPTY);
}

/** The same chord one note after another (how you would practise it), with each instrument's own sound. */
export function playModelArpeggio(model: ChordModel, shapeIndex = 0) {
  const id = model.definition.id;
  if (usesSynthVoice(id)) return synthPlay(id, modelMidi(model, shapeIndex), "arpeggio");
  if (model.kind === "fretted" || model.kind === "bass") {
    const shapes = shapesOf(model);
    const frets = shapes[shapeIndex % Math.max(shapes.length, 1)];
    if (!frets) return Promise.resolve(EMPTY);
    return audioEngine.playArpeggio({ frets, tuningMidi: model.tuning.midi, courses: model.tuning.offsets, instrument: stringVoiceFor(id), speed: "normal" });
  }
  return Promise.resolve(EMPTY);
}

/** Bass only: the chord's tones as a one-note-at-a-time run from the root up to the octave. */
export function playArpeggio(model: ChordModel) {
  if (model.kind !== "bass") return;
  const midis = arpeggioMidi(model);
  if (!midis.length) return;
  return audioEngine.playArpeggio({
    frets: midis.map(() => 0),
    tuningMidi: midis,
    instrument: "bass",
    speed: "normal",
  });
}

/** What the Explorer's practice panel plays: the shape on screen, chord or arpeggio, on the instrument's own sound. */
export function playShape(opts: {
  instrumentId: string;
  frets: (number | null)[];
  tuningMidi: number[];
  courses?: number[][];
  mode: "chord" | "arpeggio";
  speed?: "slow" | "normal" | "fast";
}) {
  if (usesSynthVoice(opts.instrumentId)) {
    const midis = opts.frets.flatMap((f, i) => (f === null || f < 0 || !Number.isFinite(opts.tuningMidi[i]) ? [] : [opts.tuningMidi[i] + f]));
    return synthPlay(opts.instrumentId, midis, opts.mode === "chord" ? "chord" : "arpeggio");
  }
  const common = { frets: opts.frets, tuningMidi: opts.tuningMidi, courses: opts.courses, instrument: stringVoiceFor(opts.instrumentId) };
  return opts.mode === "chord"
    ? audioEngine.playChord({ ...common, direction: "down" })
    : audioEngine.playArpeggio({ ...common, speed: opts.speed ?? "normal" });
}

/** What a string-table row or a diagram dot describes — just the parts the audio needs. */
export interface PlayableString {
  stringIndex: number;
  midi: number | null;
  fret: number | null;
  action: "fretted" | "open" | "muted";
}

/**
 * Plays ONE string of the shape being shown: the pitch the table/diagram says (`midi`), on that instrument's sound. For a paired
 * course (mandolin, 12-string) both strings of the pair sound. A muted string is silent.
 */
export function playPlayedString(info: PlayableString, opts: { instrumentId: string; totalStrings: number; courses?: number[][] }) {
  if (info.action === "muted" || info.midi === null) return Promise.resolve(EMPTY);
  if (usesSynthVoice(opts.instrumentId)) return synthPlay(opts.instrumentId, [info.midi], "chord");
  return audioEngine.playNote({
    midi: info.midi,
    stringIndex: info.stringIndex,
    totalStrings: opts.totalStrings,
    fret: info.fret,
    isOpen: info.action === "open",
    instrument: stringVoiceFor(opts.instrumentId),
    strands: opts.courses?.[info.stringIndex],
  });
}
