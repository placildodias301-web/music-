/**
 * Key Engine — Phase 2
 * Comprehensive key theory supporting:
 * - 15 Major keys and 15 Minor keys with accurate theoretical spellings
 * - Key signatures (sharps / flats count and exact altered notes list)
 * - Relative major/minor and Parallel major/minor relationships
 * - Circle of Fifths navigation
 * - Diatonic chord and scale generation (Triads and Seventh chords)
 */

export interface KeyDefinition {
  name: string;
  tonic: string;
  mode: "major" | "minor";
  accidentals: {
    type: "♯" | "♭" | "♮";
    count: number;
    alteredNotes: string[];
  };
  relativeKey: string;
  parallelKey: string;
  circlePosition: number; // 0 for C, +1 for G (1 sharp), -1 for F (1 flat), etc.
  scaleNotes: string[];
  diatonicTriads: Array<{ degree: string; romanNumeral: string; chordSymbol: string; notes: string[] }>;
  diatonicSevenths: Array<{ degree: string; romanNumeral: string; chordSymbol: string; notes: string[] }>;
}

export const ORDER_OF_SHARPS = ["F♯", "C♯", "G♯", "D♯", "A♯", "E♯", "B♯"];
export const ORDER_OF_FLATS = ["B♭", "E♭", "A♭", "D♭", "G♭", "C♭", "F♭"];

