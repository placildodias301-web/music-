/**
 * Wilsify AI — Comprehensive Music Theory & Advanced Harmony Engine
 * Diatonic harmony, Roman numeral analysis, harmonic function classification,
 * advanced harmony (secondary dominants, modal interchange, Neapolitan, Aug 6th, pivot chords),
 * cadence engine, and chord-scale improvisation guidelines.
 */

import { NOTE_NAMES, type ParsedChord, parseChordSymbol } from "../chordTheory";
import { noteToMidi } from "../tuner/notes";

export type HarmonicFunctionCategory = "Tonic" | "Subdominant" | "Dominant";

export interface DiatonicDegreeHarmony {
  degree: number; // 1 to 7
  romanNumeral: string;
  rootNote: string;
  rootPitchClass: number;
  chordSymbol: string;
  qualityName: string;
  harmonicFunction: HarmonicFunctionCategory;
  functionReason: string;
  tones: string[];
}

export interface RomanNumeralResult {
  romanNumeral: string;
  degree: number;
  degreeName: string;
  isDiatonic: boolean;
  figuredBass: string;
  appliedClassification?: string;
  harmonicFunction: HarmonicFunctionCategory | "Non-functional / Color";
  explanation: string;
}

export interface CadenceResult {
  type: "PAC" | "IAC" | "Half" | "Plagal" | "Deceptive" | "Phrygian" | "None";
  name: string;
  description: string;
  formula: string;
}

export interface PivotChord {
  chordSymbol: string;
  key1Roman: string;
  key1Function: HarmonicFunctionCategory;
  key2Roman: string;
  key2Function: HarmonicFunctionCategory;
}

export interface ChordScaleGuide {
  chordSymbol: string;
  recommendedScales: {
    scaleName: string;
    modeCategory: string;
    rationale: string;
    avoidNotes: string[];
  }[];
  improvisationGuidelines: string[];
}

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const HARMONIC_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 11];
const MELODIC_MINOR_STEPS = [0, 2, 3, 5, 7, 9, 11];

const DEGREE_NAMES: Record<number, string> = {
  1: "Tonic",
  2: "Supertonic",
  3: "Mediant",
  4: "Subdominant",
  5: "Dominant",
  6: "Submediant",
  7: "Leading Tone",
};

/**
 * Normalizes root input (note string or pitch class) to a pitch class 0..11.
 */
export function normalizeToPc(key: string | number): number {
  if (typeof key === "number") return ((key % 12) + 12) % 12;
  const midi = noteToMidi(key.replace(/♭/g, "b").replace(/♯/g, "#"));
  if (midi !== null) return midi % 12;
  const m = key.trim().toUpperCase();
  const letterMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = letterMap[m[0]] ?? 0;
  if (m.includes("#") || m.includes("♯")) pc += 1;
  if (m.includes("B") && m.length > 1 && (m[1] === "B" || m[1] === "b" || m[1] === "♭")) pc -= 1;
  return (pc + 12) % 12;
}

/**
 * Subphase 6.1: Diatonic Harmony across Major, Natural Minor, Harmonic Minor, and Melodic Minor.
 */
