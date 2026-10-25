import { Link } from "react-router-dom";

interface ToolkitItem {
  to: string;
  title: string;
  subtitle: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
}

const ITEMS: ToolkitItem[] = [
  {
    to: "/chords",
    title: "Chords & Notes Library",
    subtitle: "Interactive chord diagrams, open & barre shapes, chord families, and music theory lab.",
    iconBg: "bg-[var(--color-ns-purple)]/20",
    iconColor: "text-[var(--color-ns-purple-light)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    to: "/tuner",
    title: "Chromatic & String Tuner",
    subtitle: "Precision Hz pitch meter & reference tones for guitar, bass, ukulele, violin & world instruments.",
    iconBg: "bg-[var(--color-ns-cyan)]/20",
    iconColor: "text-[var(--color-ns-cyan)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="3" x2="12" y2="7" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <line x1="3" y1="12" x2="7" y2="12" />
        <line x1="17" y1="12" x2="21" y2="12" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
  {
    to: "/practice",
    title: "Practice Studio",
    subtitle: "Speed drills, chord transition trainer, loop regions & metronome sync.",
    iconBg: "bg-[var(--color-ns-blue)]/20",
    iconColor: "text-[var(--color-ns-blue)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="6 3 20 12 6 21 6 3" />
      </svg>
    ),
  },
  {
    to: "/song/current",
    title: "Chord & Lyric Sheet",
    subtitle: "Auto-scrolling stage chord sheets with real-time capo & key transposition.",
    iconBg: "bg-[var(--color-ns-amber)]/20",
    iconColor: "text-[var(--color-ns-amber)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
  },
];

export function MusicianToolkit() {
  return (
    <section aria-labelledby="musician-toolkit-heading" className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-ns-purple-light)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </span>
          <h2 id="musician-toolkit-heading" className="font-heading text-base sm:text-lg font-bold tracking-tight text-[var(--color-ns-text)]">
            Musician Toolkit — Chords, Tuner & Practice
          </h2>
        </div>
        <Link
          to="/tools"
          className="text-xs font-semibold text-[var(--color-ns-purple-light)] hover:text-[var(--color-violet-soft)] transition-colors"
        >
          All Tools →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        {ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex flex-col justify-between rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-surface)] p-3 sm:p-4 transition-all hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] hover:shadow-md active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`flex h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-xl ${item.iconBg} ${item.iconColor} transition-transform group-hover:scale-105`}>
                {item.icon}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-ns-dim)] group-hover:text-[var(--color-ns-text)] group-hover:translate-x-0.5 transition-all">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <div className="mt-3">
              <h3 className="font-heading text-xs sm:text-sm font-bold text-[var(--color-ns-text)] group-hover:text-[var(--color-ns-purple-light)] transition-colors truncate">
                {item.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-[11px] sm:text-xs leading-snug text-[var(--color-ns-muted)]">
                {item.subtitle}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
