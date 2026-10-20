import { Link } from "react-router-dom";
import { SettingsPage } from "../../components/settings/SettingsPage";
import { ANNUAL_DISCOUNT, CREDIT_FEATURES, PLANS, formatRupees, planPrice, type Billing, type Plan } from "../../lib/plans";
import { SUPPORT_EMAIL } from "../../lib/appInfo";

// Preserved underlying references for backward compatibility without misleading active UI
export { ANNUAL_DISCOUNT, CREDIT_FEATURES, PLANS, formatRupees, planPrice, SUPPORT_EMAIL };
export type { Billing, Plan };

export function Plans() {

  return (
    <SettingsPage title="Plans">
      <div className="space-y-6">
        {/* Coming soon notice */}
        <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 text-center sm:p-8 shadow-md">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-amber)] shadow-sm">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>

          <div className="mt-3">
            <span className="inline-flex rounded-full border border-[var(--color-ns-amber)]/40 bg-[var(--color-ns-amber)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--color-ns-amber)]">
              Coming soon
            </span>
          </div>

          <h2 className="mt-3 font-heading text-xl font-bold text-[var(--color-ns-text)] sm:text-2xl">
            Paid plans are coming soon.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--color-ns-muted)]">
            Paid plans are coming soon. Wilsify AI is currently free during MVP testing.
          </p>

          <div className="mx-auto mt-6 max-w-lg rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ns-purple-light)]">
              Free MVP Access Included
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-ns-muted)]">
              All registered users enjoy unrestricted access to the core MVP loop: audio and video analysis, synchronized chord and lyric sheets, Practice Studio, beat metronome, tap tempo, tuner, and chord library.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/studio" className="btn-primary text-xs sm:text-sm">
              Return to Studio
            </Link>
            <Link to="/settings" className="btn-secondary text-xs sm:text-sm">
              Back to Settings
            </Link>
          </div>
        </div>
      </div>
    </SettingsPage>
  );
}
