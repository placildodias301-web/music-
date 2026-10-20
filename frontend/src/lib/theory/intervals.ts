/**
 * Universal Interval Engine
 * Maps semitone distances and chord scale degrees to formal interval names,
 * abbreviations, and harmonic functions.
 */

export interface IntervalInfo {
  semitones: number;
  degree: number;
  name: string;
  shortName: string;
  quality: "perfect" | "major" | "minor" | "diminished" | "augmented";
  functionDescription: string;
}

/** Standard intervals mapped from semitones (0-24) and optional degree preference */
export const INTERVAL_TABLE: Record<number, { name: string; shortName: string; degree: number; quality: IntervalInfo["quality"] }> = {
  0: { name: "Perfect Unison / Root", shortName: "1", degree: 1, quality: "perfect" },
  1: { name: "Minor 2nd", shortName: "♭2", degree: 2, quality: "minor" },
  2: { name: "Major 2nd", shortName: "2", degree: 2, quality: "major" },
  3: { name: "Minor 3rd", shortName: "♭3", degree: 3, quality: "minor" },
  4: { name: "Major 3rd", shortName: "3", degree: 3, quality: "major" },
  5: { name: "Perfect 4th", shortName: "4", degree: 4, quality: "perfect" },
  6: { name: "Tritone / Diminished 5th", shortName: "♭5", degree: 5, quality: "diminished" },
  7: { name: "Perfect 5th", shortName: "5", degree: 5, quality: "perfect" },
  8: { name: "Minor 6th", shortName: "♭6", degree: 6, quality: "minor" },
  9: { name: "Major 6th", shortName: "6", degree: 6, quality: "major" },
  10: { name: "Minor 7th", shortName: "♭7", degree: 7, quality: "minor" },
  11: { name: "Major 7th", shortName: "7", degree: 7, quality: "major" },
  12: { name: "Octave", shortName: "8", degree: 8, quality: "perfect" },
  13: { name: "Minor 9th", shortName: "♭9", degree: 9, quality: "minor" },
  14: { name: "Major 9th", shortName: "9", degree: 9, quality: "major" },
  15: { name: "Augmented 9th / Minor 10th", shortName: "♯9", degree: 9, quality: "augmented" },
  16: { name: "Major 10th", shortName: "10", degree: 10, quality: "major" },
  17: { name: "Perfect 11th", shortName: "11", degree: 11, quality: "perfect" },
  18: { name: "Augmented 11th", shortName: "♯11", degree: 11, quality: "augmented" },
  19: { name: "Perfect 12th", shortName: "12", degree: 12, quality: "perfect" },
  20: { name: "Minor 13th", shortName: "♭13", degree: 13, quality: "minor" },
  21: { name: "Major 13th", shortName: "13", degree: 13, quality: "major" },
};

/**
 * Returns formal interval information based on semitones from root and optionally a target degree.
 */
export function getIntervalInfo(semitones: number, degreeHint?: number): IntervalInfo {
  const normalizedSemi = ((semitones % 12) + 12) % 12;
  const compound = semitones > 12;
  
  // Specific degree overrides for augmented/diminished intervals (e.g. #5 vs b6, b5 vs #4)
  if (degreeHint === 5 && normalizedSemi === 6) {
    return {
      semitones,
      degree: 5,
      name: "Diminished 5th",
      shortName: "♭5",
      quality: "diminished",
      functionDescription: "Altered fifth, creates tritone tension against root",
    };
  }
  if (degreeHint === 4 && normalizedSemi === 6) {
    return {
      semitones,
      degree: 4,
      name: "Augmented 4th",
      shortName: "♯4",
      quality: "augmented",
      functionDescription: "Raised fourth, Lydian color tone",
    };
  }
  if (degreeHint === 5 && normalizedSemi === 8) {
    return {
      semitones,
      degree: 5,
      name: "Augmented 5th",
      shortName: "♯5",
      quality: "augmented",
      functionDescription: "Raised fifth, characteristic augmented tension",
    };
  }
  if (degreeHint === 9 && (normalizedSemi === 1 || semitones === 13)) {
    return {
      semitones,
      degree: 9,
      name: "Minor 9th",
      shortName: "♭9",
      quality: "minor",
      functionDescription: "Half-step above octave, dark jazz tension",
    };
  }
  if (degreeHint === 9 && (normalizedSemi === 3 || semitones === 15)) {
    return {
      semitones,
      degree: 9,
      name: "Augmented 9th",
      shortName: "♯9",
      quality: "augmented",
      functionDescription: "Sharp nine / Hendrix chord tone",
    };
  }
  if (degreeHint === 11 && (normalizedSemi === 6 || semitones === 18)) {
    return {
      semitones,
      degree: 11,
      name: "Augmented 11th",
      shortName: "♯11",
      quality: "augmented",
      functionDescription: "Lydian extension above root",
    };
  }
  if (degreeHint === 13 && (normalizedSemi === 8 || semitones === 20)) {
    return {
      semitones,
      degree: 13,
      name: "Minor 13th",
      shortName: "♭13",
      quality: "minor",
      functionDescription: "Flat 13 altered extension",
    };
  }

  const lookupKey = compound && INTERVAL_TABLE[semitones] ? semitones : normalizedSemi;
  const base = INTERVAL_TABLE[lookupKey] ?? INTERVAL_TABLE[normalizedSemi];

  let functionDesc = "Chord tone";
  if (base.degree === 1) functionDesc = "Root of the chord, defines tonal center";
  else if (base.degree === 3) functionDesc = base.quality === "major" ? "Major 3rd, gives the chord its bright/major quality" : "Minor 3rd, gives the chord its dark/minor quality";
  else if (base.degree === 5) functionDesc = base.quality === "perfect" ? "Perfect 5th, harmonic anchor/stability" : `${base.name}, altered tension`;
  else if (base.degree === 7) functionDesc = base.quality === "major" ? "Major 7th, adds lush/open jazz harmony" : "Minor 7th (dominant/minor), creates blues or modal pull";
  else if (base.degree === 2 || base.degree === 9) functionDesc = "9th extension, adds openness and color";
  else if (base.degree === 4 || base.degree === 11) functionDesc = "11th extension or suspended 4th";
  else if (base.degree === 6 || base.degree === 13) functionDesc = "13th or 6th extension, rich swing/jazz harmonic tone";

  return {
    semitones,
    degree: degreeHint ?? base.degree,
    name: base.name,
    shortName: base.shortName,
    quality: base.quality,
    functionDescription: functionDesc,
  };
}

/**
 * Returns standard semitones distance above root for a scale degree.
 */
export function getSemitonesForDegree(
  degree: number,
  quality: "major" | "minor" | "perfect" = "major"
): number {
  switch (degree) {
    case 1:
      return 0;
    case 2:
      return quality === "minor" ? 1 : 2;
    case 3:
      return quality === "minor" ? 3 : 4;
    case 4:
      return 5;
    case 5:
      return 7;
    case 6:
      return quality === "minor" ? 8 : 9;
    case 7:
      return quality === "minor" ? 10 : 11;
    case 8:
      return 12;
    case 9:
      return quality === "minor" ? 13 : 14;
    case 11:
      return 17;
    case 13:
      return quality === "minor" ? 20 : 21;
    default:
      return Math.min(24, Math.max(0, (degree - 1) * 2));
  }
}
