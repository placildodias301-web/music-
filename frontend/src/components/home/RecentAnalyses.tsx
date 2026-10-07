import { Link } from "react-router-dom";
import type { SavedAnalysis } from "../../lib/library";
import { ICON, Icon } from "./icons";
import { stripExtension, topChords } from "./homeUtils";

interface RecentAnalysesProps {
  items: SavedAnalysis[];
  totalCount: number;
  onOpenItem: (item: SavedAnalysis) => void;
}

// Benchmark reference tracks from screenshot if library has fewer items
const DEMO_CARDS = [
  {
    id: "demo-perfect",
    title: "Perfect",
    artist: "Ed Sheeran",
    key: "C Major",
    bpm: 120,
    timeSignature: "4/4",
    duration: "3:42",
    chords: ["C", "G", "Am", "F"],
    bgGrad: "from-[#F59E0B]/40 via-[#EF4444]/30 to-[#101A34]",
    coverArt: "🌅",
  },
  {
    id: "demo-wonderwall",
    title: "Wonderwall",
    artist: "Oasis",
    key: "F# Minor",
    bpm: 87,
    timeSignature: "4/4",
    duration: "4:18",
    chords: ["F#", "C#", "D#m", "A#m"],
    bgGrad: "from-[#3B82F6]/40 via-[#6366F1]/30 to-[#101A34]",
    coverArt: "🏙️",
  },
  {
    id: "demo-counting-stars",
    title: "Counting Stars",
    artist: "OneRepublic",
    key: "G Major",
    bpm: 102,
    timeSignature: "4/4",
    duration: "4:17",
    chords: ["G", "Em", "C", "D"],
    bgGrad: "from-[#8B5CF6]/40 via-[#EC4899]/30 to-[#101A34]",
    coverArt: "🌌",
  },
];

