import { chordMidiNotes, getGuitarVoicings, getUkuleleShape, GUITAR_TUNING, UKULELE_TUNING, type ParsedChord } from "./chordTheory";
import { audioEngine, playSynth, type SynthResult } from "./audio";

/** Plays a chord's triad as a piano chord through the shared audio bus. */
export function playChordLive(chord: ParsedChord): Promise<SynthResult> {
  return playSynth("piano", chordMidiNotes(chord, 60), "chord");
}

/** Turns a fretted shape (null = muted) into the MIDI notes it sounds, string by string. */
export function fretsToMidi(frets: (number | null)[], tuning: number[]): number[] {
  return frets.flatMap((f, i) => (f === null ? [] : [tuning[i] + f]));
}

/** Which plucked-string voice to use. These are simple string simulations, not recordings of the real instruments. */
export type PluckKind = "guitar" | "ukulele" | "bass" | "mandolin" | "banjo" | "harp";

/** Strums a guitar or ukulele shape exactly as drawn in its chord diagram, first string to last. */
export function playStrummedShape(frets: (number | null)[], instrument: PluckKind, tuning: number[]) {
  const instType = instrument === "bass" ? "bass" : instrument === "ukulele" ? "ukulele" : "guitar";
  audioEngine.playChord({
    frets,
    tuningMidi: tuning,
    instrument: instType,
    direction: "down",
  });
}

/**
 * Plays MIDI notes as plucked strings, one after another. A short gap is a strum (all notes ring together);
 * a longer one is an arpeggio (a run of single notes).
 */
export function playPluckedNotes(midis: number[], instrument: PluckKind, gapSeconds?: number) {
  const instType = instrument === "bass" ? "bass" : instrument === "ukulele" ? "ukulele" : "guitar";
  if (!midis.length) return;
  if (gapSeconds !== undefined && gapSeconds > 0.08) {
    audioEngine.playArpeggio({
      frets: midis.map(() => 0),
      tuningMidi: midis,
      instrument: instType,
      speed: gapSeconds >= 0.25 ? "slow" : gapSeconds <= 0.12 ? "fast" : "normal",
    });
  } else {
    audioEngine.playChord({
      frets: midis.map(() => 0),
      tuningMidi: midis,
      instrument: instType,
      speed: gapSeconds ?? "normal",
      direction: "down",
    });
  }
}

/** Plays a single note with plucked or synthesized tone */
export function playSingleNote(midi: number, instrument: PluckKind = "guitar") {
  const instType = instrument === "bass" ? "bass" : instrument === "ukulele" ? "ukulele" : "guitar";
  audioEngine.playNote({
    midi,
    instrument: instType,
  });
}

/** Plays notes in sequence as an arpeggio at slow (0.35s), normal (0.18s), or fast (0.09s) speed */
export function playArpeggioNotes(
  midis: number[],
  instrument: PluckKind = "guitar",
  speed: "slow" | "normal" | "fast" = "normal"
) {
  const instType = instrument === "bass" ? "bass" : instrument === "ukulele" ? "ukulele" : "guitar";
  audioEngine.playArpeggio({
    frets: midis.map(() => 0),
    tuningMidi: midis,
    instrument: instType,
    speed,
  });
}

export type ChordView = "guitar" | "ukulele" | "piano";

/** Plays a chord the way a Chord Library card shows it: strummed guitar/ukulele shape, or piano notes. */
export function playChordInView(chord: ParsedChord, view: ChordView, voicingIndex = 0) {
  if (view === "guitar") {
    const voicings = getGuitarVoicings(chord);
    const voicing = voicings[voicingIndex % Math.max(voicings.length, 1)];
    if (voicing) return playStrummedShape(voicing.frets, "guitar", GUITAR_TUNING);
  }
  if (view === "ukulele") return playStrummedShape(getUkuleleShape(chord), "ukulele", UKULELE_TUNING);
  playChordLive(chord);
}
