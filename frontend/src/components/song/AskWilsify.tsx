import { useState } from "react";
import { askAssistant } from "../../lib/api";
import type { AnalysisResult } from "../../lib/api";

const QUESTIONS = [
  "Explain this progression.",
  "Why is {chord} used here?",
  "What scale works over this solo?",
  "Make these chords easier.",
  "How do I practice this chorus?",
];

export interface PracticeContext {
  songId: string;
  currentTime: number;
  section: string | null;
  chord: string | null;
  prevChord: string | null;
  nextChord: string | null;
  key: string;
  bpm: number;
  timeSignature: string;
  instrument: string;
}

interface Props {
  analysis: AnalysisResult;
  fileName: string;
  context: () => PracticeContext;
  seedQuestion?: string | null;
}

/** The tutor receives where the student is (section, chord, neighbours, key, tempo) with each question. */
export function AskWilsify({ analysis, fileName, context, seedQuestion }: Props) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  if (seedQuestion && seedQuestion !== seen) {
    setSeen(seedQuestion);
    setQ(seedQuestion);
  }

  async function ask(question: string) {
    const ctx = context();
    setBusy(true);
    setError(null);
    setAnswer(null);
    const where = [
      ctx.section && `section ${ctx.section}`,
      ctx.chord && `current chord ${ctx.chord}`,
      ctx.prevChord && `previous ${ctx.prevChord}`,
      ctx.nextChord && `next ${ctx.nextChord}`,
      `${Math.floor(ctx.currentTime)}s in`,
      `key ${ctx.key}, ${Math.round(ctx.bpm)} BPM, ${ctx.timeSignature}`,
      `instrument ${ctx.instrument}`,
    ].filter(Boolean).join("; ");
    try {
      const res = await askAssistant(`${question}\n\n[Where the student is: ${where}]`, {
        fileName,
        key: analysis.key,
        bpm: analysis.bpm,
        timeSignature: analysis.timeSignature,
        chordProgression: analysis.chordProgression,
        difficultyLabel: analysis.difficulty.difficultyLabel,
      });
      setAnswer(res.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The tutor couldn't answer right now.");
    } finally {
      setBusy(false);
    }
  }

  const chord = context().chord;
  return (
    <div className="space-y-2 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3">
      <p className="text-xs font-semibold text-[var(--color-ns-purple-light)]">Ask Wilsify AI</p>
      <div className="flex flex-wrap gap-1.5">
        {QUESTIONS.map((t) => {
          const text = t.replace("{chord}", chord ?? "this chord");
          return (
            <button key={t} type="button" onClick={() => setQ(text)} className="rounded-lg border border-[var(--color-ns-border)] px-2 py-1 text-[11px] text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]">
              {text}
            </button>
          );
        })}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim() && !busy) void ask(q.trim()); }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this song…" aria-label="Question for Wilsify AI" className="min-w-0 flex-1 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-3 py-1.5 text-sm text-[var(--color-ns-text)]" />
        <button disabled={busy || !q.trim()} className="rounded-lg bg-[var(--color-ns-purple)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "…" : "Ask"}</button>
      </form>
      {error && <p className="text-xs text-[var(--color-ns-red)]">{error}</p>}
      {answer && <p className="whitespace-pre-wrap text-sm text-[var(--color-ns-text)]">{answer}</p>}
    </div>
  );
}
