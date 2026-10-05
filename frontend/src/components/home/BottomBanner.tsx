import { Link } from "react-router-dom";
import { ICON, Icon } from "./icons";

export function BottomBanner() {
  return (
    <section
      aria-label="Practice promotion banner"
      className="relative overflow-hidden rounded-2xl border border-[#202E50] bg-gradient-to-r from-[#0D1630] via-[#0A1022] to-[#070D1C] p-6 sm:p-8 shadow-xl"
    >
      {/* Dusk landscape and musician silhouette background artwork */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
      >
        <svg viewBox="0 0 1200 200" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
          <defs>
            <linearGradient id="skyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0D1630" />
              <stop offset="50%" stopColor="#1E1B4B" />
              <stop offset="70%" stopColor="#431407" />
              <stop offset="100%" stopColor="#1E1B4B" />
            </linearGradient>
            <linearGradient id="glowSun" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#6C4DFF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="1200" height="200" fill="url(#skyGrad)" />
          {/* Mountains silhouette */}
          <path d="M0,160 L200,110 L450,150 L600,80 L800,140 L1000,95 L1200,150 L1200,200 L0,200 Z" fill="#070D1C" />
          <path d="M300,170 L550,120 L700,160 L950,110 L1200,170 L1200,200 L300,200 Z" fill="#040710" />
          {/* Musician silhouette on hill around center right */}
          <circle cx="680" cy="115" r="9" fill="#040710" />
          <path d="M670,124 Q680,120 690,124 L692,150 L668,150 Z" fill="#040710" />
          {/* Acoustic guitar angled */}
          <ellipse cx="692" cy="138" rx="8" ry="12" fill="#040710" transform="rotate(-30 692 138)" />
          <line x1="682" y1="145" x2="660" y2="125" stroke="#040710" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-1/3 -top-24 h-56 w-56 rounded-full bg-[#6C4DFF]/20 blur-3xl"
      />

      <div className="relative z-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6C4DFF]/40 bg-[#6C4DFF]/15 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#A78BFA]">
            NEW
          </span>
          <h2 className="mt-2.5 font-heading text-xl font-bold tracking-tight text-[#F4F6FF] sm:text-2xl lg:text-3xl">
            Turn your songs into progress
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-[#A5B1CC]">
            Practice, improve, and master your music with Wilsify AI.
          </p>
        </div>

        <Link
          to="/practice"
          className="ns-btn-primary flex-shrink-0 flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-[0_6px_24px_rgba(108,77,255,0.5)] transition-all hover:scale-105 active:scale-95"
        >
          <span>Start Practicing</span>
          <Icon size={16}>{ICON.arrowRight}</Icon>
        </Link>
      </div>
    </section>
  );
}
