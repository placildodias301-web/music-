import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { askAssistant, type SongContext } from "../lib/api";
import { useMvp } from "../lib/MvpContext";
import { getWeakChords } from "../lib/practiceLog";
import { firstNameOf, loadPrefs } from "../lib/account";
import {
  loadConversations,
  newId,
  saveConversations,
  titleFrom,
  type ChatMessage,
  type Conversation,
} from "../lib/assistantChats";

type Mode = "song" | "theory";

interface Topic {
  key: string;
  label: string;
  tint: string;
  icon: ReactNode;
  prompts: string[];
  requiresSong?: boolean;
}

function svg(children: ReactNode, size = 16) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
      {children}
    </svg>
  );
}

const S = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICONS = {
  panel: svg(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" {...S} />
      <path d="M9.5 4.5v15" {...S} />
    </>,
    18
  ),
  compose: svg(
    <>
      <path d="M12 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V12" {...S} />
      <path d="M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7L12.5 14.4 9 15l.6-3.5 8-7.6Z" {...S} />
    </>,
    18
  ),
  search: svg(
    <>
      <circle cx="11" cy="11" r="6.5" {...S} />
      <path d="m20 20-4-4" {...S} />
    </>,
    15
  ),
  plus: svg(<path d="M12 5v14M5 12h14" {...S} strokeWidth={2} />, 18),
  mic: svg(
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" {...S} />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" {...S} />
    </>,
    18
  ),
  send: svg(<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" {...S} strokeWidth={2.2} />, 18),
  pin: svg(<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5ZM12 14v6" {...S} />, 14),
  trash: svg(<path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7" {...S} />, 14),
  copy: svg(
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" {...S} />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" {...S} />
    </>,
    14
  ),
  check: svg(<path d="m5 12.5 4.5 4.5L19 7.5" {...S} strokeWidth={2.2} />, 14),
  retry: svg(<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" {...S} />, 14),
  chat: svg(<path d="M5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6.5a2.5 2.5 0 0 1-2.5 2.5H8.5L5 18.5Z" {...S} />, 14),
  upload: svg(<path d="M12 15V4.5M7.5 9 12 4.5 16.5 9M5 15.5v2A2 2 0 0 0 7 19.5h10a2 2 0 0 0 2-2v-2" {...S} />, 16),
  library: svg(<path d="M6 4h12v16l-6-3.5L6 20V4Z" {...S} />, 16),
  note: svg(
    <>
      <circle cx="7.5" cy="17.5" r="2.5" {...S} />
      <circle cx="17" cy="15.5" r="2.5" {...S} />
      <path d="M10 17.5V6l9.5-2v11.5" {...S} />
    </>,
    15
  ),
  scale: svg(<path d="M4 18h3.5v-3H11v-3h3.5V9H18V6h2" {...S} />, 15),
  rhythm: svg(<path d="M3.5 12h3l2-6 3.5 12 2.5-8 1.5 2h4.5" {...S} />, 15),
  target: svg(
    <>
      <circle cx="12" cy="12" r="8" {...S} />
      <circle cx="12" cy="12" r="4" {...S} />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="currentColor" />
    </>,
    15
  ),
  disc: svg(
    <>
      <circle cx="12" cy="12" r="8" {...S} />
      <circle cx="12" cy="12" r="2.2" {...S} />
    </>,
    15
  ),
};

const TOPICS: Topic[] = [
  {
    key: "song",
    label: "This song",
    tint: "tint-pink",
    icon: ICONS.disc,
    requiresSong: true,
    prompts: ["What key is this song in?", "What chords are used in this song?", "How fast is this song?", "Is this song difficult?"],
  },
  {
    key: "chords",
    label: "Chords",
    tint: "tint-violet",
    icon: ICONS.note,
    prompts: ["What is a C Major chord?", "How do I play G Major?", "What is an A minor chord?", "Explain the C-G-Am-F chord progression"],
  },
  {
    key: "scales",
    label: "Scales & keys",
    tint: "tint-cyan",
    icon: ICONS.scale,
    prompts: ["What is a major scale?", "What is a minor scale?", "What is a key signature?"],
  },
  {
    key: "rhythm",
    label: "Rhythm",
    tint: "tint-orange",
    icon: ICONS.rhythm,
    prompts: ["What is BPM?", "What is a time signature?", "How does a metronome help me practice?"],
  },
  {
    key: "practice",
    label: "Practice",
    tint: "tint-green",
    icon: ICONS.target,
    prompts: ["How should I practice a hard section?", "Give me tips to improve my timing", "What chords have I been struggling with?"],
  },
];

function greetingFor(name: string): string {
  const hour = new Date().getHours();
  const who = name ? `, ${firstNameOf(name)}` : "";
  if (hour < 5) return `Late-night jam${who}?`;
  if (hour < 12) return `Morning warm-up${who}?`;
  if (hour < 17) return `Let's find the groove${who}`;
  if (hour < 22) return `Evening session${who}?`;
  return `Late-night jam${who}?`;
}

function isWide() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ─── Browser speech recognition (Chrome/Edge/Safari), typed minimally ─── */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function getSpeechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Animated brand mark: a glowing orb with a live equaliser inside. */
function SoundOrb({ size = 56, active = true }: { size?: number; active?: boolean }) {
  const bars = [0.45, 0.8, 1, 0.65, 0.9];
  return (
    <span className="sound-orb" style={{ width: size, height: size }} aria-hidden="true">
      <span className="flex h-[42%] items-end gap-[8%]" style={{ width: "46%" }}>
        {bars.map((h, i) => (
          <span
            key={i}
            className="eq-bar flex-1 bg-white"
            style={{
              height: `${h * 100}%`,
              width: "auto",
              animationDelay: `${i * 0.14}s`,
              animationPlayState: active ? "running" : "paused",
            }}
          />
        ))}
      </span>
    </span>
  );
}

/** Reveals an answer word-by-word, like a streamed response. */
function RevealText({ text, animate, onTick, onDone }: { text: string; animate: boolean; onTick: () => void; onDone: () => void }) {
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  const [count, setCount] = useState(animate ? 0 : words.length);

  useEffect(() => {
    if (!animate) return;
    if (prefersReducedMotion()) {
      setCount(words.length);
      onDone();
      return;
    }
    const timer = window.setInterval(() => {
      setCount((c) => {
        const next = Math.min(c + 2, words.length);
        if (next >= words.length) {
          window.clearInterval(timer);
          onDone();
        }
        return next;
      });
    }, 28);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, words.length]);

  useEffect(() => {
    if (animate) onTick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const done = count >= words.length;
  return (
    <>
      {words.slice(0, count).join("")}
      {!done && <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-primary-light" />}
    </>
  );
}

export function Assistant() {
  const { fileName, analysis } = useMvp();
  const [prefs] = useState(loadPrefs);

  const songContext: SongContext | null = useMemo(
    () =>
      analysis
        ? {
            fileName: fileName ?? analysis.fileName,
            key: analysis.key,
            bpm: analysis.bpm,
            timeSignature: analysis.timeSignature,
            chordProgression: analysis.chordProgression,
            difficultyLabel: analysis.difficulty?.difficultyLabel,
            weakChords: getWeakChords().map((w) => w.chord),
          }
        : null,
    [analysis, fileName]
  );

  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(analysis ? "song" : "theory");
  const [input, setInput] = useState("");
  const [thinkingIn, setThinkingIn] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(isWide);
  const [railQuery, setRailQuery] = useState("");
  const [topicKey, setTopicKey] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = useMemo(() => getSpeechCtor() !== null, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];
  const isThinking = thinkingIn !== null;
  const isEmpty = messages.length === 0;
  // Song mode silently falls back to theory when no song is loaded.
  const effectiveMode: Mode = songContext ? mode : "theory";
  const songMode = effectiveMode === "song";

  useEffect(() => saveConversations(conversations), [conversations]);

  function scrollToBottom(smooth = true) {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  useEffect(() => {
    scrollToBottom(false);
  }, [activeId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, thinkingIn]);

  // Auto-grow the composer up to a max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input, isEmpty]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  function updateConversation(id: string, fn: (c: Conversation) => Conversation) {
    setConversations((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }

  async function fetchAnswer(question: string): Promise<ChatMessage> {
    const context = songMode ? songContext : null;
    try {
      const result = await askAssistant(question, context);
      return { id: newId("a"), role: "assistant", text: result.answer, songLabel: context?.fileName };
    } catch {
      return {
        id: newId("a"),
        role: "assistant",
        text: "I couldn't reach the Wilsify assistant service. Check that the backend is running, then try again.",
      };
    }
  }

  async function sendQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isThinking) return;

    const userMessage: ChatMessage = { id: newId("u"), role: "user", text: trimmed };
    let convId = activeId;
    if (!convId) {
      convId = newId("c");
      const created: Conversation = {
        id: convId,
        title: titleFrom(trimmed),
        pinned: false,
        updatedAt: Date.now(),
        messages: [userMessage],
      };
      setConversations((prev) => [created, ...prev]);
      setActiveId(convId);
    } else {
      updateConversation(convId, (c) => ({ ...c, updatedAt: Date.now(), messages: [...c.messages, userMessage] }));
    }

    setInput("");
    setTopicKey(null);
    setThinkingIn(convId);
    const answer = await fetchAnswer(trimmed);
    updateConversation(convId, (c) => ({ ...c, updatedAt: Date.now(), messages: [...c.messages, answer] }));
    setRevealId(answer.id);
    setThinkingIn(null);
  }

  async function askAgain(messageId: string) {
    if (!active || isThinking) return;
    const index = active.messages.findIndex((m) => m.id === messageId);
    const question = active.messages.slice(0, index).reverse().find((m) => m.role === "user");
    if (!question) return;
    const convId = active.id;
    setThinkingIn(convId);
    const answer = await fetchAnswer(question.text);
    updateConversation(convId, (c) => ({
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map((m) => (m.id === messageId ? answer : m)),
    }));
    setRevealId(answer.id);
    setThinkingIn(null);
  }

  function startNewChat() {
    setActiveId(null);
    setInput("");
    setTopicKey(null);
    if (!isWide()) setRailOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function openConversation(id: string) {
    setActiveId(id);
    setRevealId(null);
    if (!isWide()) setRailOpen(false);
  }

  function deleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function togglePin(id: string) {
    updateConversation(id, (c) => ({ ...c, pinned: !c.pinned }));
  }

  async function copyMessage(msg: ChatMessage) {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopiedId(msg.id);
      window.setTimeout(() => setCopiedId((id) => (id === msg.id ? null : id)), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ");
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  const filtered = conversations
    .filter((c) => c.title.toLowerCase().includes(railQuery.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const pinned = filtered.filter((c) => c.pinned);
  const recents = filtered.filter((c) => !c.pinned);

  const visibleTopics = TOPICS.filter((t) => !t.requiresSong || songContext);
  const openTopic = visibleTopics.find((t) => t.key === topicKey) ?? null;

  /* ─── Composer ─── */
  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        sendQuestion(input);
      }}
      className={`composer relative w-full rounded-2xl border bg-[var(--color-ns-card)] transition-colors shadow-lg ${
        songMode ? "border-[var(--color-ns-coral)]/40" : "border-[var(--color-ns-border)]"
      } focus-within:border-[var(--color-ns-coral)]/70`}
    >
      <label htmlFor="assistant-input" className="sr-only">
        Ask the Wilsify assistant
      </label>
      <textarea
        id="assistant-input"
        ref={textareaRef}
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            sendQuestion(input);
          }
        }}
        placeholder={
          listening
            ? "Listening…"
            : songMode
              ? `Ask about “${songContext?.fileName}”…`
              : isEmpty
                ? "Ask about chords, scales, rhythm, or practice advice…"
                : "Reply to Wilsify Tutor…"
        }
        className={`block w-full resize-none bg-transparent px-5 text-sm leading-relaxed text-[var(--color-ns-text)] placeholder:text-[var(--color-ns-muted)] focus:outline-none focus-visible:shadow-none ${
          isEmpty ? "min-h-[56px] pt-4 pb-2" : "pt-3.5 pb-1.5"
        }`}
      />

      <div className="flex items-center gap-2 px-3 pb-3">
        {/* Attach menu */}
        <div className="relative">
          <button
            type="button"
            aria-label="Add a song"
            aria-expanded={attachOpen}
            onClick={() => setAttachOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--color-ns-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--color-ns-text)]"
          >
            {ICONS.plus}
          </button>
          {attachOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAttachOpen(false)} />
              <div
                className={`animate-fadeIn absolute left-0 z-20 w-56 rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-1.5 shadow-2xl ${
                  isEmpty ? "top-11" : "bottom-11"
                }`}
              >
                <Link
                  to="/upload"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-[var(--color-ns-text)] hover:bg-[var(--color-ns-raised)]"
                >
                  <span className="text-[var(--color-ns-coral)]">{ICONS.upload}</span>
                  Analyze a new song
                </Link>
                <Link
                  to="/library"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-[var(--color-ns-text)] hover:bg-[var(--color-ns-raised)]"
                >
                  <span className="text-[var(--color-ns-blue)]">{ICONS.library}</span>
                  Open from library
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Mode switch */}
        <div role="radiogroup" aria-label="Answer mode" className="flex rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] p-0.5">
          {(["theory", "song"] as Mode[]).map((m) => {
            const disabled = m === "song" && !songContext;
            const selected = effectiveMode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                title={disabled ? "Analyze a song to unlock song-grounded answers" : undefined}
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  selected
                    ? "bg-[var(--color-ns-raised)] text-[var(--color-ns-text)] shadow-sm font-bold"
                    : "text-[var(--color-ns-muted)] hover:text-[var(--color-ns-text)] disabled:cursor-not-allowed disabled:opacity-40"
                }`}
              >
                {m === "theory" ? "Theory" : "Song"}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {songMode && songContext && (
            <span className="hidden max-w-[220px] items-center gap-1.5 rounded-lg border border-[var(--color-ns-violet)]/30 bg-[var(--color-ns-violet)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--color-ns-violet)] sm:inline-flex" title={songContext.fileName}>
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-ns-violet)]" />
              <span className="truncate">
                {songContext.key} · {songContext.bpm} BPM
              </span>
            </span>
          )}
          {speechSupported && (
            <button
              type="button"
              aria-label={listening ? "Stop dictation" : "Dictate a question"}
              aria-pressed={listening}
              onClick={toggleListening}
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                listening ? "bg-[var(--color-ns-coral)]/15 text-[var(--color-ns-coral)]" : "text-[var(--color-ns-muted)] hover:bg-white/[0.06] hover:text-[var(--color-ns-text)]"
              }`}
            >
              {listening ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-ns-coral)]" /> : ICONS.mic}
            </button>
          )}
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim() || isThinking}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-ns-coral)] text-[var(--color-ns-ink)] shadow-md transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {input.trim() || isThinking ? ICONS.send : <SoundOrbIcon />}
          </button>
        </div>
      </div>
    </form>
  );

  /* ─── Chat rail ─── */
  const rail = railOpen && (
    <>
      <div className="animate-fadeIn absolute inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setRailOpen(false)} />
      <aside
        aria-label="Conversations"
        className="absolute inset-y-0 left-0 z-30 flex w-[272px] flex-shrink-0 flex-col border-r border-[var(--color-ns-border)] bg-[var(--color-ns-bg)] lg:static lg:z-auto lg:w-[260px]"
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <span className="px-1 font-heading text-sm font-bold text-[var(--color-ns-text)]">Chats</span>
          <button
            type="button"
            aria-label="Hide chat list"
            onClick={() => setRailOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-ns-muted)] hover:bg-white/[0.05] hover:text-[var(--color-ns-text)]"
          >
            {ICONS.panel}
          </button>
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={startNewChat}
            className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-2 text-xs sm:text-sm font-semibold text-[var(--color-ns-text)] transition-colors hover:border-[var(--color-ns-border-strong)] hover:bg-[var(--color-ns-raised)]"
          >
            <span className="text-[var(--color-ns-coral)]">{ICONS.compose}</span>
            New chat
          </button>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] px-3 py-1.5 focus-within:border-[var(--color-ns-coral)]/60">
            <span className="text-[var(--color-ns-muted)]">{ICONS.search}</span>
            <input
              value={railQuery}
              onChange={(e) => setRailQuery(e.target.value)}
              aria-label="Search chats"
              placeholder="Search chats"
              className="w-full bg-transparent text-xs text-[var(--color-ns-text)] placeholder:text-[var(--color-ns-muted)] focus:outline-none focus-visible:shadow-none"
            />
          </div>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
          {songContext && (
            <div className="mb-4 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-ns-coral)]">Active Track</p>
              <p className="mt-1 truncate text-xs font-semibold text-[var(--color-ns-text)]" title={songContext.fileName}>
                {songContext.fileName}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--color-ns-muted)]">
                {songContext.key} · {songContext.bpm} BPM · {songContext.timeSignature}
              </p>
            </div>
          )}

          {conversations.length === 0 ? (
            <p className="px-2 pt-2 text-xs leading-relaxed text-[var(--color-ns-muted)]">
              Your conversations will appear here. They're saved locally in your browser.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 pt-2 text-xs text-[var(--color-ns-muted)]">No chats match “{railQuery}”.</p>
          ) : (
            <>
              {pinned.length > 0 && (
                <RailGroup label="Pinned">
                  {pinned.map((c) => (
                    <RailItem key={c.id} c={c} active={c.id === activeId} onOpen={openConversation} onPin={togglePin} onDelete={deleteConversation} />
                  ))}
                </RailGroup>
              )}
              {recents.length > 0 && (
                <RailGroup label="Recents">
                  {recents.map((c) => (
                    <RailItem key={c.id} c={c} active={c.id === activeId} onOpen={openConversation} onPin={togglePin} onDelete={deleteConversation} />
                  ))}
                </RailGroup>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      {rail}

      <section className="relative flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex h-14 flex-shrink-0 items-center gap-2 px-3 sm:px-5">
          {!railOpen && (
            <>
              <button
                type="button"
                aria-label="Show chat list"
                onClick={() => setRailOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted hover:bg-white/[0.05] hover:text-content"
              >
                {ICONS.panel}
              </button>
              <button
                type="button"
                aria-label="New chat"
                onClick={startNewChat}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted hover:bg-white/[0.05] hover:text-content"
              >
                {ICONS.compose}
              </button>
            </>
          )}
          <p className="min-w-0 truncate px-1 text-sm font-semibold text-content-light">{active ? active.title : ""}</p>
          <span className="chip tint-green ml-auto">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
            Wilsify Tutor
          </span>
        </div>

        {isEmpty ? (
          /* ─── Empty state ─── */
          <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 pb-10">
            <div className="flex w-full max-w-[720px] flex-1 flex-col items-center justify-center py-8">
              <div className="animate-slide-up flex flex-col items-center text-center">
                <SoundOrb size={60} />
                <h2 className="mt-5 font-heading text-[28px] font-bold tracking-tight text-content sm:text-4xl">
                  {greetingFor(prefs.name)}
                </h2>
                <p className="mt-2 max-w-md text-sm text-content-muted">
                  {songContext ? (
                    <>
                      Ready to break down <span className="font-semibold text-content-light">“{songContext.fileName}”</span> —{" "}
                      {songContext.key}, {songContext.bpm} BPM.
                    </>
                  ) : (
                    <>
                      Ask about chords, scales, rhythm or practice.{" "}
                      <Link to="/upload" className="link-accent">
                        Analyze a song
                      </Link>{" "}
                      for answers grounded in real audio.
                    </>
                  )}
                </p>
              </div>

              <div className="animate-slide-up mt-8 w-full" style={{ animationDelay: "60ms" }}>
                {composer}
              </div>

              <div className="animate-slide-up mt-5 flex flex-wrap justify-center gap-2" style={{ animationDelay: "120ms" }}>
                {visibleTopics.map((t) => {
                  const selected = topicKey === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      aria-expanded={selected}
                      onClick={() => setTopicKey(selected ? null : t.key)}
                      className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all active:scale-95 ${
                        selected
                          ? "border-[var(--color-ns-coral)]/60 bg-[var(--color-ns-coral)]/15 text-[var(--color-ns-text)] shadow-sm font-bold"
                          : "border-[var(--color-ns-border)] bg-[var(--color-ns-card)] text-[var(--color-ns-muted)] hover:border-[var(--color-ns-border-strong)] hover:text-[var(--color-ns-text)]"
                      }`}
                    >
                      <span>{t.icon}</span>
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {openTopic && (
                <div className="animate-fadeIn mt-4 w-full overflow-hidden rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] shadow-md">
                  {openTopic.prompts.map((p, i) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => sendQuestion(p)}
                      className={`group flex w-full items-center gap-3 px-4 py-3 text-left text-xs sm:text-sm text-[var(--color-ns-text)] transition-colors hover:bg-[var(--color-ns-raised)] ${
                        i > 0 ? "border-t border-[var(--color-ns-border)]" : ""
                      }`}
                    >
                      <span className="text-[var(--color-ns-coral)] opacity-80 group-hover:opacity-100">{openTopic.icon}</span>
                      <span className="flex-1">{p}</span>
                      <span className="text-[var(--color-ns-muted)] opacity-0 transition-opacity group-hover:opacity-100">↵</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ─── Conversation ─── */
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
              <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-6">
                {messages.map((msg) =>
                  msg.role === "user" ? (
                    <div key={msg.id} className="animate-fadeIn flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm border border-[var(--color-ns-border-strong)] bg-[var(--color-ns-raised)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ns-text)] sm:max-w-[75%] shadow-sm">
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    <div key={msg.id} className="group flex gap-3.5">
                      <div className="mt-0.5 flex-shrink-0">
                        <SoundOrb size={30} active={revealId === msg.id} />
                      </div>
                      <div className="min-w-0 flex-1">
                        {msg.songLabel && (
                          <span className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-ns-violet)]/30 bg-[var(--color-ns-violet)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-ns-violet)]">
                            {ICONS.disc}
                            <span className="truncate">Grounded in {msg.songLabel}</span>
                          </span>
                        )}
                        <div className="whitespace-pre-wrap text-sm sm:text-[15px] leading-relaxed text-[var(--color-ns-text)]">
                          <RevealText
                            text={msg.text}
                            animate={revealId === msg.id}
                            onTick={() => scrollToBottom(false)}
                            onDone={() => setRevealId((id) => (id === msg.id ? null : id))}
                          />
                        </div>
                        {revealId !== msg.id && (
                          <div className="mt-2.5 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                            <ActionButton label={copiedId === msg.id ? "Copied" : "Copy"} onClick={() => copyMessage(msg)}>
                              {copiedId === msg.id ? ICONS.check : ICONS.copy}
                            </ActionButton>
                            <ActionButton label="Ask again" onClick={() => askAgain(msg.id)} disabled={isThinking}>
                              {ICONS.retry}
                            </ActionButton>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}

                {thinkingIn === active?.id && (
                  <div className="animate-fadeIn flex items-center gap-3">
                    <SoundOrb size={30} />
                    <span className="text-xs sm:text-sm font-medium text-[var(--color-ns-muted)] animate-pulse">
                      Analyzing music theory…
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 px-4 pb-4">
              <div className="mx-auto w-full max-w-[760px]">
                {composer}
                <p className="mt-2 text-center text-[11px] text-content-dim">
                  Wilsify Tutor is a rule-based demo — answers cover core music theory and your analyzed song.
                </p>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Mini waveform glyph shown in the send button while the composer is empty. */
function SoundOrbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 10v4M9.5 6.5v11M14.5 8.5v7M19 10.5v3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function RailGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1 px-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-content-dim/80">{label}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function RailItem({
  c,
  active,
  onOpen,
  onPin,
  onDelete,
}: {
  c: Conversation;
  active: boolean;
  onOpen: (id: string) => void;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={`group relative flex items-center rounded-lg transition-colors ${
        active ? "bg-white/[0.07] text-content" : "text-content-muted hover:bg-white/[0.04] hover:text-content"
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(c.id)}
        aria-current={active ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-[13px]"
      >
        <span className={active ? "text-primary-light" : "text-content-dim"}>{c.pinned ? ICONS.pin : ICONS.chat}</span>
        <span className="truncate">{c.title}</span>
      </button>
      <div className="flex flex-shrink-0 items-center pr-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={c.pinned ? `Unpin ${c.title}` : `Pin ${c.title}`}
          onClick={() => onPin(c.id)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-content-dim hover:bg-white/[0.06] hover:text-content"
        >
          {ICONS.pin}
        </button>
        <button
          type="button"
          aria-label={`Delete ${c.title}`}
          onClick={() => onDelete(c.id)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-content-dim hover:bg-pink/10 hover:text-pink"
        >
          {ICONS.trash}
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-content-dim transition-colors hover:bg-white/[0.05] hover:text-content disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
      {label}
    </button>
  );
}
