import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFeed, addPost, toggleLike, timeAgo, type CommunityPost } from "../lib/community";
import { getLibrary, type SavedAnalysis } from "../lib/library";
import { useMvp } from "../lib/MvpContext";

export function Community() {
  const navigate = useNavigate();
  const { setSong, setAnalysis } = useMvp();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [draft, setDraft] = useState("");
  const [attachId, setAttachId] = useState<string>("");
  const [library, setLibrary] = useState<SavedAnalysis[]>([]);

  useEffect(() => {
    setPosts(getFeed());
    setLibrary(getLibrary());
  }, []);

  function handlePost(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    addPost(text, attachId || null);
    setPosts(getFeed());
    setDraft("");
    setAttachId("");
  }

  function handleLike(id: string) {
    setPosts(toggleLike(id));
  }

  function handleOpenAttached(post: CommunityPost) {
    if (!post.attachedSongId) return;
    const saved = library.find((s) => s.id === post.attachedSongId);
    if (!saved) return;
    setSong({ fileName: saved.fileName, fileSizeBytes: 0, audioUrl: null, isSampleAudio: false });
    setAnalysis(saved.analysis);
    navigate("/analysis");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header */}
      <div className="mb-6 border-b border-glass pb-6">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary-light">
            Community Jam
          </span>
          <span className="rounded-full border border-glass bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-content-dim">
            Demo Feed
          </span>
        </div>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-content sm:text-3xl">
          Musician Feed & Activity
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          Share your practice milestones, chord charts, and tips with other musicians. Posts persist locally in your browser.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Feed column */}
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post.id} className="glass-card p-5 transition-all hover:border-glass-strong">
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-xs font-bold text-white shadow-md shadow-primary/20">
                  {post.authorInitials}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-content">{post.authorName}</span>
                      <span className="text-xs text-content-dim">· {timeAgo(post.createdAt)}</span>
                    </div>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-content-light">{post.text}</p>

                  {(post.attachedSongId || post.attachedSongLabel) && (
                    <button
                      type="button"
                      onClick={() => handleOpenAttached(post)}
                      disabled={!post.attachedSongId}
                      className="mt-3.5 flex w-full items-center justify-between rounded-xl border border-glass bg-white/[0.03] p-3 text-left transition-all enabled:hover:border-primary/50 enabled:hover:bg-primary/5 disabled:cursor-default"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-cyan/15 text-cyan">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                          </svg>
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-content">
                            {post.attachedSongId
                              ? library.find((s) => s.id === post.attachedSongId)?.fileName
                              : post.attachedSongLabel}
                          </p>
                          <p className="text-[10px] text-content-dim">Attached Song Chart</p>
                        </div>
                      </div>

                      {post.attachedSongId && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-primary-light">
                          <span>Practice</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </span>
                      )}
                    </button>
                  )}

                  <div className="mt-4 flex items-center gap-5 border-t border-glass pt-3">
                    <button
                      type="button"
                      onClick={() => handleLike(post.id)}
                      className={`flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-95 ${
                        post.liked ? "text-pink" : "text-content-dim hover:text-content"
                      }`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill={post.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                      <span>{post.likes}</span>
                    </button>

                    <span className="flex items-center gap-1.5 text-xs text-content-dim">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                      Reply
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Composer Column */}
        <div className="space-y-4">
          <div className="glass-card p-5 sticky top-24">
            <h2 className="font-heading text-sm font-bold text-content">Share with the Community</h2>
            <p className="mt-1 text-xs text-content-dim">
              Share what you've learned or mastered today.
            </p>

            <form onSubmit={handlePost} className="mt-4 space-y-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What song or technique did you practice today?"
                rows={4}
                className="input-base resize-none w-full text-xs"
              />

              {library.length > 0 && (
                <div>
                  <label className="block text-[11px] font-medium text-content-dim mb-1">
                    Attach Song from Library (Optional)
                  </label>
                  <select
                    value={attachId}
                    onChange={(e) => setAttachId(e.target.value)}
                    className="input-base w-full text-xs"
                  >
                    <option value="">No song attached</option>
                    {library.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fileName} ({s.analysis.key})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={!draft.trim()}
                className="btn-primary w-full py-2 text-xs"
              >
                Publish Post
              </button>
            </form>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-content-dim">Community Guidelines</h3>
            <ul className="mt-2.5 space-y-2 text-xs text-content-muted">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Keep feedback constructive and supportive.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
                Share chords, tabs, and scale tips.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green" />
                Have fun learning music together!
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
