/**
 * AudioContextManager
 * ONE AudioContext for the whole app (browsers cap how many may exist), with a master bus: per-instrument body
 * resonance chains → a gentle room reverb → a peak limiter → a warmth filter → output.
 *
 * It also tracks every ringing voice, so playback can be stopped (with a short fade, never a click) and so a new
 * chord can take over from the one still ringing without leaving anything stuck.
 */

import { type InstrumentPreset } from "./AudioTypes";
import { getPresetForInstrument } from "./AudioPresets";

interface Chain {
  input: AudioNode;
}

class AudioContextManager {
  private static instance: AudioContextManager | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private roomInput: AudioNode | null = null;
  /** One persistent chain per instrument preset. They are never torn down, so switching instrument cannot cut off notes still ringing. */
  private chains: Map<string, Chain> = new Map();
  /** Every voice that has been started and not yet ended, with the gain node that can fade it. */
  private voices: Map<AudioScheduledSourceNode, GainNode | null> = new Map();

  private constructor() {}

  public static getInstance(): AudioContextManager {
    if (!AudioContextManager.instance) {
      AudioContextManager.instance = new AudioContextManager();
    }
    return AudioContextManager.instance;
  }

  /** Whether this browser can play Web Audio at all. */
  public isSupported(): boolean {
    return typeof window !== "undefined" && Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  }

  /**
   * Initializes or returns the active AudioContext.
   * Resumes automatically if suspended by browser autoplay policy (must be called from a user gesture the first time).
   */
  public async getContext(): Promise<AudioContext> {
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtxClass) {
        throw new Error("Web Audio isn't supported in this browser.");
      }

      this.chains.clear();
      this.voices.clear();
      this.ctx = new AudioCtxClass();
      this.setupMasterChain();
    }

    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        // May wait for direct user gesture in some browsers
      }
    }

    return this.ctx;
  }

  /** Master bus: voices → (body chain) → limiter → warmth → master volume → destination, with a reverb send. */
  private setupMasterChain() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(1, t);

    // Peak safety limiter: only catches the rare peak; per-voice gains are already balanced by the voice planner.
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-9, t);
    this.compressor.knee.setValueAtTime(12, t);
    this.compressor.ratio.setValueAtTime(5, t);
    this.compressor.attack.setValueAtTime(0.004, t);
    this.compressor.release.setValueAtTime(0.18, t);

    // Room ambience: a short, dark, decaying reverb tail so notes bloom and fade like a real room.
    const roomIn = ctx.createGain();
    roomIn.gain.setValueAtTime(1, t);
    const roomFilter = ctx.createBiquadFilter();
    roomFilter.type = "lowpass";
    roomFilter.frequency.setValueAtTime(3200, t);

    if (typeof ctx.createConvolver === "function") {
      const convolver = ctx.createConvolver();
      convolver.buffer = this.makeRoomImpulse(ctx);
      roomIn.connect(convolver);
      convolver.connect(roomFilter);
    } else {
      const delay1 = ctx.createDelay();
      delay1.delayTime.setValueAtTime(0.019, t);
      const delay2 = ctx.createDelay();
      delay2.delayTime.setValueAtTime(0.029, t);
      roomIn.connect(delay1);
      delay1.connect(delay2);
      delay2.connect(roomFilter);
    }
    roomFilter.connect(this.compressor);
    this.roomInput = roomIn;

    // Only the very top is rolled off (above ~10 kHz), so strings keep their highs and presence.
    const warmth = ctx.createBiquadFilter();
    warmth.type = "lowpass";
    warmth.frequency.setValueAtTime(10500, t);
    warmth.Q.setValueAtTime(0.5, t);

    this.compressor.connect(warmth);
    warmth.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
  }

  /** ~1.4 s of exponentially decaying noise: a small, soft room. */
  private makeRoomImpulse(ctx: AudioContext): AudioBuffer {
    const seconds = 1.4;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      }
    }
    return impulse;
  }

  /** Builds (once) the body-resonance chain for a preset and returns its input. */
  private chainFor(preset: InstrumentPreset): Chain {
    const existing = this.chains.get(preset.id);
    if (existing) return existing;
    const ctx = this.ctx;
    if (!ctx || !this.compressor) throw new Error("AudioContext not initialized");

    let first: AudioNode | null = null;
    let last: AudioNode | null = null;
    for (const spec of preset.bodyResonanceFreqs) {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.setValueAtTime(spec.freq, ctx.currentTime);
      filter.Q.setValueAtTime(spec.Q, ctx.currentTime);
      filter.gain.setValueAtTime(spec.gainDb, ctx.currentTime);
      if (last) last.connect(filter);
      else first = filter;
      last = filter;
    }
    const input: AudioNode = first ?? this.compressor;
    if (last) {
      last.connect(this.compressor);
      if (this.roomInput) {
        const send = ctx.createGain();
        send.gain.setValueAtTime(preset.roomReverbAmount, ctx.currentTime);
        last.connect(send);
        send.connect(this.roomInput);
      }
    }
    const chain = { input };
    this.chains.set(preset.id, chain);
    return chain;
  }

  /** Where individual voices of an instrument should connect. */
  public getVoiceInputNode(preset?: InstrumentPreset): AudioNode {
    if (!this.ctx) {
      throw new Error("AudioContext not initialized");
    }
    return this.chainFor(preset ?? getPresetForInstrument("guitar")).input;
  }

  /** Registers a started voice (and the gain that can fade it) so it can be stopped, and forgets it when it ends. */
  public registerSource(source: AudioScheduledSourceNode, gain?: GainNode | null) {
    this.voices.set(source, gain ?? null);
  }

  public unregisterSource(source: AudioScheduledSourceNode) {
    this.voices.delete(source);
  }

  /** How many voices are currently scheduled or ringing. */
  public activeVoiceCount(): number {
    return this.voices.size;
  }

  /**
   * Fades out and stops every voice, including ones scheduled for later (the rest of a strum). The fade is short but not
   * instant, so there is no click, and the master volume is never touched — a chord started right after is at full level.
   */
  public stopAll(fadeSeconds = 0.08) {
    const ctx = this.ctx;
    const now = ctx?.currentTime ?? 0;
    for (const [source, gain] of [...this.voices]) {
      try {
        const g = gain?.gain;
        if (ctx && g && typeof g.cancelScheduledValues === "function" && typeof g.linearRampToValueAtTime === "function") {
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(0, now + fadeSeconds);
        }
        source.stop(now + fadeSeconds + 0.01);
      } catch {
        // A voice that already ended can't be stopped again — nothing to do.
      }
    }
    this.voices.clear();
  }
}

export const audioContextManager = AudioContextManager.getInstance();
