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
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-[var(--color-ns-border)] pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md border border-[var(--color-ns-blue)]/30 bg-[var(--color-ns-blue)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-ns-blue)]">
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
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-ns-muted)]"
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
              className="input-base pl-10 pr-9 w-full rounded-xl text-xs"
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
          {query && (
            <p className="text-xs text-[var(--color-ns-muted)]">
              Showing {filtered.length} of {items.length} tracks
            </p>
          )}
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 ? (
        <div className="mx-auto my-12 max-w-md rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-8 text-center sm:p-12 shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-coral)] shadow-md">
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
          <p className="text-sm text-[var(--color-ns-muted)]">No saved tracks match “{query}”.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-3 text-xs font-semibold text-[var(--color-ns-coral)] hover:underline"
          >
            Clear search query
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const uniqueChords = Array.from(new Set(item.analysis.chordProgression)).slice(0, 4);
            return (
              <div
                key={item.id}
                className="group flex flex-col justify-between rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm transition-all hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] text-[var(--color-ns-coral)] group-hover:border-[var(--color-ns-coral)]/40 transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-heading text-sm font-bold text-[var(--color-ns-text)] group-hover:text-[var(--color-ns-coral)] transition-colors" title={item.fileName}>
                          {item.fileName}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-[var(--color-ns-muted)]">
                          Saved chart
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPendingRemove(item)}
                      aria-label={`Remove ${item.fileName} from library`}
                      className="text-[var(--color-ns-muted)] hover:text-[var(--color-ns-coral)] transition-colors p-1.5 rounded-lg hover:bg-[var(--color-ns-coral)]/10"
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
                    <span className="rounded-md border border-[var(--color-ns-coral)]/25 bg-[var(--color-ns-coral)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ns-coral)]">
                      Key: {item.analysis.key}
                    </span>
                    <span className="rounded-md border border-[var(--color-ns-blue)]/25 bg-[var(--color-ns-blue)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ns-blue)]">
                      {item.analysis.bpm} BPM
                    </span>
                    {item.analysis.difficulty?.difficultyLabel && (
                      <span className="rounded-md border border-[var(--color-ns-border)] bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ns-muted)]">
                        {item.analysis.difficulty.difficultyLabel}
                      </span>
                    )}
                  </div>

                  {/* Chords preview */}
                  <div className="mt-3.5">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-ns-muted)]">Chord progression</p>
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

