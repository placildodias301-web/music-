import { createContext, useContext } from "react";
import type { Settings } from "./model";

type Section = Exclude<keyof Settings, "version">;

export interface SettingsContextValue {
  settings: Settings;
  /** Merge a patch into one section, e.g. update("audio", { a4: 442 }). Saves immediately. */
  update: <K extends Section>(section: K, patch: Settings[K] extends object ? Partial<Settings[K]> : Settings[K]) => boolean;
  /** Replace the whole settings object (used by Edit Profile's explicit Save). */
  replace: (next: Settings) => boolean;
  /** The theme actually showing (System resolved against the device). */
  resolvedTheme: "dark" | "light";
  /** Reduce motion from the setting OR the device preference. */
  reduceMotion: boolean;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>");
  return ctx;
}
