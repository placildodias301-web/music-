import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getLibrary, removeFromLibrary, toggleFavorite, markPracticed, type SavedAnalysis } from "../lib/library";
import { useMvp } from "../lib/MvpContext";
import { ConfirmDialog } from "../components/ui";

type Tab = "all" | "recent" | "favorites" | "practiced";

function parseTitleAndArtist(fileName: string): { title: string; artist: string } {
  const clean = fileName.replace(/\.[^/.]+$/, "");
  if (clean.includes(" - ")) {
    const [part1, ...rest] = clean.split(" - ");
    return { artist: part1.trim(), title: rest.join(" - ").trim() };
  }
  return { title: clean, artist: "Original Track" };
}

export function Library() {
  const navigate = useNavigate();
  const { setSong, setAnalysis } = useMvp();
  const [items, setItems] = useState<SavedAnalysis[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  // Follow new searches from the header bar while already on this page.
  const urlQuery = searchParams.get("q");
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== null) setQuery(urlQuery);
  }

  useEffect(() => {
    setItems(getLibrary());
  }, []);

  const [pendingRemove, setPendingRemove] = useState<SavedAnalysis | null>(null);

  function handleRemove() {
    if (!pendingRemove) return;
    removeFromLibrary(pendingRemove.id);
    setItems(getLibrary());
    setPendingRemove(null);
  }

  function handleToggleFav(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    toggleFavorite(id);
    setItems(getLibrary());
  }

  function handleOpen(item: SavedAnalysis) {
    setSong({ fileName: item.fileName, fileSizeBytes: 0, audioUrl: null, isSampleAudio: false });
    setAnalysis(item.analysis);
    navigate("/analysis");
  }

  function handlePractice(item: SavedAnalysis) {
    markPracticed(item.id);
    setSong({ fileName: item.fileName, fileSizeBytes: 0, audioUrl: null, isSampleAudio: false });
    setAnalysis(item.analysis);
    navigate("/practice");
  }

  const filtered = items
    .filter((item) => {
      if (tab === "favorites") return Boolean(item.favorite);
      if (tab === "practiced") return Boolean(item.lastPracticed);
      if (tab === "recent") {
        const itemTime = new Date(item.savedAt).getTime();
        return itemTime > 0;
      }
      return true;
    })
    .filter((item) =>
      item.fileName.toLowerCase().includes(query.trim().toLowerCase())
    );

  const favCount = items.filter((i) => i.favorite).length;
  const practicedCount = items.filter((i) => i.lastPracticed).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header section */}
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-[var(--color-ns-border)] pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md border border-secondary/30 bg-secondary/10 px-2.5 py-0.5 text-[11px] font-semibold text-secondary">
              Personal Collection
            </span>
            <span className="inline-flex items-center rounded-md border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-ns-muted)]">
              {items.length} {items.length === 1 ? "track" : "tracks"}
            </span>
          </div>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-3xl">
            Song Library
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--color-ns-muted)]">
            Access your saved tracks, detected chord charts, and practice setups anytime.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/upload")}
            className="btn-primary flex items-center gap-2"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Upload Track
          </button>
        </div>
      </div>

      {/* Tabs & Search Row */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Tabs: All, Recent, Favorites, Practiced */}
        <div className="flex gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              tab === "all"
                ? "bg-primary text-white font-bold shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("recent")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              tab === "recent"
                ? "bg-primary text-white font-bold shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            Recent
          </button>
          <button
            type="button"
            onClick={() => setTab("favorites")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              tab === "favorites"
                ? "bg-primary text-white font-bold shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            <span>Favorites</span>
            {favCount > 0 && <span className="opacity-70 text-[10px]">({favCount})</span>}
          </button>
          <button
            type="button"
            onClick={() => setTab("practiced")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              tab === "practiced"
                ? "bg-primary text-white font-bold shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            <span>Practiced</span>
            {practicedCount > 0 && <span className="opacity-70 text-[10px]">({practicedCount})</span>}
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-ns-muted)]"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter your saved songs"
            placeholder="Search saved songs…"
            className="input-base pl-9 pr-8 w-full rounded-xl text-xs py-2"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {items.length === 0 ? (
        <div className="mx-auto my-12 max-w-md rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-8 text-center sm:p-12 shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-primary shadow-md">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <h2 className="mt-4 font-heading text-lg font-bold text-[var(--color-ns-text)]">No Saved Tracks Yet</h2>
          <p className="mt-2 text-xs sm:text-sm text-[var(--color-ns-muted)] leading-relaxed">
            Upload an audio or video file, analyze its key, tempo, and chord progression, then click "Save to Library" to keep it here for quick practice.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/upload")}
              className="btn-primary text-xs sm:text-sm"
            >
              Upload a Track
            </button>
            <button
              type="button"
              onClick={() => navigate("/studio")}
              className="btn-secondary text-xs sm:text-sm"
            >
              Return to Studio
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-auto max-w-md rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-8 text-center">
          <p className="text-sm text-[var(--color-ns-muted)]">
            {query ? `No saved tracks match “${query}”.` : "No tracks found in this category."}
          </p>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-3 text-xs font-semibold text-primary hover:underline"
            >
              Clear search query
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item, index) => {
            const { title, artist } = parseTitleAndArtist(item.fileName);
            const uniqueChords = Array.from(new Set(item.analysis.chordProgression)).slice(0, 4);
            const gradients = [
              "from-purple-900/60 to-blue-900/40",
              "from-indigo-900/60 to-cyan-900/40",
              "from-violet-900/60 to-slate-900/40",
              "from-blue-900/60 to-purple-900/40",
            ];
            const grad = gradients[index % gradients.length];

            return (
              <div
                key={item.id}
                className="group flex flex-col justify-between rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm transition-all hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]"
              >
                <div>
                  {/* Top: Artwork + Title/Artist + Fav/Remove */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Song Artwork Avatar */}
                      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-gradient-to-br ${grad} text-primary shadow-sm group-hover:scale-105 transition-transform`}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate font-heading text-sm font-bold text-[var(--color-ns-text)] group-hover:text-primary transition-colors" title={item.fileName}>
                          {title}
                        </h3>
                        <p className="truncate text-xs text-[var(--color-ns-muted)]">
                          {artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Favorite Button */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleFav(item.id, e)}
                        aria-label={item.favorite ? "Unmark favorite" : "Mark as favorite"}
                        title={item.favorite ? "Unmark favorite" : "Mark as favorite"}
                        className={`p-1.5 rounded-lg transition-colors ${
                          item.favorite
                            ? "text-pink bg-pink/15 hover:bg-pink/25"
                            : "text-[var(--color-ns-muted)] hover:text-pink hover:bg-pink/10"
                        }`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill={item.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                      </button>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => setPendingRemove(item)}
                        aria-label={`Remove ${item.fileName} from library`}
                        className="text-[var(--color-ns-muted)] hover:text-pink transition-colors p-1.5 rounded-lg hover:bg-pink/10"
                        title="Remove from library"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Badges: Key, BPM, Duration, Difficulty */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {item.analysis.key} {item.analysis.scale}
                    </span>
                    <span className="rounded-md border border-secondary/25 bg-secondary/10 px-2 py-0.5 text-[11px] font-semibold text-secondary">
                      {item.analysis.bpm} BPM
                    </span>
                    {item.analysis.duration && (
                      <span className="rounded-md border border-[var(--color-ns-border)] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--color-ns-muted)]">
                        {item.analysis.duration}
                      </span>
                    )}
                  </div>

                  {/* Chords preview */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-[var(--color-ns-muted)]">
                      <span>Chords</span>
                      {item.lastPracticed && (
                        <span className="normal-case text-[10px] text-ns-mint font-medium">
                          Practiced recently
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {uniqueChords.map((chord) => (
                        <span
                          key={chord}
                          className="rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-ns-text)]"
                        >
                          {chord}
                        </span>
                      ))}
                      {Array.from(new Set(item.analysis.chordProgression)).length > 4 && (
                        <span className="text-[10px] text-[var(--color-ns-muted)] font-mono">
                          +{Array.from(new Set(item.analysis.chordProgression)).length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-5 pt-3.5 border-t border-[var(--color-ns-border)] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpen(item)}
                    className="btn-primary flex-1 py-1.5 text-xs font-semibold"
                  >
                    Open Analysis
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePractice(item)}
                    className="btn-secondary py-1.5 text-xs font-semibold"
                    title="Practice chords for this song"
                  >
                    Practice Studio
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove from library?"
        body={
          <>
            <span className="font-semibold text-[var(--color-ns-text)]">{pendingRemove?.fileName}</span> and its saved chords will be
            removed from this device. This cannot be undone.
          </>
        }
        confirmLabel="Remove"
        destructive
        onConfirm={handleRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}
