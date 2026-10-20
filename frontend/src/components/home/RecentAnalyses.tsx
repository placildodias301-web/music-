import { Link } from "react-router-dom";
import type { SavedAnalysis } from "../../lib/library";
import { ICON, Icon } from "./icons";
import { stripExtension, topChords } from "./homeUtils";

interface RecentAnalysesProps {
  items: SavedAnalysis[];
  totalCount: number;
  onOpenItem: (item: SavedAnalysis) => void;
}

// Cover-art gradients for saved songs (cycled by position).
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
    bgGrad: "from-[#F59E0B]/40 via-[#EF4444]/30 to-[var(--color-ns-raised)]",
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
    bgGrad: "from-[#3B82F6]/40 via-[#6366F1]/30 to-[var(--color-ns-raised)]",
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
    bgGrad: "from-[var(--color-ns-purple-light)]/40 via-[#EC4899]/30 to-[var(--color-ns-raised)]",
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
          <span className="flex h-6 w-6 items-center justify-center text-[var(--color-ns-purple-light)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10v4" />
              <path d="M8 6v12" />
              <path d="M12 3v18" />
              <path d="M16 7v10" />
              <path d="M20 11v2" />
            </svg>
          </span>
          <div>
            <h2 id="recent-analyses-heading" className="font-heading text-lg font-bold text-[var(--color-ns-text)]">
              Recent Analyses {totalCount > 0 && <span className="text-xs font-normal text-[var(--color-ns-muted)]">({totalCount})</span>}
            </h2>
          </div>
        </div>
        <Link to="/library" className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ns-purple-light)] transition-colors hover:text-[var(--color-violet-soft)]">
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
                    <div className={`relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-ns-border)] bg-gradient-to-br ${demoRef.bgGrad} shadow-md`}>
                      <span className="text-xl">{demoRef.coverArt}</span>
                      <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-ns-purple)]/80 text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <Icon size={18}>{ICON.play}</Icon>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-heading text-sm font-bold text-[var(--color-ns-text)] group-hover:text-[var(--color-ns-purple-light)] transition-colors" title={title}>
                        {title}
                      </h3>
                      <p className="truncate text-xs text-[var(--color-ns-muted)]" title={artist}>
                        {artist}
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-[0.6875rem] font-medium text-[var(--color-ns-blue)]">
                        <span>{item.analysis.key}</span>
                        <span className="text-[var(--color-ns-dim)]">·</span>
                        <span className="text-[var(--color-ns-muted)]">{item.analysis.bpm} BPM</span>
                        <span className="text-[var(--color-ns-dim)]">·</span>
                        <span className="text-[var(--color-ns-muted)]">{item.analysis.timeSignature || "4/4"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Chords preview row */}
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {chords.map((chord) => (
                      <span key={chord} className="ns-chord text-[0.6875rem] py-1 px-2.5">
                        {chord}
                      </span>
                    ))}
                  </div>

                  {/* Bottom Row */}
                  <div className="mt-4 flex items-center justify-between border-t border-[var(--color-ns-border)]/70 pt-3">
                    <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ns-blue)]/20 text-[var(--color-ns-blue)] transition-transform group-hover:scale-105">
                      <Icon size={12}>{ICON.play}</Icon>
                    </span>
                    <span className="font-mono text-xs text-[var(--color-ns-dim)]">{duration}</span>
                    <span className="text-xs font-semibold text-[var(--color-ns-purple-light)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Open →</span>
                  </div>
                </div>
              );
            })
          : (
              <div className="ns-card flex flex-col items-center justify-center gap-3 p-6 text-center sm:col-span-2 lg:col-span-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-ns-purple)]/15 text-[var(--color-ns-purple-light)]">
                  <Icon size={20}>{ICON.play}</Icon>
                </span>
                <div>
                  <p className="font-heading text-sm font-bold text-[var(--color-ns-text)]">No songs analyzed yet</p>
                  <p className="mt-1 text-xs text-[var(--color-ns-muted)]">Upload a song or try the sample track — it'll show up here with its key, BPM and chords.</p>
                </div>
                <Link to="/upload" className="btn-primary px-4 py-2 text-xs">
                  Analyze a song
                </Link>
              </div>
            )}
      </div>
    </section>
  );
}