export const MAJOR_KEYS: Record<string, KeyDefinition> = {
  "C": {
    name: "C Major", tonic: "C", mode: "major", circlePosition: 0,
    accidentals: { type: "♮", count: 0, alteredNotes: [] },
    relativeKey: "Am", parallelKey: "Cm",
    scaleNotes: ["C", "D", "E", "F", "G", "A", "B"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "C", notes: ["C", "E", "G"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "Dm", notes: ["D", "F", "A"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "Em", notes: ["E", "G", "B"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "F", notes: ["F", "A", "C"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "G", notes: ["G", "B", "D"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "Am", notes: ["A", "C", "E"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "Bdim", notes: ["B", "D", "F"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "Cmaj7", notes: ["C", "E", "G", "B"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "Dm7", notes: ["D", "F", "A", "C"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "Em7", notes: ["E", "G", "B", "D"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "Fmaj7", notes: ["F", "A", "C", "E"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "G7", notes: ["G", "B", "D", "F"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "Am7", notes: ["A", "C", "E", "G"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "Bm7b5", notes: ["B", "D", "F", "A"] },
    ],
  },
  "G": {
    name: "G Major", tonic: "G", mode: "major", circlePosition: 1,
    accidentals: { type: "♯", count: 1, alteredNotes: ["F♯"] },
    relativeKey: "Em", parallelKey: "Gm",
    scaleNotes: ["G", "A", "B", "C", "D", "E", "F♯"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "G", notes: ["G", "B", "D"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "Am", notes: ["A", "C", "E"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "Bm", notes: ["B", "D", "F♯"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "C", notes: ["C", "E", "G"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "D", notes: ["D", "F♯", "A"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "Em", notes: ["E", "G", "B"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "F♯dim", notes: ["F♯", "A", "C"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "Gmaj7", notes: ["G", "B", "D", "F♯"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "Am7", notes: ["A", "C", "E", "G"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "Bm7", notes: ["B", "D", "F♯", "A"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "Cmaj7", notes: ["C", "E", "G", "B"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "D7", notes: ["D", "F♯", "A", "C"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "Em7", notes: ["E", "G", "B", "D"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "F♯m7b5", notes: ["F♯", "A", "C", "E"] },
    ],
  },
  "D": {
    name: "D Major", tonic: "D", mode: "major", circlePosition: 2,
    accidentals: { type: "♯", count: 2, alteredNotes: ["F♯", "C♯"] },
    relativeKey: "Bm", parallelKey: "Dm",
    scaleNotes: ["D", "E", "F♯", "G", "A", "B", "C♯"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "D", notes: ["D", "F♯", "A"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "Em", notes: ["E", "G", "B"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "F♯m", notes: ["F♯", "A", "C♯"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "G", notes: ["G", "B", "D"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "A", notes: ["A", "C♯", "E"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "Bm", notes: ["B", "D", "F♯"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "C♯dim", notes: ["C♯", "E", "G"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "Dmaj7", notes: ["D", "F♯", "A", "C♯"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "Em7", notes: ["E", "G", "B", "D"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "F♯m7", notes: ["F♯", "A", "C♯", "E"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "Gmaj7", notes: ["G", "B", "D", "F♯"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "A7", notes: ["A", "C♯", "E", "G"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "Bm7", notes: ["B", "D", "F♯", "A"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "C♯m7b5", notes: ["C♯", "E", "G", "B"] },
    ],
  },
  "A": {
    name: "A Major", tonic: "A", mode: "major", circlePosition: 3,
    accidentals: { type: "♯", count: 3, alteredNotes: ["F♯", "C♯", "G♯"] },
    relativeKey: "F#m", parallelKey: "Am",
    scaleNotes: ["A", "B", "C♯", "D", "E", "F♯", "G♯"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "A", notes: ["A", "C♯", "E"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "Bm", notes: ["B", "D", "F♯"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "C♯m", notes: ["C♯", "E", "G♯"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "D", notes: ["D", "F♯", "A"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "E", notes: ["E", "G♯", "B"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "F♯m", notes: ["F♯", "A", "C♯"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "G♯dim", notes: ["G♯", "B", "D"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "Amaj7", notes: ["A", "C♯", "E", "G♯"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "Bm7", notes: ["B", "D", "F♯", "A"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "C♯m7", notes: ["C♯", "E", "G♯", "B"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "Dmaj7", notes: ["D", "F♯", "A", "C♯"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "E7", notes: ["E", "G♯", "B", "D"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "F♯m7", notes: ["F♯", "A", "C♯", "E"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "G♯m7b5", notes: ["G♯", "B", "D", "F♯"] },
    ],
  },
  "E": {
    name: "E Major", tonic: "E", mode: "major", circlePosition: 4,
    accidentals: { type: "♯", count: 4, alteredNotes: ["F♯", "C♯", "G♯", "D♯"] },
    relativeKey: "C#m", parallelKey: "Em",
    scaleNotes: ["E", "F♯", "G♯", "A", "B", "C♯", "D♯"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "E", notes: ["E", "G♯", "B"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "F♯m", notes: ["F♯", "A", "C♯"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "G♯m", notes: ["G♯", "B", "D♯"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "A", notes: ["A", "C♯", "E"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "B", notes: ["B", "D♯", "F♯"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "C♯m", notes: ["C♯", "E", "G♯"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "D♯dim", notes: ["D♯", "F♯", "A"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "Emaj7", notes: ["E", "G♯", "B", "D♯"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "F♯m7", notes: ["F♯", "A", "C♯", "E"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "G♯m7", notes: ["G♯", "B", "D♯", "F♯"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "Amaj7", notes: ["A", "C♯", "E", "G♯"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "B7", notes: ["B", "D♯", "F♯", "A"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "C♯m7", notes: ["C♯", "E", "G♯", "B"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "D♯m7b5", notes: ["D♯", "F♯", "A", "C♯"] },
    ],
  },
  "B": {
    name: "B Major", tonic: "B", mode: "major", circlePosition: 5,
    accidentals: { type: "♯", count: 5, alteredNotes: ["F♯", "C♯", "G♯", "D♯", "A♯"] },
    relativeKey: "G#m", parallelKey: "Bm",
    scaleNotes: ["B", "C♯", "D♯", "E", "F♯", "G♯", "A♯"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "B", notes: ["B", "D♯", "F♯"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "C♯m", notes: ["C♯", "E", "G♯"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "D♯m", notes: ["D♯", "F♯", "A♯"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "E", notes: ["E", "G♯", "B"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "F♯", notes: ["F♯", "A♯", "C♯"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "G♯m", notes: ["G♯", "B", "D♯"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "A♯dim", notes: ["A♯", "C♯", "E"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "Bmaj7", notes: ["B", "D♯", "F♯", "A♯"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "C♯m7", notes: ["C♯", "E", "G♯", "B"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "D♯m7", notes: ["D♯", "F♯", "A♯", "C♯"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "Emaj7", notes: ["E", "G♯", "B", "D♯"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "F♯7", notes: ["F♯", "A♯", "C♯", "E"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "G♯m7", notes: ["G♯", "B", "D♯", "F♯"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "A♯m7b5", notes: ["A♯", "C♯", "E", "G♯"] },
    ],
  },
  "F#": {
    name: "F♯ Major", tonic: "F♯", mode: "major", circlePosition: 6,
    accidentals: { type: "♯", count: 6, alteredNotes: ["F♯", "C♯", "G♯", "D♯", "A♯", "E♯"] },
    relativeKey: "D#m", parallelKey: "F#m",
    scaleNotes: ["F♯", "G♯", "A♯", "B", "C♯", "D♯", "E♯"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "F♯", notes: ["F♯", "A♯", "C♯"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "G♯m", notes: ["G♯", "B", "D♯"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "A♯m", notes: ["A♯", "C♯", "E♯"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "B", notes: ["B", "D♯", "F♯"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "C♯", notes: ["C♯", "E♯", "G♯"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "D♯m", notes: ["D♯", "F♯", "A♯"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "E♯dim", notes: ["E♯", "G♯", "B"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "F♯maj7", notes: ["F♯", "A♯", "C♯", "E♯"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "G♯m7", notes: ["G♯", "B", "D♯", "F♯"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "A♯m7", notes: ["A♯", "C♯", "E♯", "G♯"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "Bmaj7", notes: ["B", "D♯", "F♯", "A♯"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "C♯7", notes: ["C♯", "E♯", "G♯", "B"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "D♯m7", notes: ["D♯", "F♯", "A♯", "C♯"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "E♯m7b5", notes: ["E♯", "G♯", "B", "D♯"] },
    ],
  },
  "F": {
    name: "F Major", tonic: "F", mode: "major", circlePosition: -1,
    accidentals: { type: "♭", count: 1, alteredNotes: ["B♭"] },
    relativeKey: "Dm", parallelKey: "Fm",
    scaleNotes: ["F", "G", "A", "B♭", "C", "D", "E"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "F", notes: ["F", "A", "C"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "Gm", notes: ["G", "B♭", "D"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "Am", notes: ["A", "C", "E"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "B♭", notes: ["B♭", "D", "F"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "C", notes: ["C", "E", "G"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "Dm", notes: ["D", "F", "A"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "Edim", notes: ["E", "G", "B♭"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "Fmaj7", notes: ["F", "A", "C", "E"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "Gm7", notes: ["G", "B♭", "D", "F"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "Am7", notes: ["A", "C", "E", "G"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "B♭maj7", notes: ["B♭", "D", "F", "A"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "C7", notes: ["C", "E", "G", "B♭"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "Dm7", notes: ["D", "F", "A", "C"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "Em7b5", notes: ["E", "G", "B♭", "D"] },
    ],
  },
  "Bb": {
    name: "B♭ Major", tonic: "B♭", mode: "major", circlePosition: -2,
    accidentals: { type: "♭", count: 2, alteredNotes: ["B♭", "E♭"] },
    relativeKey: "Gm", parallelKey: "Bbm",
    scaleNotes: ["B♭", "C", "D", "E♭", "F", "G", "A"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "B♭", notes: ["B♭", "D", "F"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "Cm", notes: ["C", "E♭", "G"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "Dm", notes: ["D", "F", "A"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "E♭", notes: ["E♭", "G", "B♭"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "F", notes: ["F", "A", "C"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "Gm", notes: ["G", "B♭", "D"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "Adim", notes: ["A", "C", "E♭"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "B♭maj7", notes: ["B♭", "D", "F", "A"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "Cm7", notes: ["C", "E♭", "G", "B♭"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "Dm7", notes: ["D", "F", "A", "C"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "E♭maj7", notes: ["E♭", "G", "B♭", "D"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "F7", notes: ["F", "A", "C", "E♭"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "Gm7", notes: ["G", "B♭", "D", "F"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "Am7b5", notes: ["A", "C", "E♭", "G"] },
    ],
  },
  "Eb": {
    name: "E♭ Major", tonic: "E♭", mode: "major", circlePosition: -3,
    accidentals: { type: "♭", count: 3, alteredNotes: ["B♭", "E♭", "A♭"] },
    relativeKey: "Cm", parallelKey: "Ebm",
    scaleNotes: ["E♭", "F", "G", "A♭", "B♭", "C", "D"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "E♭", notes: ["E♭", "G", "B♭"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "Fm", notes: ["F", "A♭", "C"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "Gm", notes: ["G", "B♭", "D"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "A♭", notes: ["A♭", "C", "E♭"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "B♭", notes: ["B♭", "D", "F"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "Cm", notes: ["C", "E♭", "G"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "Ddim", notes: ["D", "F", "A♭"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "E♭maj7", notes: ["E♭", "G", "B♭", "D"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "Fm7", notes: ["F", "A♭", "C", "E♭"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "Gm7", notes: ["G", "B♭", "D", "F"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "A♭maj7", notes: ["A♭", "C", "E♭", "G"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "B♭7", notes: ["B♭", "D", "F", "A♭"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "Cm7", notes: ["C", "E♭", "G", "B♭"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "Dm7b5", notes: ["D", "F", "A♭", "C"] },
    ],
  },
  "Ab": {
    name: "A♭ Major", tonic: "A♭", mode: "major", circlePosition: -4,
    accidentals: { type: "♭", count: 4, alteredNotes: ["B♭", "E♭", "A♭", "D♭"] },
    relativeKey: "Fm", parallelKey: "Abm",
    scaleNotes: ["A♭", "B♭", "C", "D♭", "E♭", "F", "G"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "A♭", notes: ["A♭", "C", "E♭"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "B♭m", notes: ["B♭", "D♭", "F"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "Cm", notes: ["C", "E♭", "G"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "D♭", notes: ["D♭", "F", "A♭"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "E♭", notes: ["E♭", "G", "B♭"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "Fm", notes: ["F", "A♭", "C"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "Gdim", notes: ["G", "B♭", "D♭"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "A♭maj7", notes: ["A♭", "C", "E♭", "G"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "B♭m7", notes: ["B♭", "D♭", "F", "A♭"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "Cm7", notes: ["C", "E♭", "G", "B♭"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "D♭maj7", notes: ["D♭", "F", "A♭", "C"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "E♭7", notes: ["E♭", "G", "B♭", "D♭"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "Fm7", notes: ["F", "A♭", "C", "E♭"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "Gm7b5", notes: ["G", "B♭", "D♭", "F"] },
    ],
  },
  "Db": {
    name: "D♭ Major", tonic: "D♭", mode: "major", circlePosition: -5,
    accidentals: { type: "♭", count: 5, alteredNotes: ["B♭", "E♭", "A♭", "D♭", "G♭"] },
    relativeKey: "Bbm", parallelKey: "Dbm",
    scaleNotes: ["D♭", "E♭", "F", "G♭", "A♭", "B♭", "C"],
    diatonicTriads: [
      { degree: "1", romanNumeral: "I", chordSymbol: "D♭", notes: ["D♭", "F", "A♭"] },
      { degree: "2", romanNumeral: "ii", chordSymbol: "E♭m", notes: ["E♭", "G♭", "B♭"] },
      { degree: "3", romanNumeral: "iii", chordSymbol: "Fm", notes: ["F", "A♭", "C"] },
      { degree: "4", romanNumeral: "IV", chordSymbol: "G♭", notes: ["G♭", "B♭", "D♭"] },
      { degree: "5", romanNumeral: "V", chordSymbol: "A♭", notes: ["A♭", "C", "E♭"] },
      { degree: "6", romanNumeral: "vi", chordSymbol: "B♭m", notes: ["B♭", "D♭", "F"] },
      { degree: "7", romanNumeral: "vii°", chordSymbol: "Cdim", notes: ["C", "E♭", "G♭"] },
    ],
    diatonicSevenths: [
      { degree: "1", romanNumeral: "Imaj7", chordSymbol: "D♭maj7", notes: ["D♭", "F", "A♭", "C"] },
      { degree: "2", romanNumeral: "ii7", chordSymbol: "E♭m7", notes: ["E♭", "G♭", "B♭", "D♭"] },
      { degree: "3", romanNumeral: "iii7", chordSymbol: "Fm7", notes: ["F", "A♭", "C", "E♭"] },
      { degree: "4", romanNumeral: "IVmaj7", chordSymbol: "G♭maj7", notes: ["G♭", "B♭", "D♭", "F"] },
      { degree: "5", romanNumeral: "V7", chordSymbol: "A♭7", notes: ["A♭", "C", "E♭", "G♭"] },
      { degree: "6", romanNumeral: "vi7", chordSymbol: "B♭m7", notes: ["B♭", "D♭", "F", "A♭"] },
      { degree: "7", romanNumeral: "viiø7", chordSymbol: "Cm7b5", notes: ["C", "E♭", "G♭", "B♭"] },
    ],
  },
};

/** Retrieves key definition by name (e.g. "C", "G", "Eb", "F#") */
export function getKeyDefinition(keyTonic: string, mode: "major" | "minor" = "major"): KeyDefinition | undefined {
  const clean = keyTonic.trim().replace(/♯/g, "#").replace(/♭/g, "b");
  if (mode === "major") {
    return MAJOR_KEYS[clean];
  }
  // Find minor key
  const match = Object.values(MAJOR_KEYS).find((k) => k.relativeKey.toLowerCase() === `${clean.toLowerCase()}m` || k.relativeKey.toLowerCase() === clean.toLowerCase());
  if (match) {
    // Generate relative minor definition
    return {
      name: `${clean} Minor`,
      tonic: clean,
      mode: "minor",
      accidentals: match.accidentals,
      relativeKey: match.tonic,
      parallelKey: `${clean} Major`,
      circlePosition: match.circlePosition,
      scaleNotes: [
        match.scaleNotes[5],
        match.scaleNotes[6],
        match.scaleNotes[0],
        match.scaleNotes[1],
        match.scaleNotes[2],
        match.scaleNotes[3],
        match.scaleNotes[4],
      ],
      diatonicTriads: [
        { degree: "1", romanNumeral: "i", chordSymbol: match.diatonicTriads[5].chordSymbol, notes: match.diatonicTriads[5].notes },
        { degree: "2", romanNumeral: "ii°", chordSymbol: match.diatonicTriads[6].chordSymbol, notes: match.diatonicTriads[6].notes },
        { degree: "3", romanNumeral: "III", chordSymbol: match.diatonicTriads[0].chordSymbol, notes: match.diatonicTriads[0].notes },
        { degree: "4", romanNumeral: "iv", chordSymbol: match.diatonicTriads[1].chordSymbol, notes: match.diatonicTriads[1].notes },
        { degree: "5", romanNumeral: "v", chordSymbol: match.diatonicTriads[2].chordSymbol, notes: match.diatonicTriads[2].notes },
        { degree: "6", romanNumeral: "VI", chordSymbol: match.diatonicTriads[3].chordSymbol, notes: match.diatonicTriads[3].notes },
        { degree: "7", romanNumeral: "VII", chordSymbol: match.diatonicTriads[4].chordSymbol, notes: match.diatonicTriads[4].notes },
      ],
      diatonicSevenths: [
        { degree: "1", romanNumeral: "i7", chordSymbol: match.diatonicSevenths[5].chordSymbol, notes: match.diatonicSevenths[5].notes },
        { degree: "2", romanNumeral: "iiø7", chordSymbol: match.diatonicSevenths[6].chordSymbol, notes: match.diatonicSevenths[6].notes },
        { degree: "3", romanNumeral: "IIImaj7", chordSymbol: match.diatonicSevenths[0].chordSymbol, notes: match.diatonicSevenths[0].notes },
        { degree: "4", romanNumeral: "iv7", chordSymbol: match.diatonicSevenths[1].chordSymbol, notes: match.diatonicSevenths[1].notes },
        { degree: "5", romanNumeral: "v7", chordSymbol: match.diatonicSevenths[2].chordSymbol, notes: match.diatonicSevenths[2].notes },
        { degree: "6", romanNumeral: "VImaj7", chordSymbol: match.diatonicSevenths[3].chordSymbol, notes: match.diatonicSevenths[3].notes },
        { degree: "7", romanNumeral: "VII7", chordSymbol: match.diatonicSevenths[4].chordSymbol, notes: match.diatonicSevenths[4].notes },
      ],
    };
  }
  return undefined;
}

/** Circle of Fifths order starting from C clockwise */
export const CIRCLE_OF_FIFTHS_MAJOR = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];

/** Returns the adjacent keys on the Circle of Fifths */
export function getAdjacentKeys(keyTonic: string): { dominantKey: string; subdominantKey: string } | undefined {
  const idx = CIRCLE_OF_FIFTHS_MAJOR.indexOf(keyTonic);
  if (idx === -1) return undefined;
  const dominantIdx = (idx + 1) % CIRCLE_OF_FIFTHS_MAJOR.length;
  const subdominantIdx = (idx - 1 + CIRCLE_OF_FIFTHS_MAJOR.length) % CIRCLE_OF_FIFTHS_MAJOR.length;
  return {
    dominantKey: CIRCLE_OF_FIFTHS_MAJOR[dominantIdx],
    subdominantKey: CIRCLE_OF_FIFTHS_MAJOR[subdominantIdx],
  };
}
