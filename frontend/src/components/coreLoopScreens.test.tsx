/**
 * TASK-10 — core-loop screens, tested through the real rendered app.
 *
 * The real <App/> runs (router, auth provider, route guard, app shell, pages,
 * Library/localStorage code, cloud-sync code). Only the outside world is faked:
 * Supabase (at the `lib/supabase` module boundary) and the browser APIs jsdom
 * lacks. Each test starts from empty storage/DOM (see src/test/setup.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ErrorBanner } from "./ErrorBanner";
import { ErrorBoundary } from "./ErrorBoundary";
import { renderApp, refreshApp } from "../test/renderApp";
import { fakeSupabaseClient, fakeSupabaseState, makeSession, resetFakeSupabase } from "../test/fakeSupabase";
import { installFakeAudio } from "../test/fakeAudio";
import { installFakeFetch } from "../test/fakeNetwork";
import { seedSong, SONG_FILE } from "../test/fixtures";
import { clearSyncError } from "../lib/cloudSync";
import { getLibrary, resolveLibrarySong } from "../lib/library";
import { loadLyrics } from "../lib/song/songStore";

vi.mock("../lib/supabase", async () => (await import("../test/fakeSupabase")).fakeSupabaseModule());

const session = makeSession();

beforeEach(() => {
  resetFakeSupabase();
  installFakeAudio();
  installFakeFetch(); // any unexpected network call fails the test loudly
});

afterEach(() => {
  clearSyncError(); // module-level state in cloudSync
});

/** The app shell wraps every page in <main>; scoping to it avoids matching sidebar/nav labels. */
const page = () => within(screen.getByRole("main"));