export function getDiatonicHarmonies(
  keyRoot: string | number,
  mode: "major" | "natural-minor" | "harmonic-minor" | "melodic-minor" = "major",
  chordType: "triad" | "seventh" = "triad"
): DiatonicDegreeHarmony[] {
  const rootPc = normalizeToPc(keyRoot);
  const steps =
    mode === "major"
      ? MAJOR_SCALE_STEPS
      : mode === "natural-minor"
      ? NATURAL_MINOR_STEPS
      : mode === "harmonic-minor"
      ? HARMONIC_MINOR_STEPS
      : MELODIC_MINOR_STEPS;

  return steps.map((step, idx) => {
    const degree = idx + 1;
    const chordRootPc = (rootPc + step) % 12;
    const rootName = NOTE_NAMES[chordRootPc];

    // Pick 3rd, 5th, and optionally 7th diatonic scale steps
    const step3 = steps[(idx + 2) % 7] + (idx + 2 >= 7 ? 12 : 0);
    const step5 = steps[(idx + 4) % 7] + (idx + 4 >= 7 ? 12 : 0);
    const step7 = steps[(idx + 6) % 7] + (idx + 6 >= 7 ? 12 : 0);

    const thirdInterval = step3 - step;
    const fifthInterval = step5 - step;
    const seventhInterval = step7 - step;

    let suffix = "";
    let roman = "";
    let qualityName = "";
    let func: HarmonicFunctionCategory = "Tonic";
    let reason = "";

    if (chordType === "triad") {
      if (thirdInterval === 4 && fifthInterval === 7) {
        suffix = "";
        qualityName = "Major triad";
      } else if (thirdInterval === 3 && fifthInterval === 7) {
        suffix = "m";
        qualityName = "Minor triad";
      } else if (thirdInterval === 3 && fifthInterval === 6) {
        suffix = "dim";
        qualityName = "Diminished triad";
      } else if (thirdInterval === 4 && fifthInterval === 8) {
        suffix = "aug";
        qualityName = "Augmented triad";
      }
    } else {
      // Sevenths
      if (thirdInterval === 4 && fifthInterval === 7 && seventhInterval === 11) {
        suffix = "maj7";
        qualityName = "Major 7th";
      } else if (thirdInterval === 4 && fifthInterval === 7 && seventhInterval === 10) {
        suffix = "7";
        qualityName = "Dominant 7th";
      } else if (thirdInterval === 3 && fifthInterval === 7 && seventhInterval === 10) {
        suffix = "m7";
        qualityName = "Minor 7th";
      } else if (thirdInterval === 3 && fifthInterval === 6 && seventhInterval === 10) {
        suffix = "m7b5";
        qualityName = "Half-diminished 7th";
      } else if (thirdInterval === 3 && fifthInterval === 6 && seventhInterval === 9) {
        suffix = "dim7";
        qualityName = "Diminished 7th";
      } else if (thirdInterval === 3 && fifthInterval === 7 && seventhInterval === 11) {
        suffix = "mMaj7";
        qualityName = "Minor-Major 7th";
      } else if (thirdInterval === 4 && fifthInterval === 8 && seventhInterval === 11) {
        suffix = "maj7#5";
        qualityName = "Augmented Major 7th";
      }
    }

    // Roman numeral notation based on quality and degree
    const baseRoman = ["I", "II", "III", "IV", "V", "VI", "VII"][idx];
    const isMinorQuality = suffix === "m" || suffix === "m7" || suffix === "m7b5" || suffix === "dim" || suffix === "dim7";
    const lowerRoman = baseRoman.toLowerCase();

    if (suffix === "dim") roman = `${lowerRoman}°`;
    else if (suffix === "dim7") roman = `${lowerRoman}°7`;
    else if (suffix === "m7b5") roman = `${lowerRoman}ø7`;
    else if (suffix === "aug") roman = `${baseRoman}+`;
    else if (suffix === "maj7#5") roman = `${baseRoman}+M7`;
    else if (isMinorQuality) roman = chordType === "seventh" ? `${lowerRoman}7` : lowerRoman;
    else roman = chordType === "seventh" && suffix === "maj7" ? `${baseRoman}M7` : chordType === "seventh" && suffix === "7" ? `${baseRoman}7` : baseRoman;

    // Harmonic function
    if (mode === "major") {
      if (degree === 1 || degree === 3 || degree === 6) {
        func = "Tonic";
        reason = degree === 1 ? "Primary harmonic home and point of rest" : degree === 6 ? "Tonic substitute sharing 2 tones with tonic (deceptive resolution)" : "Weak tonic substitute sharing tones with tonic and dominant";
      } else if (degree === 4 || degree === 2) {
        func = "Subdominant";
        reason = degree === 4 ? "Primary predominant; moves away from tonic or sets up dominant" : "Strong predominant (ii-V motion); contains scale degrees 4 and 6";
      } else {
        func = "Dominant";
        reason = degree === 5 ? "Primary harmonic tension containing leading tone; demands resolution to I" : "Leading-tone diminished chord functioning as a rootless dominant V7";
      }
    } else {
      // Minor mode
      if (degree === 1 || degree === 3 || degree === 6) {
        func = "Tonic";
        reason = degree === 1 ? "Minor tonic centre" : degree === 3 ? "Relative major tonic substitute" : "Submediant tonic substitute (plagal/deceptive)";
      } else if (degree === 2 || degree === 4) {
        func = "Subdominant";
        reason = degree === 4 ? "Minor subdominant; reinforces minor tonal colour" : "Diminished supertonic; classic minor predominant preparing V";
      } else {
        func = "Dominant";
        reason = degree === 5 ? "Dominant chord providing tension toward the minor tonic" : "Leading tone diminished chord";
      }
    }

    const tones = [
      rootName,
      NOTE_NAMES[(rootPc + (step3 % 12)) % 12],
      NOTE_NAMES[(rootPc + (step5 % 12)) % 12],
      ...(chordType === "seventh" ? [NOTE_NAMES[(rootPc + (step7 % 12)) % 12]] : []),
    ];

    return {
      degree,
      romanNumeral: roman,
      rootNote: rootName,
      rootPitchClass: chordRootPc,
      chordSymbol: `${rootName}${suffix}`,
      qualityName,
      harmonicFunction: func,
      functionReason: reason,
      tones,
    };
  });
}

