/**
 * Instrument voices for everything that is not a plucked string: bowed strings, winds, keys, mallets, accordion, harp.
 *
 * Each instrument is a RECIPE — plain data describing its spectrum (partials), how it starts (bow / breath / hammer / mallet),
 * how it is held or decays, vibrato, pitch scoops and body resonances. The recipe is turned into notes by `planSynthNotes`
 * (pure, tested) and into sound by `playSynth` (Web Audio). Nothing here is a recording: it is a physical-style model per
 * instrument family, so a violin, a flute, a piano and a marimba differ in the ways that make them recognisable.
 */

import { audioContextManager } from "./AudioContextManager";
import { INSTRUMENT_PRESETS } from "./AudioPresets";
import { midiToFreq } from "./pitch";

export interface SynthPartial {
  /** Frequency ratio to the note's pitch (1 = fundamental). Non-integers are inharmonic (piano stretch, bars). */
  ratio: number;
  gain: number;
  /** Seconds for this partial to fall to ~37%. Omit for a partial that is held (bowed, blown, organ). */
  decay?: number;
}

export interface SynthRecipe {
  id: string;
  label: string;
  partials: SynthPartial[];
  /** Seconds to reach full level. */
  attack: number;
  release: number;
  /** Seconds a note is held when played as a chord. */
  hold: number;
  level: number;
  /** Two copies detuned ± this many cents: ensemble width for strings, reed beating for accordion and harmonica. */
  detuneCents?: number;
  vibrato?: { hz: number; cents: number; delay: number };
  /** Pitch starts this many cents flat and slides up in ~60 ms (saxophone, brass, a bowed attack). */
  scoopCents?: number;
  /** Low-pass cutoff as a multiple of the note's frequency; `swell` opens it over the attack (brass). */
  cutoff: number;
  swell?: number;
  /** Body / bore resonances that give the instrument its colour. */
  formants?: { freq: number; q: number; gainDb: number }[];
  /** Bow hiss, breath, hammer or mallet noise. `sustained` noise lasts the whole note; otherwise it is a short strike. */
  noise?: { gain: number; hz: number; q: number; seconds: number; sustained: boolean };
  /** Seconds between notes when several sound as a chord: a violin chord is rolled, a harp swept, a piano nearly together. */
  roll: number;
  /** Struck/plucked: lower notes ring longer, higher ones die faster. */
  pitchDecay?: boolean;
  /** Where the sound enters the room: keeps the reverb the same for all synth voices. */
  family: "bowed" | "wind" | "keys" | "mallet" | "reed" | "plucked";
}

const harmonics = (count: number, rolloff: number, first = 1): SynthPartial[] =>
  Array.from({ length: count }, (_, i) => ({ ratio: i + 1, gain: i === 0 ? first : Math.pow(i + 1, -rolloff) }));

const fromList = (gains: number[]): SynthPartial[] => gains.map((gain, i) => ({ ratio: i + 1, gain })).filter((p) => p.gain > 0);

/** Piano: partials slightly sharp of whole multiples (string stiffness), higher partials dying sooner. */
const pianoPartials = (): SynthPartial[] => {
  const gains = [1, 0.55, 0.42, 0.3, 0.2, 0.14, 0.1, 0.07, 0.05, 0.03];
  return gains.map((gain, i) => {
    const n = i + 1;
    return { ratio: n * Math.sqrt(1 + 0.0004 * n * n), gain, decay: 3.2 / Math.pow(n, 0.7) };
  });
};

