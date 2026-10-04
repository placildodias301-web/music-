import { Link } from "react-router-dom";
import type { SavedAnalysis } from "../../lib/library";
import { ICON, Icon } from "./icons";
import { keyShort, stripExtension, topChords } from "./homeUtils";

interface RecentAnalysesProps {
  items: SavedAnalysis[];
  totalCount: number;
  onOpenItem: (item: SavedAnalysis) => void;
}

function formatDuration(analysis: SavedAnalysis["analysis"]): string {
  if (analysis.duration) return analysis.duration;
  if (analysis.durationSeconds && analysis.durationSeconds > 0) {
    const mins = Math.floor(analysis.durationSeconds / 60);
    const secs = Math.floor(analysis.durationSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return "—";
}

/** Parses "Artist - Title" pattern if present in fileName, or defaults gracefully */
function parseTitleAndArtist(fileName: string): { title: string; subtitle: string } {
  const clean = stripExtension(fileName);
  if (clean.includes(" - ")) {
    const parts = clean.split(" - ");
    return {
      title: parts.slice(1).join(" - ").trim(),
      subtitle: parts[0].trim(),
    };
  }
  return {
    title: clean,
    subtitle: fileName,
  };
}

export function RecentAnalyses({ items, totalCount, onOpenItem }: RecentAnalysesProps) {
  return (
    <section aria-labelledby="recent-analyses-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="recent-analyses-heading" className="font-heading text-lg font-bold text-ns-text">
            Recent Analyses
          </h2>
          <p className="mt-0.5 text-xs text-ns-muted">
            {totalCount > 0
              ? `${totalCount} track${totalCount === 1 ? "" : "s"} saved with chord timeline and key`
              : "Saved song analyses appear here"}
          </p>
        </div>
        {totalCount > 0 && (
          <Link to="/library" className="ns-link flex-shrink-0 text-sm">
            View all
            <Icon size={14}>{ICON.arrowRight}</Icon>
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="ns-card flex flex-col items-center justify-center p-8 text-center sm:p-12">
          <div className="ns-icon-tile ns-accent-blue mb-4 h-12 w-12 rounded-2xl">
            <Icon size={24}>{ICON.music}</Icon>
          </div>
          <h3 className="font-heading text-base font-bold text-ns-text">No saved analyses yet</h3>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-ns-muted">
            Analyze a song, then save it here.
          </p>
          <Link to="/upload" className="ns-btn-primary mt-5 px-5 text-xs">
            <Icon size={15}>{ICON.upload}</Icon>
            Analyze a Song
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-2">
          {items.map((item) => {
            const { title, subtitle } = parseTitleAndArtist(item.fileName);
            const chords = topChords(item.analysis, 4);
            const duration = formatDuration(item.analysis);

            return (
              <div
                key={item.id}
                aria-label={`Open analysis for ${title}`}
                onClick={() => onOpenItem(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenItem(item);
                  }
                }}
                role="button"
                tabIndex={0}
                className="ns-card ns-card-interactive group flex cursor-pointer flex-col justify-between p-4 focus-visible:outline-none"
              >
                {/* Header: Artwork + Titles + Duration / Play badge */}
                <div className="flex items-start gap-3.5">
                  {/* Music artwork disc / tile */}
                  <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ns-border bg-ns-bg-2 shadow-inner">
                    {/* Subtle vinyl groove background */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(77,163,255,0.15)_0%,rgba(18,24,29,0.9)_70%)]"
                    />
                    <span className="relative font-heading text-base font-bold text-ns-text group-hover:scale-105 transition-transform">
                      {keyShort(item.analysis)}
                    </span>
                    {/* Hover play icon overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-ns-coral/90 text-ns-ink opacity-0 transition-opacity group-hover:opacity-100">
                      <Icon size={18}>{ICON.play}</Icon>
                    </div>
                  </div>

                  {/* Title and metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-heading text-sm font-bold text-ns-text group-hover:text-ns-coral transition-colors" title={title}>
                        {title}
                      </h3>
                      <span className="font-mono text-[11px] font-medium text-ns-muted">
                        {duration}
                      </span>
                    </div>

                    <p className="mt-0.5 truncate text-xs text-ns-muted" title={subtitle}>
                      {subtitle}
                    </p>

                    <div className="mt-2 flex items-center gap-1.5 text-xs text-ns-blue">
                      <span className="font-medium text-ns-text/90">{item.analysis.key}</span>
                      <span className="text-ns-muted/60">·</span>
                      <span className="text-ns-muted/90">{item.analysis.bpm} BPM</span>
                      <span className="text-ns-muted/60">·</span>
                      <span className="text-ns-muted/90">{item.analysis.timeSignature || "4/4"}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom row: Detected chords + Open action */}
                <div className="mt-4 flex items-center justify-between border-t border-ns-border/60 pt-3">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    {chords.length > 0 ? (
                      chords.map((chord) => (
                        <span key={chord} className="ns-chord text-[11px]">
                          {chord}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-ns-muted/70">No chords detected</span>
                    )}
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ns-muted group-hover:text-ns-text transition-colors">
                    <span>Open</span>
                    <Icon size={12} className="transition-transform group-hover:translate-x-0.5">
                      {ICON.arrowRight}
                    </Icon>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
