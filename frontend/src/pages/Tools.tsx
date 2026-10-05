import { Link } from "react-router-dom";
import { useMvp } from "../lib/MvpContext";

interface ToolCard {
  name: string;
  description: string;
  to: string;
  accent: string;
  tag: string;
  icon: React.ReactNode;
}

export function Tools() {
  const { analysis } = useMvp();
  const analysisDestination = analysis ? "/analysis" : "/upload";

  const tools: ToolCard[] = [
    {
      name: "Song Analysis",
      description: "Upload any audio or video file and extract key, BPM tempo, meter, and full harmonic chord progression.",
      to: analysisDestination,
      accent: "#6C4DFF",
      tag: "MIR Audio",
      icon: (
        <path d="M4 18v-4m5 4V8m5 10v-7m5 7V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ),
    },
    {
      name: "Practice Studio",
      description: "Slow tempo without pitch shift, loop bars, metronome click, and get real-time accuracy verification.",
      to: "/practice",
      accent: "#4DA3FF",
      tag: "Interactive",
      icon: (
        <polygon points="6 4 19 12 6 20 6 4" fill="currentColor" />
      ),
    },
    {
      name: "Chromatic Tuner",
      description: "Real-time DSP pitch detection with instrument range filtering, cents gauge feedback, and reference tones.",
      to: "/tuner",
      accent: "#22C7D9",
      tag: "Live DSP",
      icon: (
        <>
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 9v3l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ),
    },
    {
      name: "Chord Library",
      description: "Browse 300+ chord diagrams with guitar fretboard voicings, ukulele shapes, piano keys, and audio playback.",
      to: "/chords",
      accent: "#F5B84B",
      tag: "Reference",
      icon: (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <line x1="9" y1="4" x2="9" y2="20" stroke="currentColor" strokeWidth="1.5" />
          <line x1="15" y1="4" x2="15" y2="20" stroke="currentColor" strokeWidth="1.5" />
          <line x1="4" y1="10" x2="20" y2="10" stroke="currentColor" strokeWidth="1.5" />
          <line x1="4" y1="15" x2="20" y2="15" stroke="currentColor" strokeWidth="1.5" />
        </>
      ),
    },
    {
      name: "AI Music Tutor",
      description: "Ask questions grounded in your analyzed track — chord theory, substitutions, modal scales, and song insights.",
      to: "/assistant",
      accent: "#8B5CF6",
      tag: "AI Tutor",
      icon: (
        <>
          <rect x="4" y="5" width="16" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 20l3-4 3 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ),
    },
    {
      name: "Progress & Analytics",
      description: "Monitor daily practice minutes, streaks, accuracy trends, BPM improvements, and chord transition weak spots.",
      to: "/dashboard",
      accent: "#55D69A",
      tag: "Metrics",
      icon: (
        <>
          <line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ),
    },
    {
      name: "MIDI Export",
      description: "Export polyphonic standard MIDI files (.mid) from detected chords to import into Ableton, Logic, or FL Studio.",
      to: analysisDestination,
      accent: "#4DA3FF",
      tag: "DAW Export",
      icon: (
        <path d="M4 12h4l2-6 4 12 2-6h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ),
    },
    {
      name: "PDF Lead Sheet Export",
      description: "Generate clean printable chord-chart PDFs with chord boxes, timestamps, and section cues for rehearsals.",
      to: analysisDestination,
      accent: "#FF6578",
      tag: "Printable",
      icon: (
        <path d="M6 4h9l3 3v13H6V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
          Integrated Musician Suite
        </span>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-4xl">
          All Studio Tools
        </h1>
        <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-[var(--color-ns-muted)]">
          Eight specialized musician utilities connecting directly to your audio stems and MIR chord analysis.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map((tool) => (
          <Link
            key={tool.name}
            to={tool.to}
            className="group flex flex-col justify-between rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 sm:p-6 shadow-sm transition-all hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)] hover:-translate-y-0.5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-105"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${tool.accent} 15%, transparent)`,
                    color: tool.accent,
                    border: `1px solid color-mix(in srgb, ${tool.accent} 35%, transparent)`,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    {tool.icon}
                  </svg>
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${tool.accent} 12%, transparent)`,
                    color: tool.accent,
                    border: `1px solid color-mix(in srgb, ${tool.accent} 25%, transparent)`,
                  }}
                >
                  {tool.tag}
                </span>
              </div>

              <div className="mt-4">
                <h2 className="font-heading text-base font-bold text-[var(--color-ns-text)] group-hover:text-primary transition-colors">
                  {tool.name}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ns-muted)]">{tool.description}</p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:translate-x-1 transition-transform">
              Launch tool →
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link to="/studio" className="btn-secondary text-xs sm:text-sm">
          Return to Studio
        </Link>
        <Link to="/chords" className="btn-primary text-xs sm:text-sm">
          Browse Chord Library →
        </Link>
      </div>
    </div>
  );
}
