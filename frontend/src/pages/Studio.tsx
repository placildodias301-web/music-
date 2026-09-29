import { Link } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import { getAllSessions, getStreakDays, getTotalXp, getTotalPracticeSeconds } from "../lib/practiceLog";
import { getLibrary } from "../lib/library";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMinutes(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 1) return "< 1 min";
  return `${minutes} min`;
}

function getWeekSeconds(): { label: string; fullDate: string; seconds: number; isToday: boolean }[] {
  const sessions = getAllSessions();
  const today = new Date();
  const days: { label: string; fullDate: string; seconds: number; isToday: boolean }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const seconds = sessions
      .filter((s) => s.startedAt.slice(0, 10) === key)
      .reduce((sum, s) => sum + s.durationSeconds, 0);
    days.push({
      label: WEEKDAY_LABELS[d.getDay()],
      fullDate: key,
      seconds,
      isToday: i === 0,
    });
  }
  return days;
}

export function Studio() {
  const { analysis, fileName } = useMvp();
  const week = getWeekSeconds();
  const maxSeconds = Math.max(...week.map((d) => d.seconds), 60);
  const library = getLibrary().slice(0, 3);
  const totalSeconds = getTotalPracticeSeconds();
  const streak = getStreakDays();
  const xp = getTotalXp();
  const totalLibrary = getLibrary().length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* 4 Top Metric Cards (Figma Desktop Screen 4 & Mobile Row 4) */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="glass-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-dim">Total Practice</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary-light">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-content sm:text-3xl">
            {formatMinutes(totalSeconds)}
          </p>
          <p className="mt-1 text-xs text-content-muted">Local audio sessions</p>
        </div>

        <div className="glass-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-dim">Saved Tracks</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan/15 text-cyan">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
                <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2" />
              </svg>
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-cyan sm:text-3xl">
            {totalLibrary}
          </p>
          <p className="mt-1 text-xs text-content-muted">In your Library</p>
        </div>

        <div className="glass-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-dim">Day Streak</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink/15 text-pink">
              🔥
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-pink sm:text-3xl">
            {streak} {streak === 1 ? "Day" : "Days"}
          </p>
          <p className="mt-1 text-xs text-content-muted">Keep practicing daily</p>
        </div>

        <div className="glass-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-dim">Practice XP</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green/15 text-green">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" />
              </svg>
            </span>
          </div>
          <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-green sm:text-3xl">
            {xp} <span className="text-xs font-normal text-content-dim">pts</span>
          </p>
          <p className="mt-1 text-xs text-content-muted">Level: Intermediate</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Hero Card: Start / Continue Analysis */}
        <div className="glass-card relative flex flex-col justify-between overflow-hidden p-6 sm:p-7 lg:col-span-7">
          <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
          
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-light">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-light animate-pulse" />
                Real Audio DSP Engine
              </span>
            </div>

            {analysis ? (
              <>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-content-dim">Active Project</p>
                <h2 className="mt-1 font-heading text-xl font-bold text-content sm:text-2xl">
                  {fileName ?? analysis.fileName}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-lg border border-glass bg-white/[0.04] px-2.5 py-1 font-mono font-semibold text-primary-light">
                    Key: {analysis.key}
                  </span>
                  <span className="rounded-lg border border-glass bg-white/[0.04] px-2.5 py-1 font-mono font-semibold text-cyan">
                    {analysis.bpm} BPM
                  </span>
                  <span className="rounded-lg border border-glass bg-white/[0.04] px-2.5 py-1 text-content-muted">
                    {analysis.difficulty?.difficultyLabel ?? "Beginner"}
                  </span>
                  <span className="rounded-lg border border-glass bg-white/[0.04] px-2.5 py-1 text-content-dim">
                    {analysis.chordProgression.length} chord transitions
                  </span>
                </div>
              </>
            ) : (
              <>
                <h2 className="mt-4 font-heading text-xl font-bold leading-snug text-content sm:text-2xl">
                  Analyze any audio or video with genuine signal processing
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-content-muted">
                  Detect key, BPM, chords, and time signature in seconds using real MIR algorithms, then practice with live pitch feedback.
                </p>
              </>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {analysis ? (
              <>
                <Link to="/analysis" className="btn-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M4 18v-4m5 4V8m5 10v-7m5 7V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  View Analysis
                </Link>
                <Link to="/practice" className="btn-secondary">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6 4 19 12 6 20 6 4" />
                  </svg>
                  Practice Track
                </Link>
                <Link to="/upload" className="btn-ghost">
                  Upload Another
                </Link>
              </>
            ) : (
              <>
                <Link to="/upload" className="btn-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Upload a Song
                </Link>
                <Link to="/upload" className="btn-secondary">
                  Try Sample Track
                </Link>
              </>
            )}
          </div>
        </div>

        {/* This Week Practice Activity Bar Chart */}
        <div className="glass-card flex flex-col justify-between p-6 sm:p-7 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base font-bold text-content">Weekly Activity</h2>
              <p className="text-xs text-content-dim">Practice time per day</p>
            </div>
            <Link to="/dashboard" className="text-xs font-semibold text-primary-light hover:underline">
              Analytics →
            </Link>
          </div>

          <div className="mt-6 flex h-36 items-end justify-between gap-2 sm:gap-3">
            {week.map((day, i) => {
              const pct = Math.max(8, Math.round((day.seconds / maxSeconds) * 100));
              return (
                <div key={i} className="group relative flex flex-1 flex-col items-center gap-2">
                  {/* Tooltip on hover */}
                  <div className="pointer-events-none absolute -top-8 hidden rounded bg-bg px-2 py-1 text-[10px] font-mono text-white shadow-lg border border-glass group-hover:block z-10 whitespace-nowrap">
                    {formatMinutes(day.seconds)}
                  </div>
                  <div className="flex h-28 w-full items-end justify-center">
                    <div
                      className={`w-full max-w-[28px] rounded-t-md transition-all duration-300 ${
                        day.isToday
                          ? "bg-gradient-to-t from-primary-dark to-primary shadow-[0_0_12px_rgba(124,92,255,0.5)]"
                          : day.seconds > 0
                          ? "bg-white/20 hover:bg-white/30"
                          : "bg-white/[0.05]"
                      }`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-medium ${
                      day.isToday ? "font-bold text-primary-light" : "text-content-dim"
                    }`}
                  >
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Library Items */}
      <div className="glass-card mt-6 p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-base font-bold text-content">Recent Library Songs</h2>
            <p className="text-xs text-content-dim">Reopen your saved chords, stems and sheets</p>
          </div>
          <Link to="/library" className="text-xs font-semibold text-primary-light hover:underline">
            View All ({totalLibrary}) →
          </Link>
        </div>

        {library.length === 0 ? (
          <div className="rounded-xl border border-glass/80 bg-white/[0.02] p-8 text-center">
            <p className="text-sm text-content-muted">
              No saved tracks yet. Analyze a song and click <span className="font-medium text-white">"Save to Library"</span> to keep its chords and practice data accessible anytime.
            </p>
            <Link to="/upload" className="btn-primary mt-4 text-xs">
              Upload Your First Song
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {library.map((item) => (
              <div
                key={item.id}
                className="glass-card-hover group rounded-xl border border-glass bg-white/[0.02] p-4 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-content">{item.fileName}</p>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary-light">
                    {item.analysis.key}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-content-dim">
                  <span className="font-mono">{item.analysis.bpm} BPM</span>
                  <span>·</span>
                  <span>{item.analysis.chordProgression.slice(0, 4).join(" - ")}...</span>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-glass/60 pt-3">
                  <Link
                    to="/analysis"
                    className="text-xs font-semibold text-primary-light hover:underline"
                  >
                    Open Analysis
                  </Link>
                  <span className="text-content-dim">·</span>
                  <Link
                    to="/practice"
                    className="text-xs font-medium text-content-muted hover:text-content"
                  >
                    Practice
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Launchpad to Tools */}
      <div className="mt-6">
        <h2 className="mb-3 font-heading text-sm font-semibold uppercase tracking-wider text-content-dim">
          Toolkit & Practice Suites
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link
            to="/tuner"
            className="glass-card glass-card-hover flex flex-col items-center gap-2.5 p-4 text-center sm:p-5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pink/15 text-pink shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
                <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-content">Tuner</p>
              <p className="text-[11px] text-content-dim">Microphone pitch meter</p>
            </div>
          </Link>

          <Link
            to="/practice"
            className="glass-card glass-card-hover flex flex-col items-center gap-2.5 p-4 text-center sm:p-5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange/15 text-orange shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 4 19 12 6 20 6 4" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-content">Practice Mode</p>
              <p className="text-[11px] text-content-dim">Slowdown & metronome</p>
            </div>
          </Link>

          <Link
            to="/chords"
            className="glass-card glass-card-hover flex flex-col items-center gap-2.5 p-4 text-center sm:p-5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary-light shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
                <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-content">Chord Shapes</p>
              <p className="text-[11px] text-content-dim">Guitar, uke & piano</p>
            </div>
          </Link>

          <Link
            to="/assistant"
            className="glass-card glass-card-hover flex flex-col items-center gap-2.5 p-4 text-center sm:p-5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan/15 text-cyan shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="1.8" />
                <path d="M6 10v2a6 6 0 0 0 12 0v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M12 18v4m-4 0h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-content">AI Assistant</p>
              <p className="text-[11px] text-content-dim">Theory Q&A tutor</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

