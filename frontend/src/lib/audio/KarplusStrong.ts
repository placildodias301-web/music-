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
import { getPresetForInstrument } from "./AudioPresets";
import { audioContextManager } from "./AudioContextManager";

/**
 * Standard pitch to frequency using 12-TET
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

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
  const duration = Math.min(
    stringProps.maxSeconds * fretShortenFactor * (0.8 + velocity * 0.3),
    4.5
  );
  const totalSamples = Math.floor(sr * duration);

  // Period in samples for Karplus-Strong loop
  // The 2-point averaging filter adds 0.5 sample delay; subtract it.
  const periodExact = sr / freq;
  const period = Math.max(4, Math.round(periodExact - 0.5));

  const buffer = ctx.createBuffer(1, totalSamples, sr);
  const out = buffer.getChannelData(0);

  // Pluck position comb filter delay
  const pluckPos = Math.min(0.45, Math.max(0.08, options.pluckPosition ?? stringProps.pluckPosition));
  const pluckCombDelay = Math.max(2, Math.round(period * pluckPos));

  // Velocity affects excitation brightness
  const dynamicBrightness = Math.min(
    0.98,
    stringProps.brightness * (0.65 + velocity * 0.45)
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
    const prev1 = out[i - period];
    const prev2 = out[Math.max(0, i - period - 1)];
    // Averaging filter with string-specific decay loss
    out[i] = decayFactor * 0.5 * (prev1 + prev2);
  }

  // Smooth tail fade-out to prevent clicks
  const fadeSamples = Math.min(512, Math.floor(totalSamples * 0.05));
  for (let i = 0; i < fadeSamples; i++) {
    const idx = totalSamples - fadeSamples + i;
    const fade = 1 - i / fadeSamples;
    out[idx] *= fade;
  }

  return buffer;
}

/**
 * Plays a single physical string note through the audio graph.
 */
export async function playPhysicalStringNote(options: NotePlayOptions): Promise<void> {
  const ctx = await audioContextManager.getContext();
  const preset = getPresetForInstrument(options.instrument || "guitar");

  // Determine acoustic properties of this specific string
  let stringProps = preset.defaultString;
  if (options.stringIndex !== undefined && preset.strings[options.stringIndex]) {
    stringProps = preset.strings[options.stringIndex];
  }

  const audioBuf = renderStringAudioBuffer(ctx, options, stringProps);
  const source = ctx.createBufferSource();
  source.buffer = audioBuf;

  // Individual voice gain
  const voiceGain = ctx.createGain();
  const velocity = options.velocity ?? 0.8;
  const isMuted = options.isMuted || options.fret === null || (options.fret !== undefined && options.fret < 0);
  voiceGain.gain.setValueAtTime(isMuted ? 0.3 * velocity : 0.75 * velocity, ctx.currentTime);

  // Stereo Panning for natural spatial depth across the instrument
  let panValue = options.pan ?? 0;
  if (options.stringIndex !== undefined && options.totalStrings) {
    // Strings spread slightly across stereo field: low strings left, high right
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
  audioContextManager.registerSource(source);

  source.onended = () => {
    audioContextManager.unregisterSource(source);
    try {
      source.disconnect();
      voiceGain.disconnect();
      if (panner) panner.disconnect();
    } catch {}
  };
}
