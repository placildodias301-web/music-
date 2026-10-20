import { Link } from "react-router-dom";
import { getFeed, addPost, toggleLike, timeAgo, type CommunityPost } from "../lib/community";
import { getLibrary, type SavedAnalysis } from "../lib/library";

export type CommunityTab = "discover" | "following" | "my-posts";
export { getFeed, addPost, toggleLike, timeAgo, getLibrary };
export type { CommunityPost, SavedAnalysis };

interface LeaderboardUser {
  rank: number;
  name: string;
  instrument: string;
  xp: number;
  avatarBg: string;
}

// Preserved underlying data models for backward-compatibility without misleading active UI
export const TOP_PRACTICERS: LeaderboardUser[] = [
  { rank: 1, name: "Marcus Chen", instrument: "Guitar", xp: 1420, avatarBg: "from-purple-600 to-indigo-600" },
  { rank: 2, name: "Elena Rostova", instrument: "Piano", xp: 1180, avatarBg: "from-blue-600 to-cyan-600" },
  { rank: 3, name: "Wilbur Nathan", instrument: "Guitar", xp: 950, avatarBg: "from-violet-600 to-purple-800" },
  { rank: 4, name: "Jordan Brooks", instrument: "Bass", xp: 740, avatarBg: "from-cyan-600 to-blue-700" },
  { rank: 5, name: "Aria Thorne", instrument: "Ukulele", xp: 620, avatarBg: "from-emerald-600 to-teal-700" },
];

export function Community() {

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 md:px-8">
      {/* Header */}
      <div className="mb-8 border-b border-[var(--color-ns-border)] pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-[var(--color-ns-purple)]/30 bg-[var(--color-ns-purple)]/10 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-[var(--color-ns-purple-light)]">
            Musician Community
          </span>
          <span className="inline-flex items-center rounded-md border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-[var(--color-ns-amber)]">
            Coming soon
          </span>
        </div>
        <h1 className="mt-3 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-3xl">
          Musician Community
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-ns-muted)]">
          Community features are coming soon.
        </p>
      </div>

      {/* Main Coming Soon Presentation Card */}
      <div className="rounded-3xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-8 text-center sm:p-12 shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-amber)] shadow-md">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="10" r="2.4" />
            <path d="M3.5 19c.6-3 2.7-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
            <path d="M14.5 19c.4-2 1.8-3.3 3.8-3.3" />
          </svg>
        </div>

        <div className="mt-4 inline-flex items-center rounded-full border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-ns-amber)]">
          Coming soon
        </div>

        <h2 className="mt-4 font-heading text-xl font-bold text-[var(--color-ns-text)] sm:text-2xl">
          Community features are coming soon.
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--color-ns-muted)]">
          Connect with fellow musicians, share your song chord analyses, and see shared practice logs in an upcoming release. During MVP testing, explore chord sheets, the Practice Studio, and the tuner.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/upload"
            className="btn-primary text-xs sm:text-sm font-semibold"
          >
            Analyze a Song
          </Link>
          <Link
            to="/studio"
            className="btn-secondary text-xs sm:text-sm font-semibold"
          >
            Return to Studio
          </Link>
        </div>
      </div>
    </div>
  );
}
