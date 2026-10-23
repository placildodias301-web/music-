/**
 * Chord description engine — every sentence the theory section shows is DERIVED from the chord's interval structure
 * (lib/chordTheory.ts quality tones), never looked up per chord name. A new chord quality needs no new text:
 *
 *   quality tones → features (third, fifth, seventh, sixth, suspension, extensions, tritone) → kind
 *   features + spelled notes → construction, sound, harmonic role, uses, related chords
 *
 * Voicing-specific explanations (how a particular shape produces the notes) are built from the per-string analysis.
 */

import { CHORD_QUALITIES, NOTE_NAMES, slashChord, spellChord, type ParsedChord, type QualityDef } from "../chordTheory";
import { getIntervalInfo } from "../theory/intervals";
import type { PlayedStringAnalysis } from "./analysis";

export type ChordKind =
  | "major"
  | "minor"
  | "dominant"
  | "minor-major"
  | "diminished"
  | "half-diminished"
  | "augmented"
  | "suspended"
  | "power";

export interface ChordFeatures {
  third: "major" | "minor" | "none";
  suspension: "sus2" | "sus4" | null;
  fifth: "perfect" | "diminished" | "augmented" | "none";
  seventh: "major" | "minor" | "diminished" | null;
  sixth: boolean;
  extensions: { degree: 9 | 11 | 13; alteration: "natural" | "flat" | "sharp" }[];
  tritone: boolean;
  kind: ChordKind;
}

/** Reads a chord quality's tones and classifies them. */
export function chordFeatures(quality: QualityDef): ChordFeatures {
  const byDegree = (d: number) => quality.tones.find(([, deg]) => deg === d)?.[0];
  const t3 = byDegree(3);
  const t2 = byDegree(2);
  const t4 = byDegree(4);
  const t5 = byDegree(5);
  const t6 = byDegree(6);
  const t7 = byDegree(7);
  const third = t3 === 4 ? "major" : t3 === 3 ? "minor" : "none";
  const suspension = third === "none" && t2 === 2 ? "sus2" : third === "none" && t4 === 5 ? "sus4" : null;
  const fifth = t5 === 7 ? "perfect" : t5 === 6 ? "diminished" : t5 === 8 ? "augmented" : "none";
  const seventh = t7 === 11 ? "major" : t7 === 10 ? "minor" : t7 === 9 ? "diminished" : null;
  const ext = (deg: 9 | 11 | 13, natural: number): ChordFeatures["extensions"][number] | null => {
    const s = byDegree(deg);
    if (s === undefined) return null;
    return { degree: deg, alteration: s === natural ? "natural" : s < natural ? "flat" : "sharp" };
  };
  const extensions = [ext(9, 14), ext(11, 17), ext(13, 21)].filter((e): e is ChordFeatures["extensions"][number] => e !== null);
  const semis = quality.tones.map(([s]) => s % 12);
  const tritone = semis.some((a) => semis.some((b) => (b - a + 12) % 12 === 6));

  let kind: ChordKind;
  if (suspension) kind = "suspended";
  else if (third === "none") kind = "power";
  else if (third === "minor" && fifth === "diminished") kind = seventh === "minor" ? "half-diminished" : "diminished";
  else if (third === "major" && fifth === "augmented" && seventh !== "major") kind = "augmented";
  else if (third === "major" && seventh === "minor") kind = "dominant";
  else if (third === "minor" && seventh === "major") kind = "minor-major";
  else kind = third === "major" ? "major" : "minor";
  return { third, suspension, fifth, seventh, sixth: t6 === 9, extensions, tritone, kind };
}

/* ─── Words (shared tables keyed by FEATURE, not by chord name) ─── */

const KIND_LABEL: Record<ChordKind, string> = {
  major: "Major",
  minor: "Minor",
  dominant: "Dominant",
  "minor-major": "Minor-major",
  diminished: "Diminished",
  "half-diminished": "Half-diminished",
  augmented: "Augmented",
  suspended: "Suspended",
  power: "Power (no third)",
};

const THIRD_SOUND: Record<ChordFeatures["third"], string> = {
  major: "The major third makes it sound bright, open and stable.",
  minor: "The minor third makes it sound darker, softer and more inward.",
  none: "With no third it is neither major nor minor — open, hollow and ambiguous.",
};

const SUS_SOUND: Record<"sus2" | "sus4", string> = {
  sus2: "The 2nd replaces the 3rd, so the chord floats: airy and unresolved, free of major or minor mood.",
  sus4: "The 4th replaces the 3rd and rubs against the 5th, creating tension that wants to fall back onto the 3rd.",
};

