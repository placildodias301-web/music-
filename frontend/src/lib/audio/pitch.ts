let referenceA4 = 440;
export const REFERENCE_PITCH_MIN = 415;
export const REFERENCE_PITCH_MAX = 466;

/** The A4 reference pitch the whole app uses (the Tuner's setting). Chord audio, note frequencies and the tuner all follow it. */
export function getReferencePitch(): number {
  return referenceA4;
}

export function setReferencePitch(hz: number): void {
  if (Number.isFinite(hz)) referenceA4 = Math.min(REFERENCE_PITCH_MAX, Math.max(REFERENCE_PITCH_MIN, hz));
}

/** Standard pitch to frequency using 12-TET relative to the reference pitch (A4 = MIDI 69, 440 Hz unless changed). */
export function midiToFreq(midi: number, a4: number = referenceA4): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Frequency of `midi` shifted by `cents` (used to detune the strings of one course slightly, like a real mandolin or 12-string). */
export function detunedFreq(midi: number, cents: number): number {
  return midiToFreq(midi) * Math.pow(2, cents / 1200);
}
