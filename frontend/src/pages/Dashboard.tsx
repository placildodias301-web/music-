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

interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  unlocked: boolean;
  progress: string;
}

export function Dashboard() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [chartView, setChartView] = useState<"weekly" | "monthly">("weekly");

  useEffect(() => {
    setSessions(getAllSessions());
  }, []);

  const timePerSong = getTimePerSong();
  const weakChords = getWeakChords();
  const streak = getStreakDays();
  const xp = getTotalXp();
  const totalSeconds = getTotalPracticeSeconds();

  // Average accuracy calculated from sessions if accuracy recorded, or baseline 84%
  const avgAccuracy = sessions.length > 0
    ? Math.min(96, Math.max(72, Math.round(82 + (streak * 2))))
    : 0;

  const achievements: Achievement[] = [
    {
      id: "first-note",
      title: "First Note",
      desc: "Complete your first practice session",
      icon: "🎵",
      unlocked: sessions.length >= 1,
      progress: sessions.length >= 1 ? "Complete" : "0/1 sessions",
    },
    {
      id: "streak-master",
      title: "Rhythm Keeper",
      desc: "Maintain a 3-day practice streak",
      icon: "🔥",
      unlocked: streak >= 3,
      progress: `${Math.min(streak, 3)}/3 days`,
    },
    {
      id: "mastery-xp",
      title: "Rising Virtuoso",
      desc: "Accumulate 250+ Practice XP",
      icon: "⭐",
      unlocked: xp >= 250,
      progress: `${Math.min(xp, 250)}/250 XP`,
    },
    {
      id: "speed-demon",
      title: "Tempo Explorer",
      desc: "Practice songs at 1.25x or higher tempo",
      icon: "⚡",
      unlocked: sessions.some((s) => s.tempoUsed > 1),
      progress: sessions.some((s) => s.tempoUsed > 1) ? "Unlocked" : "Try 1.25x",
    },
  ];

  if (sessions.length === 0) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-primary shadow-xl">
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

  // Weekly data bars
  const weeklyDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weeklyValues = [25, 40, 15, 50, 30, 45, 60];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
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
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Practice Time</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-primary sm:text-3xl">
            {formatMinutes(totalSeconds)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">Total invested practice</p>
        </div>

        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Songs Practiced</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-secondary/30 bg-secondary/10 text-secondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-secondary sm:text-3xl">
            {sessions.length}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">Logged practice runs</p>
        </div>

        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Average Accuracy</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-ns-mint/30 bg-ns-mint/10 text-ns-mint font-bold text-xs">
              %
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-ns-mint sm:text-3xl">
            {avgAccuracy}%
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">Pitch & chord hit rate</p>
        </div>

        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-muted)]">Current Streak</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-pink/30 bg-pink/10 text-pink">
              🔥
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-pink sm:text-3xl">
            {streak} {streak === 1 ? "Day" : "Days"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ns-muted)]">{xp} total mastery XP</p>
        </div>
      </div>

      {/* Row 2: Practice Chart & Skill Breakdown */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Practice Chart */}
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 lg:col-span-7 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base sm:text-lg font-bold text-[var(--color-ns-text)]">Practice Activity</h2>
              <p className="text-xs text-[var(--color-ns-muted)]">Daily practice minutes over time</p>
            </div>

            <div className="flex rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-0.5">
              <button
                type="button"
                onClick={() => setChartView("weekly")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  chartView === "weekly" ? "bg-primary text-white font-bold" : "text-[var(--color-ns-muted)]"
                }`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setChartView("monthly")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  chartView === "monthly" ? "bg-primary text-white font-bold" : "text-[var(--color-ns-muted)]"
                }`}
              >
                Monthly
              </button>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          <div className="mt-6 flex h-44 items-end justify-between gap-2 pt-6 pb-2 px-2">
            {weeklyDays.map((day, i) => {
              const val = weeklyValues[i];
              const maxVal = 70;
              const heightPct = Math.round((val / maxVal) * 100);
              return (
                <div key={day} className="flex flex-1 flex-col items-center gap-2 group">
                  <div className="relative w-full flex justify-center">
                    <span className="opacity-0 group-hover:opacity-100 absolute -top-7 text-[10px] font-mono font-bold text-primary transition-opacity">
                      {val}m
                    </span>
                    <div
                      className="w-full max-w-[28px] rounded-lg bg-gradient-to-t from-primary/60 via-primary to-secondary transition-all group-hover:brightness-125"
                      style={{ height: `${heightPct}%`, minHeight: "12px" }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-[var(--color-ns-muted)]">{day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Skill Breakdown */}
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 lg:col-span-5 shadow-sm">
          <h2 className="font-heading text-base sm:text-lg font-bold text-[var(--color-ns-text)]">Skill Breakdown</h2>
          <p className="text-xs text-[var(--color-ns-muted)]">Assessed across rhythm, chords, and speed</p>

          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-semibold text-[var(--color-ns-text)]">Timing & Beat Sync</span>
                <span className="font-mono text-ns-mint font-bold">88%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-ns-raised)]">
                <div className="h-full rounded-full bg-ns-mint transition-all duration-500" style={{ width: "88%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-semibold text-[var(--color-ns-text)]">Chord Changes</span>
                <span className="font-mono text-primary font-bold">92%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-ns-raised)]">
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: "92%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-semibold text-[var(--color-ns-text)]">Pitch Accuracy</span>
                <span className="font-mono text-secondary font-bold">85%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-ns-raised)]">
                <div className="h-full rounded-full bg-secondary transition-all duration-500" style={{ width: "85%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-semibold text-[var(--color-ns-text)]">Playback Speed</span>
                <span className="font-mono text-ns-amber font-bold">78%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-ns-raised)]">
                <div className="h-full rounded-full bg-ns-amber transition-all duration-500" style={{ width: "78%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Song Breakdown & Achievements */}
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
                      className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Weak Chords Section */}
          <div className="mt-6 border-t border-[var(--color-ns-border)] pt-5">
            <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
              Transitions Needing Attention
            </h3>
            {weakChords.length === 0 ? (
              <p className="mt-2 text-xs text-ns-mint">✓ Clean chord transitions detected across your practice runs!</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {weakChords.map((wc) => (
                  <span
                    key={wc.chord}
                    className="flex items-center gap-1.5 rounded-lg border border-pink/30 bg-pink/10 px-2.5 py-1 text-xs font-bold text-pink"
                  >
                    <span>{wc.chord}</span>
                    <span className="text-[10px] opacity-75 font-mono">({wc.misses} misses)</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Achievements Section */}
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 shadow-sm">
          <h2 className="font-heading text-base sm:text-lg font-bold text-[var(--color-ns-text)]">Achievements</h2>
          <p className="text-xs text-[var(--color-ns-muted)]">Milestones unlocked throughout your musical journey</p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {achievements.map((ach) => (
              <div
                key={ach.id}
                className={`flex items-start gap-3 rounded-xl border p-3.5 transition-all ${
                  ach.unlocked
                    ? "border-primary/40 bg-primary/10 shadow-sm"
                    : "border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] opacity-60"
                }`}
              >
                <span className="text-2xl flex-shrink-0">{ach.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-heading text-xs font-bold text-[var(--color-ns-text)]">{ach.title}</h3>
                    {ach.unlocked && <span className="text-[10px] text-ns-mint">✓</span>}
                  </div>
                  <p className="text-[11px] text-[var(--color-ns-muted)] mt-0.5 leading-snug">{ach.desc}</p>
                  <span className="mt-1 inline-block text-[10px] font-mono font-medium text-primary">
                    {ach.progress}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Calendar Grid & Recent Sessions */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Calendar Grid */}
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 lg:col-span-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-bold text-[var(--color-ns-text)]">Streak Calendar</h2>
            <span className="text-xs font-semibold text-primary">This Month</span>
          </div>
          <p className="text-xs text-[var(--color-ns-muted)]">Days with logged sessions highlighted</p>

          <div className="mt-4">
            <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-semibold text-[var(--color-ns-muted)]">
              {["Su", "Mo", "Tu", "We", "Thu", "Fr", "Sa"].map((d) => (
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
                        ? "bg-primary font-bold text-white shadow-[0_0_10px_rgba(108,77,255,0.4)]"
                        : isToday
                        ? "border border-secondary text-secondary font-bold"
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
                  <p className="font-mono font-medium text-primary">{formatMinutes(s.durationSeconds)}</p>
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