export const SYNTH_RECIPES: Record<string, SynthRecipe> = {
  /* ── Bowed strings: held notes with a slow bow attack, delayed vibrato, bow hiss and a wooden body ── */
  violin: {
    id: "violin", label: "Violin", family: "bowed",
    partials: harmonics(14, 0.85),
    attack: 0.16, release: 0.5, hold: 2.6, level: 0.5, detuneCents: 4,
    vibrato: { hz: 5.6, cents: 16, delay: 0.35 }, scoopCents: -12,
    cutoff: 14,
    formants: [{ freq: 300, q: 5, gainDb: 5 }, { freq: 530, q: 4, gainDb: 3 }, { freq: 1100, q: 2, gainDb: 1.5 }, { freq: 2900, q: 1.5, gainDb: 5 }],
    noise: { gain: 0.02, hz: 3000, q: 0.6, seconds: 3, sustained: true },
    roll: 0.09,
  },
  viola: {
    id: "viola", label: "Viola", family: "bowed",
    partials: harmonics(14, 0.8),
    attack: 0.18, release: 0.5, hold: 2.7, level: 0.5, detuneCents: 4,
    vibrato: { hz: 5, cents: 15, delay: 0.38 }, scoopCents: -12,
    cutoff: 12,
    formants: [{ freq: 220, q: 5, gainDb: 5 }, { freq: 400, q: 4, gainDb: 3 }, { freq: 1000, q: 2, gainDb: 1.5 }, { freq: 2200, q: 1.5, gainDb: 4 }],
    noise: { gain: 0.02, hz: 2500, q: 0.6, seconds: 3, sustained: true },
    roll: 0.1,
  },
  cello: {
    id: "cello", label: "Cello", family: "bowed",
    partials: harmonics(16, 0.75),
    attack: 0.22, release: 0.6, hold: 2.9, level: 0.55, detuneCents: 3,
    vibrato: { hz: 4.8, cents: 14, delay: 0.4 }, scoopCents: -10,
    cutoff: 10,
    formants: [{ freq: 110, q: 5, gainDb: 6 }, { freq: 200, q: 4, gainDb: 4 }, { freq: 600, q: 2, gainDb: 2 }, { freq: 1500, q: 1.5, gainDb: 3 }],
    noise: { gain: 0.022, hz: 2000, q: 0.6, seconds: 3, sustained: true },
    roll: 0.11,
  },

  /* ── Winds: breath noise, delayed vibrato, characteristic bore resonances ── */
  flute: {
    id: "flute", label: "Flute", family: "wind",
    partials: fromList([1, 0.32, 0.1, 0.04, 0.015]),
    attack: 0.09, release: 0.25, hold: 2.0, level: 0.62, detuneCents: 2,
    vibrato: { hz: 5, cents: 10, delay: 0.5 },
    cutoff: 6,
    noise: { gain: 0.07, hz: 4500, q: 0.8, seconds: 3, sustained: true },
    roll: 0.03,
  },
  bansuri: {
    id: "bansuri", label: "Bansuri", family: "wind",
    partials: fromList([1, 0.28, 0.08, 0.03]),
    attack: 0.12, release: 0.3, hold: 2.2, level: 0.62, detuneCents: 2,
    vibrato: { hz: 4.6, cents: 12, delay: 0.5 },
    cutoff: 5,
    noise: { gain: 0.1, hz: 3500, q: 0.7, seconds: 3, sustained: true },
    roll: 0.03,
  },
  recorder: {
    id: "recorder", label: "Recorder", family: "wind",
    partials: fromList([1, 0.06, 0.03]),
    attack: 0.05, release: 0.15, hold: 1.8, level: 0.65,
    cutoff: 5,
    noise: { gain: 0.025, hz: 4000, q: 0.8, seconds: 3, sustained: true },
    roll: 0.02,
  },
  oboe: {
    id: "oboe", label: "Oboe", family: "wind",
    partials: fromList([0.6, 1, 0.95, 0.75, 0.55, 0.4, 0.25, 0.15, 0.08]),
    attack: 0.06, release: 0.2, hold: 2.0, level: 0.5, detuneCents: 2,
    vibrato: { hz: 5.8, cents: 12, delay: 0.3 },
    cutoff: 9,
    formants: [{ freq: 1300, q: 3, gainDb: 8 }, { freq: 3000, q: 2, gainDb: 3 }],
    noise: { gain: 0.01, hz: 3000, q: 0.8, seconds: 3, sustained: true },
    roll: 0.03,
  },
  clarinet: {
    id: "clarinet", label: "Clarinet", family: "wind",
    partials: fromList([1, 0.02, 0.6, 0.02, 0.38, 0.02, 0.22, 0.02, 0.12]),
    attack: 0.05, release: 0.2, hold: 2.0, level: 0.58, detuneCents: 2,
    vibrato: { hz: 5, cents: 5, delay: 0.7 },
    cutoff: 8,
    formants: [{ freq: 1500, q: 2, gainDb: 3 }],
    noise: { gain: 0.015, hz: 3500, q: 0.8, seconds: 3, sustained: true },
    roll: 0.03,
  },
  bassoon: {
    id: "bassoon", label: "Bassoon", family: "wind",
    partials: fromList([1, 0.85, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1]),
    attack: 0.08, release: 0.22, hold: 2.2, level: 0.55, detuneCents: 2,
    vibrato: { hz: 4.5, cents: 8, delay: 0.5 },
    cutoff: 5,
    formants: [{ freq: 500, q: 3, gainDb: 5 }, { freq: 1200, q: 2, gainDb: 3 }],
    noise: { gain: 0.012, hz: 2500, q: 0.8, seconds: 3, sustained: true },
    roll: 0.04,
  },
  sax: {
    id: "sax", label: "Saxophone", family: "wind",
    partials: fromList([1, 0.75, 0.6, 0.45, 0.33, 0.22, 0.14, 0.09, 0.05]),
    attack: 0.06, release: 0.22, hold: 2.1, level: 0.55, detuneCents: 2,
    vibrato: { hz: 5, cents: 14, delay: 0.3 }, scoopCents: -25,
    cutoff: 6,
    formants: [{ freq: 900, q: 2.5, gainDb: 5 }, { freq: 2000, q: 2, gainDb: 3 }],
    noise: { gain: 0.025, hz: 3000, q: 0.8, seconds: 3, sustained: true },
    roll: 0.04,
  },
  trumpet: {
    id: "trumpet", label: "Trumpet", family: "wind",
    partials: fromList([1, 0.95, 0.85, 0.7, 0.55, 0.42, 0.3, 0.2, 0.12, 0.07]),
    attack: 0.04, release: 0.15, hold: 1.9, level: 0.42,
    vibrato: { hz: 6, cents: 6, delay: 0.6 }, scoopCents: -15,
    cutoff: 3, swell: 9,
    formants: [{ freq: 1200, q: 2, gainDb: 4 }],
    noise: { gain: 0.01, hz: 3000, q: 0.8, seconds: 3, sustained: true },
    roll: 0.03,
  },
  trombone: {
    id: "trombone", label: "Trombone", family: "wind",
    partials: fromList([1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.1]),
    attack: 0.07, release: 0.18, hold: 2.1, level: 0.5,
    scoopCents: -25,
    cutoff: 2.5, swell: 7,
    formants: [{ freq: 700, q: 2, gainDb: 4 }],
    noise: { gain: 0.01, hz: 2500, q: 0.8, seconds: 3, sustained: true },
    roll: 0.04,
  },
  horn: {
    id: "horn", label: "French horn", family: "wind",
    partials: fromList([1, 0.55, 0.3, 0.15, 0.08]),
    attack: 0.12, release: 0.3, hold: 2.3, level: 0.75,
    cutoff: 3, swell: 5,
    formants: [{ freq: 450, q: 2, gainDb: 3 }],
    noise: { gain: 0.01, hz: 2000, q: 0.8, seconds: 3, sustained: true },
    roll: 0.05,
  },
  tuba: {
    id: "tuba", label: "Tuba", family: "wind",
    partials: fromList([1, 0.6, 0.3, 0.12, 0.05]),
    attack: 0.12, release: 0.25, hold: 2.3, level: 0.85,
    cutoff: 3, swell: 4,
    formants: [{ freq: 250, q: 2, gainDb: 4 }],
    noise: { gain: 0.012, hz: 1500, q: 0.8, seconds: 3, sustained: true },
    roll: 0.05,
  },
  harmonica: {
    id: "harmonica", label: "Harmonica", family: "reed",
    partials: fromList([1, 0.6, 0.5, 0.4, 0.3, 0.22, 0.15, 0.1]),
    attack: 0.05, release: 0.25, hold: 2.0, level: 0.5, detuneCents: 8,
    vibrato: { hz: 5.5, cents: 6, delay: 0.25 }, scoopCents: -15,
    cutoff: 7,
    formants: [{ freq: 1800, q: 2, gainDb: 3 }],
    noise: { gain: 0.025, hz: 3500, q: 0.8, seconds: 3, sustained: true },
    roll: 0.01,
  },
  accordion: {
    id: "accordion", label: "Accordion", family: "reed",
    partials: fromList([1, 0.7, 0.8, 0.55, 0.5, 0.35, 0.3, 0.2, 0.15, 0.1]),
    attack: 0.06, release: 0.18, hold: 2.3, level: 0.42, detuneCents: 10,
    cutoff: 8,
    formants: [{ freq: 1400, q: 1.5, gainDb: 3 }],
    noise: { gain: 0.012, hz: 3000, q: 0.8, seconds: 3, sustained: true },
    roll: 0.012,
  },

  /* ── Keys, mallets, harp: struck or plucked, every partial dying at its own rate ── */
  piano: {
    id: "piano", label: "Piano", family: "keys",
    partials: pianoPartials(),
    attack: 0.003, release: 0.4, hold: 3.4, level: 0.5, detuneCents: 1.5,
    cutoff: 12,
    noise: { gain: 0.05, hz: 1800, q: 0.9, seconds: 0.04, sustained: false },
    roll: 0.012, pitchDecay: true,
  },
  organ: {
    id: "organ", label: "Organ", family: "keys",
    partials: fromList([1, 0.8, 0.55, 0.5, 0.25, 0.3, 0, 0.15]),
    attack: 0.015, release: 0.12, hold: 2.6, level: 0.5,
    vibrato: { hz: 6.2, cents: 5, delay: 0 },
    cutoff: 12,
    noise: { gain: 0.02, hz: 2500, q: 0.8, seconds: 0.03, sustained: false },
    roll: 0.004,
  },
  synth: {
    id: "synth", label: "Synthesizer", family: "keys",
    partials: harmonics(20, 1),
    attack: 0.3, release: 0.8, hold: 2.8, level: 0.4, detuneCents: 9,
    cutoff: 3.5, swell: 8,
    roll: 0.01,
  },
  marimba: {
    id: "marimba", label: "Marimba", family: "mallet",
    partials: [{ ratio: 1, gain: 1, decay: 0.9 }, { ratio: 3.98, gain: 0.4, decay: 0.3 }, { ratio: 9.9, gain: 0.12, decay: 0.1 }],
    attack: 0.002, release: 0.25, hold: 1.8, level: 0.65,
    cutoff: 14,
    noise: { gain: 0.07, hz: 1200, q: 1, seconds: 0.03, sustained: false },
    roll: 0.02, pitchDecay: true,
  },
  xylophone: {
    id: "xylophone", label: "Xylophone", family: "mallet",
    partials: [{ ratio: 1, gain: 1, decay: 0.4 }, { ratio: 3, gain: 0.5, decay: 0.15 }, { ratio: 5.9, gain: 0.2, decay: 0.07 }],
    attack: 0.001, release: 0.15, hold: 1.0, level: 0.6,
    cutoff: 16,
    noise: { gain: 0.08, hz: 3000, q: 1, seconds: 0.025, sustained: false },
    roll: 0.02, pitchDecay: true,
  },
  oud: {
    id: "oud", label: "Oud", family: "plucked",
    partials: [1, 0.7, 0.45, 0.28, 0.16, 0.09, 0.05].map((gain, i) => ({ ratio: i + 1, gain, decay: 1.4 / Math.pow(i + 1, 0.7) })),
    attack: 0.003, release: 0.3, hold: 2.4, level: 0.55,
    cutoff: 9,
    formants: [{ freq: 250, q: 3, gainDb: 4 }, { freq: 900, q: 2, gainDb: 3 }],
    noise: { gain: 0.04, hz: 2000, q: 0.9, seconds: 0.03, sustained: false },
    roll: 0.05, pitchDecay: true,
  },
  sitar: {
    id: "sitar", label: "Sitar", family: "plucked",
    // Bright, buzzing: the curved bridge (jawari) keeps upper partials strong and long-lived.
    partials: Array.from({ length: 12 }, (_, i) => ({ ratio: i + 1, gain: Math.pow(i + 1, -0.5), decay: 2.6 / Math.pow(i + 1, 0.35) })),
    attack: 0.003, release: 0.4, hold: 3.0, level: 0.5, detuneCents: 3,
    cutoff: 14,
    formants: [{ freq: 1800, q: 1.5, gainDb: 4 }, { freq: 3500, q: 1.5, gainDb: 3 }],
    noise: { gain: 0.05, hz: 3500, q: 0.8, seconds: 0.05, sustained: false },
    roll: 0.06, pitchDecay: true,
  },
  vibraphone: {
    id: "vibraphone", label: "Vibraphone", family: "mallet",
    partials: [{ ratio: 1, gain: 1, decay: 2.6 }, { ratio: 4, gain: 0.28, decay: 0.9 }, { ratio: 10.1, gain: 0.08, decay: 0.3 }],
    attack: 0.003, release: 0.5, hold: 3.2, level: 0.6,
    vibrato: { hz: 5.5, cents: 4, delay: 0.1 },
    cutoff: 14,
    noise: { gain: 0.04, hz: 1500, q: 1, seconds: 0.03, sustained: false },
    roll: 0.02, pitchDecay: true,
  },
  harp: {
    id: "harp", label: "Harp", family: "plucked",
    partials: [1, 0.6, 0.35, 0.2, 0.12, 0.07, 0.04, 0.02].map((gain, i) => ({ ratio: i + 1, gain, decay: 2.4 / Math.pow(i + 1, 0.8) })),
    attack: 0.004, release: 0.35, hold: 3.2, level: 0.55,
    cutoff: 10,
    noise: { gain: 0.03, hz: 2500, q: 0.9, seconds: 0.03, sustained: false },
    roll: 0.07, pitchDecay: true,
  },
};

