/**
 * Dynamic human-readable practice instructions, common mistakes, and step-by-step
 * guides for chord voicings and instruments.
 */

import { type FingeringResult, FINGER_NAMES } from "./fingering";

export interface ChordStep {
  stepNumber: number;
  type: "fret" | "barre" | "open" | "mute";
  stringIndex: number; // 0-based array index (0 = lowest pitch string)
  stringNumber: number; // 1-based musical string number (1 = high E, 6 = low E)
  stringName: string;   // e.g. "String 5 (A)"
  finger?: number;      // 1-4
  fingerName?: string;  // "Index", "Middle", etc.
  fret?: number;
  instruction: string;
}

export interface PracticeGuidance {
  steps: ChordStep[];
  commonMistakes: { title: string; description: string; solution: string }[];
  practiceTips: string[];
}

/** Default 6-string guitar string labels (index 0 = lowest pitch) */
export const GUITAR_STRING_LABELS = [
  { musicalNum: 6, note: "E (Low)" },
  { musicalNum: 5, note: "A" },
  { musicalNum: 4, note: "D" },
  { musicalNum: 3, note: "G" },
  { musicalNum: 2, note: "B" },
  { musicalNum: 1, note: "E (High)" },
];

/** Default 4-string bass / ukulele string labels */
export const BASS_STRING_LABELS = [
  { musicalNum: 4, note: "E" },
  { musicalNum: 3, note: "A" },
  { musicalNum: 2, note: "D" },
  { musicalNum: 1, note: "G" },
];

export const UKULELE_STRING_LABELS = [
  { musicalNum: 4, note: "G" },
  { musicalNum: 3, note: "C" },
  { musicalNum: 2, note: "E" },
  { musicalNum: 1, note: "A" },
];

export function getPracticeGuidance(
  frets: (number | null)[],
  fingering: FingeringResult,
  instrument: "guitar" | "bass" | "ukulele" | "piano" = "guitar",
  stringNames?: string[]
): PracticeGuidance {
  const numStrings = frets.length;
  const steps: ChordStep[] = [];
  let stepCounter = 1;

  // Determine string labels
  const labels: { musicalNum: number; note: string }[] = [];
  for (let i = 0; i < numStrings; i++) {
    const musicalNum = numStrings - i;
    let note = "";
    if (stringNames && stringNames[i]) {
      note = stringNames[i];
    } else if (instrument === "guitar" && i < GUITAR_STRING_LABELS.length) {
      note = GUITAR_STRING_LABELS[i].note;
    } else if (instrument === "bass" && i < BASS_STRING_LABELS.length) {
      note = BASS_STRING_LABELS[i].note;
    } else if (instrument === "ukulele" && i < UKULELE_STRING_LABELS.length) {
      note = UKULELE_STRING_LABELS[i].note;
    } else {
      note = `Str ${musicalNum}`;
    }
    labels.push({ musicalNum, note });
  }

  // 1. Barres first if any
  for (const barre of fingering.barres) {
    const fromLabel = labels[barre.fromString];
    const toLabel = labels[barre.toString];
    const fName = FINGER_NAMES[barre.finger] || "Index";
    steps.push({
      stepNumber: stepCounter++,
      type: "barre",
      stringIndex: barre.fromString,
      stringNumber: fromLabel.musicalNum,
      stringName: `Strings ${toLabel.musicalNum} through ${fromLabel.musicalNum}`,
      finger: barre.finger,
      fingerName: fName,
      fret: barre.fret,
      instruction: `Barre your ${fName} finger (${barre.finger}) flat across fret ${barre.fret} from string ${fromLabel.musicalNum} (${fromLabel.note}) to string ${toLabel.musicalNum} (${toLabel.note}).`,
    });
  }

  // 2. Individual fretted notes (excluding notes covered solely by the barre)
  const barreIndices = new Set<number>();
  for (const b of fingering.barres) {
    for (let s = b.fromString; s <= b.toString; s++) {
      if (frets[s] === b.fret) {
        barreIndices.add(s);
      }
    }
  }

  // Sort fretted notes from lowest string to highest string
  for (let i = 0; i < numStrings; i++) {
    const fret = frets[i];
    if (fret !== null && fret > 0 && !barreIndices.has(i)) {
      const finger = fingering.fingers[i];
      const fingerName = finger ? FINGER_NAMES[finger] : "finger";
      const lbl = labels[i];
      steps.push({
        stepNumber: stepCounter++,
        type: "fret",
        stringIndex: i,
        stringNumber: lbl.musicalNum,
        stringName: `String ${lbl.musicalNum} (${lbl.note})`,
        finger: finger ?? undefined,
        fingerName,
        fret,
        instruction: `Place your ${fingerName}${finger ? ` (${finger})` : ""} on string ${lbl.musicalNum} (${lbl.note}) at fret ${fret}.`,
      });
    }
  }

  // 3. Open strings
  for (let i = 0; i < numStrings; i++) {
    if (frets[i] === 0) {
      const lbl = labels[i];
      steps.push({
        stepNumber: stepCounter++,
        type: "open",
        stringIndex: i,
        stringNumber: lbl.musicalNum,
        stringName: `String ${lbl.musicalNum} (${lbl.note})`,
        instruction: `Leave string ${lbl.musicalNum} (${lbl.note}) open — do not touch it so it rings out freely.`,
      });
    }
  }

  // 4. Muted strings
  for (let i = 0; i < numStrings; i++) {
    if (frets[i] === null || frets[i]! < 0) {
      const lbl = labels[i];
      steps.push({
        stepNumber: stepCounter++,
        type: "mute",
        stringIndex: i,
        stringNumber: lbl.musicalNum,
        stringName: `String ${lbl.musicalNum} (${lbl.note})`,
        instruction: `Mute string ${lbl.musicalNum} (${lbl.note}) with the side of an adjacent finger or light thumb touch — do not play or sound this string.`,
      });
    }
  }

  // Common mistakes & solutions
  const commonMistakes = [
    {
      title: "Muting Neighboring Open Strings",
      description: "Flattened fingers can unintentionally touch and deaden adjacent ringing strings.",
      solution: "Curl your fingers at the knuckles and press firmly onto the tips rather than the fleshy pads.",
    },
    {
      title: "Fret Buzzing or Dull Sound",
      description: "Placing a finger too far behind the fret wire requires excessive squeeze and causes buzzing.",
      solution: "Slide your fingertips just behind the metal fret wire, applying clean direct pressure.",
    },
  ];

  if (fingering.barres.length > 0) {
    commonMistakes.push({
      title: "Uneven Barre Pressure",
      description: "Middle strings in a barre often buzz because the natural creases in the finger do not contact the string.",
      solution: "Roll your barring index finger slightly onto its outer bony side and leverage weight from your arm rather than squeezing the thumb.",
    });
  }

  const practiceTips = [
    "Individual String Test: Strum each string one by one from lowest to highest to ensure every single note rings clear without muffled buzz.",
    "Target Fret Placement: Aim your fingertips 1–2 mm behind the fret wire for the cleanest tone with minimum finger fatigue.",
    "Muscle Memory Lift Drill: Form the shape, hold for 5 seconds, lift fingers slightly off the fretboard while keeping the shape intact, then press back down simultaneously.",
  ];

  return { steps, commonMistakes, practiceTips };
}
