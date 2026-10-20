import { useMemo } from "react";
import { useSettings } from "./settings/settingsContext";
import { formatChord, formatKey, notationLegend, type NotationOptions } from "./notation";

export interface Notation {
  chord: (symbol: string) => string;
  key: (key: string) => string;
  /** Sargam legend line, or null for letters/solfège. */
  legend: string | null;
  options: NotationOptions;
}

/** Chord/key formatting from the Music display settings, for chords in `key`. */
export function useNotation(key: string): Notation {
  const { settings } = useSettings();
  const { accidentals, notation } = settings.display;
  return useMemo(() => {
    const options: NotationOptions = { accidentals, notation, key };
    return {
      chord: (symbol: string) => formatChord(symbol, options),
      key: (k: string) => formatKey(k, options),
      legend: notationLegend(options),
      options,
    };
  }, [accidentals, notation, key]);
}