/**
 * Subphase 6.2 & 6.3: Roman Numeral Analysis and Harmonic Function.
 */
export function analyzeRomanNumeral(
  chord: ParsedChord | string,
  keyRoot: string | number,
  mode: "major" | "minor" = "major",
  inversion = 0
): RomanNumeralResult {
  const parsed = typeof chord === "string" ? parseChordSymbol(chord) : chord;
  const keyPc = normalizeToPc(keyRoot);
  const chordRootPc = parsed.root;

  // Figured bass by inversion
  const isSeventh = parsed.quality.suffix.includes("7") || parsed.quality.suffix.includes("9") || parsed.quality.suffix.includes("11") || parsed.quality.suffix.includes("13");
  const figuredBass = isSeventh
    ? inversion === 1 ? "6/5" : inversion === 2 ? "4/3" : inversion === 3 ? "4/2" : "7"
    : inversion === 1 ? "6" : inversion === 2 ? "6/4" : "root";

  const diatonicHarmonies = getDiatonicHarmonies(keyPc, mode === "major" ? "major" : "natural-minor", isSeventh ? "seventh" : "triad");
  const match = diatonicHarmonies.find((h) => h.rootPitchClass === chordRootPc);

  if (match) {
    const degreeName = DEGREE_NAMES[match.degree] ?? "Tonic";
    return {
      romanNumeral: `${match.romanNumeral}${inversion > 0 ? ` (${figuredBass})` : ""}`,
      degree: match.degree,
      degreeName,
      isDiatonic: true,
      figuredBass,
      harmonicFunction: match.harmonicFunction,
      explanation: `${parsed.label} is diatonic chord ${match.romanNumeral} (${degreeName}) in ${NOTE_NAMES[keyPc]} ${mode}. ${match.functionReason}`,
    };
  }

  // Non-diatonic: check advanced harmony (secondary dominant, borrowed, Neapolitan, Aug 6th)
  const advanced = identifyAdvancedHarmony(parsed, keyPc, mode);
  return {
    romanNumeral: advanced.romanNumeral,
    degree: advanced.degree,
    degreeName: advanced.category,
    isDiatonic: false,
    figuredBass,
    appliedClassification: advanced.category,
    harmonicFunction: advanced.harmonicFunction,
    explanation: advanced.explanation,
  };
}

/**
 * Subphase 6.4: Advanced Harmony Identification (Secondary dominants, borrowed chords, Neapolitan, Aug 6th).
 */
