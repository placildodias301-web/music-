import { Link, useLocation } from "react-router-dom";

export function AnalysisNavSwitcher() {
  const location = useLocation();
  const currentPath = location.pathname;

  const tabs = [
    {
      to: "/analysis",
      label: "Analysis",
      detail: "Chords & Key",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 18v-4m5 4V8m5 10v-7m5 7V5" />
        </svg>
      ),
    },
    {
      to: "/stems",
      label: "Stem Separation",
      detail: "Vocals & Stems",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      ),
    },
    {
      to: "/sheet",
      label: "Sheet Generation",
      detail: "Staff & TAB",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      ),
    },
  ];

  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-6 mb-6 border-b border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/90 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
      <div className="mx-auto flex max-w-xl items-center gap-1 rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] p-1 text-xs shadow-sm">
        {tabs.map((tab) => {
          const active = currentPath === tab.to || (tab.to === "/sheet" && currentPath.startsWith("/song/"));
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 px-2 text-center font-semibold transition-all ${
                active
                  ? "border border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] font-bold shadow-sm"
                  : "text-[var(--color-ns-muted)] hover:bg-white/[0.04] hover:text-[var(--color-ns-text)]"
              }`}
            >
              <span className={active ? "text-[var(--color-ns-ink)]" : "text-[var(--color-ns-muted)]"}>
                {tab.icon}
              </span>
              <span className="truncate">{tab.label}</span>
              <span className={`hidden sm:inline text-[0.625rem] opacity-75 font-normal`}>
                ({tab.detail})
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
