import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * A settings screen: a header with a square back button and the title,
 * then content in a centred column (mobile-first, max ~520px on desktop).
 */
export function SettingsPage({
  title,
  back = "/settings",
  backLabel = "Back to settings",
  actions,
  children,
  footer,
}: {
  title: string;
  /** Where the back button goes; null hides it (the main settings list). */
  back?: string | null;
  backLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Sticky bottom bar (e.g. Save). */
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[520px] px-4 pb-10 pt-6 sm:pt-8">
      <header className="mb-6 flex items-center gap-3">
        {back !== null && (
          <Link
            to={back}
            aria-label={backLabel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-[var(--color-ns-text)] transition-colors hover:border-[var(--color-ns-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate font-heading text-xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-2xl">{title}</h1>
        {actions}
      </header>
      <div className="space-y-6">{children}</div>
      {/* Sticky action bar; on phones it sits just above the bottom tab bar (65px). */}
      {footer && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/95 px-4 py-3 backdrop-blur-md max-md:bottom-[calc(65px+env(safe-area-inset-bottom,0px))]">
          {footer}
        </div>
      )}
    </div>
  );
}