export function identifyAdvancedHarmony(
  chord: ParsedChord,
  keyPc: number,
  mode: "major" | "minor"
): {
  romanNumeral: string;
  degree: number;
  category: string;
  harmonicFunction: HarmonicFunctionCategory | "Non-functional / Color";
  explanation: string;
} {
  const root = chord.root;
  const relRoot = (root - keyPc + 12) % 12;
  const isMajorTriadOr7 = chord.quality.suffix === "" || chord.quality.suffix === "7";

  // 1. Secondary Dominants (V/x)
  // Target degrees: ii (2 semitones in major), iii (4), IV (5), V (7), vi (9)
  // The V of degree x is located 7 semitones above that degree (or -5).
  if (isMajorTriadOr7) {
    if (relRoot === 9) {
      // V/ii in major (A in C major): target is D (ii)
      return {
        romanNumeral: chord.quality.suffix === "7" ? "V7/ii" : "V/ii",
        degree: 2,
        category: "Secondary Dominant",
        harmonicFunction: "Dominant",
        explanation: `Secondary dominant tonicizing the supertonic (ii). Resolves strongly to ${NOTE_NAMES[(keyPc + 2) % 12]}m.`,
      };
    }
    if (relRoot === 11) {
      // V/iii in major (B in C major): target is E (iii)
      return {
        romanNumeral: chord.quality.suffix === "7" ? "V7/iii" : "V/iii",
        degree: 3,
        category: "Secondary Dominant",
        harmonicFunction: "Dominant",
        explanation: `Secondary dominant tonicizing the mediant (iii). Resolves to ${NOTE_NAMES[(keyPc + 4) % 12]}m.`,
      };
    }
    if (relRoot === 0 && chord.quality.suffix === "7") {
      // V7/IV in major (C7 in C major): target is F (IV)
      return {
        romanNumeral: "V7/IV",
        degree: 4,
        category: "Secondary Dominant",
        harmonicFunction: "Dominant",
        explanation: `Secondary dominant tonicizing the subdominant (IV). The added b7 destabilizes the tonic toward ${NOTE_NAMES[(keyPc + 5) % 12]}.`,
      };
    }
    if (relRoot === 2) {
      // V/V in major (D or D7 in C major): target is G (V)
      return {
        romanNumeral: chord.quality.suffix === "7" ? "V7/V" : "V/V",
        degree: 5,
        category: "Secondary Dominant",
        harmonicFunction: "Dominant",
        explanation: `Secondary dominant (applied dominant of the dominant). Chromatic push toward the dominant ${NOTE_NAMES[(keyPc + 7) % 12]}.`,
      };
    }
    if (relRoot === 4) {
      // V/vi in major (E or E7 in C major): target is A (vi)
      return {
        romanNumeral: chord.quality.suffix === "7" ? "V7/vi" : "V/vi",
        degree: 6,
        category: "Secondary Dominant",
        harmonicFunction: "Dominant",
        explanation: `Secondary dominant tonicizing the submediant (vi). Prepares movement to the relative minor ${NOTE_NAMES[(keyPc + 9) % 12]}m.`,
      };
    }
  }

  // 2. Secondary Leading-Tone Chords (vii°/x)
  if (chord.quality.suffix === "dim" || chord.quality.suffix === "dim7" || chord.quality.suffix === "m7b5") {
    // Leading tone to V: raised 4th degree (semitone below V) = 6 semitones
    if (relRoot === 6) {
      return {
        romanNumeral: "vii°7/V",
        degree: 5,
        category: "Secondary Leading-Tone",
        harmonicFunction: "Dominant",
        explanation: `Secondary leading-tone chord tonicizing the dominant V (${NOTE_NAMES[(keyPc + 7) % 12]}).`,
      };
    }
    // Leading tone to ii: raised 1st degree = 1 semitone
    if (relRoot === 1) {
      return {
        romanNumeral: "vii°7/ii",
        degree: 2,
        category: "Secondary Leading-Tone",
        harmonicFunction: "Dominant",
        explanation: `Secondary leading-tone chord tonicizing the supertonic ii (${NOTE_NAMES[(keyPc + 2) % 12]}m).`,
      };
    }
  }

  // 3. Neapolitan Chord (bII)
  if (relRoot === 1 && chord.quality.suffix === "") {
    return {
      romanNumeral: "♭II (N6)",
      degree: 2,
      category: "Neapolitan Chord",
      harmonicFunction: "Subdominant",
      explanation: `Neapolitan chord: Major triad built on the lowered second scale degree (♭2). Typically in first inversion (N6) acting as a powerful predominant resolving to V.`,
    };
  }

  // 4. Modal Interchange / Borrowed Chords (in Major, borrowed from Parallel Minor)
  if (mode === "major") {
    if (relRoot === 3 && (chord.quality.suffix === "" || chord.quality.suffix === "maj7")) {
      return {
        romanNumeral: "♭III",
        degree: 3,
        category: "Modal Interchange (Borrowed from Minor)",
        harmonicFunction: "Tonic",
        explanation: `Borrowed mediant (♭III) from parallel natural minor. Adds cinematic, epic weight.`,
      };
    }
    if (relRoot === 5 && chord.quality.suffix === "m") {
      return {
        romanNumeral: "iv",
        degree: 4,
        category: "Modal Interchange (Minor Plagal)",
        harmonicFunction: "Subdominant",
        explanation: `Minor subdominant (iv) borrowed from parallel minor. Creates the poignant minor plagal cadence (iv → I).`,
      };
    }
    if (relRoot === 8 && (chord.quality.suffix === "" || chord.quality.suffix === "maj7")) {
      return {
        romanNumeral: "♭VI",
        degree: 6,
        category: "Modal Interchange (Borrowed from Minor)",
        harmonicFunction: "Subdominant",
        explanation: `Flat submediant (♭VI) borrowed from parallel minor. Classic romantic and film score progression (♭VI → ♭VII → I).`,
      };
    }
    if (relRoot === 10 && (chord.quality.suffix === "" || chord.quality.suffix === "7")) {
      return {
        romanNumeral: "♭VII",
        degree: 7,
        category: "Modal Interchange (Subtonic)",
        harmonicFunction: "Subdominant",
        explanation: `Flat seventh (♭VII / Subtonic) borrowed from Mixolydian or Aeolian mode. Common in rock and pop anthems.`,
      };
    }
  }

  // Fallback for chromatic harmony
  return {
    romanNumeral: `Chromatic (${NOTE_NAMES[root]}${chord.quality.suffix})`,
    degree: 0,
    category: "Chromatic Non-Diatonic",
    harmonicFunction: "Non-functional / Color",
    explanation: `Chromatic non-diatonic chord relative to ${NOTE_NAMES[keyPc]} ${mode}. Often used for voice-leading, planed harmony, or sudden modulation.`,
  };
}

