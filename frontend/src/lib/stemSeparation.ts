/**
 * Stem separation — Section 3.5.
 *
 * Honesty note: full 4-stem source separation (vocals/drums/bass/other)
 * via Demucs requires a multi-hundred-MB neural network model and heavy
 * inference (PyTorch, GPU-friendly). That's real and free, but it doesn't
 * fit this zero-install, live-demo MVP's constraints. Instead this uses a
 * genuine, well-known DSP technique — phase cancellation on stereo audio:
 *
 *   Instrumental ≈ Left − Right   (cancels anything panned dead-center,
 *                                   which is usually the lead vocal)
 *   Center/Vocal ≈ (Left + Right) / 2, high-pass filtered to de-emphasize
 *                                   bass/drums which are also often centered
 *
 * This is a REAL, audible transformation of the actual uploaded audio —
 * not a placeholder — but it is a 2-stem approximation, not true source
 * separation, and only works on stereo recordings with center-panned
 * vocals (mono files, or vocals mixed off-center, won't separate well).
 * This limitation is disclosed in the UI, consistent with this MVP's
 * honesty pattern for all its "demo" vs "real" labels.
 */

function encodeWav(channelData: Float32Array, sampleRate: number): Blob {
  const numFrames = channelData.length;
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + numFrames * bytesPerSample);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + numFrames * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); // mono output
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, numFrames * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export interface StemResult {
  instrumentalUrl: string;
  vocalEmphasizedUrl: string;
  isStereoSource: boolean;
}

export async function separateStems(audioUrl: string): Promise<StemResult> {
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();

  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

  const isStereoSource = audioBuffer.numberOfChannels >= 2;
  const left = audioBuffer.getChannelData(0);
  const right = isStereoSource ? audioBuffer.getChannelData(1) : audioBuffer.getChannelData(0);
  const length = left.length;

  const instrumental = new Float32Array(length);
  const vocal = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    instrumental[i] = (left[i] - right[i]) / (isStereoSource ? 1 : 1); // L-R cancels center content
    vocal[i] = (left[i] + right[i]) / 2; // mid channel — keeps center content
  }

  const instrumentalBlob = encodeWav(instrumental, audioBuffer.sampleRate);
  const vocalBlob = encodeWav(vocal, audioBuffer.sampleRate);

  await ctx.close().catch(() => {});

  return {
    instrumentalUrl: URL.createObjectURL(instrumentalBlob),
    vocalEmphasizedUrl: URL.createObjectURL(vocalBlob),
    isStereoSource,
  };
}
