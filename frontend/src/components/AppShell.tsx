import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode, RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";

const CHORD_SYMBOL = /^[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø|\d|b|#|♭|♯)*(?:\/[A-G][#b♯♭]?)?$/;
import { getLibrary } from "../lib/library";
import { clearSyncError, getLastSyncError, subscribeSyncError } from "../lib/cloudSync";
import { firstNameOf, initialsOf, profileSubtitle } from "../lib/settings/profile";
import { useSettings } from "../lib/settings/settingsContext";
import { useAuth } from "../lib/auth";
import { ErrorBanner } from "./ErrorBanner";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

function icon(path: ReactNode, size = 18) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0" aria-hidden="true">
      {path}
    </svg>
  );
}

const ICONS = {
  home: (
    <path
      d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5h-6v5.5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  ),
  analysis: <path d="M4 18v-4m5 4V8m5 10v-7m5 7V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  practice: <polygon points="7 4.5 19 12 7 19.5 7 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  tuner: (
    <>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  chords: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  library: (
    <path d="M6 4h12v16l-6-3.5L6 20V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  ),
  assistant: (
    <>
      <path d="M12 3.5 13.8 9l5.7 1.5-5.7 1.6L12 17.5l-1.8-5.4-5.7-1.6L10.2 9 12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" fill="currentColor" />
    </>
  ),
  progress: (
    <path d="M3 3v18h18M7 14l4-4 4 4 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
  community: (
    <>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19c.6-3 2.7-4.6 5.5-4.6s4.9 1.6 5.5 4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 19c.4-2 1.8-3.3 3.8-3.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  tools: (
    <path
      d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  more: (
    <>
      <circle cx="6" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  bell: (
    <path
      d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  chevronDown: <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
};

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: "Home", items: [{ to: "/studio", label: "Home", icon: icon(ICONS.home) }] },
  {
    label: "Analyze",
    items: [
      { to: "/analysis", label: "Analysis", icon: icon(ICONS.analysis) },
      { to: "/stems", label: "Stem Splitter", icon: icon(ICONS.tools) },
      { to: "/sheet", label: "Sheet Music", icon: icon(ICONS.chords) },
      { to: "/song/current", label: "Chord Sheet", icon: icon(ICONS.chords) },
      { to: "/library", label: "Library", icon: icon(ICONS.library) },
      { to: "/assistant", label: "AI Assistant", icon: icon(ICONS.assistant) },
    ],
  },
  {
    label: "Practice",
    items: [
      { to: "/practice", label: "Practice", icon: icon(ICONS.practice) },
      { to: "/tuner", label: "Tuner", icon: icon(ICONS.tuner) },
      { to: "/chords", label: "Chords", icon: icon(ICONS.chords) },
      { to: "/dashboard", label: "Progress", icon: icon(ICONS.progress) },
    ],
  },
  { label: "Connect", items: [{ to: "/community", label: "Community", icon: icon(ICONS.community) }] },
];

const FOOTER_ITEMS: NavItem[] = [
  { to: "/tools", label: "All Tools", icon: icon(ICONS.tools) },
  { to: "/settings", label: "Settings", icon: icon(ICONS.settings) },
];

const SECTION_META: Record<string, { title: string; subtitle: string }> = {
  "/studio": { title: "", subtitle: "" },
  "/analysis": { title: "Analysis", subtitle: "Chord timeline, stems and export — everything from one analysis." },
  "/song/current": { title: "Chord Sheet", subtitle: "Synced chord timeline and lyrics." },
  "/sheet": { title: "Sheet Music", subtitle: "Turn a song into sheet music you can play, transpose and export." },
  "/stems": { title: "Stem Splitter", subtitle: "Split a song into the layers detected in it — vocals, drums, bass and more." },
  "/library": { title: "Library", subtitle: "Saved analyses keep their chords, tab and stems together." },
  "/community": { title: "Community", subtitle: "Community features are coming soon." },
  "/tools": { title: "Tools", subtitle: "Six tools, one library — see exactly what each one does." },
  "/upload": { title: "Upload & Analyze", subtitle: "Upload a song or video and Wilsify AI will analyze the real audio." },
  "/practice": { title: "Practice Mode", subtitle: "Practice along at your own speed, with live accuracy tracking." },
  "/assistant": { title: "", subtitle: "" },
  "/tuner": { title: "Tuner", subtitle: "Tune guitars, bass, folk and orchestral strings, harp — or any note." },
  "/chords": { title: "Chord Library", subtitle: "Browse chords for guitar, bass, ukulele, keys, harp and more." },
  "/dashboard": { title: "Progress", subtitle: "Your practice history, streaks and weak chords." },
};

export function isActiveItem(pathname: string, itemTo: string): boolean {
  if (pathname === itemTo) return true;
  if (itemTo === "/studio" && pathname === "/") return true;
  if (itemTo === "/song/current" && pathname.startsWith("/song/")) return true;
  return false;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

function NavRow({
  item,
  active,
  badge,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group relative flex min-h-[40px] items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ns-purple-light)] ${
        active
          ? "bg-gradient-to-r from-[var(--color-ns-purple)]/30 to-[var(--color-ns-purple-light)]/15 text-[var(--color-ns-text)] border border-[var(--color-ns-purple)]/40 shadow-[0_2px_12px_rgba(108,77,255,0.25)]"
          : "text-[var(--color-ns-muted)] hover:bg-white/[0.04] hover:text-[var(--color-ns-text)]"
      }`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--color-ns-purple-light)] shadow-[0_0_8px_#8B5CF6]"
        />
      )}
      <span className="flex min-w-0 items-center gap-3">
        <span className={`shrink-0 ${active ? "text-[var(--color-ns-purple-light)] drop-shadow-[0_0_6px_rgba(139,92,246,0.6)]" : "text-[var(--color-ns-muted)] group-hover:text-[var(--color-ns-text)]"}`}>
          {item.icon}
        </span>
        <span className="truncate">{item.label}</span>
      </span>
      {item.to === "/community" && (
        <span className="shrink-0 whitespace-nowrap rounded-full border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none text-[var(--color-ns-amber)]" title="Coming soon">
          Soon
        </span>
      )}
      {badge !== undefined && badge > 0 && (
        <span
          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-bold ${
            active ? "bg-[var(--color-ns-purple)]/30 text-[var(--color-ns-text)] border border-[var(--color-ns-purple)]/40" : "bg-white/[0.06] text-[var(--color-ns-muted)]"
          }`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function SidebarContent({
  pathname,
  libraryCount,
  name,
  subtitle,
  avatar,
  onNavigate,
}: {
  pathname: string;
  libraryCount: number;
  name: string;
  subtitle: string;
  avatar: string | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <Link
          to="/upload"
          onClick={onNavigate}
          className="ns-btn-primary mb-6 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold shadow-[0_6px_20px_rgba(108,77,255,0.45)] hover:shadow-[0_8px_24px_rgba(108,77,255,0.65)]"
        >
          {icon(ICONS.plus, 16)}
          <span>Analyze a Song</span>
        </Link>

        <nav aria-label="Main" className="flex flex-col gap-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label ?? "root"}>
              {group.label && (
                <p className="mb-1.5 px-3 text-[0.6562rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ns-dim)]">
                  {group.label}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavRow
                    key={item.to}
                    item={item}
                    active={isActiveItem(pathname, item.to)}
                    badge={item.to === "/library" ? libraryCount : undefined}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        <p className="mb-1.5 px-3 text-[0.6562rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ns-dim)]">Tools</p>
        <div className="flex flex-col gap-0.5">
          {FOOTER_ITEMS.map((item) => (
            <NavRow key={item.to} item={item} active={isActiveItem(pathname, item.to)} onNavigate={onNavigate} />
          ))}
        </div>

        {/* Promo card matching reference screenshot */}
        <div className="mt-4 rounded-xl border border-[var(--color-ns-border)] bg-gradient-to-br from-[var(--color-ns-card)] to-[var(--color-ns-raised)] p-3 shadow-md relative overflow-hidden">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-ns-purple)] to-[var(--color-ns-purple-light)] text-white shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--color-ns-text)]">Better practice.</p>
              <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">Bigger progress.</p>
            </div>
          </div>
          <div className="mt-2 h-3 w-full opacity-40">
            <svg viewBox="0 0 100 16" preserveAspectRatio="none" className="h-full w-full stroke-[var(--color-ns-purple-light)] fill-none">
              <path d="M0,8 Q25,0 50,8 T100,8" strokeWidth="2.5" />
            </svg>
          </div>
        </div>

        <Link
          to="/settings/profile"
          onClick={onNavigate}
          className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-2.5 transition-colors hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ns-raised)] text-xs font-bold text-[var(--color-ns-text)] ring-1 ring-[var(--color-ns-border-strong)]">
            <AvatarContent name={name} avatar={avatar} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-[var(--color-ns-text)]">{name || "Musician"}</span>
            <span className="block truncate text-[0.6875rem] text-[var(--color-ns-muted)]">{subtitle}</span>
          </span>
        </Link>
      </div>
    </div>
  );
}

function BottomLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActiveItem(pathname, item.to);
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-1 py-1.5 text-[0.6875rem] font-semibold transition-colors ${
        active ? "text-[var(--color-ns-purple-light)]" : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

const BOTTOM_LEFT: NavItem[] = [
  { to: "/studio", label: "Home", icon: icon(ICONS.home, 21) },
  { to: "/analysis", label: "Analysis", icon: icon(ICONS.analysis, 21) },
];
const BOTTOM_RIGHT: NavItem[] = [{ to: "/practice", label: "Practice", icon: icon(ICONS.practice, 21) }];

const PROFILE_LINKS: { to: string; label: string }[] = [
  { to: "/settings", label: "Settings" },
  { to: "/dashboard", label: "Progress" },
  { to: "/library", label: "Library" },
];

/** Profile photo when there is one, otherwise initials. */
function AvatarContent({ name, avatar }: { name: string; avatar: string | null }) {
  return avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <>{initialsOf(name)}</>;
}

function HeaderActions({ name, subtitle, avatar, pathname }: { name: string; subtitle: string; avatar: string | null; pathname: string }) {
  const [open, setOpen] = useState<"notifications" | "profile" | null>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(null), []);

  useDismiss(notifRef, open === "notifications", close);
  useDismiss(profileRef, open === "profile", close);

  useEffect(() => {
    setOpen(null);
  }, [pathname]);

  return (
    <>
      <div ref={notifRef} className="relative">
        <button
          type="button"
          aria-label="Notifications"
          aria-expanded={open === "notifications"}
          aria-controls="header-notifications"
          onClick={() => setOpen((v) => (v === "notifications" ? null : "notifications"))}
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] text-[var(--color-ns-muted)] transition-colors hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
        >
          {icon(ICONS.bell, 18)}
          {/* No unread dot: there are no notifications yet, and a dot that never clears teaches people to ignore it. */}
        </button>
        {open === "notifications" && (
          <div id="header-notifications" className="ns-popover w-[min(300px,calc(100vw-32px))]" role="region" aria-label="Notifications">
            <div className="px-3 pb-2 pt-2">
              <p className="text-sm font-bold text-[var(--color-ns-text)]">Notifications</p>
            </div>
            <div className="flex items-center gap-3 rounded-[10px] bg-[var(--color-ns-bg-2)] px-3 py-3">
              <span className="ns-icon-tile ns-accent-mint h-8 w-8 rounded-lg">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-[0.8125rem] font-semibold text-[var(--color-ns-text)]">You're all caught up</span>
                <span className="block text-xs text-[var(--color-ns-muted)]">No new notifications.</span>
              </span>
            </div>
          </div>
        )}
      </div>

      <div ref={profileRef} className="relative">
        <button
          type="button"
          aria-label={`Account menu for ${name || "your profile"}`}
          aria-expanded={open === "profile"}
          aria-controls="header-profile-menu"
          onClick={() => setOpen((v) => (v === "profile" ? null : "profile"))}
          className="flex h-10 items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] py-1 pl-1 pr-1.5 transition-colors hover:border-[var(--color-ns-border-strong)] sm:pr-2.5"
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-[var(--color-ns-raised)] text-[0.6875rem] font-bold text-[var(--color-ns-text)] ring-1 ring-[var(--color-ns-border-strong)]">
            <AvatarContent name={name} avatar={avatar} />
          </span>
          <span className="hidden text-[0.8125rem] font-semibold text-[var(--color-ns-text)] sm:inline">{firstNameOf(name)}</span>
          <span className={`text-[var(--color-ns-muted)] transition-transform ${open === "profile" ? "rotate-180" : ""}`}>
            {icon(ICONS.chevronDown, 15)}
          </span>
        </button>
        {open === "profile" && (
          <nav id="header-profile-menu" aria-label="Account" className="ns-popover">
            <div className="mb-1 border-b border-[var(--color-ns-border)] px-3 pb-3 pt-2">
              <p className="truncate text-sm font-bold text-[var(--color-ns-text)]">{name || "Musician"}</p>
              {user && <p className="truncate text-xs text-[var(--color-ns-muted)]">{user.email}</p>}
              {subtitle && <p className="truncate text-xs text-[var(--color-ns-muted)]">{subtitle}</p>}
            </div>
            {PROFILE_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex min-h-[40px] items-center rounded-[10px] px-3 text-[0.8125rem] font-semibold text-[var(--color-ns-muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--color-ns-text)]"
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={async () => {
                close();
                await logout();
                navigate("/login", { replace: true });
              }}
              className="flex min-h-[40px] w-full items-center rounded-[10px] px-3 text-left text-[0.8125rem] font-semibold text-[var(--color-ns-muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--color-ns-text)]"
            >
              Sign out
            </button>
          </nav>
        )}
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K / Cmd+K focuses the header search, as the hint promises.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [libraryCount, setLibraryCount] = useState(0);
  const syncError = useSyncExternalStore(subscribeSyncError, getLastSyncError, () => null);
  const { settings } = useSettings();
  const profile = settings.profile;
  const subtitle = profileSubtitle(profile);

  // Settings screens draw their own header with a back button.
  const meta = location.pathname.startsWith("/settings")
    ? { title: "", subtitle: "" }
    : (SECTION_META[location.pathname] ?? { title: "Wilsify AI", subtitle: "" });
  const isChat = location.pathname === "/assistant";
  const isHome = location.pathname === "/studio" || location.pathname === "/";

  useEffect(() => {
    setMobileNavOpen(false);
    setLibraryCount(getLibrary().length);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    // Chord symbols (Am7, F#9, Bbmaj7, C/G) go to the chord library; everything else searches saved songs.
    const target = CHORD_SYMBOL.test(trimmed) ? "/chords" : "/library";
    navigate(`${target}?q=${encodeURIComponent(trimmed)}`);
    searchInputRef.current?.blur();
  }

  return (
    <div className="ns-scope flex min-h-screen bg-[var(--color-ns-bg)] text-[var(--color-ns-text)]">
      {/* Desktop sidebar — visible at md (768px) and up */}
      <aside className="sticky top-0 hidden h-screen w-[248px] flex-shrink-0 flex-col overflow-y-auto border-r border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] px-4 py-5 md:flex">
        <Link to="/studio" className="mb-6 flex items-center px-1 transition-opacity hover:opacity-90">
          <Logo size={32} withText={true} subtitle="AI that hears your stems" />
        </Link>
        <div className="flex flex-1 flex-col justify-between">
          <SidebarContent
            pathname={location.pathname}
            libraryCount={libraryCount}
            name={profile.displayName}
            subtitle={subtitle}
            avatar={profile.avatar}
          />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="animate-fadeIn absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative flex h-full w-[280px] flex-col overflow-y-auto border-r border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] px-4 py-5">
            <div className="mb-6 flex items-center justify-between px-1">
              <Link to="/studio" onClick={() => setMobileNavOpen(false)}>
                <Logo size={30} withText={true} subtitle="AI that hears your stems" />
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ns-muted)] hover:bg-white/[0.05] hover:text-[var(--color-ns-text)]"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex flex-1 flex-col justify-between">
              <SidebarContent
                pathname={location.pathname}
                libraryCount={libraryCount}
                name={profile.displayName}
                subtitle={subtitle}
                avatar={profile.avatar}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </div>
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div
        className={`flex min-w-0 flex-1 flex-col ${
          isChat ? "h-[100dvh] overflow-hidden pb-16 md:pb-0" : "min-h-screen pb-24 md:pb-10"
        }`}
      >
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--color-ns-border)]/80 bg-[var(--color-ns-bg)]/85 px-4 py-3 backdrop-blur-xl sm:px-6 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] text-[var(--color-ns-text)] transition-colors hover:border-[var(--color-ns-border-strong)] md:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            {isHome ? (
              <div className="min-w-0">
                <h1 className="truncate font-heading text-base font-bold text-[var(--color-ns-text)] sm:text-xl">
                  {greeting()}, {firstNameOf(profile.displayName)}{" "}
                  <span aria-hidden="true">👋</span>
                </h1>
                <p className="mt-0.5 hidden truncate text-[0.8125rem] text-[var(--color-ns-muted)] sm:block">
                  Ready to analyse your next song?
                </p>
              </div>
            ) : meta.title ? (
              <div className="min-w-0">
                <h1 className="truncate font-heading text-lg font-bold text-[var(--color-ns-text)]">{meta.title}</h1>
                {meta.subtitle && (
                  <p className="mt-0.5 hidden truncate text-xs text-[var(--color-ns-muted)] sm:block">{meta.subtitle}</p>
                )}
              </div>
            ) : (
              <Link to="/studio" className="flex items-center gap-2 md:hidden">
                <Logo size={26} withText={false} />
                <span className="font-heading text-base font-bold text-[var(--color-ns-text)]">Wilsify</span>
              </Link>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
            <form onSubmit={handleSearch} role="search" className="hidden lg:block">
              <label className="flex cursor-text items-center gap-2.5 rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)]/90 px-3.5 py-1.5 backdrop-blur-md transition-all focus-within:border-[var(--color-ns-purple)]/70 focus-within:bg-[var(--color-ns-raised)] focus-within:shadow-[0_0_0_3px_rgba(108,77,255,0.18)]">
                <span className="text-[var(--color-ns-muted)]">{icon(ICONS.search, 14)}</span>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
                  aria-label="Search songs, chords, or questions"
                  placeholder="Search songs, chords, or questions…"
                  className="w-48 bg-transparent text-[0.8125rem] text-[var(--color-ns-text)] placeholder:text-[var(--color-ns-dim)] focus:outline-none focus-visible:rounded-none focus-visible:shadow-none [&::-webkit-search-cancel-button]:hidden xl:w-64"
                />
                <kbd className="rounded border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-1.5 py-0.5 text-[0.625rem] font-mono text-[var(--color-ns-muted)]">
                  Ctrl K
                </kbd>
              </label>
            </form>

            <HeaderActions name={profile.displayName} subtitle={subtitle} avatar={profile.avatar} pathname={location.pathname} />
          </div>
        </header>

        {syncError && (
          <div className="px-4 py-2 sm:px-6 md:px-8">
            <ErrorBanner
              severity="warning"
              role="status"
              title="Cloud Sync Unavailable"
              message={syncError}
              actionLabel="Dismiss"
              onAction={clearSyncError}
            />
          </div>
        )}

        <main className={`min-w-0 flex-1 ${isChat ? "min-h-0" : ""}`}>{children}</main>
      </div>

      {/* Mobile bottom navigation with raised center upload action */}
      <nav aria-label="Primary" className="bottom-nav-blur fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)]/95 backdrop-blur-xl md:hidden">
        <div className="flex h-16 items-center px-2">
          {BOTTOM_LEFT.map((item) => (
            <BottomLink key={item.to} item={item} pathname={location.pathname} />
          ))}
          <div className="flex flex-1 justify-center">
            <Link
              to="/upload"
              aria-label="Analyze a song"
              className="-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-[var(--color-ns-purple)] to-[var(--color-ns-purple-light)] text-white shadow-[0_10px_24px_-8px_rgba(108,77,255,0.85)] transition-transform active:scale-95"
            >
              {icon(ICONS.plus, 24)}
            </Link>
          </div>
          {BOTTOM_RIGHT.map((item) => (
            <BottomLink key={item.to} item={item} pathname={location.pathname} />
          ))}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex flex-1 flex-col items-center gap-1 py-1.5 text-[0.6875rem] font-semibold text-[var(--color-ns-muted)] transition-colors hover:text-[var(--color-ns-text)]"
          >
            {icon(ICONS.more, 21)}
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