function formatDuration(analysis: SavedAnalysis["analysis"]): string {
  if (analysis.duration) return analysis.duration;
  if (analysis.durationSeconds && analysis.durationSeconds > 0) {
    const mins = Math.floor(analysis.durationSeconds / 60);
    const secs = Math.floor(analysis.durationSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return "3:30";
}

function parseTitleAndArtist(fileName: string): { title: string; artist: string } {
  const clean = stripExtension(fileName);
  if (clean.includes(" - ")) {
    const parts = clean.split(" - ");
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(" - ").trim(),
    };
  }
  return {
    title: clean,
    artist: "Analyzed Artist",
  };
}

export function RecentAnalyses({ items, totalCount, onOpenItem }: RecentAnalysesProps) {
  // If items exist, use them; if fewer than 3, pad with reference cards from screenshot
  const displayItems = items.length > 0 ? items.slice(0, 3) : [];

  return (
    <section aria-labelledby="recent-analyses-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center text-[#8B5CF6]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10v4" />
              <path d="M8 6v12" />
              <path d="M12 3v18" />
              <path d="M16 7v10" />
              <path d="M20 11v2" />
            </svg>
          </span>
          <div>
            <h2 id="recent-analyses-heading" className="font-heading text-lg font-bold text-[#F4F6FF]">
              Recent Analyses {totalCount > 0 && <span className="text-xs font-normal text-[#A5B1CC]">({totalCount})</span>}
            </h2>
          </div>
        </div>
        <Link to="/library" className="flex items-center gap-1.5 text-xs font-semibold text-[#8B5CF6] transition-colors hover:text-[#A78BFA]">
          <span>View all</span>
          <Icon size={14}>{ICON.arrowRight}</Icon>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayItems.length > 0
          ? displayItems.map((item, idx) => {
              const { title, artist } = parseTitleAndArtist(item.fileName);
              const chords = topChords(item.analysis, 4);
              const duration = formatDuration(item.analysis);
              const demoRef = DEMO_CARDS[idx % DEMO_CARDS.length];

              return (
                <div
                  key={item.id}
                  onClick={() => onOpenItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenItem(item);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="ns-card ns-card-interactive group flex cursor-pointer flex-col justify-between p-4.5 focus-visible:outline-none"
                >
                  <div className="flex items-start gap-3.5">
                    {/* Artwork Tile */}
                    <div className={`relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#202E50] bg-gradient-to-br ${demoRef.bgGrad} shadow-md`}>
                      <span className="text-xl">{demoRef.coverArt}</span>
                      <div className="absolute inset-0 flex items-center justify-center bg-[#6C4DFF]/80 text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <Icon size={18}>{ICON.play}</Icon>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-heading text-sm font-bold text-[#F4F6FF] group-hover:text-[#8B5CF6] transition-colors" title={title}>
                        {title}
                      </h3>
                      <p className="truncate text-xs text-[#A5B1CC]" title={artist}>
                        {artist}
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-[#4DA3FF]">
                        <span>{item.analysis.key}</span>
                        <span className="text-[#687797]">·</span>
                        <span className="text-[#A5B1CC]">{item.analysis.bpm} BPM</span>
                        <span className="text-[#687797]">·</span>
                        <span className="text-[#A5B1CC]">{item.analysis.timeSignature || "4/4"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Chords preview row */}
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {chords.map((chord) => (
                      <span key={chord} className="ns-chord text-[11px] py-1 px-2.5">
                        {chord}
                      </span>
                    ))}
                  </div>

                  {/* Bottom Row */}
                  <div className="mt-4 flex items-center justify-between border-t border-[#202E50]/70 pt-3">
                    <button
                      type="button"
                      aria-label="Play song"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4DA3FF]/20 text-[#4DA3FF] transition-transform hover:scale-105"
                    >
                      <Icon size={12}>{ICON.play}</Icon>
                    </button>
                    <span className="font-mono text-xs text-[#687797]">{duration}</span>
                    <button
                      type="button"
                      aria-label="More options"
                      className="text-[#687797] hover:text-white transition-colors"
                    >
                      <Icon size={14}>{ICON.search}</Icon>
                    </button>
                  </div>
                </div>
              );
            })
          : DEMO_CARDS.map((demo) => (
              <div
                key={demo.id}
                onClick={() => {
                  // Direct navigation to practice or analysis
                  window.location.href = "/practice";
                }}
                role="button"
                tabIndex={0}
                className="ns-card ns-card-interactive group flex cursor-pointer flex-col justify-between p-4.5 focus-visible:outline-none"
              >
                <div className="flex items-start gap-3.5">
                  {/* Artwork Tile */}
                  <div className={`relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#202E50] bg-gradient-to-br ${demo.bgGrad} shadow-md`}>
                    <span className="text-xl">{demo.coverArt}</span>
                    <div className="absolute inset-0 flex items-center justify-center bg-[#6C4DFF]/85 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Icon size={18}>{ICON.play}</Icon>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-heading text-sm font-bold text-[#F4F6FF] group-hover:text-[#8B5CF6] transition-colors">
                      {demo.title}
                    </h3>
                    <p className="truncate text-xs text-[#A5B1CC]">
                      {demo.artist}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[#4DA3FF]">
                      <span>{demo.key}</span>
                      <span className="text-[#687797]">·</span>
                      <span className="text-[#A5B1CC]">{demo.bpm} BPM</span>
                      <span className="text-[#687797]">·</span>
                      <span className="text-[#A5B1CC]">{demo.timeSignature}</span>
                    </div>
                  </div>
                </div>

                {/* Chords preview row */}
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {demo.chords.map((chord) => (
                    <span key={chord} className="ns-chord text-[11px] py-1 px-2.5">
                      {chord}
                    </span>
                  ))}
                </div>

                {/* Bottom Row */}
                <div className="mt-4 flex items-center justify-between border-t border-[#202E50]/70 pt-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4DA3FF]/20 text-[#4DA3FF] shadow-sm transition-transform group-hover:scale-105">
                      <Icon size={11}>{ICON.play}</Icon>
                    </span>
                    <span className="font-mono text-xs text-[#A5B1CC]">{demo.duration}</span>
                  </div>
                  <span className="text-[#687797] group-hover:text-white transition-colors">
                    •••
                  </span>
                </div>
              </div>
            ))}
      </div>
    </section>
  );
}
