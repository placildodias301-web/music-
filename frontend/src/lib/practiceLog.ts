/**
 * Practice session logging + analytics — Section 4.5/4.6 of the spec.
 *
 * This MVP is intentionally DB-free (see MVP_DEMO_README.md), so instead
 * of a `practice_sessions` Postgres table, sessions are logged to the
 * browser's localStorage. This is a real, working, persisted log — it
 * survives reloads and powers a genuine dashboard — it's just scoped to
 * one browser instead of a server-side account. Swapping this for a real
 * `practice_sessions` table later is a drop-in change behind the same
 * functions below.
 */

const STORAGE_KEY = "wilsify_practice_sessions_v1";

export interface PracticeSession {
  id: string;
  songName: string;
  startedAt: string; // ISO timestamp
  durationSeconds: number;
  tempoUsed: number;
  chordsPracticed: string[];
  /** Chord -> number of low-accuracy attempts recorded during this session. */
  weakChordCounts: Record<string, number>;
}

function readAll(): PracticeSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PracticeSession[];
  } catch {
    return [];
  }
}

function writeAll(sessions: PracticeSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage unavailable (private mode, quota) — fail silently, non-critical
  }
}

export function logPracticeSession(session: Omit<PracticeSession, "id" | "startedAt">) {
  const sessions = readAll();
  sessions.push({
    ...session,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
  });
  writeAll(sessions);
}

export function getAllSessions(): PracticeSession[] {
  return readAll().sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function getTimePerSong(): { songName: string; totalSeconds: number }[] {
  const sessions = readAll();
  const totals = new Map<string, number>();
  for (const s of sessions) {
    totals.set(s.songName, (totals.get(s.songName) ?? 0) + s.durationSeconds);
  }
  return Array.from(totals.entries())
    .map(([songName, totalSeconds]) => ({ songName, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

export function getWeakChords(limit = 8): { chord: string; misses: number }[] {
  const sessions = readAll();
  const totals = new Map<string, number>();
  for (const s of sessions) {
    for (const [chord, count] of Object.entries(s.weakChordCounts ?? {})) {
      totals.set(chord, (totals.get(chord) ?? 0) + count);
    }
  }
  return Array.from(totals.entries())
    .map(([chord, misses]) => ({ chord, misses }))
    .filter((c) => c.misses > 0)
    .sort((a, b) => b.misses - a.misses)
    .slice(0, limit);
}

/** Real streak calculation: consecutive calendar days (up to today) with at least one session. */
export function getStreakDays(): number {
  const sessions = readAll();
  if (!sessions.length) return 0;

  const practiceDays = new Set(
    sessions.map((s) => new Date(s.startedAt).toISOString().slice(0, 10))
  );

  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (practiceDays.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/** XP = 10 per minute practiced, real and reproducible from the log — not random. */
export function getTotalXp(): number {
  const sessions = readAll();
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationSeconds / 60, 0);
  return Math.round(totalMinutes * 10);
}

export function getTotalPracticeSeconds(): number {
  return readAll().reduce((sum, s) => sum + s.durationSeconds, 0);
}
