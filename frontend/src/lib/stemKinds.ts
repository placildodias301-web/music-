/** Which instrument family a stem id belongs to (drives the icon and the preview filter bands). */
export type Kind = "vocal" | "drums" | "bass" | "guitar" | "keys" | "other";
const KIND_WORDS: [Kind, string[]][] = [
  ["vocal", ["vocal", "vocals", "voice", "singer", "vox"]],
  ["drums", ["drum", "drums", "kick", "snare", "hh", "hat", "hihat", "tom", "toms", "ride", "crash", "cymbals", "perc", "percussion"]],
  ["bass", ["bass"]],
  ["guitar", ["guitar", "guitars"]],
  ["keys", ["piano", "keys", "key", "synth", "organ"]],
];
/** Whole-word match on the id ("custom_strings" must not count as "tom"). */
export function stemKind(id: string): Kind {
  const words = id.toLowerCase().split(/[^a-z0-9]+/);
  for (const [kind, list] of KIND_WORDS) if (words.some((w) => list.includes(w))) return kind;
  return "other";
}

