/**
 * Metronome click sounds, synthesised with Web Audio (no sample files).
 * Shared by the Practice metronome, the count-in before playback and the
 * preview button in Settings, so the chosen sound and volume apply everywhere.
 */

import type { MetronomeSound } from "./settings/model";

let sharedCtx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctx();
  }
  if (sharedCtx.state === "suspended") void sharedCtx.resume();
  return sharedCtx;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Schedules one click at `when` (AudioContext time). `accent` marks beat 1
 * of the bar (a little higher and louder). Volume is 0–100.
 */
export function playClick(ctx: AudioContext, when: number, sound: MetronomeSound, volume: number, accent = false): void {
  const level = Math.max(0, Math.min(1, volume / 100)) * (accent ? 1 : 0.7);
  if (level === 0) return;
  const out = ctx.createGain();
  out.connect(ctx.destination);

  if (sound === "hihat") {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.08);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = accent ? 6500 : 7500;
    src.connect(hp).connect(out);
    out.gain.setValueAtTime(level * 0.9, when);
    out.gain.exponentialRampToValueAtTime(0.0001, when + (accent ? 0.07 : 0.045));
    src.start(when);
    src.stop(when + 0.08);
    return;
  }

  const osc = ctx.createOscillator();
  const spec = {
    woodblock: { type: "sine" as OscillatorType, freq: accent ? 1250 : 950, decay: 0.06, gain: 0.9 },
    beep: { type: "square" as OscillatorType, freq: accent ? 1320 : 880, decay: 0.07, gain: 0.25 },
    clave: { type: "triangle" as OscillatorType, freq: accent ? 2900 : 2500, decay: 0.045, gain: 0.8 },
  }[sound];
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freq, when);
  if (sound === "woodblock") osc.frequency.exponentialRampToValueAtTime(spec.freq * 0.82, when + spec.decay);
  osc.connect(out);
  out.gain.setValueAtTime(0.0001, when);
  out.gain.exponentialRampToValueAtTime(level * spec.gain, when + 0.002);
  out.gain.exponentialRampToValueAtTime(0.0001, when + spec.decay);
  osc.start(when);
  osc.stop(when + spec.decay + 0.02);

  if (sound === "woodblock") {
    // A short knock of filtered noise gives the wooden attack.
    const knock = ctx.createBufferSource();
    knock.buffer = noiseBuffer(ctx, 0.02);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = spec.freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level * 0.35, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.015);
    knock.connect(bp).connect(g).connect(ctx.destination);
    knock.start(when);
    knock.stop(when + 0.02);
  }
}

/** One bar of clicks (used by the Settings preview). */
export function previewClicks(sound: MetronomeSound, volume: number, bpm = 100, beats = 4): void {
  const ctx = audioContext();
  const start = ctx.currentTime + 0.05;
  for (let i = 0; i < beats; i++) playClick(ctx, start + (i * 60) / bpm, sound, volume, i === 0);
}

/**
 * Plays `bars` bars of count-in clicks and resolves when the last beat has
 * passed, so playback starts exactly on the next downbeat. Rejects with an
 * AbortError if the signal fires (the user pressed pause during the count).
 */
export function countIn(opts: { bars: number; beatsPerBar: number; bpm: number; sound: MetronomeSound; volume: number; signal?: AbortSignal }): Promise<void> {
  const { bars, beatsPerBar, bpm, sound, volume, signal } = opts;
  if (bars <= 0) return Promise.resolve();
  const ctx = audioContext();
  const beat = 60 / Math.max(30, Math.min(300, bpm));
  const start = ctx.currentTime + 0.08;
  const total = bars * beatsPerBar;
  for (let i = 0; i < total; i++) playClick(ctx, start + i * beat, sound, volume, i % beatsPerBar === 0);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, (0.08 + total * beat) * 1000);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Count-in cancelled", "AbortError"));
    });
  });
}
