import { Link } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";

interface ToolCard {
  name: string;
  description: string;
  to: string;
  accent: string;
  icon: React.ReactNode;
}

export function Tools() {
  const { analysis } = useMvp();
  const analysisDestination = analysis ? "/analysis" : "/upload";

  const tools: ToolCard[] = [
    {
      name: "AI Chord Detection",
      description: "Upload any audio or video file and extract key, tempo, and chord progression from actual audio.",
      to: analysisDestination,
      accent: "var(--color-ns-coral)",
      icon: (
        <path d="M4 18v-4m5 4V8m5 10v-7m5 7V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ),
    },
    {
      name: "Lead Sheets & Charts",
      description: "Generate chord-chart PDFs and printable lead sheets derived from detected harmonic progressions.",
      to: analysisDestination,
      accent: "var(--color-ns-blue)",
      icon: (
        <path d="M6 4h9l3 3v13H6V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      ),
    },
    {
      name: "Chromatic Tuner",
      description: "Real-time DSP pitch detection with instrument range filtering and cent gauge feedback.",
      to: "/tuner",
      accent: "var(--color-ns-mint)",
      icon: (
        <>
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 9v3l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ),
    },
    {
      name: "MIDI & Stems Extraction",
      description: "Export standard MIDI files or split stereo tracks into instrumental backing and vocals.",
      to: analysisDestination,
      accent: "var(--color-ns-blue)",
      icon: (
        <path d="M4 12h4l2-6 4 12 2-6h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ),
    },
    {
      name: "Interactive Practice Studio",
      description: "Slow tempo without pitch shift, loop bars, and get live accuracy verification from your mic.",
      to: "/practice",
      accent: "var(--color-ns-amber)",
      icon: (
        <path d="M6 4l14 8-14 8V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      ),
    },
    {
      name: "Wilsify Music Tutor",
      description: "Ask questions grounded in your analyzed track — chords, modal theory, tempo, and weak chords.",
      to: "/assistant",
      accent: "var(--color-ns-violet)",
      icon: (
        <>
          <rect x="4" y="5" width="16" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 20l3-4 3 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ns-coral)]/30 bg-[var(--color-ns-coral)]/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ns-coral)]">
          Integrated Musician Suite
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-4xl">
          Music Tools & Utilities
        </h1>
        <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-[var(--color-ns-muted)]">
          Every specialized tool connects directly back to your track analysis data — no fragmented third-party utilities required.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.name}
            to={tool.to}
            className="group flex flex-col justify-between rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 sm:p-7 shadow-sm transition-all hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]"
          >
            <div>
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-105"
                style={{
                  backgroundColor: `color-mix(in srgb, ${tool.accent} 12%, transparent)`,
                  color: tool.accent,
                  border: `1px solid color-mix(in srgb, ${tool.accent} 30%, transparent)`,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  {tool.icon}
                </svg>
              </span>
              <div className="mt-4">
                <h2 className="font-heading text-base font-bold text-[var(--color-ns-text)] group-hover:text-[var(--color-ns-coral)] transition-colors">
                  {tool.name}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ns-muted)]">{tool.description}</p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ns-coral)] group-hover:translate-x-1 transition-transform">
              Launch tool →
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Link to="/chords" className="btn-secondary text-xs sm:text-sm">
          Browse Interactive Chord Reference →
        </Link>
      </div>
    </div>
  );
}

