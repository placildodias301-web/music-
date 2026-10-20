/**
 * Where settings live. Today: this browser's localStorage (there are no
 * accounts yet). The UI only talks to load/save/subscribe/reset, so moving
 * to a backend API later means changing this file, not the pages.
 */

import { DEFAULT_SETTINGS, type Settings, type SkillLevel } from "./model";

const STORAGE_KEY = "wilsify_settings_v1";
const LEGACY_ACCOUNT_KEY = "wilsify_account_v1";
const CHANGED_EVENT = "wilsify:settings-changed";

/** Every localStorage key this app writes (for export, clear and delete). */
export const APP_STORAGE_PREFIXES = ["wilsify"];

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Defaults filled in under whatever was stored, so new settings appear with sane values. */
function mergeDefaults<T>(defaults: T, stored: unknown): T {
  if (!isObject(defaults) || !isObject(stored)) {
    if (stored === undefined || stored === null) return defaults;
    return typeof stored === typeof defaults && Array.isArray(stored) === Array.isArray(defaults) ? (stored as T) : defaults;
  }
  const out: Json = { ...defaults };
  for (const key of Object.keys(defaults)) out[key] = mergeDefaults((defaults as Json)[key], stored[key]);
  return out as T;
}

/** Carries over what the old Account page saved (name, instrument, level, A4, AI opt-in). */
function migrateLegacy(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem(LEGACY_ACCOUNT_KEY);
    if (!raw) return null;
    const old = JSON.parse(raw) as { name?: string; instruments?: string; level?: string; improveAi?: boolean; referencePitch?: number };
    const levels: SkillLevel[] = ["Beginner", "Intermediate", "Advanced", "Pro"];
    return {
      profile: {
        ...DEFAULT_SETTINGS.profile,
        displayName: old.name?.trim() || DEFAULT_SETTINGS.profile.displayName,
        instruments: old.instruments ? old.instruments.split(/[,·]/).map((s) => s.trim()).filter(Boolean) : DEFAULT_SETTINGS.profile.instruments,
        skill: levels.includes(old.level as SkillLevel) ? (old.level as SkillLevel) : DEFAULT_SETTINGS.profile.skill,
      },
      audio: { ...DEFAULT_SETTINGS.audio, a4: Math.min(466, Math.max(415, Number(old.referencePitch) || 440)) },
      privacy: { ...DEFAULT_SETTINGS.privacy, improveAi: Boolean(old.improveAi) },
    };
  } catch {
    return null;
  }
}

export const settingsService = {
  load(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return mergeDefaults(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch {
      // Corrupt or blocked storage: fall through to defaults.
    }
    const legacy = migrateLegacy();
    return legacy ? mergeDefaults(DEFAULT_SETTINGS, legacy) : DEFAULT_SETTINGS;
  },

  save(settings: Settings): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      window.dispatchEvent(new Event(CHANGED_EVENT));
      return true;
    } catch {
      // Quota exceeded (a large avatar) or storage blocked.
      return false;
    }
  },

  /** Fires when settings change in this tab or another one. */
  subscribe(listener: () => void): () => void {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) listener();
    };
    window.addEventListener(CHANGED_EVENT, listener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGED_EVENT, listener);
      window.removeEventListener("storage", onStorage);
    };
  },

  /** Removes every piece of data this app stored in the browser. */
  deleteAllLocalData(): void {
    try {
      for (const key of Object.keys(localStorage)) {
        if (APP_STORAGE_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
      }
      sessionStorage.clear();
    } catch {
      // Nothing more we can do if storage is blocked.
    }
  },
};