/** Which recipe each instrument id uses (ids from lib/instruments/definitions.ts). */
export const RECIPE_FOR_INSTRUMENT: Record<string, string> = {
  violin: "violin", viola: "viola", cello: "cello",
  flute: "flute", piccolo: "flute", bansuri: "bansuri", "tin-whistle": "recorder", recorder: "recorder",
  oboe: "oboe", clarinet: "clarinet", bassoon: "bassoon",
  "soprano-sax": "sax", "alto-sax": "sax", "tenor-sax": "sax", "baritone-sax": "sax",
  trumpet: "trumpet", trombone: "trombone", "french-horn": "horn", tuba: "tuba",
  harmonica: "harmonica", accordion: "accordion",
  piano: "piano", keyboard: "piano", organ: "organ", synthesizer: "synth",
  marimba: "marimba", xylophone: "xylophone", vibraphone: "vibraphone", harp: "harp",
  oud: "oud", sitar: "sitar",
  euphonium: "trombone", cornet: "trumpet", shakuhachi: "bansuri", dizi: "flute",
};

export function recipeForInstrument(instrumentId: string): SynthRecipe | undefined {
  const id = RECIPE_FOR_INSTRUMENT[instrumentId] ?? instrumentId;
  return SYNTH_RECIPES[id];
}

