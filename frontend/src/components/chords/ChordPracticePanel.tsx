import { useState } from "react";
import { Link } from "react-router-dom";
import { type FingeringResult } from "../../lib/chords/fingering";
import { type PracticeGuidance } from "../../lib/chords/instructions";
import { playShape, usesSynthVoice } from "../../lib/chords/play";
import { usePlayback } from "./usePlayback";
import { type ParsedChord } from "../../lib/chordTheory";

export interface ChordPracticePanelProps {
  chord: ParsedChord;
  frets: (number | null)[];
  tuningMidi: number[];
  /** Strands per string/course, so paired strings sound as pairs. */
  courses?: number[][];
  fingering: FingeringResult;
  guidance: PracticeGuidance;
  instrument?: string;
}

export function ChordPracticePanel({
  chord,
  frets,
  tuningMidi,
  courses,
  fingering,
  guidance,
  instrument = "guitar",
}: ChordPracticePanelProps) {
  const [arpeggioSpeed, setArpeggioSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [mode, setMode] = useState<"strum" | "arpeggio">("strum");
  const playback = usePlayback();
  const isPlayingStrum = playback.playing && mode === "strum";
  const isPlayingArpeggio = playback.playing && mode === "arpeggio";

  // The shape on screen, played with the instrument's own sound (strummed strings, or a bowed/blown/struck model).
  const handlePlayChord = () => {
    setMode("strum");
    playback.run(() => playShape({ instrumentId: instrument, frets, tuningMidi, courses, mode: "chord" }));
  };

  const handlePlayArpeggio = () => {
    setMode("arpeggio");
    playback.run(() => playShape({ instrumentId: instrument, frets, tuningMidi, courses, mode: "arpeggio", speed: arpeggioSpeed }));
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
              A sound model of the instrument playing exactly the notes in this voicing — not a recording.
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

        <p role="status" aria-live="polite" className={`mt-3 min-h-[1rem] text-[0.6875rem] ${playback.status === "error" ? "text-[var(--color-ns-error,#f43f5e)]" : "text-[var(--color-ns-dim)]"}`}>
          {playback.status === "error" ? playback.error : playback.playing ? "Playing — every sounding string rings together." : ""}
        </p>

        {/* Audio Action Buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePlayChord}
            aria-label={`Play strummed ${chord.label} chord`}
            className={`flex h-10 w-52 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-colors ${
              isPlayingStrum
                ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-md"
                : "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)] text-[var(--color-ns-ink)] shadow-md hover:brightness-110"
            }`}
          >
            {isPlayingStrum ? (
              <span className="flex h-[14px] w-[14px] items-center justify-center">
                <span className="h-2.5 w-2.5 rounded-full bg-current" />
              </span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
            {usesSynthVoice(instrument) ? "Play Chord" : "Play Strummed Chord"}
          </button>

          <button
            type="button"
            onClick={handlePlayArpeggio}
            aria-label={`Play ${chord.label} arpeggio`}
            className={`flex h-10 w-44 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-colors ${
              isPlayingArpeggio
                ? "border-[var(--color-ns-amber)] bg-[var(--color-ns-amber)]/20 text-[var(--color-ns-amber)] shadow-sm"
                : "border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] text-[var(--color-ns-text)] hover:border-[var(--color-ns-amber)] hover:bg-[var(--color-ns-card)]"
            }`}
          >
            {isPlayingArpeggio ? (
              <span className="flex h-[14px] w-[14px] items-center justify-center">
                <span className="h-2.5 w-2.5 rounded-full bg-current" />
              </span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            )}
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

          <button
            type="button"
            onClick={playback.stop}
            disabled={!playback.playing}
            aria-label="Stop audio"
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] px-4 text-xs font-bold text-[var(--color-ns-text)] transition-shadow hover:shadow-[0_0_14px_rgba(255,176,32,0.45)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
            Stop
          </button>

          {/* Practice Mode Link */}
          <Link
            to={`/practice?target=${encodeURIComponent(chord.label)}`}
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-3 py-2 text-xs font-semibold text-[var(--color-ns-text)] transition-all hover:border-[var(--color-ns-amber)]"
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
