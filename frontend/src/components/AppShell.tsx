import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { getLibrary } from "../lib/library";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

function icon(path: ReactNode) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
      {path}
    </svg>
  );
}

const SIDEBAR_ITEMS: NavItem[] = [
  {
    to: "/studio",
    label: "Studio",
    icon: icon(<rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" opacity="0.85" />),
  },
  {
    to: "/analysis",
    label: "Analysis",
    icon: icon(
      <path
        d="M4 18v-4m5 4V8m5 10v-7m5 7V5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    ),
  },
  {
    to: "/practice",
    label: "Practice",
    icon: icon(
      <>
        <polygon points="6 4 19 12 6 20 6 4" fill="currentColor" opacity="0.85" />
      </>
    ),
  },
  {
    to: "/tuner",
    label: "Tuner",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  {
    to: "/chords",
    label: "Chords",
    icon: icon(
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      </>
    ),
  },
  {
    to: "/library",
    label: "Library",
    icon: icon(
      <path
        d="M5 4h11a2 2 0 0 1 2 2v14l-7.5-3.5L5 20V4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    ),
  },
  {
    to: "/assistant",
    label: "AI Assistant",
    icon: icon(
      <>
        <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6 10v2a6 6 0 0 0 12 0v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 18v4m-4 0h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  {
    to: "/dashboard",
    label: "Analytics",
    icon: icon(
      <path
        d="M3 3v18h18M7 14l4-4 4 4 5-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    to: "/community",
    label: "Community",
    icon: icon(
      <>
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.5 19c.6-3 2.7-4.6 5.5-4.6s4.9 1.6 5.5 4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14.5 19c.4-2 1.8-3.3 3.8-3.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  {
    to: "/tools",
    label: "All Tools",
    icon: icon(
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    to: "/account",
    label: "Settings",
    icon: icon(
      <>
        <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 20c1-3.6 3.6-5.4 7-5.4s6 1.8 7 5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
];

const SECTION_META: Record<string, { title: string; subtitle: string }> = {
  "/studio": { title: "Studio", subtitle: "Analyse a track, then read, correct and export the chart." },
  "/analysis": { title: "Analysis", subtitle: "Chord timeline, stems and export — everything from one analysis." },
  "/library": { title: "Library", subtitle: "Saved analyses keep their chords, tab and stems together." },
  "/community": { title: "Community", subtitle: "Every post carries the song analysis behind it — open it and play along." },
  "/tools": { title: "Tools", subtitle: "Six tools, one library — see exactly what each one does." },
  "/account": { title: "Account", subtitle: "Profile and preferences for this device." },
  "/upload": { title: "Upload & Analyze", subtitle: "Upload a song or video and Wilsify AI will analyze the real audio." },
  "/practice": { title: "Practice Mode", subtitle: "Practice along at your own speed, with live accuracy tracking." },
  "/assistant": { title: "AI Assistant", subtitle: "Ask questions about the song you just analyzed or music theory." },
  "/tuner": { title: "Chromatic Tuner", subtitle: "Live chromatic tuner — instrument presets and real-time pitch feedback." },
  "/chords": { title: "Chord Library", subtitle: "Browse chord shapes across guitar, ukulele and piano." },
  "/dashboard": { title: "Analytics", subtitle: "Your practice history, streaks and weak chords." },
};

function isActiveItem(pathname: string, itemTo: string): boolean {
  if (pathname === itemTo) return true;
  if (itemTo === "/studio" && pathname === "/") return true;
  if (itemTo === "/studio" && pathname === "/upload") return true;
  return false;
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [libraryCount, setLibraryCount] = useState(0);

  const meta = SECTION_META[location.pathname] ?? { title: "Wilsify AI", subtitle: "" };

  useEffect(() => {
    setMobileNavOpen(false);
    setLibraryCount(getLibrary().length);
  }, [location.pathname]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/library?q=${encodeURIComponent(trimmed)}`);
    setMobileNavOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop sidebar — visible at md (768px) and up */}
      <aside className="hidden w-[230px] flex-shrink-0 flex-col justify-between border-r border-glass/80 bg-bg-card/40 px-3 py-5 backdrop-blur-md md:flex">
        <div>
          <Link to="/studio" className="mb-7 flex items-center gap-3 px-3 transition-opacity hover:opacity-90">
            <Logo size={28} />
            <div>
              <span className="font-heading text-base font-bold tracking-tight text-content">Wilsify</span>
              <span className="ml-1.5 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary-light">AI</span>
            </div>
          </Link>

          <nav className="flex flex-col gap-1">
            {SIDEBAR_ITEMS.map((item) => {
              const active = isActiveItem(location.pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    active
                      ? "bg-primary text-white shadow-[0_4px_16px_rgba(124,92,255,0.35)]"
                      : "text-content-muted hover:bg-white/[0.04] hover:text-content"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className={active ? "text-white" : "text-content-dim group-hover:text-content-light"}>
                      {item.icon}
                    </span>
                    {item.label}
                  </span>
                  {item.to === "/library" && libraryCount > 0 && (
                    <span
                      className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                        active ? "bg-white/25 text-white" : "bg-white/10 text-content-muted"
                      }`}
                    >
                      {libraryCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar user profile footer */}
        <div className="border-t border-glass/80 pt-4">
          <Link
            to="/account"
            className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/[0.04]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-xs font-bold text-white shadow-[0_2px_10px_rgba(124,92,255,0.4)]">
              WF
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-content">Wilbur Fernandes</p>
              <span className="inline-block text-[10px] font-medium text-primary-light">PRO Member</span>
            </div>
          </Link>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <aside className="bg-glass-heavy relative flex h-full w-[260px] flex-col justify-between border-r border-glass px-4 py-5 backdrop-blur-xl">
            <div>
              <div className="mb-6 flex items-center justify-between px-2">
                <Link to="/studio" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-2">
                  <Logo size={26} />
                  <span className="font-heading text-base font-bold text-content">Wilsify AI</span>
                </Link>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-content-muted hover:text-content"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <nav className="flex flex-col gap-1">
                {SIDEBAR_ITEMS.map((item) => {
                  const active = isActiveItem(location.pathname, item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileNavOpen(false)}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                        active ? "bg-primary text-white" : "text-content-muted hover:bg-white/[0.04] hover:text-content"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={active ? "text-white" : "text-content-dim"}>{item.icon}</span>
                        {item.label}
                      </span>
                      {item.to === "/library" && libraryCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/15 px-1.5 text-[11px]">
                          {libraryCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="border-t border-glass pt-3">
              <Link
                to="/account"
                onClick={() => setMobileNavOpen(false)}
                className="flex items-center gap-3 rounded-xl p-2 text-sm text-content"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-xs font-bold text-white">
                  WF
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-content">Wilbur Fernandes</p>
                  <span className="text-[10px] text-primary-light">PRO Member</span>
                </div>
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden pb-20 md:pb-8">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-glass/80 bg-bg/75 px-4 py-3.5 backdrop-blur-md sm:px-6 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-glass bg-white/[0.03] text-content transition-colors hover:border-glass-strong md:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-heading text-lg font-bold text-content sm:text-xl">{meta.title}</h1>
              {meta.subtitle && (
                <p className="mt-0.5 hidden truncate text-xs text-content-muted sm:block">{meta.subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
            <form onSubmit={handleSearch} className="hidden lg:block">
              <div className="flex items-center gap-2 rounded-full border border-glass bg-white/[0.03] px-3.5 py-1.5 focus-within:border-primary/50 focus-within:bg-white/[0.05]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-content-dim">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search your saved tracks"
                  placeholder="Search tracks..."
                  className="w-36 bg-transparent text-xs text-content placeholder:text-content-dim focus:outline-none xl:w-44"
                />
              </div>
            </form>

            <Link
              to="/upload"
              className="btn-primary hidden px-3.5 py-1.5 text-xs sm:inline-flex"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 4v16m-8-8h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              Upload Song
            </Link>

            <Link
              to="/account"
              className="flex items-center gap-2 rounded-full border border-glass bg-white/[0.02] py-1 pl-1 pr-2.5 transition-colors hover:border-glass-strong sm:pr-3"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-[11px] font-bold text-white shadow-sm">
                WF
              </span>
              <span className="hidden text-xs font-semibold text-content sm:inline">Wilbur</span>
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar — Exactly matches Figma mobile layout */}
      <nav className="bottom-nav-blur fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around px-2 md:hidden">
        <Link
          to="/studio"
          className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition-colors ${
            location.pathname === "/studio" || location.pathname === "/"
              ? "text-primary-light"
              : "text-content-dim hover:text-content-muted"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 10.5 12 3l9 7.5v9.5a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          Studio
        </Link>

        <Link
          to="/analysis"
          className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition-colors ${
            location.pathname === "/analysis" ? "text-primary-light" : "text-content-dim hover:text-content-muted"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 18v-4m5 4V8m5 10v-7m5 7V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Analysis
        </Link>

        <Link
          to="/practice"
          className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition-colors ${
            location.pathname === "/practice" ? "text-primary-light" : "text-content-dim hover:text-content-muted"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <polygon points="6 4 19 12 6 20 6 4" fill="currentColor" opacity="0.8" />
          </svg>
          Practice
        </Link>

        <Link
          to="/tuner"
          className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition-colors ${
            location.pathname === "/tuner" ? "text-primary-light" : "text-content-dim hover:text-content-muted"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Tuner
        </Link>

        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="flex flex-col items-center gap-1 py-1 text-[11px] font-medium text-content-dim transition-colors hover:text-content-muted"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="6" cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="18" cy="12" r="1.5" fill="currentColor" />
          </svg>
          More
        </button>
      </nav>
    </div>
  );
}

