import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAllSessions,
  getTimePerSong,
  getWeakChords,
  getStreakDays,
  getTotalXp,
  getTotalPracticeSeconds,
  type PracticeSession,
} from "../lib/practiceLog";

function formatMinutes(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 1) return "< 1 min";
  return `${minutes} min`;
}

export function Dashboard() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);

  useEffect(() => {
    setSessions(getAllSessions());
  }, []);

  const timePerSong = getTimePerSong();
  const weakChords = getWeakChords();
  const streak = getStreakDays();
  const xp = getTotalXp();
  const totalSeconds = getTotalPracticeSeconds();

  if (sessions.length === 0) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-[var(--color-ns-amber)] shadow-xl">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <h1 className="mt-6 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-3xl">
          No Practice Sessions Yet
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ns-muted)]">
          Launch Practice Mode with any song — every session is logged automatically right in your browser, recording your practice time, tempo evolution, and chords that need more repetition.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Link to="/upload" className="btn-primary">
            Upload & Practice Track
          </Link>
          <Link to="/studio" className="btn-secondary">
            Return to Studio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-amber)]">
          Musician Performance & Analytics
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-4xl">
          Practice Progress & Analytics
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-[var(--color-ns-muted)]">
          Real session metrics logged directly on your device — monitoring tempo progression, practice consistency, and transition weak spots.
        </p>
      </div>

      {/* 4 Core Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Total Practice Time</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--color-ns-amber)]/30 bg-[var(--color-ns-amber)]/10 text-[var(--color-ns-amber)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-amber)] sm:text-3xl">
            {formatMinutes(totalSeconds)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">Total invested practice</p>
        </div>

        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Sessions Completed</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--color-ns-blue)]/30 bg-[var(--color-ns-blue)]/10 text-[var(--color-ns-blue)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-blue)] sm:text-3xl">
            {sessions.length}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">Logged practice runs</p>
        </div>

        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Practice Streak</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--color-ns-coral)]/30 bg-[var(--color-ns-coral)]/10 text-[var(--color-ns-coral)]">
              🔥
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-coral)] sm:text-3xl">
            {streak} {streak === 1 ? "Day" : "Days"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">Consecutive active days</p>
        </div>

        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Mastery XP</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--color-ns-mint)]/30 bg-[var(--color-ns-mint)]/10 text-[var(--color-ns-mint)]">
              ★
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-mint)] sm:text-3xl">
            {xp} <span className="text-xs font-normal text-[var(--color-ns-muted)]">pts</span>
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">Tier progression</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Time Practiced Per Song */}
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 shadow-sm">
          <h2 className="font-heading text-base sm:text-lg font-bold text-[var(--color-ns-text)]">Practice Time by Track</h2>
          <p className="text-xs text-[var(--color-ns-muted)]">Distribution of practice hours across your repertoire</p>
          
          <div className="mt-5 space-y-4">
            {timePerSong.map((row) => {
              const maxSeconds = timePerSong[0]?.totalSeconds || 1;
              const pct = Math.max(6, Math.round((row.totalSeconds / maxSeconds) * 100));
              return (
                <div key={row.songName}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="truncate font-medium text-[var(--color-ns-text)]">{row.songName}</span>
                    <span className="font-mono text-[var(--color-ns-muted)]">{formatMinutes(row.totalSeconds)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-ns-raised)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--color-ns-amber)] to-[var(--color-ns-coral)] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chords Still Weak */}
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 shadow-sm">
          <h2 className="font-heading text-base sm:text-lg font-bold text-[var(--color-ns-text)]">Transitions Needing Attention</h2>
          <p className="text-xs text-[var(--color-ns-muted)]">
            Captured from pitch misses during microphone-tracked practice runs
          </p>

          {weakChords.length === 0 ? (
            <div className="mt-8 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-6 text-center">
              <span className="text-2xl">🎯</span>
              <p className="mt-2 text-sm font-semibold text-[var(--color-ns-text)]">No weak chords detected!</p>
              <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
                Keep practicing with microphone tracking active to capture chord transitions.
              </p>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap gap-2.5">
              {weakChords.map((wc) => (
                <span
                  key={wc.chord}
                  className="flex items-center gap-2 rounded-xl border border-[var(--color-ns-amber)]/35 bg-[var(--color-ns-amber)]/10 px-3.5 py-2 text-xs font-bold text-[var(--color-ns-amber)]"
                >
                  <span className="font-heading text-sm">{wc.chord}</span>
                  <span className="rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-ns-amber)]">
                    {wc.misses} misses
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Practice Calendar & Recent Sessions */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Calendar Grid */}
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 lg:col-span-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-bold text-[var(--color-ns-text)]">Streak Calendar</h2>
            <span className="text-xs font-semibold text-[var(--color-ns-amber)]">This Month</span>
          </div>
          <p className="text-xs text-[var(--color-ns-muted)]">Days with logged sessions highlighted</p>

          <div className="mt-4">
            <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-semibold text-[var(--color-ns-muted)]">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1 text-center font-mono text-xs">
              {Array.from({ length: 31 }, (_, i) => {
                const dayNum = i + 1;
                const hasSession = sessions.some((s) => {
                  const date = new Date(s.startedAt);
                  return date.getDate() === dayNum;
                });
                const isToday = new Date().getDate() === dayNum;
                return (
                  <div
                    key={dayNum}
                    className={`flex h-8 w-full items-center justify-center rounded-lg transition-all ${
                      hasSession
                        ? "bg-[var(--color-ns-amber)] font-bold text-[var(--color-ns-ink)] shadow-[0_0_10px_rgba(244,184,74,0.4)]"
                        : isToday
                        ? "border border-[var(--color-ns-coral)] text-[var(--color-ns-coral)] font-bold"
                        : "text-[var(--color-ns-muted)] hover:bg-white/5"
                    }`}
                  >
                    {dayNum}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Sessions List */}
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 lg:col-span-7 shadow-sm">
          <h2 className="font-heading text-base font-bold text-[var(--color-ns-text)]">Recent Sessions</h2>
          <p className="text-xs text-[var(--color-ns-muted)]">Session logs saved on this device</p>
          
          <div className="mt-4 divide-y divide-[var(--color-ns-border)]">
            {sessions.slice(0, 7).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-3 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--color-ns-text)]">{s.songName}</p>
                  <p className="text-[11px] text-[var(--color-ns-muted)]">
                    {s.chordsPracticed?.slice(0, 5).join(", ")}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono font-medium text-[var(--color-ns-amber)]">{formatMinutes(s.durationSeconds)}</p>
                  <p className="text-[11px] text-[var(--color-ns-muted)]">
                    {s.tempoUsed}x · {new Date(s.startedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

