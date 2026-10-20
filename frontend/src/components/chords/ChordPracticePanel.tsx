import { useState } from "react";
import { Link } from "react-router-dom";
import { type FingeringResult } from "../../lib/chords/fingering";
import { type PracticeGuidance } from "../../lib/chords/instructions";
import { playPluckedNotes, playArpeggioNotes, playChordLive } from "../../lib/playChord";
import { type ParsedChord } from "../../lib/chordTheory";

export interface ChordPracticePanelProps {
  chord: ParsedChord;
  frets: (number | null)[];
  tuningMidi: number[];
  fingering: FingeringResult;
  guidance: PracticeGuidance;
}

export function ChordPracticePanel({
  chord,
  frets,
  tuningMidi,
  fingering,
  guidance,
}: ChordPracticePanelProps) {
  const [arpeggioSpeed, setArpeggioSpeed] = useState<"slow" | "normal" | "fast">("normal");

  // Filter played MIDI notes
  const playedMidis = frets.flatMap((f, i) => (f !== null && f >= 0 ? [tuningMidi[i] + f] : []));

  const handlePlayChord = () => {
    if (playedMidis.length > 0) {
      playPluckedNotes(playedMidis, "guitar", 0.035);
    } else {
      playChordLive(chord);
    }
  };

  const handlePlayArpeggio = () => {
    if (playedMidis.length > 0) {
      playArpeggioNotes(playedMidis, "guitar", arpeggioSpeed);
    }
  };

  const difficultyColor =
    fingering.difficulty === "Beginner"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : fingering.difficulty === "Intermediate"
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-rose-400 bg-rose-500/10 border-rose-500/30";

  return (
    <div className="space-y-4">
      {/* Audio Playback Controls */}
      <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ns-border)] pb-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
              Interactive Audio Reference
            </h4>
            <p className="text-[0.6875rem] text-[var(--color-ns-muted)]">
              Accurate Karplus-Strong string synthesis showing how the voicing sounds.
            </p>
          </div>

          {/* Difficulty Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${difficultyColor}`}
            >
              {fingering.difficulty}
            </span>
          </div>
        </div>

        {/* Audio Action Buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePlayChord}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] px-4 py-2.5 text-xs font-bold text-[var(--color-ns-ink)] shadow-md transition-all hover:brightness-110 active:scale-95"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Play Strummed Chord
          </button>

          <button
            type="button"
            onClick={handlePlayArpeggio}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-4 py-2.5 text-xs font-bold text-[var(--color-ns-text)] transition-all hover:border-[var(--color-ns-amber)] hover:bg-[var(--color-ns-card)] active:scale-95"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Play Arpeggio
          </button>

          {/* Arpeggio Speed Selector */}
          <div className="flex items-center gap-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-1 text-xs">
            {(["slow", "normal", "fast"] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setArpeggioSpeed(sp)}
                className={`rounded-lg px-2.5 py-1 text-[0.6875rem] font-semibold capitalize transition-all ${
                  arpeggioSpeed === sp
                    ? "bg-[var(--color-ns-border-strong)] text-[var(--color-ns-text)] font-bold"
                    : "text-[var(--color-ns-muted)]"
                }`}
              >
                {sp}
              </button>
            ))}
          </div>

          {/* Practice Mode Link */}
          <Link
            to={`/practice?target=${encodeURIComponent(chord.label)}`}
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-3 py-2 text-xs font-semibold text-[var(--color-ns-text)] transition-all hover:border-[var(--color-ns-amber)] active:scale-95"
          >
            <span>Mic Pitch Practice →</span>
          </Link>
        </div>

        <p className="mt-3 text-[0.6875rem] text-[var(--color-ns-dim)]">
          {fingering.difficultyReason}
        </p>
      </div>

      {/* Step-by-Step Finger Instructions */}
      <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
          Step-by-Step Finger Placement
        </h4>
        <div className="mt-3 space-y-2">
          {guidance.steps.map((st) => (
            <div
              key={st.stepNumber}
              className="flex items-start gap-3 rounded-xl border border-[var(--color-ns-border)]/60 bg-[var(--color-ns-bg)]/40 p-3"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-ns-amber)]/20 text-xs font-bold text-[var(--color-ns-amber)]">
                {st.stepNumber}
              </span>
              <p className="text-xs leading-relaxed text-[var(--color-ns-text)]">
                {st.instruction}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Common Mistakes & How to Fix */}
      <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
          Common Mistakes & Fixes
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {guidance.commonMistakes.map((cm, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)]/50 p-3"
            >
              <h5 className="font-heading text-xs font-bold text-rose-400">
                ⚠ {cm.title}
              </h5>
              <p className="mt-1 text-[0.6875rem] text-[var(--color-ns-muted)]">
                {cm.description}
              </p>
              <p className="mt-2 text-[0.6875rem] font-medium text-[var(--color-ns-text)]">
                <span className="text-emerald-400">Fix: </span>
                {cm.solution}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Practice Drills */}
      <div className="rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-5 shadow-sm">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ns-text)]">
          Practice Tips & Drills
        </h4>
        <ul className="mt-3 space-y-2 text-xs text-[var(--color-ns-muted)]">
          {guidance.practiceTips.map((tip, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-[var(--color-ns-amber)]">✦</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
