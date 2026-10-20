import { useState } from "react";
import { askAssistant } from "../../lib/api";
import type { AnalysisResult } from "../../lib/api";
import { parseLyrics } from "../../lib/song/lyrics";
import { buildLyricsPrompt, cleanGeneratedLyrics } from "../../lib/song/aiLyrics";

interface Props {
  initial: string;
  hasLyrics: boolean;
  analysis: AnalysisResult;
  fileName: string;
  onSave: (raw: string, source: "pasted" | "uploaded" | "ai") => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Paste or upload lyrics (plain, [Verse] headers, or .lrc with times). Nothing is fetched from anywhere. */
export function LyricsEditor({ initial, hasLyrics, analysis, fileName, onSave, onRemove, onClose }: Props) {
  const [text, setText] = useState(initial);
  const [source, setSource] = useState<"pasted" | "uploaded" | "ai">("pasted");
  const [aiOpen, setAiOpen] = useState(false);
  const [theme, setTheme] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [before, setBefore] = useState<string | null>(null);

  const writeWithAi = async () => {
    setBusy(true);
    setAiError(null);
    try {
      const res = await askAssistant(buildLyricsPrompt(analysis, theme), {
        fileName,
        key: analysis.key,
        bpm: analysis.bpm,
        timeSignature: analysis.timeSignature,
        chordProgression: analysis.chordProgression,
      });
      // Without a live AI model the backend returns canned tutor text — never put that in as lyrics.
      if (res.isDemo) throw new Error("AI writing isn't available right now (the AI model is offline). Try again later, or paste your own lyrics.");
      const lyrics = cleanGeneratedLyrics(res.answer);
      if (!parseLyrics(lyrics).sections.some((s) => s.lines.length)) throw new Error("The AI didn't return usable lyrics. Try again.");
      setBefore(text);
      setText(lyrics);
      setSource("ai");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Couldn't write lyrics. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const parsed = parseLyrics(text);
  const lineCount = parsed.sections.reduce((n, s) => n + s.lines.length, 0);

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-4">
      <p className="text-sm font-semibold text-[var(--color-ns-text)]">Lyrics</p>
      <p className="text-xs text-[var(--color-ns-muted)]">
        Add lyrics you wrote or have the right to use. Use <code>[Verse 1]</code> / <code>[Chorus]</code> headers to name sections. With an <code>.lrc</code> file
        (<code>[00:12.40]line</code>) chords are placed automatically; with plain text you can tap each line's start while the song plays.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} aria-label="Lyrics" placeholder={"[Verse 1]\nFirst line…\nSecond line…"} className="w-full rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] p-3 font-mono text-sm text-[var(--color-ns-text)]" />
      {aiOpen && (
        <div className="space-y-2 rounded-xl border border-[var(--color-ns-purple)]/30 bg-[var(--color-ns-purple)]/5 p-3">
          <p className="text-xs text-[var(--color-ns-muted)]">
            Wilsify AI writes <b>original</b> lyrics to fit this song's key, tempo and chord cycle ({analysis.key}, {Math.round(analysis.bpm)} BPM, {analysis.timeSignature}). It never copies an existing song. Chords are not timed to them until you tap-sync.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              maxLength={200}
              aria-label="Lyrics theme"
              placeholder="Theme or mood (optional) — e.g. late-night drive, missing home, in English or Hindi"
              className="min-w-0 flex-1 rounded-lg border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)] px-3 py-1.5 text-sm text-[var(--color-ns-text)]"
            />
            <button onClick={writeWithAi} disabled={busy} className="rounded-lg bg-[var(--color-ns-purple)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {busy ? "Writing…" : text.trim() ? "Write again" : "Generate lyrics"}
            </button>
            {before !== null && !busy && (
              <button onClick={() => { setText(before); setBefore(null); setSource("pasted"); }} className="rounded-lg border border-[var(--color-ns-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ns-muted)]">
                Undo AI text
              </button>
            )}
          </div>
          {aiError && <p role="alert" className="text-xs text-[var(--color-ns-red)]">{aiError}</p>}
          {source === "ai" && !aiError && <p className="text-xs text-[var(--color-ns-dim)]">AI-written — edit anything you like, then Save lyrics.</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setAiOpen((o) => !o)} aria-expanded={aiOpen} className="rounded-lg border border-[var(--color-ns-purple)]/50 px-3 py-1.5 text-xs font-semibold text-[var(--color-ns-purple)] hover:bg-[var(--color-ns-purple)]/10">
          ✦ Write with AI
        </button>
        <label className="cursor-pointer rounded-lg border border-[var(--color-ns-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)]">
          Upload .lrc / .txt
          <input
            type="file"
            accept=".lrc,.txt,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setText(await f.text());
              setSource("uploaded");
            }}
          />
        </label>
        <span className="text-xs text-[var(--color-ns-dim)]">{lineCount} lines · {parsed.format === "lrc" ? (parsed.timed ? "timed" : "partly timed") : "not timed yet"}</span>
        <span className="flex-1" />
        {hasLyrics && <button onClick={onRemove} className="rounded-lg border border-[var(--color-ns-red)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--color-ns-red)]">Remove lyrics</button>}
        <button onClick={onClose} className="rounded-lg border border-[var(--color-ns-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ns-muted)]">Cancel</button>
        <button onClick={() => onSave(text, source)} disabled={!lineCount} className="rounded-lg bg-[var(--color-ns-purple)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save lyrics</button>
      </div>
    </div>
  );
}
