/** Profile display helpers and validation (no server: these are the only checks). */

import type { Profile, ProfileLinks } from "./model";

export function initialsOf(name: string): string {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return initials || "?";
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || "Musician";
}

export function profileSubtitle(profile: Profile): string {
  return [profile.instruments.slice(0, 2).join(", "), profile.skill].filter(Boolean).join(" · ");
}

export const BIO_MAX = 160;
export const DISPLAY_NAME_MAX = 50;

/** 3–20 characters: lowercase letters, numbers, dot and underscore; no leading/trailing dot. */
export function usernameError(username: string): string | null {
  if (!username) return null; // optional until accounts exist
  if (username.length < 3) return "At least 3 characters.";
  if (username.length > 20) return "20 characters at most.";
  if (!/^[a-z0-9._]+$/.test(username)) return "Use lowercase letters, numbers, dots and underscores only.";
  if (/^\.|\.$|\.\./.test(username)) return "Dots can't be at the start, end, or next to each other.";
  return null;
}

export const LINK_FIELDS: { key: keyof ProfileLinks; label: string; hosts: string[]; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"], placeholder: "https://instagram.com/yourname" },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"], placeholder: "https://youtube.com/@yourchannel" },
  { key: "spotify", label: "Spotify", hosts: ["spotify.com"], placeholder: "https://open.spotify.com/artist/…" },
  { key: "soundcloud", label: "SoundCloud", hosts: ["soundcloud.com"], placeholder: "https://soundcloud.com/yourname" },
  { key: "website", label: "Website", hosts: [], placeholder: "https://yoursite.com" },
];

/** Valid http(s) URL, and on the right site for platform links. */
export function linkError(value: string, hosts: string[]): string | null {
  if (!value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "Enter a full link starting with https://";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "Links must start with https://";
  if (hosts.length && !hosts.some((h) => url.hostname === h || url.hostname.endsWith("." + h))) {
    return `That isn't a ${hosts[0]} link.`;
  }
  return null;
}
