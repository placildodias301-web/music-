/**
 * Local profile preferences (Account page). Stored in localStorage — this
 * MVP has no auth backend, so there is one profile per browser.
 */

export interface AccountPrefs {
  name: string;
  instruments: string;
  level: string;
  improveAi: boolean;
  referencePitch: number;
  metronomeSound: string;
}

const STORAGE_KEY = "wilsify_account_v1";

/** Fired on window after prefs are saved, so the app shell can refresh. */
export const ACCOUNT_CHANGED_EVENT = "wilsify:account-changed";

export const DEFAULT_PREFS: AccountPrefs = {
  name: "Wilbur Nathan Fernandes",
  instruments: "Guitar",
  level: "Intermediate",
  improveAi: false,
  referencePitch: 440,
  metronomeSound: "digital",
};

export function loadPrefs(): AccountPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: AccountPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // non-fatal for the demo
  }
  window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
}

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