/**
 * Pivot-chord modulation: finds all common diatonic chords between two keys.
 */
export function findPivotChords(
  key1Root: string | number,
  key1Mode: "major" | "minor",
  key2Root: string | number,
  key2Mode: "major" | "minor"
): PivotChord[] {
  const k1Pcs = getDiatonicHarmonies(key1Root, key1Mode === "major" ? "major" : "natural-minor", "triad");
  const k2Pcs = getDiatonicHarmonies(key2Root, key2Mode === "major" ? "major" : "natural-minor", "triad");

  const pivots: PivotChord[] = [];
  for (const c1 of k1Pcs) {
    const c2 = k2Pcs.find((h) => h.rootPitchClass === c1.rootPitchClass && h.qualityName === c1.qualityName);
    if (c2) {
      pivots.push({
        chordSymbol: c1.chordSymbol,
        key1Roman: c1.romanNumeral,
        key1Function: c1.harmonicFunction,
        key2Roman: c2.romanNumeral,
        key2Function: c2.harmonicFunction,
      });
    }
  }
  return pivots;
}

/**
 * Subphase 6.5: Cadence Engine.
 * Analyzes two chords in sequence to identify the cadence type.
 */
export function identifyCadence(
  chord1: ParsedChord | string,
  chord2: ParsedChord | string,
  keyRoot: string | number,
  mode: "major" | "minor" = "major",
  options?: {
    chord1Inversion?: number;
    chord2Inversion?: number;
    sopranoIsRoot?: boolean;
  }
): CadenceResult {
  const c1 = typeof chord1 === "string" ? parseChordSymbol(chord1) : chord1;
  const c2 = typeof chord2 === "string" ? parseChordSymbol(chord2) : chord2;
  const keyPc = normalizeToPc(keyRoot);

  const relRoot1 = (c1.root - keyPc + 12) % 12;
  const relRoot2 = (c2.root - keyPc + 12) % 12;

  const inv1 = options?.chord1Inversion ?? 0;
  const inv2 = options?.chord2Inversion ?? 0;
  const sopranoRoot = options?.sopranoIsRoot ?? true;

  // Authentic Cadences (Dominant -> Tonic: V -> I or vii° -> I)
  if ((relRoot1 === 7 || relRoot1 === 11) && relRoot2 === 0) {
    if (relRoot1 === 7 && inv1 === 0 && inv2 === 0 && sopranoRoot) {
      return {
        type: "PAC",
        name: "Perfect Authentic Cadence (PAC)",
        formula: "V → I (root position, tonic in soprano)",
        description: "The strongest, most decisive resolution in Western music. Both chords are in root position with the tonic note in the highest soprano voice.",
      };
    }
    return {
      type: "IAC",
      name: "Imperfect Authentic Cadence (IAC)",
      formula: relRoot1 === 7 ? "V → I (inverted or non-tonic soprano)" : "vii° → I",
      description: "An authentic resolution that feels open or less final because of chord inversions or soprano voice leading.",
    };
  }

  // Half Cadence (Ends on V)
  if (relRoot2 === 7) {
    // Phrygian Half Cadence: iv6 -> V in minor (relRoot1 is 5, minor, first inversion)
    if (mode === "minor" && relRoot1 === 5 && (inv1 === 1 || c1.quality.suffix.includes("m"))) {
      return {
        type: "Phrygian",
        name: "Phrygian Half Cadence",
        formula: "iv⁶ → V in minor",
        description: "Characteristic minor cadence with bass step descent (♭6 → 5), originating from the Renaissance Phrygian mode.",
      };
    }
    return {
      type: "Half",
      name: "Half Cadence (Semi-cadence)",
      formula: "? → V",
      description: "A musical comma or pause on the dominant. Creates expectation of continuation rather than resolution.",
    };
  }

  // Plagal Cadence (IV -> I or iv -> I)
  if (relRoot1 === 5 && relRoot2 === 0) {
    return {
      type: "Plagal",
      name: c1.quality.suffix === "m" ? "Minor Plagal Cadence" : "Plagal Cadence (Amen)",
      formula: c1.quality.suffix === "m" ? "iv → I" : "IV → I",
      description: "The 'Amen' cadence. Resolves from the subdominant without a leading-tone tension, giving a gentle, reverent quality.",
    };
  }

  // Deceptive Cadence (V -> vi or V -> VI)
  if (relRoot1 === 7 && (relRoot2 === 9 || relRoot2 === 8)) {
    return {
      type: "Deceptive",
      name: "Deceptive Cadence (Interrupted)",
      formula: "V → vi (or ♭VI)",
      description: "Surprise resolution! The ear expects resolution to the tonic I, but the music pivots to the submediant.",
    };
  }

  return {
    type: "None",
    name: "Non-cadential Progression",
    formula: `${c1.label} → ${c2.label}`,
    description: "Chord motion that does not constitute a standard harmonic cadence.",
  };
}

