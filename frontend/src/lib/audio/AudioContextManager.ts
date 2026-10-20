/**
 * AudioContextManager
 * Centralized singleton audio context with master effects bus,
 * body resonance filters, subtle room ambience, and safety peak limiter.
 */

import { type InstrumentPreset } from "./AudioTypes";
import { getPresetForInstrument } from "./AudioPresets";

class AudioContextManager {
  private static instance: AudioContextManager | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private roomGain: GainNode | null = null;
  private bodyFilters: BiquadFilterNode[] = [];
  private activeSources: Set<AudioNode> = new Set();
  private currentInstrumentId: string = "guitar";

  private constructor() {}

  public static getInstance(): AudioContextManager {
    if (!AudioContextManager.instance) {
      AudioContextManager.instance = new AudioContextManager();
    }
    return AudioContextManager.instance;
  }

  /**
   * Initializes or returns the active AudioContext.
   * Resumes automatically if suspended by browser autoplay policy.
   */
  public async getContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      
      if (!AudioCtxClass) {
        throw new Error("Web Audio API is not supported in this environment.");
      }

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

  /**
   * Sets up the master audio chain:
   * Body Resonance EQ -> Room Ambience -> Peak Limiter -> Destination
   */
  private setupMasterChain() {
    if (!this.ctx) return;

    // Master Volume
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    // Peak Safety Compressor / Limiter to prevent clipping
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-3, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(10, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

    // Subtle early reflection room ambience
    this.roomGain = this.ctx.createGain();
    this.roomGain.gain.setValueAtTime(0.07, this.ctx.currentTime);

    const delay1 = this.ctx.createDelay();
    delay1.delayTime.setValueAtTime(0.019, this.ctx.currentTime);
    const delay2 = this.ctx.createDelay();
    delay2.delayTime.setValueAtTime(0.029, this.ctx.currentTime);

    const roomFilter = this.ctx.createBiquadFilter();
    roomFilter.type = "lowpass";
    roomFilter.frequency.setValueAtTime(3200, this.ctx.currentTime);

    this.roomGain.connect(delay1);
    delay1.connect(delay2);
    delay2.connect(roomFilter);
    roomFilter.connect(this.compressor);

    // Initial body filters for guitar
    this.updateBodyFilters(getPresetForInstrument("guitar"));

    // Connect compressor to master output
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  /**
   * Updates acoustic body resonance filters based on the selected instrument.
   */
  public updateBodyFilters(preset: InstrumentPreset) {
    if (!this.ctx || !this.compressor) return;

    // Disconnect old body filters
    for (const f of this.bodyFilters) {
      try {
        f.disconnect();
      } catch {}
    }
    this.bodyFilters = [];

    // Chain new filters
    let lastNode: AudioNode | null = null;
    for (const spec of preset.bodyResonanceFreqs) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.setValueAtTime(spec.freq, this.ctx.currentTime);
      filter.Q.setValueAtTime(spec.Q, this.ctx.currentTime);
      filter.gain.setValueAtTime(spec.gainDb, this.ctx.currentTime);

      if (lastNode) {
        lastNode.connect(filter);
      }
      lastNode = filter;
      this.bodyFilters.push(filter);
    }

    if (lastNode) {
      lastNode.connect(this.compressor);
      if (this.roomGain) {
        lastNode.connect(this.roomGain);
      }
    }

    if (this.roomGain) {
      this.roomGain.gain.setValueAtTime(preset.roomReverbAmount, this.ctx.currentTime);
    }

    this.currentInstrumentId = preset.id;
  }

  /**
   * Returns the input node where individual string voices should connect.
   */
  public getVoiceInputNode(preset?: InstrumentPreset): AudioNode {
    if (!this.ctx) {
      throw new Error("AudioContext not initialized");
    }

    if (preset && preset.id !== this.currentInstrumentId) {
      this.updateBodyFilters(preset);
    }

    if (this.bodyFilters.length > 0) {
      return this.bodyFilters[0];
    }

    return this.compressor || this.ctx.destination;
  }

  /**
   * Registers an active sound source for global tracking and clean stop/cleanup.
   */
  public registerSource(source: AudioNode) {
    this.activeSources.add(source);
  }

  /**
   * Unregisters a finished sound source.
   */
  public unregisterSource(source: AudioNode) {
    this.activeSources.delete(source);
  }

  /**
   * Stops all currently ringing audio voices immediately.
   */
  public stopAll() {
    for (const node of this.activeSources) {
      try {
        if ("stop" in node && typeof (node as AudioScheduledSourceNode).stop === "function") {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {}
    }
    this.activeSources.clear();
  }
}

export const audioContextManager = AudioContextManager.getInstance();
