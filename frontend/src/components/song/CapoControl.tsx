import { displayChord } from "../../lib/chordSync";
import { transposeChord } from "../../lib/transpose";
import type { Option } from "../../lib/settings/model";
import { SettingsSelect } from "../settings/SettingsSelect";

const CAPO_OPTIONS: Option<string>[] = Array.from({ length: 13 }, (_, i) => ({ value: String(i), label: i === 0 ? "No capo" : `Capo ${i}` }));

interface Props {
  capo: number;
  onChange: (n: number) => void;
  /** A chord to illustrate concert vs playable shape (the first chord of the song). */
  example?: string;
  suggestions: { capo: number; openShare: number }[];
}

/** Capo 0–12. Chords on the sheet become the shapes to play; concert chords stay available. */
export function CapoControl({ capo, onChange, example, suggestions }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-[var(--color-ns-muted)]">Capo</span>
      <div className="w-36">
        <SettingsSelect variant="field" label="Capo" value={String(capo)} options={CAPO_OPTIONS} onChange={(v) => onChange(Number(v))} />
      </div>
      {capo > 0 && example && (
        <span className="text-xs text-[var(--color-ns-muted)]">
          Concert <strong className="text-[var(--color-ns-text)]">{displayChord(example)}</strong> → play shape <strong className="text-[var(--color-ns-amber)]">{displayChord(transposeChord(example, -capo))}</strong>
        </span>
      )}
      {suggestions.length > 0 && (
        <span className="flex items-center gap-1 text-[11px] text-[var(--color-ns-dim)]">
          Easiest:
          {suggestions.map((s) => (
            <button key={s.capo} type="button" onClick={() => onChange(s.capo)} title={`${Math.round(s.openShare * 100)}% of the song in open shapes`} className="rounded-md border border-[var(--color-ns-border)] px-1.5 py-0.5 text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]">
              {s.capo === 0 ? "no capo" : `capo ${s.capo}`}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
