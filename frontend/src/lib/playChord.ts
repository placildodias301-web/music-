import { chordMidiNotes, getGuitarVoicings, getUkuleleShape, GUITAR_TUNING, UKULELE_TUNING, type ParsedChord } from "./chordTheory";
import { audioEngine, audioContextManager, INSTRUMENT_PRESETS, voiceGainFor } from "./audio";

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Soft attack, a short hold, then a slow cosine fade to silence — a note that rings and dies away
 * instead of playing at full volume and then stopping.
 */
function softEnvelope(gain: AudioParam, t0: number, attack: number, total: number, peak = 1) {
  gain.setValueAtTime(0, t0);
  gain.linearRampToValueAtTime(peak, t0 + attack);
  const fadeStart = t0 + attack + (total - attack) * 0.25;
  gain.setValueAtTime(peak, fadeStart);
  const points = 64;
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) curve[i] = peak * 0.5 * (1 + Math.cos((Math.PI * i) / (points - 1)));
  gain.setValueCurveAtTime(curve, fadeStart, t0 + total - fadeStart);
}

/** What a synth (non-string) play call scheduled: the notes and how long they ring. */
export interface SynthResult {
  notes: number[];
  durationSeconds: number;
}

/**
 * Synth voices (keys, mallets, harp, wind…) use the SAME shared AudioContext and master bus as the string engine, so there is
 * one context for the whole app, one volume path, and one Stop. Starting a new sound fades the previous one out.
 */
async function synthOutput(): Promise<{ ctx: AudioContext; out: AudioNode }> {
  const ctx = await audioContextManager.getContext();
  audioContextManager.stopAll();
  return { ctx, out: audioContextManager.getVoiceInputNode(INSTRUMENT_PRESETS.piano) };
}

/** Rounds off a synth voice's harsh top end. */
function warmFilter(ctx: AudioContext, cutoff = 3200): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  f.Q.value = 0.5;
  return f;
}

/** Plays a chord's triad as a soft sustained tone through the shared audio bus. */
export function playChordLive(chord: ParsedChord, durationSeconds = 2.2): Promise<SynthResult> {
  return playToneNotes(chordMidiNotes(chord, 60), "sustained", durationSeconds);
}

/** Turns a fretted shape (null = muted) into the MIDI notes it sounds, string by string. */
export function fretsToMidi(frets: (number | null)[], tuning: number[]): number[] {
  return frets.flatMap((f, i) => (f === null ? [] : [tuning[i] + f]));
}

/** Which plucked-string voice to use. These are simple string simulations, not recordings of the real instruments. */
export type PluckKind = "guitar" | "ukulele" | "bass" | "mandolin" | "banjo" | "harp";

/** Strums a guitar or ukulele shape exactly as drawn in its chord diagram, first string to last. */
export function playStrummedShape(frets: (number | null)[], instrument: PluckKind, tuning: number[]) {
  const instType = instrument === "bass" ? "bass" : instrument === "ukulele" ? "ukulele" : "guitar";
  audioEngine.playChord({
    frets,
    tuningMidi: tuning,
    instrument: instType,
    direction: "down",
  });
}

/**
 * Plays MIDI notes as plucked strings, one after another. A short gap is a strum (all notes ring together);
 * a longer one is an arpeggio (a run of single notes).
 */
export function playPluckedNotes(midis: number[], instrument: PluckKind, gapSeconds?: number) {
  const instType = instrument === "bass" ? "bass" : instrument === "ukulele" ? "ukulele" : "guitar";
  if (!midis.length) return;
  if (gapSeconds !== undefined && gapSeconds > 0.08) {
    audioEngine.playArpeggio({
      frets: midis.map(() => 0),
      tuningMidi: midis,
      instrument: instType,
      speed: gapSeconds >= 0.25 ? "slow" : gapSeconds <= 0.12 ? "fast" : "normal",
    });
  } else {
    audioEngine.playChord({
      frets: midis.map(() => 0),
      tuningMidi: midis,
      instrument: instType,
      speed: gapSeconds ?? "normal",
      direction: "down",
    });
  }
}

/** Plays a single note with plucked or synthesized tone */
export function playSingleNote(midi: number, instrument: PluckKind = "guitar") {
  const instType = instrument === "bass" ? "bass" : instrument === "ukulele" ? "ukulele" : "guitar";
  audioEngine.playNote({
    midi,
    instrument: instType,
  });
}

/** Plays notes in sequence as an arpeggio at slow (0.35s), normal (0.18s), or fast (0.09s) speed */
export function playArpeggioNotes(
  midis: number[],
  instrument: PluckKind = "guitar",
  speed: "slow" | "normal" | "fast" = "normal"
) {
  const instType = instrument === "bass" ? "bass" : instrument === "ukulele" ? "ukulele" : "guitar";
  audioEngine.playArpeggio({
    frets: midis.map(() => 0),
    tuningMidi: midis,
    instrument: instType,
    speed,
  });
}

