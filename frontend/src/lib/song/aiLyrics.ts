import type { AnalysisResult } from "../api";

/** Asks the tutor for ORIGINAL lyrics shaped like the analysed song. Nothing here fetches existing lyrics. */
export function buildLyricsPrompt(analysis: AnalysisResult, theme: string): string {
  const cycle = analysis.chordProgression.slice(0, 8).join(" – ");
  const topic = theme.trim().slice(0, 200);
  return [
    "TASK: write brand-new, ORIGINAL song lyrics for a songwriter. Do not quote, copy or closely imitate any existing song's lyrics.",
    `The song is in ${analysis.key} at about ${Math.round(analysis.bpm)} BPM, ${analysis.timeSignature}, with the chord cycle ${cycle || "unknown"}.`,
    topic ? `Theme / mood / language requested by the user: ${topic}` : "Theme: free choice — something heartfelt and singable.",
    "Structure: [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Chorus]. 4 short singable lines per section, roughly one line per two chords of the cycle.",
    "Output ONLY the lyrics, with the section headers in square brackets on their own lines. No chords, no title, no explanations, no markdown.",
  ].join("\n");
}

/** Strips code fences / markdown the model may add, keeping [Section] headers and lines. */
export function cleanGeneratedLyrics(raw: string): string {
  return raw
    .replace(/```[a-z]*\n?/gi, "")
    .split("\n")
    .map((l) => l.replace(/^\s*#{1,6}\s*/, "").replace(/\*\*|__/g, "").replace(/^\s*\*\*?\s+/, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
