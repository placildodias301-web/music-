import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { settingsService } from "./settingsService";
import type { Settings } from "./model";
import { SettingsContext, type SettingsContextValue } from "./settingsContext";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * Holds the settings for the whole app and applies the app-wide ones
 * (theme, accent, text size, reduced motion) as attributes on <html>, so
 * they take effect instantly everywhere through CSS.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => settingsService.load());
  const prefersLight = useMediaQuery("(prefers-color-scheme: light)");
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Another tab (or the service) changed them.
  useEffect(() => settingsService.subscribe(() => setSettings(settingsService.load())), []);

  const replace = useCallback((next: Settings) => {
    setSettings(next);
    return settingsService.save(next);
  }, []);

  const update = useCallback<SettingsContextValue["update"]>(
    (section, patch) => {
      const current = settings[section];
      const value = typeof current === "object" && current !== null && !Array.isArray(current) ? { ...current, ...(patch as object) } : patch;
      return replace({ ...settings, [section]: value } as Settings);
    },
    [settings, replace]
  );

  const { appearance, accent, textSize } = settings.app;
  const resolvedTheme = appearance === "system" ? (prefersLight ? "light" : "dark") : appearance;
  const reduceMotion = settings.app.reduceMotion || prefersReducedMotion;

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = resolvedTheme;
    html.dataset.accent = accent;
    html.dataset.textSize = textSize;
    html.dataset.reduceMotion = String(settings.app.reduceMotion);
    html.style.colorScheme = resolvedTheme;
    html.lang = settings.app.language;
  }, [resolvedTheme, accent, textSize, settings.app.reduceMotion, settings.app.language]);

  const value = useMemo(
    () => ({ settings, update, replace, resolvedTheme, reduceMotion }) as SettingsContextValue,
    [settings, update, replace, resolvedTheme, reduceMotion]
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
