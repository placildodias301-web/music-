/**
 * Multi-Sampled Studio Instrument Soundfont Player with Physical Model Fallback
 *
 * Provides real-world instrument timbres (Grand Piano, Acoustic Steel/Nylon Guitar,
 * Electric Clean Guitar, Finger/Upright Bass, Ukulele, Violin, Trumpet, Saxophone, Flute,
 * Accordion, Harp, Marimba, etc.) streamed from standard WebAudio soundfonts with
 * in-memory AudioBuffer caching, strum/roll scheduling, and fallback to physical synthesis.
 */

import { audioContextManager } from "./AudioContextManager";

const SOUNDFONT_CDN_BASE = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";

const INSTRUMENT_SOUNDFONTS: Record<string, string> = {
  guitar: "acoustic_guitar_steel",
  "acoustic-guitar": "acoustic_guitar_steel",
  "classical-guitar": "acoustic_guitar_nylon",
  "electric-guitar": "electric_guitar_clean",
  "guitar-7": "electric_guitar_clean",
  "guitar-8": "electric_guitar_clean",
  "guitar-12": "acoustic_guitar_steel",
  bass: "electric_bass_finger",
  "double-bass": "acoustic_bass",
  "fretless-bass": "fretless_bass",
  ukulele: "acoustic_guitar_nylon",
  cavaquinho: "acoustic_guitar_steel",
  mandolin: "banjo",
  bouzouki: "acoustic_guitar_steel",
  charango: "acoustic_guitar_nylon",
  cuatro: "acoustic_guitar_steel",
  tres: "acoustic_guitar_steel",
  banjo: "banjo",
  balalaika: "acoustic_guitar_steel",
  piano: "acoustic_grand_piano",
  "electric-piano": "electric_piano_1",
  organ: "church_organ",
  accordion: "accordion",
  harmonica: "harmonica",
  harp: "orchestral_harp",
  violin: "violin",
  viola: "viola",
  cello: "cello",
  flute: "flute",
  recorder: "recorder",
  piccolo: "piccolo",
  oboe: "oboe",
  clarinet: "clarinet",
  bassoon: "bassoon",
  trumpet: "trumpet",
  cornet: "trumpet",
  "french-horn": "french_horn",
  trombone: "trombone",
  tuba: "tuba",
  euphonium: "tuba",
  "alto-sax": "alto_sax",
  "tenor-sax": "tenor_sax",
  "soprano-sax": "soprano_sax",
  "baritone-sax": "baritone_sax",
  marimba: "marimba",
  xylophone: "xylophone",
  vibraphone: "vibraphone",
  sitar: "sitar",
};

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function midiToSoundfontNote(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  return `${note}${octave}`;
}

export type AudioEngineMode = "samples" | "physical";

let currentMode: AudioEngineMode = "samples";

export function getAudioEngineMode(): AudioEngineMode {
  return currentMode;
}

export function setAudioEngineMode(mode: AudioEngineMode): void {
  currentMode = mode;
}

const bufferCache = new Map<string, AudioBuffer>();
const pendingFetches = new Map<string, Promise<AudioBuffer | null>>();

export async function fetchNoteSample(soundfont: string, noteName: string): Promise<AudioBuffer | null> {
  const key = `${soundfont}:${noteName}`;
  if (bufferCache.has(key)) return bufferCache.get(key)!;
  if (pendingFetches.has(key)) return pendingFetches.get(key)!;

  const fetchPromise = (async () => {
    try {
      const url = `${SOUNDFONT_CDN_BASE}/${soundfont}-mp3/${noteName}.mp3`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const ctx = await audioContextManager.getContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      bufferCache.set(key, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    } finally {
      pendingFetches.delete(key);
    }
  })();

  pendingFetches.set(key, fetchPromise);
  return fetchPromise;
}

export async function playSampledChord(
  instrumentId: string,
  midiNotes: number[],
  options: {
    strumGapSeconds?: number;
    arpeggio?: boolean;
    velocity?: number;
  } = {}
): Promise<boolean> {
  if (currentMode === "physical") return false;

  const soundfont = INSTRUMENT_SOUNDFONTS[instrumentId] ?? "acoustic_guitar_steel";
  const validNotes = midiNotes.filter((m) => m >= 21 && m <= 108);
  if (!validNotes.length) return false;

  // Attempt to load all samples in parallel with a fast 1.5s timeout
  const timeoutPromise = new Promise<null[]>((resolve) => setTimeout(() => resolve([]), 1500));
  const loadPromise = Promise.all(
    validNotes.map((m) => fetchNoteSample(soundfont, midiToSoundfontNote(m)))
  );

  const samples = await Promise.race([loadPromise, timeoutPromise]);
  if (!samples || samples.length !== validNotes.length || samples.some((s) => s === null)) {
    // If samples cannot be loaded (offline, slow connection, or unmapped), gracefully signal fallback
    return false;
  }

  const ctx = await audioContextManager.getContext();
  const startTime = ctx.currentTime + 0.02;
  const gap = options.arpeggio ? 0.28 : (options.strumGapSeconds ?? 0.032);
  const velocity = options.velocity ?? 0.85;

  samples.forEach((buf, i) => {
    if (!buf) return;
    const source = ctx.createBufferSource();
    source.buffer = buf;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velocity, startTime + i * gap);

    // Subtle stereo widening
    const panner = ctx.createStereoPanner();
    const panOffset = validNotes.length > 1 ? -0.3 + (i / (validNotes.length - 1)) * 0.6 : 0;
    panner.pan.setValueAtTime(panOffset, startTime + i * gap);

    source.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);

    source.start(startTime + i * gap);
  });

  return true;
}