/* ─── Planning (pure) ─── */

export interface PlannedSynthNote {
  midi: number;
  frequency: number;
  startOffset: number;
  duration: number;
  /** Linear level after balancing for how many notes sound together. */
  gain: number;
}

export type SynthMode = "chord" | "arpeggio";

/** Brings every synthesized instrument up to the level of the plucked strings (whose buffers are normalised to a strong peak). */
export const SYNTH_LOUDNESS = 1.5;

/**
 * When and how loud each note sounds. A chord is ROLLED from the lowest note up by the instrument's own roll time (a violin
 * rolls its chords, a piano nearly strikes them together); an arpeggio puts `gap` seconds between notes.
 */
export function planSynthNotes(recipe: SynthRecipe, midis: number[], mode: SynthMode = "chord", gap = 0.35): PlannedSynthNote[] {
  const notes = [...new Set(midis.filter((m) => Number.isFinite(m)))].sort((a, b) => a - b);
  const balance = Math.min(1, Math.sqrt(1.5 / Math.max(1, notes.length)));
  const sustained = recipe.partials.every((p) => p.decay === undefined);
  return notes.map((midi, i) => {
    const startOffset = mode === "chord" ? i * recipe.roll : i * gap;
    // Held instruments in an arpeggio play each note for about one gap; struck/plucked ones ring on.
    const duration = mode === "arpeggio" && sustained ? Math.max(gap * 1.05, recipe.attack + 0.3) : recipe.hold;
    return { midi, frequency: midiToFreq(midi), startOffset, duration, gain: recipe.level * balance * SYNTH_LOUDNESS };
  });
}

