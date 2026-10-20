/**
 * Preview stems made from the user's REAL uploaded audio, used while the Python
 * backend isn't connected. Each stem is the song itself, filtered to the range
 * that instrument usually lives in (mid/side + band filters).
 *
 * This is a DSP approximation, not AI separation: the layers bleed into each
 * other. It exists so the mixer plays the actual song at full length and every
 * slider, mute and solo is audible. The real backend replaces it.
 */
import { stemKind } from "./stemKinds";

const PREVIEW_RATE = 22050;

/** 16-bit mono WAV. */
export function encodeWav16(samples: Float32Array, sampleRate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

type Source = "mid" | "side";
interface Band {
  source: Source;
  filters: { type: BiquadFilterType; freq: number; q?: number }[];
  gain: number;
}

/** What each stem keeps. Plain frequency bands — deliberately simple and honest. */
export function bandsFor(id: string): Band[] {
  switch (stemKind(id)) {
    case "vocal":
      return id.includes("backing")
        ? [{ source: "side", filters: [{ type: "highpass", freq: 250 }, { type: "lowpass", freq: 5000 }], gain: 2 }]
        : [{ source: "mid", filters: [{ type: "highpass", freq: 250 }, { type: "lowpass", freq: 4500 }], gain: 1 }];
    case "drums":
      return [
        { source: "mid", filters: [{ type: "lowpass", freq: 90 }], gain: 1 },
        { source: "mid", filters: [{ type: "highpass", freq: 7000 }], gain: 1.4 },
      ];
    case "bass":
      return [{ source: "mid", filters: [{ type: "lowpass", freq: 220 }], gain: 1 }];
    case "guitar":
      return [{ source: "side", filters: [{ type: "highpass", freq: 180 }, { type: "lowpass", freq: 3500 }], gain: 1.6 }];
    case "keys":
      return [{ source: "mid", filters: [{ type: "bandpass", freq: 900, q: 0.5 }], gain: 1.4 }];
    default:
      return [{ source: "side", filters: [{ type: "highpass", freq: 5000 }], gain: 2 }];
  }
}

export async function decodeFile(file: File): Promise<AudioBuffer> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    void ctx.close();
  }
}

/** Render one preview stem of a decoded song. */
export async function renderPreviewStem(song: AudioBuffer, id: string): Promise<Blob> {
  const length = Math.max(1, Math.ceil(song.duration * PREVIEW_RATE));
  const ctx = new OfflineAudioContext(1, length, PREVIEW_RATE);
  const src = ctx.createBufferSource();
  src.buffer = song;
  const split = ctx.createChannelSplitter(2);
  src.connect(split);
  const stereo = song.numberOfChannels > 1;

  for (const band of bandsFor(id)) {
    const entry = ctx.createGain();
    entry.gain.value = band.gain;
    if (band.source === "mid") {
      src.connect(entry); // mono down-mix of the source = (L + R) / 2
    } else {
      // side = (L − R) / 2 ; a mono song has no side, so it falls back to the mono signal
      const l = ctx.createGain();
      const r = ctx.createGain();
      l.gain.value = stereo ? 0.5 : 1;
      r.gain.value = stereo ? -0.5 : 0;
      split.connect(l, 0);
      split.connect(r, stereo ? 1 : 0);
      l.connect(entry);
      r.connect(entry);
    }
    let node: AudioNode = entry;
    for (const f of band.filters) {
      const b = ctx.createBiquadFilter();
      b.type = f.type;
      b.frequency.value = f.freq;
      if (f.q) b.Q.value = f.q;
      node.connect(b);
      node = b;
    }
    node.connect(ctx.destination);
  }
  src.start();
  const out = await ctx.startRendering();
  return encodeWav16(out.getChannelData(0), PREVIEW_RATE);
}