const FIFTH_SOUND: Record<"diminished" | "augmented", string> = {
  diminished: "The flattened 5th forms a tritone with the root — the most unstable interval in tonal music — so the chord feels tense and wants to move.",
  augmented: "The raised 5th makes the chord float: restless and unresolved, with no firm resting point.",
};

const SEVENTH_SOUND: Record<"major" | "minor" | "diminished", string> = {
  major: "The major 7th sits one semitone under the octave, adding a shimmering, dreamy colour.",
  minor: "The minor 7th adds a relaxed, bluesy colour and keeps the chord moving.",
  diminished: "The diminished 7th stacks minor thirds symmetrically, giving a dramatic, unstable sound that can resolve in several directions.",
};

const EXTENSION_SOUND: Record<string, string> = {
  "9:natural": "The 9th adds openness and shimmer above the chord.",
  "9:flat": "The ♭9 adds a sharp, dark tension that strongly asks to resolve.",
  "9:sharp": "The ♯9 adds a gritty, bluesy edge — major and minor thirds sounding together.",
  "11:natural": "The 11th adds suspended-sounding space (players often leave out the 3rd to avoid a clash with it).",
  "11:sharp": "The ♯11 adds a bright, Lydian-like sparkle without the clash of a natural 11th.",
  "13:natural": "The 13th adds warm, jazzy richness near the top of the chord.",
  "13:flat": "The ♭13 adds a dark, aching colour that leans toward the 5th.",
};

/* ─── Intervals, construction, sound ─── */

export interface IntervalRow {
  note: string;
  shortName: string;
  name: string;
  semitones: number;
  /** "C → E" */
  fromRoot: string;
}

export function intervalRows(chord: ParsedChord): IntervalRow[] {
  const notes = spellChord(chord);
  const root = notes[0];
  return chord.quality.tones.map(([semi, degree], i) => {
    const info = getIntervalInfo(semi, degree);
    return { note: notes[i], shortName: info.shortName, name: info.name, semitones: semi, fromRoot: i === 0 ? `${root} (root)` : `${root} → ${notes[i]}` };
  });
}

export function constructionText(chord: ParsedChord): string {
  const rows = intervalRows(chord);
  const [root, ...rest] = rows;
  const parts = rest.map((r) => `the ${r.name.toLowerCase()} (${r.note}, ${r.semitones} semitones above the root)`);
  const stack = parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const f = chordFeatures(chord.quality);
  const how = f.suspension
    ? " The third is left out and replaced by a suspended note, which is what makes it a suspension."
    : f.third === "none"
      ? " With only the root and fifth there is no third to say major or minor."
      : "";
  return `Start on the root, ${root.note}, and add ${stack || "nothing else"}.${how}`;
}

/** Several short sentences describing how the chord sounds, one for each feature the chord has. */
export function soundCharacter(chord: ParsedChord): string[] {
  const f = chordFeatures(chord.quality);
  const out: string[] = [];
  if (f.suspension) out.push(SUS_SOUND[f.suspension]);
  else out.push(THIRD_SOUND[f.third]);
  if (f.fifth === "diminished" || f.fifth === "augmented") out.push(FIFTH_SOUND[f.fifth]);
  if (f.seventh) out.push(SEVENTH_SOUND[f.seventh]);
  if (f.sixth && !f.seventh) out.push("The 6th adds a warm, sweet, settled colour without the forward pull of a 7th.");
  for (const e of f.extensions) {
    const text = EXTENSION_SOUND[`${e.degree}:${e.alteration}`];
    if (text) out.push(text);
  }
  if (f.tritone && f.kind === "dominant") out.push("The tritone between the 3rd and ♭7 is the engine of the chord: it pulls toward resolution.");
  return out;
}

/* ─── Harmonic role, common uses ─── */

const name = (pc: number) => NOTE_NAMES[((pc % 12) + 12) % 12];

