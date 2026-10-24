/**
 * Advanced Karplus-Strong Physical String Synthesis Model
 *
 * Implements:
 * - Dual-phase pluck excitation (pick/finger transient + noise comb filter)
 * - Variable pluck position (bridge vs sound hole comb notch)
 * - Fractional delay line tuning
 * - String-mass and gauge-dependent loop damping
 * - Open vs. fretted finger-flesh damping
 * - Velocity-dependent low-pass excitation
 * - Muted string percussive "chuck" modeling
 */

import { type NotePlayOptions, type StringAcousticProperties } from "./AudioTypes";
import { getPresetForInstrument, profileForMidi } from "./AudioPresets";
import { audioContextManager } from "./AudioContextManager";

import { midiToFreq } from "./pitch";
export { midiToFreq };

/** Peak level of every rendered string (before the voice gain). */
export const TARGET_PEAK = 0.85;

/**
 * Synthesizes an AudioBuffer of a physically plucked or muted string.
 */
export function renderStringAudioBuffer(
  ctx: AudioContext,
  options: NotePlayOptions,
  stringProps: StringAcousticProperties
): AudioBuffer {
  const sr = ctx.sampleRate;
  const isMuted = options.isMuted || options.fret === null || (options.fret !== undefined && options.fret < 0);
  const velocity = Math.min(1.0, Math.max(0.1, options.velocity ?? 0.8));
  const fret = options.fret ?? 0;
  const isOpen = options.isOpen ?? (fret === 0 && !isMuted);

  // ─── 1. MUTED STRING "CHUCK" SYNTHESIS ───
  if (isMuted) {
    const chuckSeconds = 0.08;
    const chuckSamples = Math.floor(sr * chuckSeconds);
    const buffer = ctx.createBuffer(1, chuckSamples, sr);
    const data = buffer.getChannelData(0);

    // Muted string: brief percussive click + damped low-mid thud
    const baseFreq = options.midi ? midiToFreq(options.midi) : 150;
    const thudPeriod = Math.max(2, Math.round(sr / baseFreq));

    let prev = 0;
    for (let i = 0; i < chuckSamples; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 60) * velocity * 0.4;
      // Filtered noise with periodic thud
      const white = Math.random() * 2 - 1;
      prev = prev + 0.35 * (white - prev);
      const thud = Math.sin((2 * Math.PI * i) / thudPeriod) * 0.3;
      data[i] = (prev * 0.7 + thud) * env;
    }
    return buffer;
  }

  // ─── 2. PLUCKED STRING SYNTHESIS ───
  const freq = options.frequency ?? midiToFreq(options.midi);
  // Total duration: base string maxSeconds modified by fret position and velocity
  const fretShortenFactor = Math.max(0.5, 1 - fret * 0.025);
  // Real strings ring on: the buffer is long enough for the natural decay to finish before the final fade.
  const duration = Math.min(
    stringProps.maxSeconds * 1.5 * fretShortenFactor * (0.8 + velocity * 0.3),
    6
  );
  const totalSamples = Math.floor(sr * duration);

  // Loop delay in samples. The 2-point averaging filter already adds 0.5 sample, so the delay line
  // supplies the rest: an integer part plus a fraction that is interpolated, so EVERY fret is in tune
  // (rounding to whole samples left high notes up to ~25 cents off).
  const remaining = Math.max(2, sr / freq - 0.5);
  const delayInt = Math.floor(remaining);
  const delayFrac = remaining - delayInt;
  const period = delayInt + 2;

  const buffer = ctx.createBuffer(1, totalSamples, sr);
  const out = buffer.getChannelData(0);

  // Pluck position comb filter delay
  const pluckPos = Math.min(0.45, Math.max(0.08, options.pluckPosition ?? stringProps.pluckPosition));
  const pluckCombDelay = Math.max(2, Math.round(period * pluckPos));

  // Velocity affects excitation brightness: a harder pick has more highs. Full-range, not dulled: a real guitar is bright.
  const dynamicBrightness = Math.min(
    0.97,
    stringProps.brightness * (0.72 + velocity * 0.5)
  );

  // Decay factor per loop cycle
  // Open strings have longer sustain; fretted strings have finger damping
  let decayFactor = stringProps.decay;
  if (isOpen) {
    decayFactor = Math.min(0.9992, decayFactor + 0.001);
  } else {
    decayFactor = Math.max(0.98, decayFactor - fret * 0.0003);
  }

  // Generate Excitation Signal
  const noiseBuf = new Float32Array(period);
  let filterState = 0;
  const lowpassAlpha = Math.max(0.1, 1 - dynamicBrightness);

  for (let i = 0; i < period; i++) {
    // Pick transient impulse
    const transientPhase = (i / Math.max(1, period * 0.15)) * Math.PI;
    const transient =
      i < period * 0.15
        ? Math.sin(transientPhase) * stringProps.transientSharpness * 0.5
        : 0;

    // White noise
    const white = Math.random() * 2 - 1;

    // Velocity low-pass filtering on excitation
    filterState = filterState + (1 - lowpassAlpha) * (white - filterState);

    noiseBuf[i] = filterState * 0.8 + transient;
  }

  // Apply Pluck-Position Comb Filter: e[n] = noise[n] - noise[n - D_pluck]
  for (let i = 0; i < period; i++) {
    const delayedIdx = (i - pluckCombDelay + period) % period;
    out[i] = (noiseBuf[i] - 0.85 * noiseBuf[delayedIdx]) * velocity;
  }

  // Karplus-Strong Loop with 2-Point Low-Pass Averaging
  for (let i = period; i < totalSamples; i++) {
    // Fractionally delayed copy of the string, then the averaging filter with string-specific decay loss.
    const a = (1 - delayFrac) * out[i - delayInt] + delayFrac * out[i - delayInt - 1];
    const b = (1 - delayFrac) * out[i - delayInt - 1] + delayFrac * out[i - delayInt - 2];
    out[i] = decayFactor * 0.5 * (a + b);
  }

  // A touch of warmth only: a light one-pole low-pass that rounds the very top without dulling the sound.
  const warmth = Math.min(0.98, 0.72 + dynamicBrightness * 0.28);
  let lp = 0;
  for (let i = 0; i < totalSamples; i++) {
    lp += warmth * (out[i] - lp);
    out[i] = lp;
  }

  // Pick attack: a few milliseconds of bright, high-passed noise, the snap that makes it sound like a plucked string.
  const clickSamples = Math.min(Math.floor(sr * 0.012), totalSamples);
  let prevNoise = 0;
  for (let i = 0; i < clickSamples; i++) {
    const white = Math.random() * 2 - 1;
    const highPassed = white - prevNoise;
    prevNoise = white;
    out[i] += highPassed * 0.35 * stringProps.transientSharpness * velocity * Math.exp(-i / (sr * 0.0025));
  }

  // Natural release: a soft attack (no click), then the ring-out fades over the last
  // ~55% of the note on a smooth cosine curve, so the sound dies away slowly instead of being cut off.
  const attackSamples = Math.min(Math.floor(sr * 0.004), totalSamples);
  const releaseStart = 0.7;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / totalSamples;
    let env = 1;
    if (i < attackSamples) env = i / attackSamples;
    if (t > releaseStart) env *= 0.5 * (1 + Math.cos(Math.PI * ((t - releaseStart) / (1 - releaseStart))));
    out[i] *= env;
  }

  // Level: every string is rendered to the same peak, so loudness is decided by the voice gain alone:
  // a low string, a high string and a fretted note all come out at the same level and nothing is left quiet.
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 1e-6) {
    const scale = TARGET_PEAK / peak;
    for (let i = 0; i < totalSamples; i++) out[i] *= scale;
  }

  return buffer;
}

