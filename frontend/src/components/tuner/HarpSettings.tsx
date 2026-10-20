import { accidentalSymbol, HARP_LETTERS, type HarpAccidental, type HarpAccidentals, type HarpLetter } from "../../lib/tuner/harp";

const FIELD_LABEL = "mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-ns-dim)]";
const OPTIONS: HarpAccidental[] = [-1, 0, 1];

/**
 * Lever / pedal positions: one ♭ ♮ ♯ choice for each of the seven note letters. The named key settings in the Tuning
 * menu fill these in; changing one by hand switches the tuning to "Custom positions". A custom harp also sets its
 * lowest string and string count here.
 */
export function HarpSettings({
  accidentals,
  onAccidentals,
  custom,
  lowest,
  count,
  onRange,
  rangeError,
  pedal,
}: {
  accidentals: HarpAccidentals;
  onAccidentals: (next: HarpAccidentals) => void;
  custom: boolean;
  lowest: string;
  count: number;
  onRange: (lowest: string, count: number) => void;
  rangeError?: string;
  pedal: boolean;
}) {
  function set(letter: HarpLetter, value: HarpAccidental) {
    onAccidentals({ ...accidentals, [letter]: value });
  }
  return (
    <div className="mb-4 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-3">
      {custom && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className={FIELD_LABEL}>Lowest string</span>
            <input
              defaultValue={lowest}
              key={`low-${lowest}`}
              onBlur={(e) => onRange(e.target.value.toUpperCase(), count)}
              aria-label="Lowest string"
              maxLength={3}
              className="w-full rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-2 text-sm text-[var(--color-ns-text)] focus-visible:border-[var(--color-ns-purple)] focus-visible:outline-none"
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>Strings</span>
            <input
              type="number"
              min={5}
              max={60}
              defaultValue={count}
              key={`count-${count}`}
              onBlur={(e) => onRange(lowest, Number(e.target.value))}
              aria-label="Number of strings"
              className="w-full rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-2 text-sm text-[var(--color-ns-text)] focus-visible:border-[var(--color-ns-purple)] focus-visible:outline-none"
            />
          </label>
          {rangeError && (
            <p role="alert" className="col-span-2 text-xs text-[var(--color-ns-red)]">
              {rangeError}
            </p>
          )}
        </div>
      )}
      <span className={FIELD_LABEL}>{pedal ? "Pedal positions" : "Lever positions"}</span>
      <div className="grid grid-cols-7 gap-1.5">
        {HARP_LETTERS.map((letter) => (
          <div key={letter} className="flex flex-col items-center gap-1" role="group" aria-label={`${letter} strings`}>
            <span className="text-xs font-bold text-[var(--color-ns-text)]">{letter}</span>
            {OPTIONS.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={accidentals[letter] === o}
                aria-label={`${letter} ${o === -1 ? "flat" : o === 1 ? "sharp" : "natural"}`}
                onClick={() => set(letter, o)}
                className={`h-7 w-full rounded-md border text-sm font-bold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-purple-light)] ${
                  accidentals[letter] === o
                    ? "border-[var(--color-ns-amber)]/60 bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)]"
                    : "border-[var(--color-ns-border)] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
                }`}
              >
                {accidentalSymbol(o)}
              </button>
            ))}
          </div>
        ))}
      </div>
      {pedal && <p className="mt-2 text-[0.6875rem] text-[var(--color-ns-dim)]">The lowest C, lowest D and highest G have no pedal and stay natural.</p>}
    </div>
  );
}
