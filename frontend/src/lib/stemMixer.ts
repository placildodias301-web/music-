/**
 * Multi-lane stem mixer (Moises-style), done entirely in the browser.
 *
 * Honesty note: this is NOT AI source separation (that needs a neural model
 * such as Demucs). It splits the real uploaded audio by stereo position and
 * frequency range, which is genuine DSP, and then MEASURES how much sound
 * each lane really contains. A lane is reported as "detected" only when it
 * carries audible signal — a mono file has no side lane, a track with no bass
 * has an empty bass lane. The lane names describe the region they isolate
 * (centre vocals/lead, bass range, …); they do not identify instruments.
 *
 *   mid  = (L + R) / 2      side = (L − R) / 2      (L = mid + side)
 *   Vocals & centre = mid, band-passed 200 Hz – 5 kHz
 *   Bass            = mid, low-passed at 200 Hz
 *   Highs           = mid, high-passed at 5 kHz (hats, cymbals, air)
 *   Sides           = side (wide guitars, keys, reverb, backing parts)
 */

export type LaneId = "vocals" | "bass" | "highs" | "sides";

export interface LaneInfo {
  id: LaneId;
  label: string;
  hint: string;
  /** RMS level in dBFS (−Infinity when silent). */
  levelDb: number;
  /** True when this lane carries audible signal. */
  detected: boolean;
  buffer: AudioBuffer;
}

export interface LaneAnalysis {
  lanes: LaneInfo[];
  detectedCount: number;
  isStereo: boolean;
  duration: number;
  /** 0–1 peaks of the whole mix for the waveform. */
  peaks: number[];
}

const LANES: { id: LaneId; label: string; hint: string }[] = [
  { id: "vocals", label: "Vocals & centre", hint: "Centre-panned mids (lead vocal, centred instruments)" },
  { id: "bass", label: "Bass range", hint: "Below 200 Hz (bass, kick)" },
  { id: "highs", label: "Highs", hint: "Above 5 kHz (hats, cymbals, air)" },
  { id: "sides", label: "Sides", hint: "Wide stereo content (guitars, keys, reverb)" },
];

/** A lane counts as present when it is audible in absolute terms and not buried under the loudest lane. */
export const ABS_FLOOR_DB = -55;
export const REL_FLOOR_DB = -42;