/**
 * Plays a single physical string note through the audio graph.
 */
export async function playPhysicalStringNote(options: NotePlayOptions): Promise<void> {
  // A muted or invalid string makes no sound at all.
  if (options.isMuted || options.fret === null || (options.fret !== undefined && options.fret < 0) || !Number.isFinite(options.midi)) return;

  const ctx = await audioContextManager.getContext();
  const preset = getPresetForInstrument(options.instrument || "guitar");

  // Acoustic profile by PITCH within the instrument's range (not by string index, which differs between instruments).
  const stringProps = profileForMidi(preset, options.midi);

  const audioBuf = renderStringAudioBuffer(ctx, options, stringProps);
  const source = ctx.createBufferSource();
  source.buffer = audioBuf;

  // Individual voice gain
  const voiceGain = ctx.createGain();
  const velocity = options.velocity ?? 0.8;
  // The voice planner sets `gain` so any number of simultaneous voices stays balanced; a lone note defaults to the single-note level.
  voiceGain.gain.setValueAtTime(options.gain ?? 0.75 * velocity, ctx.currentTime);

  // Stereo panning for natural spatial depth: low strings slightly left, high slightly right.
  let panValue = options.pan ?? 0;
  if (options.pan === undefined && options.stringIndex !== undefined && options.totalStrings) {
    const relPos = options.stringIndex / Math.max(1, options.totalStrings - 1);
    panValue = (relPos - 0.5) * 0.28; // subtle ±0.14 spread
  }

  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (panner) {
    panner.pan.setValueAtTime(Math.min(1, Math.max(-1, panValue)), ctx.currentTime);
    source.connect(voiceGain);
    voiceGain.connect(panner);
    panner.connect(audioContextManager.getVoiceInputNode(preset));
  } else {
    source.connect(voiceGain);
    voiceGain.connect(audioContextManager.getVoiceInputNode(preset));
  }

  const startTime = options.startTime ?? ctx.currentTime;
  source.start(startTime);
  audioContextManager.registerSource(source, voiceGain);

  source.onended = () => {
    audioContextManager.unregisterSource(source);
    try {
      source.disconnect();
      voiceGain.disconnect();
      if (panner) panner.disconnect();
    } catch {}
  };
}
