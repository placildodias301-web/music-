import type { DisplaySettings as Settings } from "../../lib/song/songStore";

interface Props {
  value: Settings;
  onChange: (next: Settings) => void;
}

const row = "flex items-center justify-between gap-3 text-xs text-[var(--color-ns-muted)]";
const toggle = (on: boolean) => `rounded-lg border px-2.5 py-1 text-xs font-semibold ${on ? "border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)]/15 text-[var(--color-ns-amber)]" : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)]"}`;

export function DisplaySettings({ value, onChange }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4">
      <label className={row}>Chord size
        <input type="range" min={12} max={28} value={value.chordSize} onChange={(e) => set("chordSize", Number(e.target.value))} aria-label="Chord font size" />
      </label>
      <label className={row}>Lyric size
        <input type="range" min={12} max={30} value={value.lyricSize} onChange={(e) => set("lyricSize", Number(e.target.value))} aria-label="Lyric font size" />
      </label>
      <label className={row}>Line spacing
        <input type="range" min={1.3} max={2.6} step={0.1} value={value.lineSpacing} onChange={(e) => set("lineSpacing", Number(e.target.value))} aria-label="Line spacing" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={toggle(value.showChords)} aria-pressed={value.showChords} onClick={() => set("showChords", !value.showChords)}>Chords</button>
        <button className={toggle(value.showLyrics)} aria-pressed={value.showLyrics} onClick={() => set("showLyrics", !value.showLyrics)}>Lyrics</button>
        <button className={toggle(value.simplify)} aria-pressed={value.simplify} onClick={() => set("simplify", !value.simplify)} title="Cmaj7 → C, G7 → G, Am7 → Am. The analysed chords are not changed.">Simplify chords</button>
        <button className={toggle(value.autoScroll)} aria-pressed={value.autoScroll} onClick={() => set("autoScroll", !value.autoScroll)}>Auto scroll</button>
        <button className={toggle(value.light)} aria-pressed={value.light} onClick={() => set("light", !value.light)}>{value.light ? "Light sheet" : "Dark sheet"}</button>
      </div>
    </div>
  );
}