// ─────────────────────────────────────────────────────────────────────────────
describe("Protected routes", () => {
  it.each(["/library", "/practice", "/upload", "/song/current", "/community", "/settings/plans"])(
    "sends a signed-out visitor from %s to the login screen and shows why",
    async (path) => {
      await renderApp({ session: null, path });

      expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
      expect(window.location.pathname).toBe("/login");
      expect(screen.getByText("Please sign in to continue.")).toBeInTheDocument();
      // None of the protected content (or the app shell navigation) was rendered.
      expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Song Library" })).not.toBeInTheDocument();
    },
  );

  it("lets a signed-in user open a protected route", async () => {
    await renderApp({ session, path: "/library" });

    expect(await screen.findByRole("heading", { name: "Song Library" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/library");
    expect(screen.queryByRole("heading", { name: "Welcome back" })).not.toBeInTheDocument();
  });

  it("shows the 'Checking your session' screen, not protected content, while the session is still being verified", async () => {
    // A getSession() that never settles keeps the auth controller in its "loading" state.
    vi.spyOn(fakeSupabaseClient.auth, "getSession").mockReturnValue(new Promise<never>(() => {}));

    await renderApp({ session, path: "/library", waitForShell: false });

    expect(await screen.findByText("Checking your session...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Song Library" })).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ErrorBanner", () => {
  const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature";

  it("renders title, message, action, request ID and sanitized technical details; Retry calls the handler", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render_(
      <ErrorBanner
        title="Can't reach the server"
        message="Check your connection and try again."
        actionLabel="Retry"
        onAction={onRetry}
        requestId="req-1234-abcd"
        technicalDetails={`Error: 401\n    at fetchIt (/srv/app/api.ts:12:34)\nAuthorization: Bearer ${JWT}`}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Can't reach the server" })).toBeInTheDocument();
    expect(within(alert).getByText("Check your connection and try again.")).toBeInTheDocument();

    // Technical details are collapsed until asked for.
    expect(screen.queryByText(/req-1234-abcd/)).not.toBeInTheDocument();
    const toggle = within(alert).getByRole("button", { name: "Technical details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);

    expect(within(alert).getByRole("button", { name: "Hide technical details" })).toHaveAttribute("aria-expanded", "true");
    expect(within(alert).getByText("req-1234-abcd")).toBeInTheDocument();
    expect(alert).toHaveTextContent("Request ID:");
    expect(alert).toHaveTextContent("[token redacted]");
    expect(alert).not.toHaveTextContent("doNotLeakThisSignature");
    expect(alert).not.toHaveTextContent("eyJhbGciOiJIUzI1NiIs");
    expect(alert).not.toHaveTextContent("/srv/app/api.ts");

    expect(onRetry).not.toHaveBeenCalled();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("warning severity is announced politely (status) and secondary action works", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render_(
      <ErrorBanner severity="warning" title="Heads up" message="Something is slow." secondaryActionLabel="Dismiss" onSecondaryAction={onDismiss} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Heads up");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ErrorBoundary turns a crashing page into an ErrorBanner with sanitized details instead of a blank screen", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {}); // React logs the intentional crash
    function Crash(): never {
      throw new Error(`boom Bearer ${JWT}`);
    }
    render_(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Technical details" }));
    expect(alert).toHaveTextContent("boom Bearer [token redacted]");
    expect(alert).not.toHaveTextContent("doNotLeakThisSignature");
  });
});

function render_(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ─────────────────────────────────────────────────────────────────────────────
describe("Empty states and next-step CTAs", () => {
  it("Library with no songs explains itself and its CTA goes to Upload", async () => {
    const { user } = await renderApp({ session, path: "/library" });

    expect(await page().findByRole("heading", { name: "No Saved Tracks Yet" })).toBeInTheDocument();
    expect(page().getByText("Upload an audio file or search YouTube to create your first chord sheet.")).toBeInTheDocument();

    await user.click(page().getByRole("button", { name: "Upload a Track" }));

    expect(await page().findByRole("heading", { name: "Select media" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/upload");
  });

  it("Library 'Return to Studio' CTA leaves the empty state", async () => {
    const { user } = await renderApp({ session, path: "/library" });
    await user.click(await page().findByRole("button", { name: "Return to Studio" }));
    await waitFor(() => expect(window.location.pathname).toBe("/studio"));
  });

  it("/song/current with nothing analysed shows the 'No active song' state and its Library CTA works", async () => {
    const { user } = await renderApp({ session, path: "/song/current" });

    expect(await page().findByText("No active song")).toBeInTheDocument();
    expect(page().getByText("Choose a song from your Library or upload a new one.")).toBeInTheDocument();
    expect(page().getByRole("link", { name: "Upload a song" })).toHaveAttribute("href", "/upload");
    // Practice Studio can't open without a song, and says why.
    const practice = page().getByRole("button", { name: "Open Practice Studio" });
    expect(practice).toBeDisabled();
    expect(practice).toHaveAttribute("title", "Analyze or select a song first to open Practice Studio");

    await user.click(page().getByRole("link", { name: "Open Library" }));
    expect(await page().findByRole("heading", { name: "Song Library" })).toBeInTheDocument();
  });

  it("an unknown /song/:id also lands on 'No active song' rather than crashing", async () => {
    await renderApp({ session, path: "/song/does-not-exist" });
    expect(await page().findByText("No active song")).toBeInTheDocument();
  });

  it("a saved song without lyrics shows its chord sheet plus an 'Add lyrics' CTA that opens the editor", async () => {
    const saved = seedSong();
    const { user } = await renderApp({ session, path: `/song/${saved.id}` });

    expect(await page().findByRole("button", { name: "Open Practice Studio" })).toBeInTheDocument();

    // The chord sheet is rendered even though there are no lyrics: every chord of the progression is on it.
    const sheetSections = page().getAllByRole("region");
    expect(sheetSections.length).toBeGreaterThan(0);
    const sheetText = sheetSections.map((r) => r.textContent ?? "").join(" ");
    for (const chord of ["C", "G", "Am", "F"]) expect(sheetText).toContain(chord);
    expect(page().getByText(/Add lyrics to see them synced with your chords/)).toBeInTheDocument();

    const addButtons = page().getAllByRole("button", { name: "Add lyrics" });
    expect(addButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(addButtons[0]);

    expect(await page().findByRole("textbox", { name: "Lyrics" })).toBeInTheDocument();
    expect(page().getByRole("button", { name: "Save lyrics" })).toBeDisabled(); // nothing to save yet
  });

  it("Community shows 'Coming soon' and no fake leaderboard, posts or social actions", async () => {
    await renderApp({ session, path: "/community" });

    expect(await page().findByRole("heading", { name: "Community features are coming soon." })).toBeInTheDocument();
    expect(page().getAllByText(/coming soon/i).length).toBeGreaterThan(0);

    // The fake people that still exist in the data model must not leak into the UI.
    for (const name of ["Marcus Chen", "Elena Rostova", "Wilbur Nathan", "Jordan Brooks", "Aria Thorne"]) {
      expect(page().queryByText(name)).not.toBeInTheDocument();
    }
    expect(page().queryByText(/leaderboard|top practicers|\bxp\b/i)).not.toBeInTheDocument();
    expect(page().queryByRole("button", { name: /like|follow|post|share|comment|join/i })).not.toBeInTheDocument();
    expect(page().queryByRole("tab")).not.toBeInTheDocument();
    // The only actions are real, working links.
    expect(page().getByRole("link", { name: "Analyze a Song" })).toHaveAttribute("href", "/upload");
    expect(page().getByRole("link", { name: "Return to Studio" })).toHaveAttribute("href", "/studio");
  });

  it("Plans shows 'Coming soon' with the free-MVP explanation and no purchase or checkout controls", async () => {
    await renderApp({ session, path: "/settings/plans" });

    expect(await page().findByRole("heading", { name: "Paid plans are coming soon." })).toBeInTheDocument();
    expect(page().getByText("Paid plans are coming soon. Wilsify AI is currently free during MVP testing.")).toBeInTheDocument();
    expect(page().getByText("Free MVP Access Included")).toBeInTheDocument();

    const money = /buy|purchase|checkout|subscribe|upgrade|pay\b|payment|billing|₹|\$\d|per month|\/mo/i;
    expect(page().queryByRole("button", { name: money })).not.toBeInTheDocument();
    expect(page().queryByRole("link", { name: money })).not.toBeInTheDocument();
    expect(page().queryByText(money)).not.toBeInTheDocument();
    expect(page().queryByRole("switch")).not.toBeInTheDocument(); // no monthly/annual toggle
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Supabase sync failure", () => {
  it("shows a non-blocking warning while the local Library stays fully usable", async () => {
    const saved = seedSong();
    const before = localStorage.getItem("wilsify_library_v1");
    fakeSupabaseState.userDataError = { message: "connection refused", code: "08006" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { user } = await renderApp({ session, path: "/library" });

    // Warning appears (status, polite — it does not interrupt)…
    const banner = await screen.findByRole("status", {}, { timeout: 3000 });
    expect(within(banner).getByRole("heading", { name: "Cloud Sync Unavailable" })).toBeInTheDocument();
    expect(banner).toHaveTextContent("safely saved on this device");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // …and the page itself still works: the song is listed and opens.
    expect(await page().findByText("core_loop_test")).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
    await user.click(page().getByRole("button", { name: "Open" }));
    expect(await page().findByRole("button", { name: "Open Practice Studio" })).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/song/${saved.id}`);

    // Nothing was lost locally.
    expect(localStorage.getItem("wilsify_library_v1")).toBe(before);
    expect(getLibrary()).toHaveLength(1);

    // The warning can be dismissed.
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Cloud Sync Unavailable" })).not.toBeInTheDocument());
  });

  it("does not show the warning when sync works, and pushes the local song to the account", async () => {
    seedSong();
    await renderApp({ session, path: "/library" });
    expect(await page().findByText("core_loop_test")).toBeInTheDocument();
    await waitFor(() => expect(fakeSupabaseState.upserts.some((r) => r.kind === "library")).toBe(true));
    expect(screen.queryByRole("heading", { name: "Cloud Sync Unavailable" })).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/** Lyrics are rendered word by word, so compare the line with whitespace ignored. */
function expectLyricsOnSheet() {
  const verse = page().getByRole("region", { name: "Verse 1" });
  const flat = (verse.textContent ?? "").replace(/\s+/g, "");
  expect(flat).toContain("WhenIfindmyselfintimesoftrouble");
  expect(flat).toContain("MotherMarycomestome");
}

const LYRICS = "[Verse 1]\nWhen I find myself in times of trouble\nMother Mary comes to me";

describe("Song sheet: lyrics are the same on /song/current and /song/:songId", () => {
  async function addLyrics(user: ReturnType<typeof userEvent.setup>) {
    await user.click(page().getAllByRole("button", { name: "Add lyrics" })[0]);
    const box = await page().findByRole("textbox", { name: "Lyrics" });
    await user.click(box);
    // paste: user-event's keyboard syntax treats "[" specially, and lyrics contain brackets
    await user.paste(LYRICS);
    await user.click(page().getByRole("button", { name: "Save lyrics" }));
    await waitFor(expectLyricsOnSheet);
  }

  it("lyrics saved on /song/current are visible when the song is opened from the Library (/song/:songId)", async () => {
    const saved = seedSong();
    const { user } = await renderApp({ session, path: "/song/current" });
    expect(await page().findByRole("button", { name: "Open Practice Studio" })).toBeInTheDocument();

    await addLyrics(user);

    await user.click(screen.getAllByRole("link", { name: /^Library/ })[0]);
    await user.click(await page().findByRole("button", { name: "Open" }));
    expect(window.location.pathname).toBe(`/song/${saved.id}`);
    await waitFor(expectLyricsOnSheet);
    expect(page().getByRole("button", { name: "Edit lyrics" })).toBeInTheDocument();
    expect(loadLyrics(saved.id)?.raw).toBe(LYRICS);
    expect(resolveLibrarySong(saved.id)?.lyrics?.raw).toBe(LYRICS);
  });

  it("lyrics saved on /song/:songId are visible on /song/current, including after a full refresh", async () => {
    const saved = seedSong();
    const first = await renderApp({ session, path: `/song/${saved.id}` });
    expect(await page().findByRole("button", { name: "Open Practice Studio" })).toBeInTheDocument();

    await addLyrics(first.user);

    await first.user.click(screen.getAllByRole("link", { name: "Chord Sheet" })[0]);
    expect(window.location.pathname).toBe("/song/current");
    await waitFor(expectLyricsOnSheet);

    const second = await refreshApp(first, { session, path: "/song/current" });
    await waitFor(expectLyricsOnSheet);
    expect(second.user).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Transpose, capo and simplify persist across a refresh", () => {
  it("restores all three from the saved Library record", async () => {
    const saved = seedSong(SONG_FILE, {
      chordProgression: ["Cmaj7", "G7", "Am7", "Fmaj7"],
      chordTimeline: [
        { chord: "Cmaj7", start: 0, end: 2, confidence: 0.9 },
        { chord: "G7", start: 2, end: 4, confidence: 0.9 },
        { chord: "Am7", start: 4, end: 6, confidence: 0.9 },
        { chord: "Fmaj7", start: 6, end: 8, confidence: 0.9 },
      ],
    });
    const first = await renderApp({ session, path: `/song/${saved.id}` });
    const { user } = first;
    await page().findByRole("button", { name: "Open Practice Studio" });

    await user.click(page().getByRole("button", { name: "Transpose up one semitone" }));
    await user.click(page().getByRole("button", { name: "Transpose up one semitone" }));
    await user.click(page().getByRole("checkbox", { name: "Simplify chords" }));
    await user.click(page().getByRole("button", { name: "No capo" })); // opens the capo picker
    await user.click(screen.getByRole("radio", { name: "Capo 2" })); // picker is rendered in a portal, outside <main>

    // Visible effect right now: +2 semitones, capo 2, simplified.
    expect(page().getByText("+2")).toBeInTheDocument();
    expect(page().getByRole("button", { name: "Capo 2" })).toBeInTheDocument();
    expect(page().getByRole("checkbox", { name: "Simplify chords" })).toBeChecked();

    const stored = resolveLibrarySong(saved.id);
    expect(stored).toMatchObject({ transpose: 2, capo: 2, simplify: true });

    // Refresh the page: React state is gone, storage survives.
    await refreshApp(first, { session, path: `/song/${saved.id}` });
    await page().findByRole("button", { name: "Open Practice Studio" });

    expect(page().getByText("+2")).toBeInTheDocument();
    expect(page().getByRole("checkbox", { name: "Simplify chords" })).toBeChecked();
    expect(page().getByRole("button", { name: "Capo 2" })).toBeInTheDocument();
    expect(resolveLibrarySong(saved.id)).toMatchObject({ transpose: 2, capo: 2, simplify: true });
  });
});
