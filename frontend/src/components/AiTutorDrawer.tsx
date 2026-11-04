import { useState, useRef, useEffect, type FormEvent } from "react";
import { TutorChordWidget, type ProgressionOption } from "./TutorChordWidget";

export interface TutorChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  is_music_related?: boolean;
  difficulty_level?: string;
  has_widget?: boolean;
  widget_title?: string;
  default_bpm?: number;
  options?: ProgressionOption[];
  follow_up_suggestions?: string[];
  /** Served from the shared answer cache (no live AI call). */
  cached?: boolean;
  timestamp: number;
}

/** Live AI answers left today (remaining_free is null on Wilsify Pro: unlimited). */
export interface TutorQuota {
  remaining_free: number | null;
  daily_limit: number;
  is_pro: boolean;
  cached?: boolean;
}

const CLIENT_ID_KEY = "wilsify_tutor_client_id";

/** A random id per browser, so the free daily quota follows this user, not the whole network. */
function tutorClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(CLIENT_ID_KEY, fresh);
    return fresh;
  } catch {
    return ""; // storage blocked: the server counts by address instead
  }
}

function quotaLabel(q: TutorQuota): string {
  if (q.is_pro || q.remaining_free === null) return "Wilsify Pro · unlimited AI answers";
  if (q.remaining_free <= 0) return "Today's free AI answers are used up · the built-in tutor still answers";
  return `${q.remaining_free} of ${q.daily_limit} free AI answers left today`;
}

export interface AiTutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  songContext?: {
    title?: string;
    key?: string;
    bpm?: number;
    chords?: string[];
  };
}

const API_URL = import.meta.env.VITE_API_URL ?? "";

// Simple Markdown Formatter for Tutor responses
function MarkdownView({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-2 text-sm leading-relaxed text-[var(--color-ns-text)]">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        // Header ###
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-heading text-base font-bold text-[var(--color-ns-text)] pt-1">
              {trimmed.replace(/^###\s+/, "")}
            </h4>
          );
        }
        // Header ####
        if (trimmed.startsWith("#### ")) {
          return (
            <h5 key={idx} className="font-heading text-sm font-bold text-[var(--color-ns-purple-light)] pt-0.5">
              {trimmed.replace(/^####\s+/, "")}
            </h5>
          );
        }
        // Blockquote >
        if (trimmed.startsWith("> ")) {
          return (
            <div key={idx} className="border-l-2 border-[var(--color-ns-purple)] pl-3 text-xs italic text-[var(--color-ns-muted)]">
              {trimmed.replace(/^>\s+/, "")}
            </div>
          );
        }
        // Bullet list -
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2 text-xs sm:text-sm">
              <span className="text-[var(--color-ns-purple)] font-bold">•</span>
              <span dangerouslySetInnerHTML={{ __html: formatInline(trimmed.substring(2)) }} />
            </div>
          );
        }
        // Numbered list 1.
        if (/^\d+\.\s+/.test(trimmed)) {
          const match = trimmed.match(/^(\d+\.)\s+(.*)/);
          return (
            <div key={idx} className="flex items-start gap-2 pl-2 text-xs sm:text-sm">
              <span className="font-mono text-xs font-bold text-[var(--color-ns-purple)]">{match?.[1]}</span>
              <span dangerouslySetInnerHTML={{ __html: formatInline(match?.[2] || "") }} />
            </div>
          );
        }

        // Regular paragraph with inline formatting
        return (
          <p key={idx} dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />
        );
      })}
    </div>
  );
}

function formatInline(str: string): string {
  return str
    .replace(/\*\*(.*?)\*\*/g, "<strong class='font-bold text-[var(--color-ns-text)]'>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em class='italic'>$1</em>")
    .replace(/`(.*?)`/g, "<code class='rounded bg-[var(--color-ns-border)]/50 px-1 py-0.5 font-mono text-xs text-[var(--color-ns-purple-light)]'>$1</code>");
}