/**
 * A neutral reference tone for instruments Wilsify cannot synthesise convincingly (keys, accordion, mallets):
 * soft sine voices, so you hear WHICH notes the chord has — not what the real instrument sounds like.
 * One voice per note, all overlapping, level-balanced for however many notes there are.
 */
export async function playToneNotes(midis: number[], style: "sustained" | "struck" = "sustained", seconds = style === "struck" ? 2.4 : 2.2): Promise<SynthResult> {
  const notes = midis.filter((m) => Number.isFinite(m));
  if (!notes.length) return { notes, durationSeconds: 0 };
  const { ctx, out } = await synthOutput();
  const warm = warmFilter(ctx, style === "struck" ? 4200 : 3000);
  warm.connect(out);
  const perNote = voiceGainFor(notes.length) * 0.5;
  notes.forEach((midi, i) => {
    const t = ctx.currentTime + 0.02 + (style === "struck" ? i * 0.03 : i * 0.012);
    const gain = ctx.createGain();
    if (style === "struck") {
      // A bell-like strike: instant attack, then a long smooth decay to silence.
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(perNote, t + 0.004);
      gain.gain.setTargetAtTime(0, t + 0.004, seconds / 5);
    } else {
      softEnvelope(gain.gain, t, 0.05, seconds, perNote);
    }
    gain.connect(warm);
    // A sine plus a quiet octave-up sine: a pure, sweet tone rather than a buzzy triangle/square.
    for (const [mult, level] of [[1, 1], [2, style === "struck" ? 0.18 : 0.1]] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = midiToFrequency(midi) * mult;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(gain);
      osc.start(t);
      osc.stop(t + seconds);
      audioContextManager.registerSource(osc, gain);
      osc.onended = () => {
        audioContextManager.unregisterSource(osc);
        try {
          osc.disconnect();
          g.disconnect();
        } catch {}
      };
    }
  });
  return { notes, durationSeconds: seconds + notes.length * 0.03 };
}

/* ─── Wind voices: simple additive synthesis, so a flute, a clarinet and a trumpet do not all sound alike ─── */

export interface WindVoice {
  /** Relative strength of harmonics 1, 2, 3 … (a clarinet has mostly odd ones; a flute is nearly a sine). */
  harmonics: number[];
  attack: number;
  release: number;
  /** Low-pass cutoff as a multiple of the note's frequency; `swell` opens it over the attack (brass). */
  cutoff: number;
  swell?: number;
  vibratoHz: number;
  vibratoDepth: number;
  /** Amount of breath noise mixed in. */
  breath: number;
  gain: number;
}

export const WIND_VOICES = {
  flute: { harmonics: [1, 0.25, 0.08, 0.03], attack: 0.07, release: 0.12, cutoff: 6, vibratoHz: 5, vibratoDepth: 0.004, breath: 0.05, gain: 1 },
  recorder: { harmonics: [1, 0.08, 0.03], attack: 0.04, release: 0.08, cutoff: 5, vibratoHz: 0, vibratoDepth: 0, breath: 0.02, gain: 1 },
  clarinet: { harmonics: [1, 0.02, 0.6, 0.02, 0.35, 0.02, 0.2], attack: 0.05, release: 0.1, cutoff: 8, vibratoHz: 0, vibratoDepth: 0, breath: 0.015, gain: 0.8 },
  oboe: { harmonics: [0.6, 1, 0.9, 0.7, 0.5, 0.35, 0.2, 0.1], attack: 0.05, release: 0.1, cutoff: 9, vibratoHz: 5.5, vibratoDepth: 0.005, breath: 0.01, gain: 0.55 },
  bassoon: { harmonics: [1, 0.8, 0.7, 0.5, 0.35, 0.25, 0.15], attack: 0.07, release: 0.12, cutoff: 5, vibratoHz: 4.5, vibratoDepth: 0.003, breath: 0.01, gain: 0.6 },
  sax: { harmonics: [1, 0.7, 0.55, 0.4, 0.3, 0.2, 0.12, 0.08], attack: 0.06, release: 0.12, cutoff: 6, vibratoHz: 5, vibratoDepth: 0.004, breath: 0.03, gain: 0.6 },
  trumpet: { harmonics: [1, 0.9, 0.8, 0.65, 0.5, 0.4, 0.3, 0.2, 0.12], attack: 0.04, release: 0.1, cutoff: 3, swell: 9, vibratoHz: 0, vibratoDepth: 0, breath: 0.01, gain: 0.45 },
  trombone: { harmonics: [1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.1], attack: 0.07, release: 0.12, cutoff: 2.5, swell: 7, vibratoHz: 0, vibratoDepth: 0, breath: 0.01, gain: 0.5 },
  horn: { harmonics: [1, 0.55, 0.3, 0.15, 0.08], attack: 0.1, release: 0.18, cutoff: 3, swell: 5, vibratoHz: 0, vibratoDepth: 0, breath: 0.01, gain: 0.8 },
  tuba: { harmonics: [1, 0.6, 0.3, 0.12, 0.05], attack: 0.1, release: 0.15, cutoff: 3, swell: 4, vibratoHz: 0, vibratoDepth: 0, breath: 0.01, gain: 0.9 },
  bowed: { harmonics: [1, 0.55, 0.38, 0.28, 0.2, 0.14, 0.1, 0.06], attack: 0.14, release: 0.3, cutoff: 4.5, vibratoHz: 5.5, vibratoDepth: 0.004, breath: 0.012, gain: 0.55 },
  harmonica: { harmonics: [1, 0.6, 0.5, 0.4, 0.3, 0.22, 0.15, 0.1], attack: 0.05, release: 0.2, cutoff: 7, vibratoHz: 6, vibratoDepth: 0.002, breath: 0.02, gain: 0.5 },
} satisfies Record<string, WindVoice>;

