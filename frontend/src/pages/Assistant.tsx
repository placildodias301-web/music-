import { useEffect, useRef, useState } from "react";
import { askAssistant, type SongContext } from "../lib/api";
import { useMvp } from "../lib/MvpContext";
import { getWeakChords } from "../lib/practiceLog";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const SUGGESTED_QUESTIONS_GENERIC = [
  "What is a C Major chord?",
  "How do I play G Major?",
  "What is BPM?",
  "Explain the C-G-Am-F chord progression",
  "What is a major scale?",
];

const SUGGESTED_QUESTIONS_GROUNDED = [
  "What key is this song in?",
  "What chords are used in this song?",
  "How fast is this song?",
  "Is this song difficult?",
  "What chords have I been struggling with?",
];

export function Assistant() {
  const { fileName, analysis } = useMvp();

  const songContext: SongContext | null = analysis
    ? {
        fileName: fileName ?? analysis.fileName,
        key: analysis.key,
        bpm: analysis.bpm,
        timeSignature: analysis.timeSignature,
        chordProgression: analysis.chordProgression,
        difficultyLabel: analysis.difficulty?.difficultyLabel,
        weakChords: getWeakChords().map((w) => w.chord),
      }
    : null;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: songContext
        ? `Hi! I'm the Wilsify AI Assistant. I can see you're viewing "${songContext.fileName}" — ask me about its key, chords, tempo, or difficulty, or ask a general music-theory question.`
        : "Hi! I'm the Wilsify AI Assistant — a rule-based demo assistant covering the basics of chords, scales, BPM, and music theory. Upload a song first for answers grounded in its actual detected data, or ask me something general below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking]);

  async function sendQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isThinking) return;

    const userMessage: ChatMessage = { id: `${Date.now()}-user`, role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);

    try {
      const result = await askAssistant(trimmed, songContext);
      setMessages((prev) => [...prev, { id: `${Date.now()}-assistant`, role: "assistant", text: result.answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-error`, role: "assistant", text: "Sorry, I couldn't reach the assistant service. Please try again." },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  const suggestions = songContext
    ? [...SUGGESTED_QUESTIONS_GROUNDED, ...SUGGESTED_QUESTIONS_GENERIC.slice(0, 2)]
    : SUGGESTED_QUESTIONS_GENERIC;

  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] max-w-4xl flex-col px-3 py-4 sm:px-6 sm:py-6 md:px-8">
      {/* Header */}
      <div className="mb-4 flex flex-col justify-between gap-3 border-b border-glass pb-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/20 text-primary-light">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
              </svg>
            </span>
            <span className="font-heading text-sm font-bold uppercase tracking-wider text-primary-light">
              Wilsify Music AI
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-green/30 bg-green/10 px-2 py-0.5 text-[10px] font-semibold text-green">
              <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
              Ready
            </span>
          </div>
          <h1 className="mt-1 font-heading text-xl font-bold tracking-tight text-content sm:text-2xl">
            Music Theory Assistant
          </h1>
        </div>

        {songContext && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <div className="text-xs">
              <span className="font-semibold text-content">{songContext.fileName}</span>
              <span className="text-content-dim ml-1.5">({songContext.key} · {songContext.bpm} BPM)</span>
            </div>
          </div>
        )}
      </div>

      {/* Chat Messages */}
      <div ref={scrollRef} className="glass-card flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 ${
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <div
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-primary to-primary-dark text-white shadow-md shadow-primary/20"
                  : "border border-primary/30 bg-primary/10 text-primary-light"
              }`}
            >
              {msg.role === "user" ? (
                "You"
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
                </svg>
              )}
            </div>

            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-primary to-primary-dark text-white rounded-tr-sm shadow-lg shadow-primary/10"
                  : "border border-glass bg-white/[0.04] text-content-light rounded-tl-sm backdrop-blur-md"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary-light">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
              </svg>
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-glass bg-white/[0.04] px-4 py-3">
              <span className="spinner" />
              <span className="text-xs text-content-muted">Analyzing audio context…</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {suggestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => sendQuestion(q)}
            disabled={isThinking}
            className="rounded-full border border-glass bg-white/[0.03] px-3 py-1.5 text-xs text-content-muted transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-content active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(input);
        }}
        className="mt-3 flex gap-2 sm:gap-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ask the assistant a question"
          placeholder="Ask about chords, scales, BPM, or music theory…"
          className="input-base flex-1"
          disabled={isThinking}
        />
        <button
          type="submit"
          disabled={!input.trim() || isThinking}
          className="btn-primary px-4 sm:px-6"
        >
          <span>Send</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
