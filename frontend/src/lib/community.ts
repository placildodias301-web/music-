/**
 * Community — Section "03 Desktop / Community" of the Figma board.
 *
 * This is a local, single-browser demo feed (localStorage), not a real
 * social network with other users — there's no backend/auth for that in
 * this MVP. It's seeded with a few realistic posts so the feed doesn't look
 * empty, and the user's own posts (optionally attaching a real saved
 * analysis) are added on top and persist across refreshes on this device.
 */

export interface CommunityPost {
  id: string;
  authorName: string;
  authorInitials: string;
  isYou: boolean;
  text: string;
  createdAt: string; // ISO timestamp
  attachedSongId: string | null; // links to a SavedAnalysis.id when set by the current user
  attachedSongLabel: string | null; // display label for seeded posts with no real backing analysis
  likes: number;
  liked: boolean;
}

const STORAGE_KEY = "wilsify_community_v1";

const SEED_POSTS: CommunityPost[] = [
  {
    id: "seed-1",
    authorName: "Riya B.",
    authorInitials: "RB",
    isYou: false,
    text: "Finally got the F# minor bridge clean at full tempo. Wilsify's difficulty score called this one 'Advanced' and it was not lying 😅",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    attachedSongId: null,
    attachedSongLabel: "Neon Alleyway · F#m · 98 BPM",
    likes: 4,
    liked: false,
  },
  {
    id: "seed-2",
    authorName: "Milan I.",
    authorInitials: "MI",
    isYou: false,
    text: "Used the stem split to isolate the vocal line and figure out a harmony part. Rough but it worked!",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    attachedSongId: null,
    attachedSongLabel: null,
    likes: 2,
    liked: false,
  },
  {
    id: "seed-3",
    authorName: "Kabir S.",
    authorInitials: "KS",
    isYou: false,
    text: "Live session right now, working through open chords for beginners joining today.",
    createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    attachedSongId: null,
    attachedSongLabel: null,
    likes: 6,
    liked: false,
  },
  {
    id: "seed-4",
    authorName: "Anaya N.",
    authorInitials: "AN",
    isYou: false,
    text: "Exported my first chord chart PDF today — printed it and stuck it on the wall next to my desk.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    attachedSongId: null,
    attachedSongLabel: null,
    likes: 3,
    liked: false,
  },
];

function readAll(): CommunityPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      writeAll(SEED_POSTS);
      return SEED_POSTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_POSTS;
  } catch {
    return SEED_POSTS;
  }
}

function writeAll(posts: CommunityPost[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch {
    // non-fatal for the demo
  }
}

export function getFeed(): CommunityPost[] {
  return readAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addPost(text: string, attachedSongId: string | null): CommunityPost {
  const post: CommunityPost = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    authorName: "You",
    authorInitials: "WF",
    isYou: true,
    text,
    createdAt: new Date().toISOString(),
    attachedSongId,
    attachedSongLabel: null,
    likes: 0,
    liked: false,
  };
  writeAll([post, ...readAll()]);
  return post;
}

export function toggleLike(id: string) {
  const posts = readAll().map((p) =>
    p.id === id ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 } : p
  );
  writeAll(posts);
  return posts;
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