export function harmonicRole(chord: ParsedChord): string {
  const f = chordFeatures(chord.quality);
  const r = chord.root;
  switch (f.kind) {
    case "dominant":
      return `Dominant function: it creates momentum and resolves down a fifth (up a fourth) to ${name(r + 5)}, the chord a perfect fourth above. In a major key it is built on the 5th degree.`;
    case "major":
      return f.seventh === "major" || f.sixth
        ? "Stable, restful colour: a tonic (I) or subdominant (IV) in a major key, a home chord with extra sweetness."
        : "Stable and restful: the tonic (I), subdominant (IV) or dominant (V) in a major key, and III, VI or VII in a minor key.";
    case "minor":
      return f.seventh === "minor"
        ? "Mellow and flexible: the ii (the start of a ii–V–I), iii or vi in a major key, or the tonic (i) in a minor key."
        : "The home chord of a minor key (i), and the ii, iii or vi of a major key.";
    case "minor-major":
      return "A tense, cinematic tonic minor — the minor chord with a leading-tone seventh, common in film music and as a passing chord.";
    case "diminished":
      return "Leading-tone function: it is tense and resolves a semitone up to a nearby chord (vii° → I), or acts as a passing chord between two others.";
    case "half-diminished":
      return "The ii chord of a minor ii–V–i progression (iiø7), moving to a dominant chord a fourth above.";
    case "augmented":
      return "A restless passing chord that pushes outward — often used to lead from a major chord to the chord a step or fifth away.";
    case "suspended":
      return "A suspension: it delays the resolution to a full major or minor chord, which usually follows it.";
    case "power":
      return "Neutral and powerful: it reinforces the root without naming major or minor, so it works under any melody — the backbone of rock and metal riffs.";
  }
}

/** Typical places the chord is used, with progressions worked out for THIS root. */
export function commonUses(chord: ParsedChord): string[] {
  const f = chordFeatures(chord.quality);
  const r = chord.root;
  const m = (pc: number) => `${name(pc)}m`;
  switch (f.kind) {
    case "dominant":
      return [
        `V–I cadence: ${name(r)}${chord.quality.suffix} → ${name(r + 5)}`,
        `ii–V–I in ${name(r + 5)}: ${m(r + 7)}7 – ${name(r)}${chord.quality.suffix} – ${name(r + 5)}maj7`,
        "Blues, funk, jazz and rock: the standard 12-bar blues is built from dominant chords.",
      ];
    case "major":
      return [
        `I–IV–V in ${name(r)}: ${name(r)} – ${name(r + 5)} – ${name(r + 7)}`,
        `I–V–vi–IV in ${name(r)}: ${name(r)} – ${name(r + 7)} – ${m(r + 9)} – ${name(r + 5)}`,
        f.seventh === "major" ? "Jazz, bossa nova and soft pop for the tonic or IV chord." : "Pop, folk, rock and country — the most common chord in popular music.",
      ];
    case "minor":
      return [
        `i–VI–VII in ${name(r)} minor: ${m(r)} – ${name(r + 8)} – ${name(r + 10)}`,
        `ii–V–I in ${name(r + 10)}: ${m(r)}${f.seventh === "minor" ? "7" : ""} – ${name(r + 5)}7 – ${name(r + 10)}`,
        "Ballads, soul, rock and film music wherever a serious or tender mood is wanted.",
      ];
    case "minor-major":
      return [`Tonic minor with a chromatic line: ${m(r)} → ${m(r)}maj7 → ${m(r)}7 → ${m(r)}6`, "Film noir, spy-theme and jazz minor sounds."];
    case "diminished":
      return [`Passing chord: ${name(r - 1)} → ${name(r)}${chord.quality.suffix} → ${m(r + 1)}`, "Classical and jazz connecting chords; dim7 is also a pivot to many keys."];
    case "half-diminished":
      return [`Minor ii–V–i in ${name(r + 10)} minor: ${name(r)}ø7 – ${name(r + 5)}7 – ${m(r + 10)}`, "Jazz standards and bossa nova."];
    case "augmented":
      return [`Passing chord: ${name(r)} → ${name(r)}aug → ${name(r + 5)}6`, "Waltzes, film music and jazz turnarounds."];
    case "suspended":
      return [
        f.suspension === "sus4" ? `Resolve down: ${name(r)}sus4 → ${name(r)}` : `Resolve to a third: ${name(r)}sus2 → ${name(r)} or ${m(r)}`,
        "Pop, rock and folk intros, where it keeps the sound open before the full chord arrives.",
      ];
    case "power":
      return ["Rock, punk and metal riffs, especially with distortion where full chords turn muddy.", `Riff on ${name(r)}5 – ${name(r + 5)}5 – ${name(r + 7)}5`];
  }
}

/* ─── Related chords ─── */

export interface RelatedChord {
  symbol: string;
  relation: string;
  detail: string;
}

const qualityWith = (semis: number[]): QualityDef | undefined => {
  const key = [...new Set(semis.map((s) => s))].sort((a, b) => a - b).join(",");
  return CHORD_QUALITIES.find((q) => q.tones.map(([s]) => s).sort((a, b) => a - b).join(",") === key);
};