export function rmsDb(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  const rms = Math.sqrt(sum / Math.max(1, data.length));
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/** Marks which lanes are present given each lane's level. Pure, so it is unit-tested. */
export function detectLanes(levels: number[]): boolean[] {
  const loudest = Math.max(...levels);
  return levels.map((db) => Number.isFinite(db) && db > ABS_FLOOR_DB && db > loudest - Math.abs(REL_FLOOR_DB));
}

export function peaksOf(data: Float32Array, bars = 320): number[] {
  const size = Math.max(1, Math.floor(data.length / bars));
  const out: number[] = [];
  let max = 0;
  for (let b = 0; b < bars; b++) {
    let peak = 0;
    const end = Math.min(data.length, (b + 1) * size);
    for (let i = b * size; i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
    out.push(peak);
    max = Math.max(max, peak);
  }
  return max > 0 ? out.map((p) => p / max) : out;
}

function audioCtor(): typeof AudioContext {
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

async function filtered(source: Float32Array, sampleRate: number, chain: { type: BiquadFilterType; freq: number }[]): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(1, source.length, sampleRate);
  const buf = off.createBuffer(1, source.length, sampleRate);
  buf.copyToChannel(source as Float32Array<ArrayBuffer>, 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  let node: AudioNode = src;
  for (const f of chain) {
    // Two cascaded biquads per stage = a steeper 24 dB/oct slope.
    for (let i = 0; i < 2; i++) {
      const b = off.createBiquadFilter();
      b.type = f.type;
      b.frequency.value = f.freq;
      b.Q.value = 0.707;
      node.connect(b);
      node = b;
    }
  }
  node.connect(off.destination);
  src.start();
  return off.startRendering();
}

function toBuffer(ctx: BaseAudioContext, data: Float32Array, sampleRate: number): AudioBuffer {
  const b = ctx.createBuffer(1, data.length, sampleRate);
  b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return b;
}

export async function analyseLanes(audioUrl: string, onProgress?: (done: number, total: number) => void): Promise<LaneAnalysis> {
  const bytes = await (await fetch(audioUrl)).arrayBuffer();
  const ctx = new (audioCtor())();
  const decoded = await ctx.decodeAudioData(bytes.slice(0));
  const sr = decoded.sampleRate;
  const left = decoded.getChannelData(0);
  const isStereo = decoded.numberOfChannels >= 2;
  const right = isStereo ? decoded.getChannelData(1) : left;
  const mid = new Float32Array(left.length);
  const side = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    mid[i] = (left[i] + right[i]) / 2;
    side[i] = (left[i] - right[i]) / 2;
  }

  const total = 3;
  let done = 0;
  const step = async (chain: { type: BiquadFilterType; freq: number }[]) => {
    const out = await filtered(mid, sr, chain);
    onProgress?.(++done, total);
    return out;
  };
  const buffers: Record<LaneId, AudioBuffer> = {
    vocals: await step([{ type: "highpass", freq: 200 }, { type: "lowpass", freq: 5000 }]),
    bass: await step([{ type: "lowpass", freq: 200 }]),
    highs: await step([{ type: "highpass", freq: 5000 }]),
    // A mono file has no side information at all: that lane is genuinely empty.
    sides: toBuffer(ctx, isStereo ? side : new Float32Array(left.length), sr),
  };

  const levels = LANES.map((l) => rmsDb(buffers[l.id].getChannelData(0)));
  const present = detectLanes(levels);
  const lanes: LaneInfo[] = LANES.map((l, i) => ({ ...l, levelDb: levels[i], detected: present[i], buffer: buffers[l.id] }));
  await ctx.close().catch(() => {});
  return { lanes, detectedCount: present.filter(Boolean).length, isStereo, duration: decoded.duration, peaks: peaksOf(mid) };
}

/** Linear gain for a lane: slider 0–100 (80 = original level, up to +2 dB), mute and solo applied. */
export function laneGain(volume: number, muted: boolean, soloed: boolean, anySolo: boolean): number {
  if (muted || (anySolo && !soloed)) return 0;
  return Math.max(0, volume) / 80;
}

/** Plays all lanes in lock-step through one AudioContext (so they can never drift apart). */
export class StemPlayer {
  private ctx: AudioContext;
  private gains: GainNode[];
  private sources: AudioBufferSourceNode[] = [];
  private startedAt = 0; // ctx time when the current run began
  private offset = 0; // song position at that moment
  private playing = false;
  readonly duration: number;
  onEnded: (() => void) | null = null;

  private buffers: AudioBuffer[];

  constructor(buffers: AudioBuffer[]) {
    this.buffers = buffers;
    this.ctx = new (audioCtor())();
    this.duration = Math.max(...buffers.map((b) => b.duration));
    this.gains = buffers.map(() => {
      const g = this.ctx.createGain();
      g.connect(this.ctx.destination);
      return g;
    });
  }

  get isPlaying() {
    return this.playing;
  }

  get time(): number {
    return this.playing ? Math.min(this.duration, this.offset + (this.ctx.currentTime - this.startedAt)) : this.offset;
  }

  setGain(i: number, value: number) {
    this.gains[i].gain.setTargetAtTime(value, this.ctx.currentTime, 0.015);
  }

  async play() {
    if (this.playing) return;
    await this.ctx.resume();
    if (this.offset >= this.duration - 0.05) this.offset = 0;
    this.sources = this.buffers.map((b, i) => {
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.gains[i]);
      s.start(0, this.offset);
      return s;
    });
    this.sources[0].onended = () => {
      if (this.playing && this.time >= this.duration - 0.1) {
        this.playing = false;
        this.offset = 0;
        this.onEnded?.();
      }
    };
    this.startedAt = this.ctx.currentTime;
    this.playing = true;
  }

  private stopSources() {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    this.sources = [];
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.time;
    this.playing = false;
    this.stopSources();
  }

  async seek(t: number) {
    const was = this.playing;
    if (was) this.pause();
    this.offset = Math.max(0, Math.min(this.duration, t));
    if (was) await this.play();
  }

  dispose() {
    this.playing = false;
    this.stopSources();
    void this.ctx.close().catch(() => {});
  }
}
