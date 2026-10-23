import React from "react";
import { type PlayedStringAnalysis } from "../../lib/chords/analysis";
import { type FingeringResult } from "../../lib/chords/fingering";
import { playPlayedString } from "../../lib/chords/play";

export interface StringInfoTableProps {
  playedStrings: PlayedStringAnalysis[];
  selectedStringIndex: number | null;
  onSelectString: (index: number) => void;
  fingering: FingeringResult;
  instrumentName?: string;
  /** Strands per string/course (mandolin pairs, 12-string octaves) so a pair sounds as a pair. */
  courses?: number[][];
}

export function StringInfoTable({
  playedStrings,
  selectedStringIndex,
  onSelectString,
  fingering,
  instrumentName = "guitar",
  courses,
}: StringInfoTableProps) {
  const handlePlayString = (e: React.MouseEvent, stringInfo: PlayedStringAnalysis) => {
    e.stopPropagation();
    onSelectString(stringInfo.stringIndex);
    void playPlayedString(stringInfo, { instrumentId: instrumentName, totalStrings: playedStrings.length, courses }).catch(() => {});
  };

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] shadow-sm">
      <div className="border-b border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/60 px-4 py-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
          String-by-String Breakdown
        </h4>
        <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
          Click any row to inspect note physics and sound the note.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/30 text-[0.6875rem] font-semibold text-[var(--color-ns-muted)]">
            <tr>
              <th className="px-3 py-2.5">String</th>
              <th className="px-3 py-2.5">Fret</th>
              <th className="px-3 py-2.5">Note</th>
              <th className="px-3 py-2.5">Interval / Function</th>
              <th className="px-3 py-2.5">Finger</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-ns-border)]/50">
            {playedStrings.map((str) => {
              const isSelected = selectedStringIndex === str.stringIndex;
              const isMuted = str.action === "muted";
              const isOpen = str.action === "open";
              const isBarre = fingering.barres.some(
                (b) =>
                  str.fret === b.fret &&
                  str.stringIndex >= b.fromString &&
                  str.stringIndex <= b.toString
              );

              return (
                <tr
                  key={str.stringIndex}
                  onClick={() => onSelectString(str.stringIndex)}
                  tabIndex={0}
                  aria-selected={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectString(str.stringIndex);
                    }
                  }}
                  className={`group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ns-amber)] transition-colors ${
                    isSelected
                      ? "bg-[var(--color-ns-amber)]/15 font-semibold text-[var(--color-ns-text)]"
                      : "hover:bg-[var(--color-ns-raised)]/60 text-[var(--color-ns-muted)]"
                  }`}
                >
                  {/* String */}
                  <td className="px-3 py-2.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-ns-border)]/60 text-[0.625rem] font-bold text-[var(--color-ns-text)]">
                        {str.stringNumber}
                      </span>
                      <span>Str {str.stringNumber}</span>
                    </span>
                  </td>

                  {/* Fret */}
                  <td className="px-3 py-2.5">
                    {isMuted ? (
                      <span className="inline-flex rounded px-1.5 py-0.5 text-[0.6875rem] font-bold text-[var(--color-ns-error, #f43f5e)] bg-[var(--color-ns-error, #f43f5e)]/10">
                        Muted (X)
                      </span>
                    ) : isOpen ? (
                      <span className="inline-flex rounded px-1.5 py-0.5 text-[0.6875rem] font-bold text-[var(--color-ns-success, #10b981)] bg-[var(--color-ns-success, #10b981)]/10">
                        Open (0)
                      </span>
                    ) : (
                      <span className="font-mono font-bold text-[var(--color-ns-text)]">
                        Fret {str.fret}
                      </span>
                    )}
                  </td>

                  {/* Note */}
                  <td className="px-3 py-2.5">
                    {str.noteName ? (
                      <span className="flex items-center gap-1">
                        <span className="font-heading text-sm font-bold text-[var(--color-ns-text)]">
                          {str.noteName.replace("#", "♯")}
                        </span>
                        {str.frequencyHz && (
                          <span className="font-mono text-[0.625rem] text-[var(--color-ns-dim)]">
                            {Math.round(str.frequencyHz)} Hz
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[var(--color-ns-dim)]">—</span>
                    )}
                  </td>

                  {/* Interval / Function */}
                  <td className="px-3 py-2.5">
                    {str.interval ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[0.625rem] font-bold uppercase ${
                              str.isRoot
                                ? "bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)]"
                                : "bg-[var(--color-ns-border)] text-[var(--color-ns-text)]"
                            }`}
                          >
                            {str.isRoot ? "Root (1)" : str.interval.shortName}
                          </span>
                          <span className="text-[0.6875rem] text-[var(--color-ns-text)]">
                            {str.interval.name}
                          </span>
                        </span>
                        <span className="text-[0.625rem] text-[var(--color-ns-muted)]">
                          {str.interval.functionDescription}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[var(--color-ns-dim)]">—</span>
                    )}
                  </td>

                  {/* Finger */}
                  <td className="px-3 py-2.5">
                    {str.finger ? (
                      <span className="flex items-center gap-1 font-medium text-[var(--color-ns-text)]">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-ns-amber)] text-[0.5625rem] font-black text-[var(--color-ns-ink)]">
                          {str.finger}
                        </span>
                        <span>{str.fingerName}</span>
                        {isBarre && (
                          <span className="ml-1 rounded bg-[var(--color-ns-amber)]/20 px-1 text-[0.5625rem] font-bold text-[var(--color-ns-amber)]">
                            Barre
                          </span>
                        )}
                      </span>
                    ) : isOpen ? (
                      <span className="text-[0.6875rem] text-[var(--color-ns-muted)]">None (Open)</span>
                    ) : (
                      <span className="text-[0.6875rem] text-[var(--color-ns-dim)]">—</span>
                    )}
                  </td>

                  {/* Play Action */}
                  <td className="px-3 py-2.5 text-right">
                    {!isMuted && str.midi !== null ? (
                      <button
                        type="button"
                        onClick={(e) => handlePlayString(e, str)}
                        title={`Play ${str.noteName}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-2 py-1 text-[0.6875rem] font-medium text-[var(--color-ns-text)] transition-all hover:border-[var(--color-ns-amber)] hover:bg-[var(--color-ns-amber)]/10"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="text-[var(--color-ns-amber)]"
                        >
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Play
                      </button>
                    ) : (
                      <span className="text-[0.6875rem] text-[var(--color-ns-dim)]">Muted</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
