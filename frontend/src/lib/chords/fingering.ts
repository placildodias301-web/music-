/**
 * Heuristic fingering assignment and difficulty scoring for fretted instruments.
 * Assigns fingers (1=Index, 2=Middle, 3=Ring, 4=Pinky), detects barre chords,
 * and classifies difficulty (Beginner, Intermediate, Advanced).
 */

export interface BarreDef {
  fret: number;
  fromString: number; // 0-indexed: 0 = lowest pitch string (e.g. Low E)
  toString: number;   // 0-indexed: 5 = High E
  finger: number;     // typically 1 (Index), rarely 3 or 4
}

export type ChordDifficulty = "Beginner" | "Intermediate" | "Advanced";

export interface FingeringResult {
  /** Finger number 1-4 for each string, or null if open/muted */
  fingers: (number | null)[];
  /** Finger name ("Index", "Middle", "Ring", "Pinky") or null */
  fingerNames: (string | null)[];
  /** Barre details if any detected */
  barres: BarreDef[];
  /** Overall difficulty level */
  difficulty: ChordDifficulty;
  /** Detailed reason explaining the difficulty classification */
  difficultyReason: string;
  /** Fret span between lowest and highest fretted note */
  span: number;
}

export const FINGER_NAMES: Record<number, string> = {
  1: "Index",
  2: "Middle",
  3: "Ring",
  4: "Pinky",
};

/**
 * Canonical fingerings for classic 6-string guitar open chords (frets pattern as key).
 * Key format: comma-separated frets e.g. "x,3,2,0,1,0"
 */
const CANONICAL_GUITAR_FINGERINGS: Record<string, { fingers: (number | null)[]; difficulty?: ChordDifficulty }> = {
  // C major: x 3 2 0 1 0
  "x,3,2,0,1,0": { fingers: [null, 3, 2, null, 1, null], difficulty: "Beginner" },
  // C7: x 3 2 3 1 0
  "x,3,2,3,1,0": { fingers: [null, 3, 2, 4, 1, null], difficulty: "Intermediate" },
  // Cadd9: x 3 2 0 3 3
  "x,3,2,0,3,3": { fingers: [null, 2, 1, null, 3, 4], difficulty: "Beginner" },
  // D major: x x 0 2 3 2
  "x,x,0,2,3,2": { fingers: [null, null, null, 1, 3, 2], difficulty: "Beginner" },
  // Dm: x x 0 2 3 1
  "x,x,0,2,3,1": { fingers: [null, null, null, 2, 3, 1], difficulty: "Beginner" },
  // D7: x x 0 2 1 2
  "x,x,0,2,1,2": { fingers: [null, null, null, 2, 1, 3], difficulty: "Beginner" },
  // Dsus4: x x 0 2 3 3
  "x,x,0,2,3,3": { fingers: [null, null, null, 1, 3, 4], difficulty: "Beginner" },
  // Dsus2: x x 0 2 3 0
  "x,x,0,2,3,0": { fingers: [null, null, null, 1, 2, null], difficulty: "Beginner" },
  // E major: 0 2 2 1 0 0
  "0,2,2,1,0,0": { fingers: [null, 2, 3, 1, null, null], difficulty: "Beginner" },
  // Em: 0 2 2 0 0 0
  "0,2,2,0,0,0": { fingers: [null, 2, 3, null, null, null], difficulty: "Beginner" },
  // E7: 0 2 0 1 0 0
  "0,2,0,1,0,0": { fingers: [null, 2, null, 1, null, null], difficulty: "Beginner" },
  // E7 (alt): 0 2 2 1 3 0
  "0,2,2,1,3,0": { fingers: [null, 2, 3, 1, 4, null], difficulty: "Intermediate" },
  // Em7: 0 2 2 0 3 0 or 0 2 0 0 0 0
  "0,2,0,0,0,0": { fingers: [null, 2, null, null, null, null], difficulty: "Beginner" },
  "0,2,2,0,3,0": { fingers: [null, 1, 2, null, 3, null], difficulty: "Beginner" },
  // G major: 3 2 0 0 0 3
  "3,2,0,0,0,3": { fingers: [2, 1, null, null, null, 3], difficulty: "Beginner" },
  // G (4-finger): 3 2 0 0 3 3
  "3,2,0,0,3,3": { fingers: [2, 1, null, null, 3, 4], difficulty: "Beginner" },
  // G7: 3 2 0 0 0 1
  "3,2,0,0,0,1": { fingers: [3, 2, null, null, null, 1], difficulty: "Beginner" },
  // A major: x 0 2 2 2 0
  "x,0,2,2,2,0": { fingers: [null, null, 1, 2, 3, null], difficulty: "Beginner" },
  // Am: x 0 2 2 1 0
  "x,0,2,2,1,0": { fingers: [null, null, 2, 3, 1, null], difficulty: "Beginner" },
  // A7: x 0 2 0 2 0
  "x,0,2,0,2,0": { fingers: [null, null, 2, null, 3, null], difficulty: "Beginner" },
  // Am7: x 0 2 0 1 0
  "x,0,2,0,1,0": { fingers: [null, null, 2, null, 1, null], difficulty: "Beginner" },
  // Asus4: x 0 2 2 3 0
  "x,0,2,2,3,0": { fingers: [null, null, 1, 2, 4, null], difficulty: "Beginner" },
  // Asus2: x 0 2 2 0 0
  "x,0,2,2,0,0": { fingers: [null, null, 1, 2, null, null], difficulty: "Beginner" },
  // B7: x 2 1 2 0 2
  "x,2,1,2,0,2": { fingers: [null, 2, 1, 3, null, 4], difficulty: "Intermediate" },
  // Fmaj7: x x 3 2 1 0
  "x,x,3,2,1,0": { fingers: [null, null, 3, 2, 1, null], difficulty: "Beginner" },
  // F small barre: x x 3 2 1 1
  "x,x,3,2,1,1": { fingers: [null, null, 3, 2, 1, 1], difficulty: "Intermediate" },
};

