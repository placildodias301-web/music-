import { useEffect, useRef, useState } from "react";
import { searchYouTube, type YouTubeVideo } from "../../lib/api";

const DEFAULT_QUERY = "trending songs";
const QUICK_SEARCHES = ["Trending songs", "Acoustic covers", "Guitar lessons", "Piano songs", "Lofi", "Bollywood hits"];

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function formatViews(views: number | null): string {
  if (!views) return "";
  if (views >= 1e9) return `${(views / 1e9).toFixed(1)}B views`;
  if (views >= 1e6) return `${(views / 1e6).toFixed(1)}M views`;
  if (views >= 1e3) return `${Math.round(views / 1e3)}K views`;
  return `${views} views`;
}

interface YouTubeBrowserProps {
  /** Called with the picked video, or null when the pick is cleared. */
  onSelect: (video: YouTubeVideo | null) => void;
  selected: YouTubeVideo | null;
  disabled?: boolean;
}

/**
 * In-app YouTube browser: search, browse thumbnails, preview in the embedded
 * player and pick a video to analyze. youtube.com itself can't be framed, so
 * search runs through the backend and playback uses YouTube's embed player.
 */
export function YouTubeBrowser({ onSelect, selected, disabled = false }: YouTubeBrowserProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function runSearch(q: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      setResults(await searchYouTube(q, 12, controller.signal));
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    void runSearch(DEFAULT_QUERY);
    return () => abortRef.current?.abort();
  }, []);

  return (
    <div className="rounded-2xl border border-ns-border bg-white/[0.015] p-4 sm:p-5">
      {/* Search bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) void runSearch(query.trim());
        }}
        role="search"
        className="flex h-11 items-stretch overflow-hidden rounded-full border border-ns-border bg-ns-raised transition-colors focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_rgba(108,77,255,0.15)]"
      >
        <label className="flex min-w-0 flex-1 cursor-text items-center gap-2.5 pl-4 pr-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-content-dim" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            enterKeyHint="search"
            aria-label="Search YouTube"
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search YouTube for a song…"
            style={{ boxShadow: "none", outline: "none" }}
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-content placeholder:text-content-dim"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-content-dim transition-colors hover:bg-white/[0.06] hover:text-content"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </label>
        <button
          type="submit"
          aria-label="Search"
          disabled={disabled || !query.trim()}
          className="flex w-16 flex-shrink-0 items-center justify-center border-l border-ns-border bg-white/[0.05] text-content transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:text-content-dim disabled:hover:bg-white/[0.05]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </form>

      <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {QUICK_SEARCHES.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => {
              setQuery(q);
              void runSearch(q);
            }}
            className="flex-shrink-0 rounded-lg border border-ns-border bg-ns-raised px-3 py-1 text-[11px] font-medium text-content-muted transition-colors hover:border-ns-border-strong hover:text-content"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Player for the picked video */}
      {selected && (
        <div className="mt-4 overflow-hidden rounded-xl border border-primary/40 bg-primary/5">
          <div className="relative aspect-video w-full bg-black">
            <iframe
              key={selected.id}
              src={`https://www.youtube-nocookie.com/embed/${selected.id}?autoplay=1&rel=0`}
              title={selected.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <div className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-content">{selected.title}</p>
              <p className="truncate text-[11px] text-content-dim">{selected.channel}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <span className="rounded-full bg-ns-mint/15 px-2.5 py-0.5 text-[11px] font-semibold text-ns-mint">Selected</span>
              <button
                type="button"
                aria-label="Clear selected video"
                disabled={disabled}
                onClick={() => onSelect(null)}
                className="flex h-6 w-6 items-center justify-center rounded text-content-dim hover:text-content"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {error && <p className="mt-4 text-xs text-[#FF4D5E]">{error}</p>}
      <div className="mt-4 grid max-h-[460px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
        {loading && results.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video rounded-xl bg-white/[0.05]" />
                <div className="mt-2 h-3 w-4/5 rounded bg-white/[0.05]" />
                <div className="mt-1.5 h-2.5 w-1/2 rounded bg-white/[0.05]" />
              </div>
            ))
          : results.map((v) => {
              const unavailable = v.isLive || v.tooLong;
              const active = selected?.id === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={disabled || unavailable}
                  onClick={() => onSelect(v)}
                  title={unavailable ? "Live streams and videos over 20 minutes can't be analyzed" : v.title}
                  className={`group rounded-xl p-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    active ? "bg-primary/15 ring-1 ring-primary/60" : "hover:bg-white/[0.04]"
                  } ${loading ? "opacity-60" : ""}`}
                >
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                    <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    {(v.durationSeconds || v.isLive) && (
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {v.isLive ? "LIVE" : formatDuration(v.durationSeconds)}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs font-semibold leading-snug text-content">{v.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-content-dim">
                    {[v.channel, formatViews(v.views)].filter(Boolean).join(" · ")}
                  </p>
                </button>
              );
            })}
      </div>
      {!loading && !error && results.length === 0 && (
        <p className="mt-2 text-center text-xs text-content-dim">No videos found. Try another search.</p>
      )}
    </div>
  );
}