export type WindVoiceName = keyof typeof WIND_VOICES;

/**
 * Plays notes with a wind-like synthetic voice on the shared audio bus. `gapSeconds` > 0 steps through them one by one
 * (a wind instrument plays one note at a time); 0 sounds them together (harmonica holes, a bowed chord).
 * Not a recording or a model of the real instrument.
 */
export async function playWindNotes(midis: number[], voiceName: WindVoiceName, gapSeconds = 0.5): Promise<SynthResult> {
  const notes = midis.filter((m) => Number.isFinite(m));
  if (!notes.length) return { notes, durationSeconds: 0 };
  const { ctx, out } = await synthOutput();
  const v: WindVoice = WIND_VOICES[voiceName];
  const master = ctx.createGain();
  master.gain.value = gapSeconds > 0 ? 0.22 : 0.22 * Math.sqrt(1.5 / Math.max(1, notes.length)) * 1.2;
  master.connect(out);
  const hold = gapSeconds > 0 ? Math.max(gapSeconds * 0.95, 0.5) : 1.6;
  const real = new Float32Array([0, ...v.harmonics.map(() => 0)]);
  const imag = new Float32Array([0, ...v.harmonics]);
  const wave = ctx.createPeriodicWave(real, imag);
  let noiseBuffer: AudioBuffer | null = null;
  if (v.breath > 0) {
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * (hold + 0.3)), ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  notes.forEach((midi, i) => {
    const f = midiToFrequency(midi);
    const t0 = ctx.currentTime + 0.02 + i * gapSeconds;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = f;
    if (v.vibratoHz > 0) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = v.vibratoHz;
      depth.gain.value = f * v.vibratoDepth;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + hold + v.release + 0.1);
    }
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(f * v.cutoff, 12000), t0);
    if (v.swell) filter.frequency.linearRampToValueAtTime(Math.min(f * v.swell, 12000), t0 + v.attack * 3);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(v.gain, t0 + v.attack);
    const release = Math.min(Math.max(v.release * 2.5, 0.3), hold * 0.6);
    env.gain.setValueAtTime(v.gain, t0 + hold - release);
    env.gain.setTargetAtTime(0, t0 + hold - release, release / 4);
    osc.connect(filter);
    let noise: AudioBufferSourceNode | null = null;
    if (noiseBuffer) {
      noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(f * 2, 8000);
      const ng = ctx.createGain();
      ng.gain.value = v.breath;
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(env);
      noise.start(t0);
      noise.stop(t0 + hold + 0.1);
      audioContextManager.registerSource(noise, env);
    }
    filter.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + hold + 0.1);
    audioContextManager.registerSource(osc, env);
    osc.onended = () => {
      audioContextManager.unregisterSource(osc);
      if (noise) audioContextManager.unregisterSource(noise);
      try {
        osc.disconnect();
        filter.disconnect();
        env.disconnect();
      } catch {}
    };
  });
  return { notes, durationSeconds: hold + notes.length * gapSeconds + 0.3 };
}

export type ChordView = "guitar" | "ukulele" | "piano";

/** Plays a chord the way a Chord Library card shows it: strummed guitar/ukulele shape, or piano notes. */
export function playChordInView(chord: ParsedChord, view: ChordView, voicingIndex = 0) {
  if (view === "guitar") {
    const voicings = getGuitarVoicings(chord);
    const voicing = voicings[voicingIndex % Math.max(voicings.length, 1)];
    if (voicing) return playStrummedShape(voicing.frets, "guitar", GUITAR_TUNING);
  }
  if (view === "ukulele") return playStrummedShape(getUkuleleShape(chord), "ukulele", UKULELE_TUNING);
  playChordLive(chord);
}