/** Chords one small change away, found by editing the quality's tones and looking the result up — nothing hand-listed per chord. */
export function relatedChords(chord: ParsedChord): RelatedChord[] {
  const f = chordFeatures(chord.quality);
  const semis = chord.quality.tones.map(([s]) => s);
  const root = name(chord.root);
  const out: RelatedChord[] = [];
  const push = (relation: string, detail: string, q: QualityDef | undefined, rootPc = chord.root) => {
    if (!q || (rootPc === chord.root && q.suffix === chord.quality.suffix)) return;
    const symbol = `${name(rootPc)}${q.suffix}`;
    if (!out.some((o) => o.symbol === symbol)) out.push({ symbol, relation, detail });
  };
  const mutate = (from: number, to: number) => semis.map((s) => (s === from ? to : s));

  if (f.third === "major" && f.fifth !== "augmented") push("Parallel minor", "Lower the 3rd by a semitone (4 → 3): same root, darker mood.", qualityWith(mutate(4, 3)));
  if (f.third === "minor") push("Parallel major", "Raise the 3rd by a semitone (3 → 4): same root, brighter mood.", qualityWith(mutate(3, 4)));
  if (!f.seventh && !f.sixth && f.extensions.length === 0 && f.fifth === "perfect" && f.third !== "none") {
    push("Add the ♭7", "Add a minor 7th (10 semitones) for a more bluesy, moving sound.", qualityWith([...semis, 10]));
    push("Add the major 7", "Add a major 7th (11 semitones) for a dreamy, jazzy tonic.", qualityWith([...semis, 11]));
    push("Add the 9th", "Add the 9th (14 semitones) for extra colour without a 7th.", qualityWith([...semis, 14]));
  }
  if (f.seventh === "minor" && f.third === "major") push("Major 7 version", "Raise the ♭7 to a major 7th: the same chord without the pull to resolve.", qualityWith(mutate(10, 11)));
  if (f.seventh === "major" && f.third === "major") push("Dominant version", "Lower the 7th to ♭7: adds the tritone and a push toward resolution.", qualityWith(mutate(11, 10)));
  if (f.third !== "none" && !f.suspension) {
    const third = f.third === "major" ? 4 : 3;
    push("Suspended 4th", "Replace the 3rd with a 4th (5 semitones): the chord hangs unresolved.", qualityWith(semis.map((s) => (s === third ? 5 : s))));
    push("Suspended 2nd", "Replace the 3rd with a 2nd (2 semitones): open and airy.", qualityWith(semis.map((s) => (s === third ? 2 : s))));
  }
  if (f.kind === "power") {
    push("Add a major 3rd", "Add the 3rd (4 semitones) to turn the neutral power chord into a bright major chord.", qualityWith([...semis, 4]));
    push("Add a minor 3rd", "Add the ♭3 (3 semitones) to turn it into a darker minor chord.", qualityWith([...semis, 3]));
    push("Suspended 4th", "Add a 4th (5 semitones) instead of a 3rd: open and unresolved.", qualityWith([...semis, 5]));
    push("Suspended 2nd", "Add a 2nd (2 semitones) instead of a 3rd: airy and open.", qualityWith([...semis, 2]));
  }
  if (f.suspension) push("Resolved major", "Let the suspended note fall to the major 3rd.", qualityWith(semis.map((s) => (s === 2 || s === 5 ? 4 : s))));

  if (f.kind === "major" && !f.seventh) {
    push("Relative minor", `Shares the same notes as the major key: a minor chord a minor third below (${name(chord.root + 9)}m).`, qualityWith([0, 3, 7]), chord.root + 9);
  }
  if (f.kind === "minor" && !f.seventh) {
    push("Relative major", `Shares the same notes as the minor key: a major chord a minor third above (${name(chord.root + 3)}).`, qualityWith([0, 4, 7]), chord.root + 3);
  }
  if (f.kind === "dominant") {
    push("Resolves to", `The chord a perfect fourth above (${name(chord.root + 5)}), where this dominant chord wants to go.`, qualityWith([0, 4, 7]), chord.root + 5);
    push("Tritone substitute", `A dominant chord a tritone away (${name(chord.root + 6)}7) shares the same 3rd and ♭7, so it can replace it.`, qualityWith([0, 4, 7, 10]), chord.root + 6);
  }
  if (chord.slashBass !== undefined) {
    out.unshift({ symbol: root + chord.quality.suffix, relation: "Root position", detail: `The same chord with ${root} in the bass instead of ${name(chord.slashBass)}.` });
  } else if (chord.quality.tones.length >= 3 && f.kind !== "power") {
    const [, second] = chord.quality.tones;
    const bass = (chord.root + second[0]) % 12;
    const q = chord.quality;
    out.push({ symbol: slashChord(chord.root, q, bass).label, relation: "First inversion", detail: `The same notes with the ${getIntervalInfo(second[0], second[1]).name.toLowerCase()} (${name(bass)}) in the bass.` });
  }
  return out.slice(0, 8);
}

