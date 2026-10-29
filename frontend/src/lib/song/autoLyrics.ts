/**
 * Turns lyrics transcribed from the song's audio into the sheet's normal
 * lyric format (enhanced LRC: a time per line and per word), so they are
 * stored, edited, synced and aligned with chords exactly like lyrics the
 * user pastes. Section headers come from the sections the analysis
 * detected; without those, stanzas are split at long silences and named
 * from repetition like any other lyrics.
 */
import type { AnalysisSection, LyricsTranscription } from "../api";

/** "/api/audio/<id>" (the analysis's server playback copy) → "<id>". */
export function mediaIdOf(audioUrl: string | null | undefined): string | null {
  const m = /^\/api\/audio\/([A-Za-z0-9_-]+)$/.exec(audioUrl ?? "");
  return m ? m[1] : null;
}

function stamp(seconds: number): string {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

const HEADER: Record<string, string> = {
  intro: "Intro",
  verse: "Verse",
  chorus: "Chorus",
  bridge: "Bridge",
  solo: "Solo",
  inst: "Instrumental",
  break: "Instrumental",
  outro: "Outro",
};

/** Header for each detected section ("Verse 1", "Chorus 2", "Bridge"), numbering kinds that repeat. */
function sectionNames(sections: AnalysisSection[]): (string | null)[] {
  const kinds = sections.map((s) => HEADER[s.label.toLowerCase()] ?? null);
  const totals = new Map<string, number>();
  kinds.forEach((k) => k && totals.set(k, (totals.get(k) ?? 0) + 1));
  const seen = new Map<string, number>();
  return kinds.map((k) => {
    if (!k) return null;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return (totals.get(k) ?? 0) > 1 ? `${k} ${n}` : k;
  });
}

export function transcriptionToLrc(result: LyricsTranscription, sections: AnalysisSection[] = []): string {
  const usable = sections.filter((s) => s.end > s.start && HEADER[s.label.toLowerCase()]);
  const names = sectionNames(usable);
  const sectionOf = (t: number) => usable.findIndex((s) => t >= s.start && t < s.end);
  const out: string[] = [];
  if (result.language && result.language !== "auto") {
    out.push(`[la:${result.language}]`);
  }
  let lastKey: string | null = null;
  for (const line of result.lines) {
    const idx = usable.length >= 2 ? sectionOf(line.start) : -1;
    const key = idx >= 0 ? `s${idx}` : `t${line.stanza}`;
    if (key !== lastKey) {
      if (out.length && (!result.language || out.length > 1)) out.push("");
      if (idx >= 0 && names[idx]) out.push(`[${names[idx]}]`);
      lastKey = key;
    }
    const words = line.words.length
      ? line.words.map((w) => `<${stamp(w.start)}>${w.word.replace(/[<>[\]]/g, "")}`).join(" ")
      : line.text.replace(/[<>[\]]/g, "");
    out.push(`[${stamp(line.start)}]${words}`);
  }
  return out.join("\n");
}