/**
 * Subphase 6.6: Chord-Scale Relationships and Improvisation Guidelines.
 */
export function getChordScaleGuide(chord: ParsedChord | string): ChordScaleGuide {
  const parsed = typeof chord === "string" ? parseChordSymbol(chord) : chord;
  const suf = parsed.quality.suffix;
  const root = NOTE_NAMES[parsed.root];

  const recommendations: ChordScaleGuide["recommendedScales"] = [];
  const guidelines: string[] = [];

  if (suf === "" || suf === "maj7" || suf === "6" || suf === "add9") {
    // Major
    recommendations.push(
      {
        scaleName: `${root} Major (Ionian)`,
        modeCategory: "Diatonic Major",
        rationale: "Default scale for major tonic chords. Pure consonant sound.",
        avoidNotes: ["4th (F in C major) — conflicts with the major 3rd"],
      },
      {
        scaleName: `${root} Lydian`,
        modeCategory: "Major Mode (#4)",
        rationale: "Modern, open, cinematic major sound with raised 4th (#11). Has NO avoid notes.",
        avoidNotes: [],
      },
      {
        scaleName: `${root} Major Pentatonic`,
        modeCategory: "Pentatonic",
        rationale: "Foolproof melodic framework containing 1, 2, 3, 5, 6.",
        avoidNotes: [],
      }
    );
    guidelines.push(
      "Emphasize the 3rd and 7th on strong beats to outline chord quality.",
      "Use the #4 (Lydian) for modern jazz and cinematic sparkle.",
      "Avoid lingering on the natural 4th against a major 3rd."
    );
  } else if (suf === "m" || suf === "m7" || suf === "m9") {
    // Minor
    recommendations.push(
      {
        scaleName: `${root} Dorian`,
        modeCategory: "Minor Mode (Natural 6th)",
        rationale: "Preferred jazz and funk minor scale. The natural 6th avoids the sadness of the minor 6th.",
        avoidNotes: [],
      },
      {
        scaleName: `${root} Natural Minor (Aeolian)`,
        modeCategory: "Diatonic Minor",
        rationale: "Standard classical and rock minor scale with ♭6.",
        avoidNotes: ["♭6 (can clash with 5th)"],
      },
      {
        scaleName: `${root} Minor Pentatonic / Blues`,
        modeCategory: "Blues & Pentatonic",
        rationale: "Essential blues vocabulary with blue note (♭5).",
        avoidNotes: [],
      }
    );
    guidelines.push(
      "The Dorian 6th adds a sophisticated, upbeat minor sound.",
      "Highlight the minor 3rd and minor 7th.",
      "The blues scale can be used freely over minor 7th chords."
    );
  } else if (suf === "7" || suf === "9" || suf === "13") {
    // Dominant
    recommendations.push(
      {
        scaleName: `${root} Mixolydian`,
        modeCategory: "Dominant Diatonic",
        rationale: "Default primary scale for dominant 7th chords (1, 2, 3, 4, 5, 6, ♭7).",
        avoidNotes: ["4th — treat as passing tone to prevent clash with 3rd"],
      },
      {
        scaleName: `${root} Lydian Dominant (#11)`,
        modeCategory: "Melodic Minor Mode 4",
        rationale: "Brilliant acoustic scale (1, 2, 3, #4, 5, 6, ♭7) for non-resolving dominant chords.",
        avoidNotes: [],
      },
      {
        scaleName: `${root} Altered (Super Locrian)`,
        modeCategory: "Melodic Minor Mode 7",
        rationale: "Ultimate tension scale (♭9, #9, ♭5, #5) for dominants resolving to minor or major tonics.",
        avoidNotes: [],
      }
    );
    guidelines.push(
      "The tritone between the 3rd and ♭7 is the engine of dominant tension.",
      "Use Altered scale when the chord resolves up a fourth (e.g. G7alt → Cmaj7).",
      "Use Lydian Dominant for tritone substitutions or blues IV7 chords."
    );
  } else if (suf === "m7b5") {
    // Half-diminished
    recommendations.push(
      {
        scaleName: `${root} Locrian`,
        modeCategory: "Diatonic Mode 7",
        rationale: "Standard diatonic match for iiø7 in minor keys.",
        avoidNotes: ["♭2 — resolve quickly to root or minor 3rd"],
      },
      {
        scaleName: `${root} Locrian #2`,
        modeCategory: "Melodic Minor Mode 6",
        rationale: "Preferred modern jazz scale; natural 2nd avoids the harsh ♭2 clash.",
        avoidNotes: [],
      }
    );
    guidelines.push("Target the ♭5 and ♭7 to clearly define the half-diminished color.");
  } else if (suf === "dim7") {
    // Fully diminished
    recommendations.push(
      {
        scaleName: `${root} Diminished (Whole-Half)`,
        modeCategory: "Symmetrical S-Tone",
        rationale: "Symmetrical scale built by alternating whole and half steps. Completely matches all 4 chord tones.",
        avoidNotes: [],
      }
    );
    guidelines.push("Any note in a diminished 7th can be treated as root due to its minor-third symmetry.");
  } else {
    // Other
    recommendations.push({
      scaleName: `${root} Chromatic / Pentatonic`,
      modeCategory: "Universal",
      rationale: "Use chord tones as target pitches with chromatic approaches.",
      avoidNotes: [],
    });
    guidelines.push("Target the chord tones on downbeats and fill with scalar steps.");
  }

  return {
    chordSymbol: parsed.label,
    recommendedScales: recommendations,
    improvisationGuidelines: guidelines,
  };
}
