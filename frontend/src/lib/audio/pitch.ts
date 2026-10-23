/** Standard pitch to frequency using 12-TET (A4 = MIDI 69 = 440 Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Frequency of `midi` shifted by `cents` (used to detune the strings of one course slightly, like a real mandolin or 12-string). */
export function detunedFreq(midi: number, cents: number): number {
  return midiToFreq(midi) * Math.pow(2, cents / 1200);
}
