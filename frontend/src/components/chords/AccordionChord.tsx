import { STRADELLA_COLUMNS, STRADELLA_ROWS, type AccordionModel } from "../../lib/chords/model";
import { KeyboardChord } from "./KeyboardChord";

/** Accordion: right-hand notes on a keyboard, plus the left-hand button on a standard Stradella bass layout (when the chord has one). */
export function AccordionChord({ model }: { model: AccordionModel }) {
  const pick = model.stradella;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="w-full">
        <p className="mb-1 text-center text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-dim)]">Right hand · notes</p>
        <KeyboardChord keys={model.keys} />
      </div>
      <div className="w-full">
        <p className="mb-1 text-center text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-dim)]">Left hand · Stradella bass</p>
        <div className="overflow-x-auto">
          <table className="mx-auto border-separate border-spacing-[3px] text-[0.5625rem]" aria-label="Stradella bass buttons">
            <tbody>
              {STRADELLA_ROWS.map((row) => (
                <tr key={row}>
                  <th scope="row" className="pr-1 text-right font-medium text-[var(--color-ns-dim)]">{row}</th>
                  {STRADELLA_COLUMNS.map((col) => {
                    const on = pick && pick.row === row && pick.column === col;
                    return (
                      <td key={col} className={`h-4 w-4 rounded-full text-center ${on ? "bg-[var(--color-ns-amber)] font-bold text-[var(--color-ns-ink)]" : "bg-[var(--color-ns-bg)] text-[var(--color-ns-dim)]"}`}>
                        {row === "Bass" || row === "Counter-bass" || on ? col.replace("#", "♯") : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-center text-[0.6875rem] text-[var(--color-ns-muted)]">
          {pick
            ? `${pick.column}${pick.row === "Diminished" ? " (or any equal button — a diminished 7th repeats every minor third)" : ""} · ${pick.row.toLowerCase()} button`
            : "No single Stradella button makes this chord — play its notes with the bass and chord buttons together, or on the right hand."}
          {" "}Layout shown is the common 120-bass pattern; smaller accordions have fewer columns.
        </p>
      </div>
    </div>
  );
}
