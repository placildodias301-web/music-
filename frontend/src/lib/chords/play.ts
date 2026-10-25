/**
 * Playback for a chord model. Uses high-fidelity studio sampled soundfonts with
 * Karplus-Strong physical modeling and additive synthesis fallbacks:
 *
 *  - studio sampled audio (soundfontPlayer.ts) providing authentic instrument samples across 88 keys and fretboards;
 *  - plucked strings physical model fallback (KarplusStrong.ts) strummed at that instrument's own speed;
 *  - synth voice recipes fallback (synthVoices.ts) for winds, bowed strings, mallets, and organs.
 *
 * The notes played are always the notes drawn, correctly transposed by capo and alternate tunings.
 */

import { arpeggioMidi, bassOptions, modelMidi, type ChordModel } from "./model";
import { audioEngine, playSynth, recipeForInstrument, type SynthMode } from "../audio";
import { playSampledChord, getAudioEngineMode, setAudioEngineMode, type AudioEngineMode } from "../audio/soundfontPlayer";
export { getAudioEngineMode, setAudioEngineMode, type AudioEngineMode };

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
export async function playModel(model: ChordModel, shapeIndex = 0) {
  const id = model.definition.id;
  const midis = modelMidi(model, shapeIndex);

  // 1. Try studio sampled soundfont playback first
  try {
    const playedSample = await playSampledChord(id, midis);
    if (playedSample) return { voices: [], durationSeconds: 2.8 };
  } catch {
    // fallback to physical synthesis
  }

  // 2. Physical string model and additive synth recipe fallback
  if (usesSynthVoice(id)) return synthPlay(id, midis, "chord");

  if (model.kind === "fretted" || model.kind === "bass") {
    const shapes = shapesOf(model);
    const frets = shapes[shapeIndex % Math.max(shapes.length, 1)];
    if (!frets) return EMPTY;
    const capoOffset = model.capo ?? 0;
    const tuningMidi = capoOffset > 0 ? model.tuning.midi.map((m) => m + capoOffset) : model.tuning.midi;
    return audioEngine.playChord({
      frets,
      tuningMidi,
      courses: model.tuning.offsets,
      instrument: stringVoiceFor(id),
      direction: "down",
    });
  }
  return EMPTY;
}

/** The same chord one note after another (how you would practise it), with each instrument's own sound. */
export async function playModelArpeggio(model: ChordModel, shapeIndex = 0) {
  const id = model.definition.id;
  const midis = modelMidi(model, shapeIndex);

  try {
    const playedSample = await playSampledChord(id, midis, { arpeggio: true });
    if (playedSample) return { voices: [], durationSeconds: midis.length * 0.35 };
  } catch {
    // fallback
  }

  if (usesSynthVoice(id)) return synthPlay(id, midis, "arpeggio");
  if (model.kind === "fretted" || model.kind === "bass") {
    const shapes = shapesOf(model);
    const frets = shapes[shapeIndex % Math.max(shapes.length, 1)];
    if (!frets) return EMPTY;
    const capoOffset = model.capo ?? 0;
    const tuningMidi = capoOffset > 0 ? model.tuning.midi.map((m) => m + capoOffset) : model.tuning.midi;
    return audioEngine.playArpeggio({ frets, tuningMidi, courses: model.tuning.offsets, instrument: stringVoiceFor(id), speed: "normal" });
  }
  return EMPTY;
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
export async function playShape(opts: {
  instrumentId: string;
  frets: (number | null)[];
  tuningMidi: number[];
  courses?: number[][];
  mode: "chord" | "arpeggio";
  speed?: "slow" | "normal" | "fast";
  capo?: number;
}) {
  const capoOffset = opts.capo ?? 0;
  const effectiveTuning = capoOffset > 0 ? opts.tuningMidi.map((m) => m + capoOffset) : opts.tuningMidi;
  const midis = opts.frets.flatMap((f, i) =>
    f === null || f < 0 || !Number.isFinite(effectiveTuning[i]) ? [] : [effectiveTuning[i] + f]
  );

  // 1. Studio sampled soundfont playback
  try {
    const isArp = opts.mode === "arpeggio";
    const playedSample = await playSampledChord(opts.instrumentId, midis, { arpeggio: isArp });
    if (playedSample) return { voices: [], durationSeconds: isArp ? midis.length * 0.35 : 2.8 };
  } catch {
    // fallback
  }

  if (usesSynthVoice(opts.instrumentId)) {
    return synthPlay(opts.instrumentId, midis, opts.mode === "chord" ? "chord" : "arpeggio");
  }
  const common = { frets: opts.frets, tuningMidi: effectiveTuning, courses: opts.courses, instrument: stringVoiceFor(opts.instrumentId) };
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
export async function playPlayedString(info: PlayableString, opts: { instrumentId: string; totalStrings: number; courses?: number[][] }) {
  if (info.action === "muted" || info.midi === null) return Promise.resolve(EMPTY);

  // 1. Studio sampled soundfont playback
  try {
    const played = await playSampledChord(opts.instrumentId, [info.midi]);
    if (played) return { voices: [], durationSeconds: 2.0 };
  } catch {
    // fallback
  }

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

/** Stop all running synthesizers and physical string voices. */
export function stopAllAudio(): void {
  audioEngine.stop();
}

/** Plays a single pitch / MIDI note on the selected instrument voice. */
export async function playSinglePitch(midi: number, instrumentId: string = 'guitar') {
  try {
    const played = await playSampledChord(instrumentId, [midi]);
    if (played) return { voices: [], durationSeconds: 2.0 };
  } catch {
    // fallback
  }

  if (usesSynthVoice(instrumentId)) {
    return synthPlay(instrumentId, [midi], 'chord');
  }
  return audioEngine.playNote({
    midi,
    fret: 0,
    isOpen: true,
    instrument: stringVoiceFor(instrumentId),
  });
}