/**
 * A barre is one finger laid flat across a run of strings. It can lie over a MUTED string (touching it silences it — the
 * classic x-3-1-x-1-2 shapes), but it cannot cross an OPEN string (the finger would fret it) or a string fretted lower.
 */
function barreIsPlayable(frets: (number | null)[], fret: number, from: number, to: number): boolean {
  for (let i = from; i <= to; i++) {
    const f = frets[i];
    if (f === null || f === undefined) continue; // muted: the flat finger deadens it
    if (f === 0 || f < fret) return false;
  }
  return true;
}

function fretsToKey(frets: (number | null)[]): string {
  return frets.map((f) => (f === null || f < 0 ? "x" : String(f))).join(",");
}

/**
 * Assigns fingers and detects barres for a given fret pattern.
 * Works with 6-string guitar, 4-string bass/ukulele, 5/7 string instruments.
 */
export function assignFingers(frets: (number | null)[]): FingeringResult {
  const numStrings = frets.length;
  const key = fretsToKey(frets);

  // 1. Check canonical dictionary first
  if (CANONICAL_GUITAR_FINGERINGS[key]) {
    const canon = CANONICAL_GUITAR_FINGERINGS[key];
    const fingers = [...canon.fingers];
    const fingerNames = fingers.map((f) => (f ? FINGER_NAMES[f] : null));
    const frettedVals = frets.filter((f): f is number => f !== null && f > 0);
    const span = frettedVals.length > 0 ? Math.max(...frettedVals) - Math.min(...frettedVals) : 0;
    
    // Check if small barre exists in canonical (e.g. F small barre)
    const barres: BarreDef[] = [];
    const minFret = frettedVals.length > 0 ? Math.min(...frettedVals) : 0;
    const minFretIndices = frets
      .map((f, i) => (f === minFret ? i : -1))
      .filter((i) => i !== -1);
    if (minFretIndices.length >= 2 && minFret > 0 && barreIsPlayable(frets, minFret, Math.min(...minFretIndices), Math.max(...minFretIndices))) {
      barres.push({
        fret: minFret,
        fromString: Math.min(...minFretIndices),
        toString: Math.max(...minFretIndices),
        finger: 1,
      });
    }

    return {
      fingers,
      fingerNames,
      barres,
      difficulty: canon.difficulty ?? "Beginner",
      difficultyReason: canon.difficulty === "Beginner" 
        ? "Common open position chord with minimal finger stretch" 
        : "Standard voicing requiring four distinct finger placements",
      span,
    };
  }

  // 2. Dynamic heuristic solver
  const fretted = frets
    .map((fret, stringIdx) => ({ fret, stringIdx }))
    .filter((entry): entry is { fret: number; stringIdx: number } => entry.fret !== null && entry.fret > 0);

  if (fretted.length === 0) {
    return {
      fingers: Array(numStrings).fill(null),
      fingerNames: Array(numStrings).fill(null),
      barres: [],
      difficulty: "Beginner",
      difficultyReason: "All open or muted strings",
      span: 0,
    };
  }

  const fretNumbers = fretted.map((e) => e.fret);
  const minFret = Math.min(...fretNumbers);
  const maxFret = Math.max(...fretNumbers);
  const span = maxFret - minFret;

  const resultFingers: (number | null)[] = Array(numStrings).fill(null);
  const barres: BarreDef[] = [];

  // Identify strings at the lowest fretted position
  const lowestFretStrings = fretted.filter((e) => e.fret === minFret);

  // Check for barre condition:
  // If 2 or more strings are on minFret AND minFret > 0
  // (and one finger can actually lie across them: an open string in between means two separate fingers)
  const isBarre =
    lowestFretStrings.length >= 2 &&
    barreIsPlayable(frets, minFret, Math.min(...lowestFretStrings.map((s) => s.stringIdx)), Math.max(...lowestFretStrings.map((s) => s.stringIdx)));

  if (isBarre) {
    const stringIndices = lowestFretStrings.map((s) => s.stringIdx);
    const fromString = Math.min(...stringIndices);
    const toString = Math.max(...stringIndices);

    // Barre with index finger (1)
    barres.push({
      fret: minFret,
      fromString,
      toString,
      finger: 1,
    });

    // Mark index finger for all strings at minFret
    for (const e of lowestFretStrings) {
      resultFingers[e.stringIdx] = 1;
    }

    // Remaining notes sorted by fret, then string
    const remaining = fretted
      .filter((e) => e.fret > minFret)
      .sort((a, b) => a.fret - b.fret || a.stringIdx - b.stringIdx);

    // Group remaining by fret offset
    let nextFinger = 2;
    for (let i = 0; i < remaining.length; i++) {
      const entry = remaining[i];
      if (nextFinger <= 4) {
        resultFingers[entry.stringIdx] = nextFinger;
        // If there's another note at the same fret, give it the next finger
        nextFinger++;
      } else {
        // Fallback to pinky for highest notes
        resultFingers[entry.stringIdx] = 4;
      }
    }
  } else {
    // Non-barre voicing
    // Sort fretted notes by fret ascending; if frets are equal, sort by string
    const sorted = [...fretted].sort((a, b) => a.fret - b.fret || a.stringIdx - b.stringIdx);

    const assigned = new Map<number, number>(); // stringIdx -> finger
    // One finger per fretted note, in fret order (then string order): a finger can never be on two different frets.
    // The shape search only returns shapes that need four fingers or fewer (a flat barre counts as one).
    sorted.forEach((note, idx) => {
      assigned.set(note.stringIdx, Math.min(idx + 1, 4));
    });

    for (const [sIdx, finger] of assigned.entries()) {
      resultFingers[sIdx] = finger;
    }
  }

  // 3. Difficulty scoring
  let difficulty: ChordDifficulty = "Intermediate";
  let difficultyReason = "";

  const openStringsCount = frets.filter((f) => f === 0).length;
  const frettedCount = fretted.length;

  if (barres.length > 0) {
    if (span >= 4 || maxFret >= 9) {
      difficulty = "Advanced";
      difficultyReason = `High-fret barre chord with a wide ${span}-fret stretch`;
    } else if (barres[0].toString - barres[0].fromString >= 4) {
      difficulty = "Intermediate";
      difficultyReason = `Full ${barres[0].toString - barres[0].fromString + 1}-string barre across fret ${minFret}`;
    } else {
      difficulty = "Intermediate";
      difficultyReason = `Partial barre on fret ${minFret}`;
    }
  } else if (span >= 4) {
    difficulty = "Advanced";
    difficultyReason = `Large ${span}-fret reach across non-adjacent frets`;
  } else if (minFret <= 3 && openStringsCount >= 2 && frettedCount <= 3 && span <= 2) {
    difficulty = "Beginner";
    difficultyReason = "Easy open-position chord with comfortable finger reach";
  } else if (frettedCount >= 4 || span >= 3) {
    difficulty = "Intermediate";
    difficultyReason = `Requires ${frettedCount} independent finger placements with a ${span}-fret span`;
  } else {
    difficulty = "Beginner";
    difficultyReason = "Standard comfortable fingering without complex stretches";
  }

  const fingerNames = resultFingers.map((f) => (f ? FINGER_NAMES[f] : null));

  return {
    fingers: resultFingers,
    fingerNames,
    barres,
    difficulty,
    difficultyReason,
    span,
  };
}
