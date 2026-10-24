/** Joins interleaved float samples (-1..1) into one 16-bit PCM WAV file. */
export function encodeWav(chunks: Float32Array[], sampleRate: number, channels = 2): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const bytes = new Uint8Array(44 + total * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + total * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, total * 2, true);
  let at = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++, at += 2) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
  return bytes;
}
