import { chordMidiNotes, getGuitarVoicings, getUkuleleShape, GUITAR_TUNING, UKULELE_TUNING, type ParsedChord } from "./chordTheory";
import { audioEngine } from "./audio";

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Plays a chord's triad live through the Web Audio API — used by the Chord Library's "play" button. */
export function playChordLive(chord: ParsedChord, durationSeconds = 1.4) {
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0.2;
  master.connect(ctx.destination);

  const notes = chordMidiNotes(chord, 60);

  notes.forEach((midi) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToFrequency(midi);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(1, ctx.currentTime + durationSeconds - 0.2);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationSeconds);

    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + durationSeconds);
  });

  window.setTimeout(() => ctx.close().catch(() => {}), (durationSeconds + 0.2) * 1000);
}

/** Turns a fretted shape (null = muted) into the MIDI notes it sounds, string by string. */
export function fretsToMidi(frets: (number | null)[], tuning: number[]): number[] {
  return frets.flatMap((f, i) => (f === null ? [] : [tuning[i] + f]));
}

const PLUCK_TONE = {
  // Steel strings: bright attack, long sustain.
  guitar: { brightness: 0.75, decay: 0.996, strumGap: 0.035, seconds: 2.6 },
  // Nylon strings: softer attack, shorter ring.
  ukulele: { brightness: 0.45, decay: 0.993, strumGap: 0.045, seconds: 1.8 },
  // Heavier strings: darker, longer.
  bass: { brightness: 0.35, decay: 0.998, strumGap: 0.06, seconds: 2.4 },
  // Bright, quick strings.
  mandolin: { brightness: 0.85, decay: 0.99, strumGap: 0.03, seconds: 1.5 },
  banjo: { brightness: 0.9, decay: 0.988, strumGap: 0.03, seconds: 1.3 },
  // Soft, long ring.
  harp: { brightness: 0.5, decay: 0.997, strumGap: 0.07, seconds: 3.0 },
};

/** Which plucked-string voice to use. These are simple string simulations, not recordings of the real instruments. */
export type PluckKind = keyof typeof PLUCK_TONE;

/** Renders one plucked string with Karplus–Strong synthesis (legacy helper). */
export function renderPluck(ctx: AudioContext, midi: number, tone: (typeof PLUCK_TONE)["guitar"]): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * tone.seconds);
  const buffer = ctx.createBuffer(1, length, sr);
  const out = buffer.getChannelData(0);
  // The averaging filter adds half a sample of delay, so subtract it from the period.
  const period = Math.max(2, Math.round(sr / midiToFrequency(midi) - 0.5));

  // Excitation: noise burst, low-passed so lower brightness = softer pick.
  let prev = 0;
  for (let i = 0; i < period; i++) {
    prev = prev + tone.brightness * (Math.random() * 2 - 1 - prev);
    out[i] = prev;
  }
  for (let i = period; i < length; i++) {
    out[i] = tone.decay * 0.5 * (out[i - period] + out[Math.max(0, i - period - 1)]);
  }
  return buffer;
}

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
      speed: gapSeconds ?? 0.034,
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
 * plain oscillators, so you hear WHICH notes the chord has — not what the real instrument sounds like.
 */
export function playToneNotes(midis: number[], style: "sustained" | "struck" = "sustained") {
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const seconds = style === "struck" ? 1.6 : 1.4;
  const master = ctx.createGain();
  master.gain.value = 0.2;
  master.connect(ctx.destination);
  midis.forEach((midi) => {
    const osc = ctx.createOscillator();
    osc.type = style === "struck" ? "sine" : "triangle";
    osc.frequency.value = midiToFrequency(midi);
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + (style === "struck" ? 0.005 : 0.03));
    if (style === "struck") gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    else {
      gain.gain.setValueAtTime(1, t + seconds - 0.2);
      gain.gain.linearRampToValueAtTime(0, t + seconds);
    }
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(t + seconds);
  });
  window.setTimeout(() => ctx.close().catch(() => {}), (seconds + 0.2) * 1000);
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
  harmonica: { harmonics: [1, 0.6, 0.5, 0.4, 0.3, 0.22, 0.15, 0.1], attack: 0.05, release: 0.2, cutoff: 7, vibratoHz: 6, vibratoDepth: 0.002, breath: 0.02, gain: 0.5 },
} satisfies Record<string, WindVoice>;

export type WindVoiceName = keyof typeof WIND_VOICES;

/**
 * Plays notes with a wind-like synthetic voice. `gapSeconds` > 0 steps through them one by one (a wind instrument plays one note
 * at a time); 0 sounds them together (harmonica holes). Not a recording or a model of the real instrument.
 */
export function playWindNotes(midis: number[], voiceName: WindVoiceName, gapSeconds = 0.5) {
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const v: WindVoice = WIND_VOICES[voiceName];
  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
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
  midis.forEach((midi, i) => {
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
      lfo.stop(t0 + hold + v.release);
    }
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(f * v.cutoff, 12000), t0);
    if (v.swell) filter.frequency.linearRampToValueAtTime(Math.min(f * v.swell, 12000), t0 + v.attack * 3);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(v.gain, t0 + v.attack);
    env.gain.setValueAtTime(v.gain, t0 + hold - v.release);
    env.gain.linearRampToValueAtTime(0, t0 + hold);
    osc.connect(filter);
    if (noiseBuffer) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(f * 2, 8000);
      const ng = ctx.createGain();
      ng.gain.value = v.breath;
      n.connect(bp);
      bp.connect(ng);
      ng.connect(env);
      n.start(t0);
      n.stop(t0 + hold);
    }
    filter.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + hold + 0.02);
  });
  window.setTimeout(() => ctx.close().catch(() => {}), (hold + midis.length * gapSeconds + 0.6) * 1000);
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
