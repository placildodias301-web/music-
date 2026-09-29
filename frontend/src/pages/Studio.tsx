import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";
import type { AnalysisResult } from "../lib/api";
import { getAllSessions, getStreakDays, getTotalXp, getTotalPracticeSeconds } from "../lib/practiceLog";
import { getLibrary, type SavedAnalysis } from "../lib/library";
import { firstNameOf, loadPrefs } from "../lib/account";
import { EmptyState, SectionHeader } from "../components/ui";
import type { UploadLocationState } from "./Upload";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TINTS = ["tint-violet", "tint-cyan", "tint-green", "tint-pink", "tint-orange"] as const;
const ART_GRADIENTS = [
  "from-[#7c5cff] to-[#3b2a91]",
  "from-[#2bb6cc] to-[#16406b]",
  "from-[#2fb987] to-[#12503f]",
  "from-[#e2588a] to-[#5c1f45]",
  "from-[#e89a3a] to-[#6a3b12]",
];

/** Heights for the decorative equaliser in the drop zone (percent). */
const EQ_BARS = [30, 52, 40, 70, 48, 86, 62, 95, 72, 58, 80, 44, 66, 90, 54, 76, 38, 60, 84, 50, 68, 42, 74, 56, 34, 62, 46, 28];

function formatMinutes(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 1) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso: string): string {
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
function keyShort(analysis: AnalysisResult): string {
  const root = analysis.key.split(" ")[0] ?? "?";
  return analysis.mode === "minor" ? `${root}m` : root;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function getWeekSeconds(): { label: string; seconds: number; isToday: boolean }[] {
  const sessions = getAllSessions();
  const today = new Date();
  const days: { label: string; seconds: number; isToday: boolean }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const seconds = sessions
      .filter((s) => s.startedAt.slice(0, 10) === key)
      .reduce((sum, s) => sum + s.durationSeconds, 0);
    days.push({ label: WEEKDAY_LABELS[d.getDay()], seconds, isToday: i === 0 });
  }
  return days;
}

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

const TOOLS: { to: string; name: string; desc: string; tint: string; icon: ReactNode }[] = [
  {
    to: "/practice",
    name: "Practice mode",
    desc: "Slow down, loop, metronome",
    tint: "tint-violet",
    icon: <polygon points="7 4.5 19 12 7 19.5 7 4.5" fill="currentColor" />,
  },
  {
    to: "/tuner",
    name: "Tuner",
    desc: "Live chromatic pitch",
    tint: "tint-cyan",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  {
    to: "/chords",
    name: "Chord shapes",
    desc: "Guitar, ukulele, piano",
    tint: "tint-green",
    icon: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.9" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.9" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.9" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.9" />
      </>
    ),
  },
  {
    to: "/assistant",
    name: "AI assistant",
    desc: "Theory Q&A, rule-based",
    tint: "tint-pink",
    icon: <path d="M12 3.5 13.8 9l5.7 1.5-5.7 1.6L12 17.5l-1.8-5.4-5.7-1.6L10.2 9 12 3.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />,
  },
];

export function Studio() {
  const navigate = useNavigate();
  const { analysis, fileName, setSong, setAnalysis } = useMvp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");

  // All local reads — computed once per mount.
  const data = useMemo(() => {
    const library = getLibrary();
    const week = getWeekSeconds();
    return {
      name: firstNameOf(loadPrefs().name),
      library,
      recent: library.slice(0, 4),
      week,
      weekTotal: week.reduce((sum, d) => sum + d.seconds, 0),
      maxSeconds: Math.max(...week.map((d) => d.seconds), 60),
      totalSeconds: getTotalPracticeSeconds(),
      streak: getStreakDays(),
      xp: getTotalXp(),
    };
  }, []);

  function handOff(state: UploadLocationState) {
    navigate("/upload", { state });
  }

  function openSaved(item: SavedAnalysis, to: "/analysis" | "/practice" = "/analysis") {
    // Same flow as Library: saved analyses have no audio file (localStorage
    // can't hold it) — chart, chords and export still work from saved data.
    setSong({ fileName: item.fileName, fileSizeBytes: 0, audioUrl: null, isSampleAudio: false });
    setAnalysis(item.analysis);
    navigate(to);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/library?q=${encodeURIComponent(trimmed)}` : "/library");
  }

  const uniqueChords = analysis ? Array.from(new Set(analysis.chordProgression)).slice(0, 6) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-8">
      {/* Greeting */}
      <div className="animate-slide-up mb-6 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-content-muted">
            {greeting()}, {data.name}
          </p>
          <h1 className="mt-1 font-heading text-[28px] font-bold leading-tight text-content sm:text-4xl">
            What are we{" "}
            <span className="bg-gradient-to-r from-primary-light via-violet-soft to-cyan bg-clip-text text-transparent">
              hearing
            </span>{" "}
            today?
          </h1>
        </div>
        {data.streak > 0 && (
          <span className="chip tint-orange self-start lg:self-auto">
            <Svg size={13}>
              <path
                d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.7 1.2 2.7 2 3-.5-3 .3-6 1-8.5Z"
                fill="currentColor"
              />
            </Svg>
            {data.streak}-day practice streak
          </span>
        )}
      </div>

      {/* Mobile/tablet search — desktop uses the header search */}
      <form onSubmit={handleSearch} role="search" className="mb-5 lg:hidden">
        <label className="flex items-center gap-2.5 rounded-xl border border-glass-strong bg-bg-raised px-3.5 py-3 transition-colors focus-within:border-primary/60">
          <Svg size={16}>
            <circle cx="11" cy="11" r="7" stroke="#8b93ad" strokeWidth="2" />
            <path d="m20 20-3-3" stroke="#8b93ad" strokeWidth="2" strokeLinecap="round" />
          </Svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search your saved tracks"
            placeholder="Search saved tracks, keys, chords…"
            className="w-full bg-transparent text-sm text-content placeholder:text-content-dim focus:outline-none focus-visible:shadow-none"
          />
        </label>
      </form>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Hero: drop a song to analyse */}
        <section aria-label="Analyze a song" className="hero-card animate-slide-up p-4 sm:p-5 lg:col-span-7">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handOff({ file });
            }}
          />
          <div
            // Mouse/drag target; keyboard users use the "Choose a file" button inside.
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handOff({ file });
            }}
            className={`group flex h-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-5 py-8 text-center transition-all sm:py-10 ${
              dragging
                ? "border-primary-light bg-primary/15"
                : "border-[#3b4460] bg-bg/30 hover:border-primary/60 hover:bg-primary/[0.06]"
            }`}
          >
            <div className="flex h-20 items-end gap-[3px]" aria-hidden="true">
              {EQ_BARS.map((h, i) => (
                <span
                  key={i}
                  className="eq-bar bg-gradient-to-t from-primary via-violet-soft to-cyan"
                  style={{ height: `${h}%`, animationDelay: `${(i % 7) * -0.23}s`, opacity: 0.55 + (h / 100) * 0.45 }}
                />
              ))}
            </div>
            <p className="mt-5 font-heading text-xl font-bold text-content sm:text-2xl">
              {dragging ? "Release to analyse" : "Drop a song to analyse"}
            </p>
            <p className="mt-1.5 max-w-sm text-sm text-content-muted">
              Any audio or video file — we detect the key, tempo, time signature and chords.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="btn-primary px-5 py-2.5 text-sm"
              >
                <Svg size={16}>
                  <path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                Choose a file
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handOff({ sample: true });
                }}
                className="btn-secondary px-4 py-2.5 text-sm"
              >
                Try a sample track
              </button>
            </div>
            <span className="chip tint-cyan mt-5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_8px_#67e8f9]" />
              Real signal analysis · not demo data
            </span>
          </div>
        </section>

        {/* Right column: current track + this week */}
        <div className="flex flex-col gap-5 lg:col-span-5">
          {analysis && (
            <section aria-label="Current track" className="glass-card animate-slide-up p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-content-dim">Current track</p>
                <span className="chip tint-green">
                  <span className="h-1.5 w-1.5 rounded-full bg-green" />
                  Analysed
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3.5">
                <span
                  className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ART_GRADIENTS[0]} font-heading text-lg font-bold text-white shadow-[0_8px_24px_-8px_rgba(124,92,255,0.8)]`}
                  aria-hidden="true"
                >
                  {keyShort(analysis)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-heading text-base font-bold text-content" title={fileName ?? analysis.fileName}>
                    {stripExtension(fileName ?? analysis.fileName)}
                  </p>
                  <p className="mt-0.5 text-xs text-content-muted">
                    {analysis.key} · {analysis.bpm} BPM · {analysis.timeSignature}
                    {analysis.difficulty?.difficultyLabel ? ` · ${analysis.difficulty.difficultyLabel}` : ""}
                  </p>
                </div>
              </div>
              {uniqueChords.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {uniqueChords.map((chord) => (
                    <span
                      key={chord}
                      className="rounded-lg border border-glass-strong bg-bg-raised px-2.5 py-1 font-mono text-xs font-medium text-content-light"
                    >
                      {chord}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link to="/analysis" className="btn-primary px-3 py-2 text-[13px]">
                  View analysis
                </Link>
                <Link to="/practice" className="btn-secondary px-3 py-2 text-[13px]">
                  Practice
                </Link>
              </div>
            </section>
          )}

          <section aria-label="This week" className="glass-card animate-slide-up flex flex-1 flex-col p-5">
            <SectionHeader
              title="This week"
              subtitle={`${formatMinutes(data.weekTotal)} practised`}
              action={
                <Link to="/dashboard" className="link-accent">
                  Progress
                </Link>
              }
            />
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Total", value: formatMinutes(data.totalSeconds), tone: "text-content" },
                { label: "Streak", value: `${data.streak}d`, tone: "text-orange" },
                { label: "XP", value: String(data.xp), tone: "text-green" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-glass bg-bg-raised/70 px-3 py-2.5">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-content-dim">{stat.label}</p>
                  <p className={`mt-0.5 font-heading text-lg font-bold ${stat.tone}`}>{stat.value}</p>
                </div>
              ))}
            </div>
            {data.weekTotal === 0 && (
              <p className="mt-5 text-center text-xs text-content-dim">
                No practice logged this week.{" "}
                <Link to="/practice" className="font-semibold text-violet-soft hover:text-primary-light">
                  Start a session
                </Link>
              </p>
            )}
            <div className="mt-5 flex min-h-[110px] flex-1 items-end justify-between gap-2" role="img" aria-label={`Practice minutes per day this week: ${data.week.map((d) => `${d.label} ${Math.round(d.seconds / 60)}`).join(", ")}`}>
              {data.week.map((day, i) => {
                const pct = Math.max(6, Math.round((day.seconds / data.maxSeconds) * 100));
                return (
                  <div key={i} className="group relative flex h-full flex-1 flex-col items-center gap-2">
                    <div className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded-md border border-glass-strong bg-bg px-2 py-0.5 font-mono text-[10px] text-content group-hover:block">
                      {formatMinutes(day.seconds)}
                    </div>
                    <div className="flex w-full flex-1 items-end justify-center">
                      <div
                        className={`w-full max-w-[26px] rounded-md transition-all duration-300 ${
                          day.isToday
                            ? "bg-gradient-to-t from-primary-dark to-violet-soft shadow-[0_0_16px_rgba(124,92,255,0.55)]"
                            : day.seconds > 0
                              ? "bg-primary/35 group-hover:bg-primary/50"
                              : "bg-white/[0.06]"
                        }`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[11px] ${day.isToday ? "font-bold text-primary-light" : "font-medium text-content-dim"}`}>
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Recent analyses */}
        <section aria-label="Recent analyses" className="lg:col-span-7">
          <SectionHeader
            title="Recent analyses"
            action={
              data.library.length > 0 ? (
                <Link to="/library" className="link-accent">
                  See all ({data.library.length})
                </Link>
              ) : undefined
            }
          />
          {data.recent.length === 0 ? (
            <EmptyState
              icon={
                <Svg size={20}>
                  <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
                  <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2" />
                </Svg>
              }
              title="No saved analyses yet"
              body="Analyse a song, then choose “Save to Library” — it’ll show up here with its key, tempo and chords."
            >
              <Link to="/upload" className="btn-primary px-4 py-2 text-[13px]">
                Analyse your first song
              </Link>
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.recent.map((item, i) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openSaved(item)}
                    className="glass-card glass-card-hover flex w-full items-center gap-3.5 rounded-xl p-3 text-left"
                  >
                    <span
                      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ART_GRADIENTS[i % ART_GRADIENTS.length]} font-heading text-[15px] font-bold text-white`}
                      aria-hidden="true"
                    >
                      {keyShort(item.analysis)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-content">{stripExtension(item.fileName)}</span>
                      <span className="mt-0.5 block truncate text-xs text-content-muted">
                        {item.analysis.key} · {item.analysis.bpm} BPM · {timeAgo(item.savedAt)}
                      </span>
                    </span>
                    {item.analysis.difficulty?.difficultyLabel && (
                      <span className={`chip ${TINTS[i % TINTS.length]} hidden sm:inline-flex`}>
                        {item.analysis.difficulty.difficultyLabel}
                      </span>
                    )}
                    <span className="text-content-dim" aria-hidden="true">
                      <Svg size={16}>
                        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Tools + library */}
        <section aria-label="Tools" className="lg:col-span-5">
          <SectionHeader
            title="Tools"
            action={
              <Link to="/tools" className="link-accent">
                All tools
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-2">
            {TOOLS.map((tool) => (
              <Link
                key={tool.to}
                to={tool.to}
                className="glass-card glass-card-hover flex flex-col items-start gap-3 rounded-xl p-3.5"
              >
                <span className={`icon-tile ${tool.tint} h-9 w-9 rounded-[10px]`}>
                  <Svg size={17}>{tool.icon}</Svg>
                </span>
                <span>
                  <span className="block text-[13.5px] font-bold text-content">{tool.name}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-content-dim">{tool.desc}</span>
                </span>
              </Link>
            ))}
          </div>

          <Link
            to="/library"
            className="glass-card glass-card-hover mt-2 flex items-center gap-3.5 rounded-xl p-3.5"
          >
            <span className="icon-tile tint-violet">
              <Svg size={18}>
                <path d="M6 4h12v16l-6-3.5L6 20V4Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              </Svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-content">Your library</span>
              <span className="mt-0.5 block text-xs text-content-muted">
                {data.library.length === 0
                  ? "Nothing saved yet"
                  : `${data.library.length} saved ${data.library.length === 1 ? "analysis" : "analyses"}`}
              </span>
            </span>
            <span className="text-content-dim" aria-hidden="true">
              <Svg size={16}>
                <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </span>
          </Link>
        </section>
      </div>
    </div>
  );
}
