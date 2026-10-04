import { Link } from "react-router-dom";
import { ICON, Icon } from "./icons";

interface QuickToolItem {
  to: string;
  title: string;
  subtitle: string;
  accentClass: string;
  badgeAccent: string;
  icon: keyof typeof ICON;
}

const TOOLS: QuickToolItem[] = [
  {
    to: "/practice",
    title: "Practice Studio",
    subtitle: "Slow down · Loop · Metronome",
    accentClass: "ns-accent-coral",
    badgeAccent: "group-hover:border-ns-coral/40 group-hover:text-ns-coral",
    icon: "studio",
  },
  {
    to: "/tuner",
    title: "Chromatic Tuner",
    subtitle: "Tune guitar, bass & more",
    accentClass: "ns-accent-blue",
    badgeAccent: "group-hover:border-ns-blue/40 group-hover:text-ns-blue",
    icon: "tuner",
  },
  {
    to: "/chords",
    title: "Chord Library",
    subtitle: "Explore and learn chords",
    accentClass: "ns-accent-amber",
    badgeAccent: "group-hover:border-ns-amber/40 group-hover:text-ns-amber",
    icon: "chords",
  },
  {
    to: "/assistant",
    title: "AI Music Tutor",
    subtitle: "Ask about your song",
    accentClass: "ns-accent-violet",
    badgeAccent: "group-hover:border-ns-violet/40 group-hover:text-ns-violet",
    icon: "sparkle",
  },
];

export function QuickTools() {
  return (
    <section aria-labelledby="quick-tools-heading">
      <div className="mb-4">
        <h2 id="quick-tools-heading" className="font-heading text-lg font-bold text-ns-text">
          Quick Tools
        </h2>
        <p className="mt-0.5 text-xs text-ns-muted">
          Essential tools designed for everyday musical practice and learning
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="ns-card ns-card-interactive group flex flex-col justify-between p-4 focus-visible:outline-none"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className={`ns-icon-tile ${tool.accentClass} transition-transform group-hover:scale-105`}>
                  <Icon size={19}>{ICON[tool.icon]}</Icon>
                </span>
                <span className={`text-ns-muted/60 transition-colors ${tool.badgeAccent}`}>
                  <Icon size={14} className="transition-transform group-hover:translate-x-0.5">
                    {ICON.arrowRight}
                  </Icon>
                </span>
              </div>

              <h3 className="mt-4 font-heading text-sm font-bold text-ns-text transition-colors group-hover:text-ns-text">
                {tool.title}
              </h3>
              <p className="mt-1 text-xs text-ns-muted">
                {tool.subtitle}
              </p>
            </div>

            <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-ns-muted transition-colors group-hover:text-ns-text">
              <span>Open tool</span>
              <Icon size={11} className="transition-transform group-hover:translate-x-0.5">
                {ICON.arrowRight}
              </Icon>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
