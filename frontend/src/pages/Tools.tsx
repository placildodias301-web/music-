import { Link } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";

interface ToolCard {
  name: string;
  description: string;
  to: string;
  color: string;
  icon: React.ReactNode;
}

export function Tools() {
  const { analysis } = useMvp();
  const analysisDestination = analysis ? "/analysis" : "/upload";

  const tools: ToolCard[] = [
    {
      name: "AI Chord Detection",
      description: "Upload any song and get instant key, tempo and chord analysis from the real audio.",
      to: analysisDestination,
      color: "var(--color-primary)",
      icon: (
        <path d="M4 18v-4m5 4V8m5 10v-7m5 7V5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      ),
    },
    {
      name: "Guitar Tabs & Sheet",
      description: "Export a chord-chart PDF (lead sheet) generated from the detected progression.",
      to: analysisDestination,
      color: "var(--color-cyan)",
      icon: (
        <path d="M6 4h9l3 3v13H6V4Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
      ),
    },
    {
      name: "Chromatic Tuner",
      description: "Live pitch detection with instrument presets and real-time visual feedback.",
      to: "/tuner",
      color: "var(--color-pink)",
      icon: (
        <>
          <circle cx="12" cy="12" r="7" stroke="white" strokeWidth="1.8" />
          <path d="M12 9v3l2 2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ),
    },
    {
      name: "MIDI & Stem Export",
      description: "Export any song to MIDI, or split it into instrumental and vocal-emphasized tracks.",
      to: analysisDestination,
      color: "var(--color-green)",
      icon: (
        <path d="M4 12h4l2-6 4 12 2-6h4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ),
    },
    {
      name: "Practice Mode",
      description: "Slow a song down, loop sections, and get live accuracy feedback from your mic.",
      to: "/practice",
      color: "var(--color-orange)",
      icon: (
        <path d="M6 4l14 8-14 8V4Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
      ),
    },
    {
      name: "AI Tutor",
      description: "Ask questions grounded in the song you just analyzed — chords, key, tempo, weak spots.",
      to: "/assistant",
      color: "var(--color-primary-light)",
      icon: (
        <>
          <rect x="4" y="5" width="16" height="11" rx="3" stroke="white" strokeWidth="1.8" />
          <path d="M9 20l3-4 3 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-light">
          Integrated Music Suite
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-content sm:text-4xl">
          Musician Toolkit
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          Every specialized tool connects back to your analysis data — no fragmented third-party apps required.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.name}
            to={tool.to}
            className="glass-card glass-card-hover group flex flex-col justify-between p-6 sm:p-7"
          >
            <div>
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-transform group-hover:scale-105"
                style={{ background: `${tool.color}25`, color: tool.color, border: `1px solid ${tool.color}45` }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  {tool.icon}
                </svg>
              </span>
              <div className="mt-4">
                <h2 className="font-heading text-base font-bold text-content">{tool.name}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-content-muted">{tool.description}</p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-primary-light group-hover:translate-x-1 transition-transform">
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
