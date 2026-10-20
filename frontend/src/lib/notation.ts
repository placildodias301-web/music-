/**
 * How chord and key names are written, from the Music display settings.
 * Chord symbols stay as ASCII letters internally ("G#m7") — this only
 * changes what people read.
 *
 *  - Letters:  C♯ / D♭ per the sharps/flats setting ("auto" follows the key).
 *  - Solfège:  fixed Do (Do = C), with the same sharps/flats choice.
 *  - Sargam:   relative to the song's key — Sa is the tonic. Notes outside
 *              the natural scale degrees are komal (flat), written in
 *              lowercase (re, ga, dha, ni), or tivra Ma, written Ma'.
 */

import type { Accidentals, NotationSystem } from "./settings/model";

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const SOLFEGE: Record<string, string> = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };
/** Semitones above Sa → swara (komal in lowercase, tivra Ma as Ma'). */
const SARGAM = ["Sa", "re", "Re", "ga", "Ga", "Ma", "Ma'", "Pa", "dha", "Dha", "ni", "Ni"];

/** Keys conventionally written with flats. */
const FLAT_MAJOR_TONICS = new Set([5, 10, 3, 8, 1, 6]); // F B♭ E♭ A♭ D♭ G♭
const FLAT_MINOR_TONICS = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm B♭m E♭m

export interface NotationOptions {
  accidentals: Accidentals;
  notation: NotationSystem;
  /** The key the chords are in (e.g. "G# Minor"), for "auto" spelling and Sa. */
  key: string;
}

function parseKey(key: string): { tonic: number; minor: boolean } | null {
  const m = /^([A-G])([#b♯♭]?)\s+(major|minor)/i.exec(key.trim());
  if (!m) return null;
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0;
  return { tonic: (LETTER_PC[m[1]] + acc + 12) % 12, minor: m[3].toLowerCase() === "minor" };
}

function prefersFlats(opts: NotationOptions): boolean {
  if (opts.accidentals === "flats") return true;
  if (opts.accidentals === "sharps") return false;
  const k = parseKey(opts.key);
  if (!k) return false;
  return k.minor ? FLAT_MINOR_TONICS.has(k.tonic) : FLAT_MAJOR_TONICS.has(k.tonic);
}

function rootName(pc: number, opts: NotationOptions): string {
  const letterName = (prefersFlats(opts) ? FLAT_NAMES : SHARP_NAMES)[pc];
  if (opts.notation === "solfege") return SOLFEGE[letterName[0]] + letterName.slice(1);
  if (opts.notation === "sargam") {
    const k = parseKey(opts.key);
    return k ? SARGAM[(pc - k.tonic + 12) % 12] : letterName;
  }
  return letterName;
}

const ROOT_RE = /^([A-G])([#b♯♭]?)(.*)$/;

function pcOf(letter: string, acc: string): number {
  const offset = acc === "#" || acc === "♯" ? 1 : acc === "b" || acc === "♭" ? -1 : 0;
  return (LETTER_PC[letter] + offset + 12) % 12;
}

/** "G#m7" → "A♭m7" / "Sol♯m7" / "Sa m7" depending on the options. */
export function formatChord(symbol: string, opts: NotationOptions): string {
  const m = ROOT_RE.exec(symbol.trim());
  if (!m) return symbol;
  let suffix = m[3];
  let bass = "";
  const slash = /\/([A-G])([#b♯♭]?)$/.exec(suffix);
  if (slash) {
    suffix = suffix.slice(0, slash.index);
    bass = "/" + rootName(pcOf(slash[1], slash[2]), opts);
  }
  const root = rootName(pcOf(m[1], m[2]), opts);
  // Sargam names are words, so keep the chord quality visibly separate.
  const sep = opts.notation === "sargam" && suffix ? "\u00A0" : "";
  return root + sep + suffix + bass;
}

/** "G# Minor" → "G♯ minor" / "A♭ minor" / "Sol♯ minor". Sargam keys stay in letters (Sa is relative). */
export function formatKey(key: string, opts: NotationOptions): string {
  const k = parseKey(key);
  if (!k) return key;
  // Spell the key by its own signature, not the song's.
  const lettersOnly = { ...opts, key, notation: opts.notation === "sargam" ? "letters" : opts.notation } as NotationOptions;
  return `${rootName(k.tonic, lettersOnly)} ${k.minor ? "minor" : "major"}`;
}

/** One-line legend shown wherever sargam names appear (null otherwise). */
export function notationLegend(opts: NotationOptions): string | null {
  if (opts.notation !== "sargam") return null;
  const k = parseKey(opts.key);
  if (!k) return null;
  const sa = (prefersFlats(opts) ? FLAT_NAMES : SHARP_NAMES)[k.tonic];
  return `Sargam: Sa = ${sa}. Lowercase = komal (flat): re ga dha ni. Ma' = tivra (sharp) Ma.`;
}
