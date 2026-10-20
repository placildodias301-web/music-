/** Assistant conversations: kept in localStorage, synced to the account (cloudSync). */
import { SYNCED_KEYS, syncList } from "./cloudSync";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Song the answer was grounded in, if any. */
  songLabel?: string;
}

export interface Conversation {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: number;
  messages: ChatMessage[];
}

const STORAGE_KEY = SYNCED_KEYS.chat;
const MAX_CONVERSATIONS = 50;

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]) {
  try {
    const kept = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
    syncList("chat", loadConversations(), kept);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // non-fatal for the demo
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 40).trimEnd()}…` : clean;
}
