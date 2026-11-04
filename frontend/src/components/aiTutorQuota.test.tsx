/**
 * AI Tutor drawer cost-control UI: a stable per-browser client id on every request,
 * the remaining free answers, and the "Instant Cached" badge on cached answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiTutorDrawer } from "./AiTutorDrawer";

const answer = (cached: boolean, remaining: number | null, isPro = false) => ({
  is_music_related: true,
  difficulty_level: "Beginner",
  answer_markdown: "Try D Dorian over a slow minor blues.",
  follow_up_suggestions: [],
  cached,
  quota_exceeded: remaining === 0,
  quota: { remaining_free: remaining, daily_limit: 10, is_pro: isPro, cached },
});

let calls: { url: string; headers: Record<string, string> }[];

function installFetch(responses: unknown[]) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      if (url.endsWith("/api/tutor/quota")) {
        return new Response(JSON.stringify({ remaining_free: 9, daily_limit: 10, is_pro: false, cached: false }));
      }
      return new Response(JSON.stringify(responses.shift()));
    }),
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

async function ask(question: string) {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(/Ask about passing chords/), question);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

describe("AI Tutor quota and cache", () => {
  it("shows today's free answers, sends one client id, and badges cached answers", async () => {
    installFetch([answer(false, 8), answer(true, 8)]);
    render(<AiTutorDrawer isOpen onClose={() => {}} />);
    expect(await screen.findByText("9 of 10 free AI answers left today")).toBeInTheDocument();

    await ask("Which scale works over a slow minor blues?");
    expect(await screen.findByText("8 of 10 free AI answers left today")).toBeInTheDocument();
    expect(screen.queryByText("⚡ Instant Cached")).not.toBeInTheDocument();

    await ask("which scale works over a slow minor blues");
    expect(await screen.findByText("⚡ Instant Cached")).toBeInTheDocument();

    const ids = calls.map((c) => c.headers["X-Client-ID"]);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(localStorage.getItem("wilsify_tutor_client_id")).toBe(ids[0]);
  });

  it("says when the free answers are used up, and shows Pro as unlimited", async () => {
    installFetch([answer(false, 0)]);
    const { unmount } = render(<AiTutorDrawer isOpen onClose={() => {}} />);
    await ask("What is a Neapolitan sixth?");
    expect(await screen.findByText(/free AI answers are used up/)).toBeInTheDocument();
    unmount();

    installFetch([answer(false, null, true)]);
    render(<AiTutorDrawer isOpen onClose={() => {}} />);
    await ask("What is a Neapolitan sixth?");
    await waitFor(() => expect(screen.getByText("Wilsify Pro · unlimited AI answers")).toBeInTheDocument());
  });
});
