/**
 * Reference playback for a chord model. Plucked-string instruments use a simple string simulation; keys, accordion, harp and
 * mallets use a plain tone. NONE of these is a recording or a model of the real instrument — they only let you hear which notes
 * the chord contains, and the Chords page says so.
 */

import { playPluckedNotes, playToneNotes, playWindNotes, type PluckKind, type WindVoiceName } from "../playChord";
import { arpeggioMidi, modelMidi, type ChordModel } from "./model";
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

/** Whether playback is the nearest string voice or only a neutral tone. */
export function playbackKind(model: ChordModel): "string-simulation" | "neutral-tone" {
  return VOICE[model.definition.id] && model.kind !== "keyboard" ? "string-simulation" : "neutral-tone";
}

export function playModel(model: ChordModel, shapeIndex = 0) {
  // If fretted instrument (guitar, ukulele, etc.), use the physical string strum engine
  if (model.kind === "fretted" && model.shapes && model.shapes.length > 0) {
    const shape = model.shapes[shapeIndex % model.shapes.length];
    if (shape) {
      const voice = VOICE[model.definition.id];
      const inst = voice === "bass" ? "bass" : voice === "ukulele" ? "ukulele" : "guitar";
      return audioEngine.playChord({
        frets: shape.frets,
        tuningMidi: model.tuning.midi,
        instrument: inst,
        direction: "down",
      });
    }
  }

  // If bass instrument with chord shapes
  if (model.kind === "bass" && model.shapes && model.shapes.length > 0) {
    const shape = model.shapes[shapeIndex % model.shapes.length];
    if (shape) {
      return audioEngine.playChord({
        frets: shape.frets,
        tuningMidi: model.tuning.midi,
        instrument: "bass",
        direction: "down",
      });
    }
  }

  const midis = modelMidi(model, shapeIndex);
  if (!midis.length) return;
  const voice = VOICE[model.definition.id];
  if (model.kind === "harp") return playPluckedNotes(midis, "harp", 0.12);
  // Wind instruments play one note at a time, so the reference steps up the chord tones; a harmonica sounds its hole group together.
  if (model.kind === "wind") return playWindNotes(midis, WIND_VOICE[model.definition.id] ?? "flute", 0.5);
  if (model.kind === "harmonica") return playWindNotes(midis, "harmonica", 0);
  if (voice && (model.kind === "fretted" || model.kind === "bass")) return playPluckedNotes(midis, voice);
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
