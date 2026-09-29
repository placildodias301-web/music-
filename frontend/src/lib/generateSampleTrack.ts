/**
 * Generates a short, original, synthesized demo audio clip entirely in the
 * browser using the Web Audio API (OfflineAudioContext) — no external audio
 * file, no copyrighted material, nothing bundled or downloaded.
 *
 * This exists so the "Use Sample Track" button in the Upload flow always
 * works, even if the person demoing Wilsify AI doesn't have an audio file
 * handy. It renders the C → G → Am → F demo progression as simple sustained
 * triads at 120 BPM, matching the sample data described in the analysis
 * results, and returns it as a playable WAV Blob.
 */

const SAMPLE_RATE = 44100;
const CHORD_NOTES: Record<string, number[]> = {
  // MIDI-ish frequencies (Hz) for a simple root-position triad, octave 3-4
  C: [130.81, 164.81, 196.0], // C3 E3 G3
  G: [98.0, 123.47, 146.83], // G2 B2 D3
  Am: [110.0, 130.81, 164.81], // A2 C3 E3
  F: [87.31, 110.0, 130.81], // F2 A2 C3
};
const PROGRESSION = ["C", "G", "Am", "F"];
const SECONDS_PER_CHORD = 2; // 120 BPM, 4 beats per chord = 2s

function encodeWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Renders the demo progression to a WAV Blob and returns an object URL
 * ready to be used as an <audio> `src`. Caller is responsible for revoking
 * the URL (URL.revokeObjectURL) when it's no longer needed.
 */
export async function generateSampleTrack(): Promise<{
  blobUrl: string;
  durationSeconds: number;
}> {
  const totalSeconds = PROGRESSION.length * SECONDS_PER_CHORD;
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  const ctx = new OfflineCtx(2, SAMPLE_RATE * totalSeconds, SAMPLE_RATE);
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.18;
  masterGain.connect(ctx.destination);

  PROGRESSION.forEach((chordName, chordIndex) => {
    const startTime = chordIndex * SECONDS_PER_CHORD;
    const notes = CHORD_NOTES[chordName];

    notes.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;

      const noteGain = ctx.createGain();
      // Gentle attack/decay envelope so chord changes don't click.
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.linearRampToValueAtTime(1, startTime + 0.05);
      noteGain.gain.setValueAtTime(1, startTime + SECONDS_PER_CHORD - 0.15);
      noteGain.gain.linearRampToValueAtTime(0, startTime + SECONDS_PER_CHORD - 0.02);

      osc.connect(noteGain);
      noteGain.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + SECONDS_PER_CHORD);
    });
  });

  const renderedBuffer = await ctx.startRendering();
  const wavBlob = encodeWav(renderedBuffer);
  const blobUrl = URL.createObjectURL(wavBlob);

  return { blobUrl, durationSeconds: totalSeconds };
}
