import { chordMidiNotes, type ParsedChord } from "./chordTheory";

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Plays a chord's triad live through the Web Audio API — used by the Chord Library's "play" button. */
export function playChordLive(chord: ParsedChord, durationSeconds = 1.4) {
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0.2;
  master.connect(ctx.destination);

  const notes = chordMidiNotes(chord, 60);

  notes.forEach((midi) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToFrequency(midi);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(1, ctx.currentTime + durationSeconds - 0.2);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationSeconds);

    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + durationSeconds);
  });

  window.setTimeout(() => ctx.close().catch(() => {}), (durationSeconds + 0.2) * 1000);
}
