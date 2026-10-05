import { Link } from "react-router-dom";
import { ICON, Icon } from "./icons";

interface QuickToolItem {
  to: string;
  title: string;
  subtitle: string;
  iconBg: string;
  iconColor: string;
  icon: keyof typeof ICON;
}

const TOOLS: QuickToolItem[] = [
  {
    to: "/practice",
    title: "Practice Studio",
    subtitle: "Slow down · Loop · Metronome",
    iconBg: "bg-[#4DA3FF]/20",
    iconColor: "text-[#4DA3FF]",
    icon: "studio",
  },
  {
    to: "/tuner",
    title: "Chromatic Tuner",
    subtitle: "Tune guitar, bass & more",
    iconBg: "bg-[#22C7D9]/20",
    iconColor: "text-[#22C7D9]",
    icon: "tuner",
  },
  {
    to: "/chords",
    title: "Chord Library",
    subtitle: "Learn 100+ chords",
    iconBg: "bg-[#6C4DFF]/20",
    iconColor: "text-[#8B5CF6]",
    icon: "chords",
  },
  {
    to: "/assistant",
    title: "AI Music Tutor",
    subtitle: "Ask about your song",
    iconBg: "bg-[#8B5CF6]/20",
    iconColor: "text-[#A78BFA]",
    icon: "sparkle",
  },
];

export function QuickTools() {
  return (
    <section aria-labelledby="quick-tools-heading" className="flex flex-col justify-between h-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#8B5CF6]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </span>
          <h2 id="quick-tools-heading" className="font-heading text-lg font-bold text-[#F4F6FF]">
            Quick Tools
          </h2>
        </div>
        <Link to="/tools" className="flex items-center gap-1 text-xs font-semibold text-[#8B5CF6] hover:text-[#A78BFA] transition-colors">
          <span>View all</span>
          <Icon size={14}>{ICON.arrowRight}</Icon>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="ns-card ns-card-interactive group flex flex-col justify-between p-4.5 focus-visible:outline-none"
          >
            <div className="flex items-start justify-between">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tool.iconBg} ${tool.iconColor} transition-transform group-hover:scale-105 shadow-sm`}>
                <Icon size={20}>{ICON[tool.icon]}</Icon>
              </span>
              <span className="text-[#687797] transition-all group-hover:text-white group-hover:translate-x-0.5">
                <Icon size={16}>{ICON.arrowRight}</Icon>
              </span>
            </div>

            <div className="mt-4">
              <h3 className="font-heading text-sm font-bold text-[#F4F6FF] group-hover:text-[#8B5CF6] transition-colors">
                {tool.title}
              </h3>
              <p className="mt-1 text-xs text-[#A5B1CC]">
                {tool.subtitle}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