/** Time constant for a struck partial: low notes ring longer, high notes die faster. */
export function partialDecaySeconds(recipe: SynthRecipe, partial: SynthPartial, midi: number): number {
  const base = partial.decay ?? 1;
  if (!recipe.pitchDecay) return base;
  const scale = Math.min(1.6, Math.max(0.45, 1.7 - (midi - 40) / 40));
  return base * scale;
}

export interface SynthResult {
  notes: number[];
  durationSeconds: number;
}

/* ─── Sound ─── */

let noiseBuffer: AudioBuffer | null = null;
function noiseFor(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Plays notes with an instrument recipe on the shared audio bus. The previous sound fades out first. */
export async function playSynth(recipeOrId: SynthRecipe | string, midis: number[], mode: SynthMode = "chord", gap = 0.35): Promise<SynthResult> {
  const recipe = typeof recipeOrId === "string" ? recipeForInstrument(recipeOrId) : recipeOrId;
  if (!recipe) return { notes: [], durationSeconds: 0 };
  const planned = planSynthNotes(recipe, midis, mode, gap);
  if (!planned.length) return { notes: [], durationSeconds: 0 };

  const ctx = await audioContextManager.getContext();
  audioContextManager.stopAll();
  const bus = audioContextManager.getVoiceInputNode(INSTRUMENT_PRESETS.piano);
  const start = ctx.currentTime + 0.03;
  const harmonic = recipe.partials.filter((p) => p.decay === undefined && Number.isInteger(p.ratio));
  const individual = recipe.partials.filter((p) => !harmonic.includes(p));

  for (const note of planned) {
    const t0 = start + note.startOffset;
    const t1 = t0 + note.duration;
    const f = note.frequency;

    // Envelope: held instruments rise over the attack and fade over the release; struck ones start at once and ring.
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(note.gain, t0 + Math.max(0.001, recipe.attack));
    const releaseAt = Math.max(t0 + recipe.attack + 0.05, t1 - recipe.release);
    env.gain.setValueAtTime(note.gain, releaseAt);
    env.gain.setTargetAtTime(0, releaseAt, recipe.release / 4);

    // Body resonances after the envelope.
    let tail: AudioNode = env;
    for (const fm of recipe.formants ?? []) {
      const peak = ctx.createBiquadFilter();
      peak.type = "peaking";
      peak.frequency.value = fm.freq;
      peak.Q.value = fm.q;
      peak.gain.value = fm.gainDb;
      tail.connect(peak);
      tail = peak;
    }
    tail.connect(bus);

    // Tone colour: low-pass relative to the pitch; brass-like instruments open it over the attack.
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(Math.min(f * recipe.cutoff, 14000), t0);
    if (recipe.swell) lowpass.frequency.linearRampToValueAtTime(Math.min(f * recipe.swell, 14000), t0 + recipe.attack * 3);
    lowpass.connect(env);

    const stopAt = t1 + recipe.release + 0.15;
    const detunes = recipe.detuneCents ? [-recipe.detuneCents, recipe.detuneCents] : [0];
    const sources: OscillatorNode[] = [];

    const addOsc = (wave: PeriodicWave | null, ratio: number, gain: number, decay: number | null, cents: number) => {
      const osc = ctx.createOscillator();
      if (wave) osc.setPeriodicWave(wave);
      else osc.type = "sine";
      osc.frequency.value = f * ratio;
      osc.detune.setValueAtTime(cents + (recipe.scoopCents ?? 0), t0);
      if (recipe.scoopCents) osc.detune.linearRampToValueAtTime(cents, t0 + 0.06);
      const g = ctx.createGain();
      const share = gain / detunes.length;
      g.gain.setValueAtTime(share, t0);
      if (decay !== null) g.gain.setTargetAtTime(0, t0, decay);
      osc.connect(g);
      g.connect(lowpass);
      osc.start(t0);
      osc.stop(stopAt);
      audioContextManager.registerSource(osc, env);
      osc.onended = () => {
        audioContextManager.unregisterSource(osc);
        try {
          osc.disconnect();
          g.disconnect();
        } catch {}
      };
      sources.push(osc);
    };

    // Held harmonic partials share one oscillator (a wave table): cheap even for 20 harmonics.
    if (harmonic.length) {
      const top = Math.max(...harmonic.map((p) => p.ratio));
      const real = new Float32Array(top + 1);
      const imag = new Float32Array(top + 1);
      for (const p of harmonic) imag[p.ratio] = p.gain;
      const wave = ctx.createPeriodicWave(real, imag);
      for (const cents of detunes) addOsc(wave, 1, 1, null, cents);
    }
    // Struck / inharmonic partials: one oscillator each, each with its own decay.
    for (const p of individual) {
      for (const cents of detunes) addOsc(null, p.ratio, p.gain, p.decay !== undefined ? partialDecaySeconds(recipe, p, note.midi) : null, cents);
    }

    // Vibrato starts after a delay, like a player settling into the note.
    if (recipe.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = recipe.vibrato.hz;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t0);
      depth.gain.setValueAtTime(0, t0 + recipe.vibrato.delay);
      depth.gain.linearRampToValueAtTime(recipe.vibrato.cents, t0 + recipe.vibrato.delay + 0.4);
      lfo.connect(depth);
      for (const osc of sources) depth.connect(osc.detune);
      lfo.start(t0);
      lfo.stop(stopAt);
    }

    // Noise: bow hiss / breath for held instruments, a short strike for struck ones.
    if (recipe.noise) {
      const n = ctx.createBufferSource();
      n.buffer = noiseFor(ctx);
      n.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(recipe.noise.hz, 12000);
      bp.Q.value = recipe.noise.q;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(recipe.noise.gain, t0);
      if (!recipe.noise.sustained) ng.gain.setTargetAtTime(0, t0, recipe.noise.seconds / 3);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(env);
      n.start(t0);
      n.stop(recipe.noise.sustained ? stopAt : t0 + recipe.noise.seconds * 4);
      audioContextManager.registerSource(n, env);
      n.onended = () => audioContextManager.unregisterSource(n);
    }
  }

  const last = planned[planned.length - 1];
  return { notes: planned.map((p) => p.midi), durationSeconds: last.startOffset + last.duration + recipe.release };
}