export function AiTutorDrawer({ isOpen, onClose, songContext }: AiTutorDrawerProps) {
  const [messages, setMessages] = useState<TutorChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "### 👋 Welcome to Wilsify AI Music Tutor!\n\nI am your personal master tutor powered by **Google Gemini**. I specialize strictly in musical instruments, guitar fretboard fingerings, piano voicings, passing chords, harmony, ear training, and songwriting.\n\nAsk me anything or tap one of the topics below to get started!",
      is_music_related: true,
      difficulty_level: "Beginner",
      follow_up_suggestions: [
        "In guitar to go A to F#m in between I want to put a chord",
        "How do I play an A major chord on guitar?",
        "What is a tritone substitution and how do I use it?",
        "Explain modal interchange and borrowed chords",
      ],
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<TutorQuota | null>(null);
  const clientIdRef = useRef<string>("");
  if (!clientIdRef.current) clientIdRef.current = tutorClientId();
  const clientHeaders: Record<string, string> = clientIdRef.current ? { "X-Client-ID": clientIdRef.current } : {};

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    fetch(`${API_URL}/api/tutor/quota`, { headers: clientHeaders })
      .then((r) => (r.ok ? r.json() : null))
      .then((q: TutorQuota | null) => {
        if (alive && q) setQuota(q);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the client id never changes
  }, [isOpen]);

  const sendQuestion = async (qText: string) => {
    const text = qText.trim();
    if (!text || loading) return;

    const userMsg: TutorChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const historyTurns = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch(`${API_URL}/api/tutor/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...clientHeaders },
        body: JSON.stringify({
          question: text,
          context: songContext || null,
          history: historyTurns,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      const botMsg: TutorChatMessage = {
        id: `bot-${Date.now()}`,
        role: "assistant",
        text: data.answer_markdown || "I have analyzed your musical question.",
        is_music_related: data.is_music_related,
        difficulty_level: data.difficulty_level,
        has_widget: data.has_widget,
        widget_title: data.widget_title,
        default_bpm: data.default_bpm || 80,
        options: data.options || [],
        follow_up_suggestions: data.follow_up_suggestions || [],
        cached: data.cached === true,
        timestamp: Date.now(),
      };

      if (data.quota) setQuota(data.quota as TutorQuota);
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          role: "assistant",
          text: "I ran into a temporary connection issue reaching the music engine. Please try asking again!",
          is_music_related: true,
          difficulty_level: "Beginner",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendQuestion(input);
  };

  if (!isOpen) return null;

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label="Wilsify AI Music Tutor"
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[var(--color-ns-border)] bg-[var(--color-ns-card)] shadow-2xl transition-all sm:max-w-xl md:max-w-2xl"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-ns-border)] px-4 py-3.5 bg-[var(--color-ns-raised)]/90 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[var(--color-ns-purple)] to-[var(--color-ns-purple-light)] text-white shadow-md">
            🎵
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-bold text-[var(--color-ns-text)]">
                Wilsify AI Music Tutor
              </h3>
              <span className="rounded-full bg-[var(--color-ns-purple)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ns-purple-light)]">
                Gemini 2.5
              </span>
            </div>
            <p className="text-xs text-[var(--color-ns-muted)]">
              Strict Music Guardrail &amp; Adaptive Theory
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--color-ns-border)] p-2 text-xs font-semibold text-[var(--color-ns-muted)] hover:bg-[var(--color-ns-border)] hover:text-[var(--color-ns-text)] transition-colors"
          aria-label="Close tutor drawer"
        >
          ✕
        </button>
      </div>

      {/* Song Context Strip if available */}
      {songContext && songContext.title && (
        <div className="flex items-center justify-between border-b border-[var(--color-ns-border)]/60 bg-[var(--color-ns-card)] px-4 py-1.5 text-xs text-[var(--color-ns-muted)]">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-[var(--color-ns-text)]">Context:</span>
            <span className="truncate text-[var(--color-ns-purple-light)]">{songContext.title}</span>
            {songContext.key && <span>· Key: {songContext.key}</span>}
            {songContext.bpm && <span>· {Math.round(songContext.bpm)} BPM</span>}
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-ns-purple)]">Grounded</span>
        </div>
      )}

      {/* Chat Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {/* Level & Guardrail Badge */}
            {msg.role === "assistant" && msg.difficulty_level && (
              <div className="mb-1.5 flex items-center gap-2">
                {msg.difficulty_level === "Off-Topic" || msg.is_music_related === false ? (
                  <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                    ⚠️ Music Guardrail Active
                  </span>
                ) : msg.difficulty_level === "Beginner" ? (
                  <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                    🌱 Beginner Friendly
                  </span>
                ) : msg.difficulty_level === "Intermediate" ? (
                  <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-500">
                    ⚡ Intermediate Theory
                  </span>
                ) : (
                  <span className="rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-400">
                    🎓 Advanced Harmony
                  </span>
                )}
                {msg.cached && (
                  <span
                    title="Answered from Wilsify's shared answer cache: instant, and it didn't use one of your free AI answers"
                    className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-500"
                  >
                    ⚡ Instant Cached
                  </span>
                )}
              </div>
            )}

            {/* Chat Bubble */}
            <div
              className={`max-w-[94%] rounded-2xl p-4 shadow-sm ${
                msg.role === "user"
                  ? "bg-[var(--color-ns-purple)] text-white font-medium"
                  : "border border-[var(--color-ns-border)] bg-[var(--color-ns-raised)]/80 text-[var(--color-ns-text)]"
              }`}
            >
              {msg.role === "user" ? (
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              ) : (
                <MarkdownView content={msg.text} />
              )}

              {/* Interactive Chord & Voice Leading Widget */}
              {msg.role === "assistant" && msg.has_widget && msg.options && msg.options.length > 0 && (
                <TutorChordWidget
                  options={msg.options}
                  widgetTitle={msg.widget_title}
                  defaultBpm={msg.default_bpm}
                />
              )}
            </div>

            {/* Follow-up Suggestions Chips */}
            {msg.role === "assistant" && msg.follow_up_suggestions && msg.follow_up_suggestions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5 pl-1">
                {msg.follow_up_suggestions.map((suggestion, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => void sendQuestion(suggestion)}
                    className="rounded-full border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-1 text-xs text-[var(--color-ns-muted)] transition-all hover:border-[var(--color-ns-purple)]/60 hover:text-[var(--color-ns-purple-light)] hover:shadow-xs active:scale-95"
                  >
                    💬 {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-ns-purple-light)] p-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-ns-purple)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--color-ns-purple)]"></span>
            </span>
            <span>Tutor is formulating voice-leading &amp; theory analysis…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="border-t border-[var(--color-ns-border)] p-3.5 bg-[var(--color-ns-raised)]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about passing chords, scales, theory, or guitar fingerings…"
            className="flex-1 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-4 py-2.5 text-sm text-[var(--color-ns-text)] placeholder-[var(--color-ns-muted)] focus:border-[var(--color-ns-purple)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="flex items-center justify-center rounded-xl bg-[var(--color-ns-purple)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50 transition-all"
          >
            Send
          </button>
        </div>
        {quota && (
          <p
            className={`mt-2 text-[11px] ${
              !quota.is_pro && quota.remaining_free !== null && quota.remaining_free <= 0
                ? "text-amber-500"
                : "text-[var(--color-ns-muted)]"
            }`}
            aria-live="polite"
          >
            {quotaLabel(quota)}
          </p>
        )}
      </form>
    </aside>
  );
}
