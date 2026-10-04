import { Link } from "react-router-dom";
import { ICON, Icon } from "./icons";

export function BottomBanner() {
  return (
    <section
      aria-label="Practice promotion banner"
      className="ns-banner relative overflow-hidden p-6 sm:p-8"
    >
      {/* Subtle musical studio aesthetic background accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-ns-amber/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-1/4 -bottom-12 h-48 w-48 rounded-full bg-ns-coral/10 blur-2xl"
      />

      {/* Decorative guitar string / equalizer sound lines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 opacity-15 lg:flex lg:flex-col lg:justify-around"
      >
        <div className="h-px w-full bg-gradient-to-r from-transparent via-ns-amber to-ns-amber" />
        <div className="h-px w-full bg-gradient-to-r from-transparent via-ns-coral to-ns-coral" />
        <div className="h-px w-full bg-gradient-to-r from-transparent via-ns-blue to-ns-blue" />
        <div className="h-px w-full bg-gradient-to-r from-transparent via-ns-mint to-ns-mint" />
      </div>

      <div className="relative z-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ns-amber/35 bg-ns-amber/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ns-amber">
            NEW
          </span>
          <h2 className="mt-2.5 font-heading text-xl font-bold tracking-tight text-ns-text sm:text-2xl">
            Turn your songs into progress
          </h2>
          <p className="mt-1 text-sm text-ns-muted">
            Practice, improve, and master your music with Wilsify AI.
          </p>
        </div>

        <Link
          to="/practice"
          className="ns-btn-primary flex-shrink-0 px-6 py-2.5"
        >
          <span>Start Practicing</span>
          <Icon size={16}>{ICON.arrowRight}</Icon>
        </Link>
      </div>
    </section>
  );
}
