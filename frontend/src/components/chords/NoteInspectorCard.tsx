import { type PlayedStringAnalysis } from "../../lib/chords/analysis";
import { playPlayedString } from "../../lib/chords/play";

export interface NoteInspectorCardProps {
  selectedNote: PlayedStringAnalysis | null;
  onClearSelection?: () => void;
  instrument?: string;
  courses?: number[][];
  totalStrings?: number;
  fretless?: boolean;
}

export function NoteInspectorCard({ selectedNote, onClearSelection, instrument = "guitar", courses, totalStrings, fretless = false }: NoteInspectorCardProps) {
  if (!selectedNote) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-ns-border)] bg-[var(--color-ns-card)]/40 p-6 text-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-ns-border)]/40 text-[var(--color-ns-muted)]">
          🎵
        </div>
        <p className="text-xs font-semibold text-[var(--color-ns-text)]">Note Inspector</p>
        <p className="mt-1 text-[0.6875rem] text-[var(--color-ns-muted)]">
          Click any string dot or fretboard position to inspect pitch physics, frequency, and harmonic role.
        </p>
      </div>
    );
  }

  const isMuted = selectedNote.action === "muted";
  const isOpen = selectedNote.action === "open";

  const handlePlay = () => {
    void playPlayedString(selectedNote, { instrumentId: instrument, totalStrings: totalStrings ?? selectedNote.stringNumber + selectedNote.stringIndex, courses }).catch(() => {});
  };

  return (
    <div className="rounded-2xl border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-card)] p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-ns-border)] pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-ns-amber)] font-heading text-sm font-bold text-[var(--color-ns-ink)]">
            {selectedNote.noteName ? selectedNote.noteName.replace("#", "♯") : "✕"}
          </span>
          <div>
            <h4 className="font-heading text-sm font-bold text-[var(--color-ns-text)]">
              {isMuted
                ? `String ${selectedNote.stringNumber} — Muted`
                : `${selectedNote.noteName?.replace("#", "♯")} on String ${selectedNote.stringNumber}`}
            </h4>
            <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
              {isMuted
                ? "This string is muted and not played"
                : isOpen
                ? fretless ? "Open string" : "Open string (Fret 0)"
                : fretless ? `${selectedNote.fret} semitones above the open string` : `Fret ${selectedNote.fret}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isMuted && selectedNote.midi !== null && (
            <button
              type="button"
              onClick={handlePlay}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/10 px-3 py-1.5 text-xs font-bold text-[var(--color-ns-amber)] transition-all hover:bg-[var(--color-ns-amber)] hover:text-[var(--color-ns-ink)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Play Note
            </button>
          )}
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              title="Close inspector"
              className="rounded-lg p-1 text-xs text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {!isMuted ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--color-ns-border)]/60 bg-[var(--color-ns-bg)]/50 p-2.5">
            <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
              Interval
            </span>
            <span className="mt-0.5 block font-heading text-sm font-bold text-[var(--color-ns-text)]">
              {selectedNote.isRoot ? "Root (1)" : selectedNote.interval?.name || "—"}
            </span>
            <span className="text-[0.625rem] text-[var(--color-ns-dim)]">
              {selectedNote.interval?.semitones !== undefined
                ? `${selectedNote.interval.semitones} semitones above root`
                : ""}
            </span>
          </div>

          <div className="rounded-xl border border-[var(--color-ns-border)]/60 bg-[var(--color-ns-bg)]/50 p-2.5">
            <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
              Acoustic Pitch
            </span>
            <span className="mt-0.5 block font-heading text-sm font-bold text-[var(--color-ns-text)]">
              {selectedNote.frequencyHz ? `${Math.round(selectedNote.frequencyHz * 10) / 10} Hz` : "—"}
            </span>
            <span className="text-[0.625rem] text-[var(--color-ns-dim)]">
              MIDI {selectedNote.midi}
            </span>
          </div>

          <div className="rounded-xl border border-[var(--color-ns-border)]/60 bg-[var(--color-ns-bg)]/50 p-2.5">
            <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
              Fingering
            </span>
            <span className="mt-0.5 block font-heading text-sm font-bold text-[var(--color-ns-text)]">
              {selectedNote.finger ? `${selectedNote.fingerName} (${selectedNote.finger})` : isOpen ? "Open" : "—"}
            </span>
            <span className="text-[0.625rem] text-[var(--color-ns-dim)]">
              {selectedNote.finger ? `Finger #${selectedNote.finger}` : "No fretting needed"}
            </span>
          </div>

          <div className="rounded-xl border border-[var(--color-ns-border)]/60 bg-[var(--color-ns-bg)]/50 p-2.5">
            <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-[var(--color-ns-muted)]">
              Harmonic Role
            </span>
            <span className="mt-0.5 block font-heading text-sm font-bold text-[var(--color-ns-text)]">
              {selectedNote.isRoot ? "Root Foundation" : selectedNote.interval?.shortName || "Tone"}
            </span>
            <span className="text-[0.625rem] text-[var(--color-ns-dim)] line-clamp-1">
              {selectedNote.interval?.functionDescription || "Chord tone"}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-[var(--color-ns-muted)]">
          This string is damped with the thumb or an adjacent finger so that it stays silent during strumming.
        </div>
      )}
    </div>
  );
}
