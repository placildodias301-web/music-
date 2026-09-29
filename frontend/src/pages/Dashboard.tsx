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
      <div className="mx-auto flex min-h-[calc(100vh-73px)] max-w-lg flex-col justify-center px-5 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-content">No practice sessions yet</h1>
        <p className="mt-3 text-content-muted">
          Practice a song in Practice Mode — every session you complete is logged here
          automatically (time practiced, tempo used, and chords you struggled with).
        </p>
        <Link to="/upload" className="btn-primary mt-6 inline-flex self-center">
          Go to Upload
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      <div className="mb-6 sm:mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-light">
          Practice & Performance Metrics
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-content sm:text-4xl">
          Practice Analytics
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          Session logs recorded directly in your browser — tracks tempo evolution, time invested, and chords that need more repetition.
        </p>
      </div>

      {/* 4 Core Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-dim">Total Time</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary-light">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-primary-light sm:text-3xl">
            {formatMinutes(totalSeconds)}
          </p>
          <p className="mt-1 text-xs text-content-muted">Overall practice investment</p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-dim">Completed Sessions</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan/15 text-cyan">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-cyan sm:text-3xl">
            {sessions.length}
          </p>
          <p className="mt-1 text-xs text-content-muted">Track runs logged</p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-dim">Current Streak</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink/15 text-pink">
              🔥
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-pink sm:text-3xl">
            {streak} {streak === 1 ? "Day" : "Days"}
          </p>
          <p className="mt-1 text-xs text-content-muted">Consistent practice</p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-dim">Mastery XP</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green/15 text-green">
              ★
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-green sm:text-3xl">
            {xp} <span className="text-xs font-normal text-content-dim">pts</span>
          </p>
          <p className="mt-1 text-xs text-content-muted">Intermediate Tier</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Time Practiced Per Song */}
        <div className="glass-card p-6 sm:p-7">
          <h2 className="font-heading text-base font-bold text-content">Time Practiced Per Song</h2>
          <p className="text-xs text-content-dim">Relative practice split across library tracks</p>
          
          <div className="mt-5 space-y-4">
            {timePerSong.map((row) => {
              const maxSeconds = timePerSong[0]?.totalSeconds || 1;
              const pct = Math.max(6, Math.round((row.totalSeconds / maxSeconds) * 100));
              return (
                <div key={row.songName}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="truncate font-medium text-content">{row.songName}</span>
                    <span className="font-mono text-content-dim">{formatMinutes(row.totalSeconds)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-primary-light to-cyan transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chords Still Weak */}
        <div className="glass-card p-6 sm:p-7">
          <h2 className="font-heading text-base font-bold text-content">Chords Needing Attention</h2>
          <p className="text-xs text-content-dim">
            Detected from micro-pauses and pitch inaccuracy during Practice Mode
          </p>

          {weakChords.length === 0 ? (
            <div className="mt-8 rounded-xl border border-glass bg-white/[0.02] p-6 text-center">
              <span className="text-2xl">🎯</span>
              <p className="mt-2 text-sm font-semibold text-content">No weak chords detected!</p>
              <p className="mt-1 text-xs text-content-dim">
                Keep playing with mic tracking active to capture chord transitions.
              </p>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap gap-2.5">
              {weakChords.map((wc) => (
                <span
                  key={wc.chord}
                  className="flex items-center gap-2 rounded-xl border border-orange/35 bg-orange/10 px-3.5 py-2 text-xs font-bold text-orange"
                >
                  <span className="font-heading text-sm">{wc.chord}</span>
                  <span className="rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[10px] font-medium text-orange/80">
                    {wc.misses} misses
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Practice Calendar & Recent Sessions (Figma Mobile Row 4 Screen 6) */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Calendar Grid */}
        <div className="glass-card p-6 sm:p-7 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-bold text-content">Streak Calendar</h2>
            <span className="text-xs font-semibold text-primary-light">Current Month</span>
          </div>
          <p className="text-xs text-content-dim">Days with logged sessions highlighted</p>

          <div className="mt-4">
            <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-semibold text-content-dim">
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
                        ? "bg-primary font-bold text-white shadow-[0_0_8px_rgba(124,92,255,0.4)]"
                        : isToday
                        ? "border border-primary-light text-primary-light font-bold"
                        : "text-content-dim hover:bg-white/5"
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
        <div className="glass-card p-6 sm:p-7 lg:col-span-7">
          <h2 className="font-heading text-base font-bold text-content">Recent Sessions</h2>
          <p className="text-xs text-content-dim">Session history recorded on this device</p>
          
          <div className="mt-4 divide-y divide-glass">
            {sessions.slice(0, 7).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-3 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-content">{s.songName}</p>
                  <p className="text-[11px] text-content-dim">
                    {s.chordsPracticed?.slice(0, 5).join(", ")}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono font-medium text-primary-light">{formatMinutes(s.durationSeconds)}</p>
                  <p className="text-[11px] text-content-dim">
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
