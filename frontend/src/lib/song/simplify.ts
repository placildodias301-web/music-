/**
 * Optional display simplification. The analysed chord is never changed —
 * callers keep `originalChord` and derive `displayChord` from it.
 */
const ROOT = /^([A-G][#b♯♭]?)(.*)$/;

export interface SimplifyOptions {
  /** Drop the slash bass ("C/E" → "C"). */
  dropBass?: boolean;
}

/**
 * Cmaj7 → C, G7 → G, Am7 → Am, Dsus4 → D, Cadd9 → C, C6 → C, F#m9 → F#m.
 * Diminished and augmented chords are kept: they are a different sound,
 * not an extension of a triad.
 */
export function simplifyChord(symbol: string, options: SimplifyOptions = {}): string {
  const m = ROOT.exec(symbol.trim());
  if (!m) return symbol;
  const root = m[1];
  let rest = m[2];
  let bass = "";
  const slash = /\/([A-G][#b♯♭]?)$/.exec(rest);
  if (slash) {
    bass = slash[0];
    rest = rest.slice(0, slash.index);
  }
  if (/^(dim|°|o|aug|\+)/.test(rest) && !/^m(aj)?7|^m\d/.test(rest)) return symbol; // dim / aug stay
  const minor = /^(m(?!aj)|min|-)/.test(rest);
  const out = root + (minor ? "m" : "");
  return options.dropBass ? out : out + bass;
}
