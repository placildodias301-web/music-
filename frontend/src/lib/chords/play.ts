/**
 * Reference playback for a chord model. Plucked-string instruments use a simple string simulation; keys, accordion, harp and
 * mallets use a plain tone. NONE of these is a recording or a model of the real instrument — they only let you hear which notes
 * the chord contains, and the Chords page says so.
 */

import { playPluckedNotes, playToneNotes, playWindNotes, type PluckKind, type WindVoiceName } from "../playChord";
import { arpeggioMidi, bassOptions, modelMidi, type ChordModel } from "./model";
import { audioEngine } from "../audio";

const VOICE: Record<string, PluckKind> = {
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
  banjo: "banjo",
  harp: "harp",
};

/** Which synthetic wind voice each wind instrument uses. Instruments not listed here fall back to the flute voice. */
const WIND_VOICE: Record<string, WindVoiceName> = {
  flute: "flute",
  piccolo: "flute",
  bansuri: "flute",
  "tin-whistle": "recorder",
  recorder: "recorder",
  oboe: "oboe",
  clarinet: "clarinet",
  bassoon: "bassoon",
  "soprano-sax": "sax",
  "alto-sax": "sax",
  "tenor-sax": "sax",
  "baritone-sax": "sax",
  trumpet: "trumpet",
  trombone: "trombone",
  "french-horn": "horn",
  tuba: "tuba",
  harmonica: "harmonica",
};

/** The physical-string voice the audio engine uses for a plucked instrument (guitar, bass or ukulele; guitar for the rest). */
export function stringVoiceFor(definitionId: string): "guitar" | "bass" | "ukulele" {
  const voice = VOICE[definitionId];
  return voice === "bass" ? "bass" : voice === "ukulele" ? "ukulele" : "guitar";
}

/** Whether playback is the nearest string voice or only a neutral tone. */
export function playbackKind(model: ChordModel): "string-simulation" | "neutral-tone" {
  return VOICE[model.definition.id] && model.kind !== "keyboard" ? "string-simulation" : "neutral-tone";
}

const BOWED = new Set(["violin", "viola", "cello"]);

export function playModel(model: ChordModel, shapeIndex = 0) {
  // Violin family: a sustained bowed-string tone, all notes of the shape together.
  if (BOWED.has(model.definition.id)) {
    const bowed = modelMidi(model, shapeIndex);
    if (bowed.length) return playWindNotes(bowed, "bowed", 0);
    return;
  }
  // Strings: ONE chord shape → every sounding string (and every strand of a paired course) → one voice each. The shape played
  // is exactly the shape drawn: for bass, the same option list the diagram steps through (two-note dyads first, then chords).
  if (model.kind === "fretted" || model.kind === "bass") {
    const shapes = model.kind === "fretted" ? model.shapes.map((sh) => sh.frets) : bassOptions(model).map((o) => o.frets);
    const frets = shapes[shapeIndex % Math.max(shapes.length, 1)];
    if (!frets) return Promise.resolve({ voices: [], durationSeconds: 0 });
    return audioEngine.playChord({
      frets,
      tuningMidi: model.tuning.midi,
      courses: model.tuning.offsets,
      instrument: stringVoiceFor(model.definition.id),
      direction: "down",
    });
  }

  const midis = modelMidi(model, shapeIndex);
  if (!midis.length) return;
  if (model.kind === "harp") return playPluckedNotes(midis, "harp", 0.12);
  // Wind instruments play one note at a time, so the reference steps up the chord tones; a harmonica sounds its hole group together.
  if (model.kind === "wind") return playWindNotes(midis, WIND_VOICE[model.definition.id] ?? "flute", 0.5);
  if (model.kind === "harmonica") return playWindNotes(midis, "harmonica", 0);
  return playToneNotes(midis, model.kind === "mallet" ? "struck" : "sustained");
}

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

/** What a string-table row or a diagram dot describes — just the parts the audio needs. */
export interface PlayableString {
  stringIndex: number;
  midi: number | null;
  fret: number | null;
  action: "fretted" | "open" | "muted";
}

/**
 * Plays ONE string of the shape being shown: the pitch the table/diagram says (`midi`), on that instrument's voice. For a paired
 * course (mandolin, 12-string) both strings of the pair sound. A muted string is silent.
 */
export function playPlayedString(info: PlayableString, opts: { instrumentId: string; totalStrings: number; courses?: number[][] }) {
  if (info.action === "muted" || info.midi === null) return Promise.resolve({ voices: [], durationSeconds: 0 });
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