/* ─── Whole description ─── */

export interface ChordDescription {
  kind: ChordKind;
  kindLabel: string;
  features: ChordFeatures;
  intervals: IntervalRow[];
  construction: string;
  sound: string[];
  role: string;
  uses: string[];
  related: RelatedChord[];
}

export function describeChord(chord: ParsedChord): ChordDescription {
  const features = chordFeatures(chord.quality);
  return {
    kind: features.kind,
    kindLabel: KIND_LABEL[features.kind],
    features,
    intervals: intervalRows(chord),
    construction: constructionText(chord),
    sound: soundCharacter(chord),
    role: harmonicRole(chord),
    uses: commonUses(chord),
    related: relatedChords(chord),
  };
}

/* ─── The shape ─── */

export interface VoicingExplanation {
  /** One line per sounding string: "String 5 (A), fret 3 → C: the root". */
  lines: { string: number; text: string }[];
  summary: string[];
}

/** How a specific shape produces the chord, from the same per-string analysis the table shows. */
export function describeVoicing(played: PlayedStringAnalysis[], chord: ParsedChord, stringNames: string[]): VoicingExplanation {
  const sounding = played.filter((p) => p.action !== "muted");
  const spelled = spellChord(chord);
  const lines = sounding.map((p) => {
    const strName = stringNames[p.stringIndex] ?? "";
    const where = p.action === "open" ? "open" : `fret ${p.fret}`;
    const role = p.isRoot ? "the root" : `the ${p.interval?.name.toLowerCase() ?? "note"}`;
    return { string: p.stringNumber, text: `String ${p.stringNumber}${strName ? ` (${strName})` : ""}, ${where} → ${p.noteName}: ${role}` };
  });
  const summary: string[] = [];
  const muted = played.filter((p) => p.action === "muted");
  summary.push(`${sounding.length} of ${played.length} strings sound${muted.length ? `; string${muted.length > 1 ? "s" : ""} ${muted.map((m) => m.stringNumber).join(", ")} ${muted.length > 1 ? "are" : "is"} muted` : ""}.`);
  const lowest = sounding.reduce<PlayedStringAnalysis | null>((lo, p) => (p.midi !== null && (lo === null || (lo.midi ?? 1e9) > p.midi) ? p : lo), null);
  if (lowest) {
    const slash = chord.slashBassNote ? ` (written as a slash chord over ${chord.slashBassNote})` : "";
    const position = lowest.isRoot ? "root position" : "an inversion";
    summary.push(`The lowest note is ${lowest.noteName} — ${lowest.isRoot ? "the root" : `the ${lowest.interval?.name.toLowerCase()}`}, so the chord is in ${position}${slash}.`);
  }
  const counts = new Map<string, number>();
  for (const p of sounding) if (p.noteName) counts.set(p.noteName, (counts.get(p.noteName) ?? 0) + 1);
  const doubled = [...counts].filter(([, n]) => n > 1).map(([n, c]) => `${n} (×${c})`);
  if (doubled.length) summary.push(`Doubled notes: ${doubled.join(", ")} — the same pitch class on more than one string adds weight.`);
  const present = new Set(sounding.map((p) => p.pitchClass));
  const missing = chord.quality.tones.map(([s], i) => ({ pc: (chord.root + s) % 12, name: spelled[i], optional: chord.quality.optional.includes(s) })).filter((t) => !present.has(t.pc));
  if (missing.length) summary.push(`Left out: ${missing.map((t) => `${t.name}${t.optional ? " (optional)" : ""}`).join(", ")} — the shape suggests the chord without ${missing.length > 1 ? "them" : "it"}.`);
  else summary.push("Every note of the chord is present.");
  const open = sounding.filter((p) => p.action === "open");
  if (open.length) summary.push(`Open strings ring: ${open.map((p) => `${p.noteName} (string ${p.stringNumber})`).join(", ")}.`);
  return { lines, summary };
}
