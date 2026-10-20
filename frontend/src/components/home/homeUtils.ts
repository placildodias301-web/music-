/**
 * Formatting helpers for the Home dashboard. Pure functions over data the
 * app already has (saved analyses, practice log) — nothing here invents values.
 */
import type { AnalysisResult } from "../../lib/api";
import type { PracticeSession } from "../../lib/practiceLog";

export function formatMinutes(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 1) return totalSeconds > 0 ? "< 1 min" : "0 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "C Major" → "C", "A Minor" → "Am" — used as the track's cover art. */
export function keyShort(analysis: AnalysisResult): string {
  const root = analysis.key.split(" ")[0] ?? "?";
  return analysis.mode === "minor" ? `${root}m` : root;
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

/** "song.mp3" → "MP3"; null when there is no extension. */
export function fileTypeLabel(fileName: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match ? match[1].toUpperCase() : null;
}

/** First N distinct chords in the order they occur in the song. */
export function topChords(analysis: AnalysisResult, limit = 4): string[] {
  return Array.from(new Set(analysis.chordProgression)).slice(0, limit);
}

/**
 * Deterministic bar heights (percent) for the decorative waveform motif.
 * Seeded by a string so a given track always gets the same silhouette.
 * Purely visual — it is not presented as measured audio data.
 */
export function waveHeights(seed: string, count: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const noise = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    const envelope = 0.4 + 0.6 * Math.sin((Math.PI * (i + 0.5)) / count);
    out.push(Math.round(14 + 86 * envelope * (0.35 + 0.65 * noise)));
  }
  return out;
}

export interface DayStat {
  label: string;
  seconds: number;
  isToday: boolean;
  isFuture: boolean;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Practice seconds for each day of the current calendar week (Mon → Sun, local time). */
export function currentWeek(sessions: PracticeSession[], now = new Date()): DayStat[] {
  const todayIndex = (now.getDay() + 6) % 7; // Monday = 0
  const totals = new Map<string, number>();
  for (const s of sessions) {
    const key = localDayKey(new Date(s.startedAt));
    totals.set(key, (totals.get(key) ?? 0) + s.durationSeconds);
  }
  return WEEKDAYS.map((label, i) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIndex + i);
    return {
      label,
      seconds: totals.get(localDayKey(day)) ?? 0,
      isToday: i === todayIndex,
      isFuture: i > todayIndex,
    };
  });
}
