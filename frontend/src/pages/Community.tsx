import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFeed, addPost, toggleLike, timeAgo, type CommunityPost } from "../lib/community";
import { getLibrary, type SavedAnalysis } from "../lib/library";
import { useMvp } from "../lib/MvpContext";

type CommunityTab = "discover" | "following" | "my-posts";

interface LeaderboardUser {
  rank: number;
  name: string;
  instrument: string;
  xp: number;
  avatarBg: string;
}

const TOP_PRACTICERS: LeaderboardUser[] = [
  { rank: 1, name: "Marcus Chen", instrument: "Guitar", xp: 1420, avatarBg: "from-purple-600 to-indigo-600" },
  { rank: 2, name: "Elena Rostova", instrument: "Piano", xp: 1180, avatarBg: "from-blue-600 to-cyan-600" },
  { rank: 3, name: "Wilbur Nathan", instrument: "Guitar", xp: 950, avatarBg: "from-violet-600 to-purple-800" },
  { rank: 4, name: "Jordan Brooks", instrument: "Bass", xp: 740, avatarBg: "from-cyan-600 to-blue-700" },
  { rank: 5, name: "Aria Thorne", instrument: "Ukulele", xp: 620, avatarBg: "from-emerald-600 to-teal-700" },
];

export function Community() {
  const navigate = useNavigate();
  const { setSong, setAnalysis } = useMvp();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [tab, setTab] = useState<CommunityTab>("discover");
  const [draft, setDraft] = useState("");
  const [attachId, setAttachId] = useState<string>("");
  const [library, setLibrary] = useState<SavedAnalysis[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  function handleShare(id: string) {
    void navigator.clipboard.writeText(`${window.location.origin}/community#post-${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
  }

  function handleOpenAttached(post: CommunityPost) {
    if (!post.attachedSongId) return;
    const saved = library.find((s) => s.id === post.attachedSongId);
    if (!saved) return;
    setSong({ fileName: saved.fileName, fileSizeBytes: 0, audioUrl: null, isSampleAudio: false });
    setAnalysis(saved.analysis);
    navigate("/analysis");
  }

  const filteredPosts = posts.filter((post) => {
    if (tab === "my-posts") {
      return post.authorName.toLowerCase().includes("wilbur") || post.authorInitials === "WN";
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-[var(--color-ns-border)] pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              Musician Community
            </span>
            <span className="inline-flex items-center rounded-md border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-ns-muted)]">
              Studio Feed
            </span>
          </div>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-[var(--color-ns-text)] sm:text-3xl">
            Community Feed & Musician Logs
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--color-ns-muted)]">
            Share your practice breakthroughs, song charts, and theory insights with fellow musicians.
          </p>
        </div>

        {/* Tab pills: Discover, Following, My Posts */}
        <div className="flex gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setTab("discover")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              tab === "discover"
                ? "bg-primary text-white font-bold shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            Discover
          </button>
          <button
            type="button"
            onClick={() => setTab("following")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              tab === "following"
                ? "bg-primary text-white font-bold shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            Following
          </button>
          <button
            type="button"
            onClick={() => setTab("my-posts")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              tab === "my-posts"
                ? "bg-primary text-white font-bold shadow-sm"
                : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            }`}
          >
            My Posts
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Feed column */}
        <div className="space-y-4">
          {filteredPosts.length === 0 ? (
            <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-10 text-center">
              <p className="text-sm text-[var(--color-ns-muted)]">No posts found in this feed view.</p>
              <button
                type="button"
                onClick={() => setTab("discover")}
                className="mt-3 text-xs font-semibold text-primary hover:underline"
              >
                Back to Discover
              </button>
            </div>
          ) : (
            filteredPosts.map((post) => (
              <div
                key={post.id}
                id={`post-${post.id}`}
                className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm transition-all hover:border-[var(--color-ns-border-strong)]"
              >
                <div className="flex items-start gap-3.5">
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--color-ns-border)] bg-gradient-to-br from-primary/30 to-secondary/20 text-xs font-bold text-white shadow-sm">
                    {post.authorInitials}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--color-ns-text)]">{post.authorName}</span>
                        <span className="text-xs text-[var(--color-ns-muted)]">· {timeAgo(post.createdAt)}</span>
                      </div>
                    </div>

                    <p className="mt-2 text-sm leading-relaxed text-[var(--color-ns-text)]">{post.text}</p>

                    {(post.attachedSongId || post.attachedSongLabel) && (
                      <button
                        type="button"
                        onClick={() => handleOpenAttached(post)}
                        disabled={!post.attachedSongId}
                        className="mt-3.5 flex w-full items-center justify-between rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-3 text-left transition-all enabled:hover:border-primary/40 enabled:hover:bg-[var(--color-ns-bg)] disabled:cursor-default"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-secondary/30 bg-secondary/10 text-secondary">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 18V5l12-2v13" />
                              <circle cx="6" cy="18" r="3" />
                              <circle cx="18" cy="16" r="3" />
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[var(--color-ns-text)]">
                              {post.attachedSongId
                                ? library.find((s) => s.id === post.attachedSongId)?.fileName
                                : post.attachedSongLabel}
                            </p>
                            <p className="text-[10px] text-[var(--color-ns-muted)]">Attached Song Chart</p>
                          </div>
                        </div>

                        {post.attachedSongId && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                            <span>Open Chart</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="5" y1="12" x2="19" y2="12" />
                              <polyline points="12 5 19 12 12 19" />
                            </svg>
                          </span>
                        )}
                      </button>
                    )}

                    {/* Post Interactions: Like, Comment, Share */}
                    <div className="mt-4 flex items-center gap-6 border-t border-[var(--color-ns-border)] pt-3">
                      <button
                        type="button"
                        onClick={() => handleLike(post.id)}
                        className={`flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-95 ${
                          post.liked ? "text-pink font-bold" : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                        }`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill={post.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                        <span>{post.likes}</span>
                      </button>

                      <span className="flex items-center gap-1.5 text-xs text-[var(--color-ns-muted)] cursor-pointer hover:text-[var(--color-ns-text)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        </svg>
                        Comment
                      </span>

                      <button
                        type="button"
                        onClick={() => handleShare(post.id)}
                        className="flex items-center gap-1.5 text-xs text-[var(--color-ns-muted)] hover:text-primary transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                        {copiedId === post.id ? <span className="text-ns-mint font-semibold">Link copied!</span> : "Share"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sidebar Column */}
        <div className="space-y-5">
          {/* Share with the Community Card */}
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <h2 className="font-heading text-sm font-bold text-[var(--color-ns-text)]">Share with the Community</h2>
            <p className="mt-1 text-xs text-[var(--color-ns-muted)]">
              Share what song or technique you practiced today.
            </p>

            <form onSubmit={handlePost} className="mt-4 space-y-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What song or technique did you practice today?"
                rows={4}
                className="input-base resize-none w-full text-xs rounded-xl"
              />

              {library.length > 0 && (
                <div>
                  <label className="block text-[11px] font-medium text-[var(--color-ns-muted)] mb-1">
                    Attach Song from Library (Optional)
                  </label>
                  <select
                    value={attachId}
                    onChange={(e) => setAttachId(e.target.value)}
                    className="input-base w-full text-xs rounded-xl"
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
                className="btn-primary w-full py-2.5 text-xs font-semibold"
              >
                Publish Post
              </button>
            </form>
          </div>

          {/* Top Practicers Widget */}
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
                Top Practicers
              </h3>
              <span className="text-[11px] font-semibold text-primary">Weekly</span>
            </div>

            <div className="space-y-3">
              {TOP_PRACTICERS.map((user) => (
                <div key={user.rank} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      user.rank === 1 ? "bg-amber-400/20 text-amber-300" :
                      user.rank === 2 ? "bg-slate-300/20 text-slate-200" :
                      user.rank === 3 ? "bg-amber-600/20 text-amber-500" :
                      "text-[var(--color-ns-muted)]"
                    }`}>
                      #{user.rank}
                    </span>
                    <span className={`h-7 w-7 rounded-lg bg-gradient-to-br ${user.avatarBg} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0`}>
                      {user.name.split(" ").map((n) => n[0]).join("")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--color-ns-text)]">{user.name}</p>
                      <p className="text-[10px] text-[var(--color-ns-muted)]">{user.instrument}</p>
                    </div>
                  </div>

                  <span className="font-mono text-xs font-bold text-ns-mint flex-shrink-0">
                    {user.xp} XP
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Guidelines */}
          <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">Community Guidelines</h3>
            <ul className="mt-2.5 space-y-2 text-xs text-[var(--color-ns-muted)]">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Keep feedback constructive and supportive.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                Share chords, tabs, and scale tips.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-ns-mint" />
                Have fun making music together!
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
