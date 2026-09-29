import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getLibrary, removeFromLibrary, type SavedAnalysis } from "../lib/library";
import { useMvp } from "../lib/MvpContext";
import { ConfirmDialog } from "../components/ui";

export function Library() {
  const navigate = useNavigate();
  const { setSong, setAnalysis } = useMvp();
  const [items, setItems] = useState<SavedAnalysis[]>([]);
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

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

  function handleOpen(item: SavedAnalysis) {
    // No stored audio file for a saved analysis (localStorage can't hold it) —
    // the chart, chords, difficulty and export all still work from the saved data.
    setSong({ fileName: item.fileName, fileSizeBytes: 0, audioUrl: null, isSampleAudio: false });
    setAnalysis(item.analysis);
    navigate("/analysis");
  }

  const filtered = items.filter((item) =>
    item.fileName.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header section */}
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-glass/80 pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary-light">
              Personal Collection
            </span>
            <span className="rounded-full border border-glass bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-content-dim">
              {items.length} {items.length === 1 ? "track" : "tracks"}
            </span>
          </div>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-content sm:text-3xl">
            Song Library
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Access your saved tracks, detected chord charts, and practice setups anytime.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/upload")}
            className="btn-primary"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Upload Track
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      {items.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-dim"
              width="16"
              height="16"
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
              placeholder="Search by title, key, or artist…"
              className="input-base pl-10 pr-9 w-full"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-content-dim hover:text-content"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          {query && (
            <p className="text-xs text-content-dim">
              Showing {filtered.length} of {items.length} tracks
            </p>
          )}
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 ? (
        <div className="glass-card p-12 text-center max-w-md mx-auto my-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary-light">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <h2 className="mt-4 font-heading text-lg font-bold text-content">Nothing saved in your library yet</h2>
          <p className="mt-2 text-sm text-content-muted leading-relaxed">
            Upload an audio or video file in the Studio, analyze its chords and key, then click "Save to Library" to keep it here permanently.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/upload")}
              className="btn-primary"
            >
              Upload a Song
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="btn-secondary"
            >
              Go to Studio
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center max-w-md mx-auto">
          <p className="text-sm text-content-muted">No saved songs match "{query}".</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-3 text-xs font-semibold text-primary-light hover:underline"
          >
            Clear search filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const uniqueChords = Array.from(new Set(item.analysis.chordProgression)).slice(0, 4);
            return (
              <div
                key={item.id}
                className="glass-card flex flex-col justify-between p-5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-light group-hover:bg-primary/20 transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-heading text-sm font-bold text-content group-hover:text-primary-light transition-colors" title={item.fileName}>
                          {item.fileName}
                        </h3>
                        <p className="mt-0.5 text-xs text-content-dim">
                          Saved track
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPendingRemove(item)}
                      aria-label={`Remove ${item.fileName} from library`}
                      className="text-content-dim hover:text-pink transition-colors p-1 rounded-md hover:bg-pink/10"
                      title="Remove from library"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>

                  {/* Badges: Key, BPM, Scale */}
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary-light">
                      {item.analysis.key}
                    </span>
                    <span className="rounded-md border border-cyan/25 bg-cyan/10 px-2 py-0.5 text-[11px] font-semibold text-cyan">
                      {item.analysis.bpm} BPM
                    </span>
                    {item.analysis.difficulty?.difficultyLabel && (
                      <span className="rounded-md border border-glass bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-content-muted">
                        {item.analysis.difficulty.difficultyLabel}
                      </span>
                    )}
                  </div>

                  {/* Chords preview */}
                  <div className="mt-3">
                    <p className="text-[10px] uppercase font-semibold tracking-wider text-content-dim">Chord preview</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {uniqueChords.map((chord) => (
                        <span
                          key={chord}
                          className="rounded-md border border-glass bg-white/[0.03] px-2 py-0.5 font-mono text-xs font-medium text-content-light"
                        >
                          {chord}
                        </span>
                      ))}
                      {Array.from(new Set(item.analysis.chordProgression)).length > 4 && (
                        <span className="text-[10px] text-content-dim">
                          +{Array.from(new Set(item.analysis.chordProgression)).length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-5 pt-3 border-t border-glass flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpen(item)}
                    className="btn-primary flex-1 py-1.5 text-xs"
                  >
                    View Chart
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpen(item);
                      navigate("/practice");
                    }}
                    className="btn-secondary py-1.5 text-xs"
                    title="Practice chords for this song"
                  >
                    Practice
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Removing is permanent and there is no undo, so confirm first. */}
      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove from library?"
        body={
          <>
            <span className="font-semibold text-content">{pendingRemove?.fileName}</span> and its saved chords will be
            removed from this device. This can’t be undone.
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
