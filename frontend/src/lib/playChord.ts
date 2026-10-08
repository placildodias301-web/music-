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

/** Turns a fretted shape (null = muted) into the MIDI notes it sounds, string by string. */
export function fretsToMidi(frets: (number | null)[], tuning: number[]): number[] {
  return frets.flatMap((f, i) => (f === null ? [] : [tuning[i] + f]));
}

const PLUCK_TONE = {
  // Steel strings: bright attack, long sustain.
  guitar: { brightness: 0.75, decay: 0.996, strumGap: 0.035, seconds: 2.6 },
  // Nylon strings: softer attack, shorter ring.
  ukulele: { brightness: 0.45, decay: 0.993, strumGap: 0.045, seconds: 1.8 },
};

/** Renders one plucked string with Karplus–Strong synthesis. */
function renderPluck(ctx: AudioContext, midi: number, tone: (typeof PLUCK_TONE)["guitar"]): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * tone.seconds);
  const buffer = ctx.createBuffer(1, length, sr);
  const out = buffer.getChannelData(0);
  // The averaging filter adds half a sample of delay, so subtract it from the period.
  const period = Math.max(2, Math.round(sr / midiToFrequency(midi) - 0.5));

  // Excitation: noise burst, low-passed so lower brightness = softer pick.
  let prev = 0;
  for (let i = 0; i < period; i++) {
    prev = prev + tone.brightness * (Math.random() * 2 - 1 - prev);
    out[i] = prev;
  }
  for (let i = period; i < length; i++) {
    out[i] = tone.decay * 0.5 * (out[i - period] + out[Math.max(0, i - period - 1)]);
  }
  return buffer;
}

/** Strums a guitar or ukulele shape exactly as drawn in its chord diagram, first string to last. */
export function playStrummedShape(frets: (number | null)[], instrument: "guitar" | "ukulele", tuning: number[]) {
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const tone = PLUCK_TONE[instrument];
  const master = ctx.createGain();
  master.gain.value = 0.45;
  master.connect(ctx.destination);

  fretsToMidi(frets, tuning).forEach((midi, i) => {
    const src = ctx.createBufferSource();
    src.buffer = renderPluck(ctx, midi, tone);
    src.connect(master);
    src.start(ctx.currentTime + 0.02 + i * tone.strumGap);
  });

  window.setTimeout(() => ctx.close().catch(() => {}), (tone.seconds + 0.5) * 1000);
}
