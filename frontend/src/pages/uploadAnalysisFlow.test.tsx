/**
 * TASK-10 — upload → analysis → Library, through the real app.
 *
 * Faked at the network boundary only: the analysis upload's XMLHttpRequest
 * (the app's real NDJSON stream parser, error classification, cancel and
 * Library-save code all run) and fetch (rights attestation). Supabase is
 * faked at the module boundary.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp, refreshApp } from "../test/renderApp";
import { fakeSupabaseState, makeSession, resetFakeSupabase } from "../test/fakeSupabase";
import { installFakeAudio } from "../test/fakeAudio";
import { installFakeFetch, installFakeXhr, successfulAnalysisEvents, xhrBehaviour } from "../test/fakeNetwork";
import { audioFile, makeAnalysis, SONG_FILE } from "../test/fixtures";
import { getLibrary } from "../lib/library";

vi.mock("../lib/supabase", async () => (await import("../test/fakeSupabase")).fakeSupabaseModule());

const session = makeSession();
const analysis = makeAnalysis();
let fetchCalls: ReturnType<typeof installFakeFetch>;

beforeEach(() => {
  resetFakeSupabase();
  installFakeAudio();
  installFakeXhr();
  fetchCalls = installFakeFetch({ "/api/rights-attestation": () => new Response("{}", { status: 200 }) });
});

const page = () => within(screen.getByRole("main"));

/** Fills the Upload form the way a user would: pick a file, confirm rights. */
async function chooseFileAndConfirm(user: Awaited<ReturnType<typeof renderApp>>["user"], file: File, { confirmRights = true } = {}) {
  await page().findByRole("heading", { name: "Select media" });
  // The real <input type="file"> is visually hidden and has no label (the "Browse files" tab only
  // calls .click() on it), so it is the one place a role query cannot reach. It is the only file input on the page.
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not found");
  await user.upload(input, file);
  if (confirmRights) await user.click(page().getByRole("checkbox", { name: /I confirm I own this audio/ }));
}

describe("Successful analysis", () => {
  it("auto-saves the song to the Library, opens the analysis, and survives a page refresh", async () => {
    xhrBehaviour.script = (xhr) => xhr.streamEvents(successfulAnalysisEvents(analysis));
    const first = await renderApp({ session, path: "/upload" });
    const { user } = first;

    await chooseFileAndConfirm(user, audioFile());
    expect(await page().findByText(SONG_FILE)).toBeInTheDocument();
    expect(page().getByText("Ready")).toBeInTheDocument();

    await user.click(page().getByRole("button", { name: "Analyze Song" }));

    // Real request: right endpoint, tagged with where the audio came from, carrying the file.
    await waitFor(() => expect(xhrBehaviour.instances).toHaveLength(1));
    const xhr = xhrBehaviour.instances[0];
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/analyze/stream");
    expect(xhr.headers["X-Source-Type"]).toBe("file");
    expect((xhr.body as FormData).get("file")).toBeInstanceOf(File);
    // The rights attestation is logged before the upload.
    expect(fetchCalls.some((c) => c.url.endsWith("/api/rights-attestation"))).toBe(true);

    // The app finishes by showing the analysis (it holds the 100% bar briefly first).
    await waitFor(() => expect(window.location.pathname).toBe("/analysis"), { timeout: 3000 });

    // Saved as a completed Library song, with the full analysis.
    const lib = getLibrary();
    expect(lib).toHaveLength(1);
    expect(lib[0].fileName).toBe(SONG_FILE);
    expect(lib[0].analysis.chordProgression).toEqual(["C", "G", "Am", "F"]);

    // …and synced to the account.
    await waitFor(() => expect(fakeSupabaseState.upserts.some((r) => r.kind === "library" && r.id === lib[0].id)).toBe(true));

    // Simulated refresh: all React state gone, only storage remains.
    const second = await refreshApp(first, { session, path: "/library" });
    expect(await page().findByText("core_loop_test")).toBeInTheDocument();
    expect(page().getByText("1 track")).toBeInTheDocument();
    expect(getLibrary()[0].id).toBe(lib[0].id);

    // The active song is restored too, so the chord sheet opens straight away.
    await refreshApp(second, { session, path: "/song/current" });
    expect(await page().findByRole("button", { name: "Open Practice Studio" })).toBeInTheDocument();
    const sheetText = page().getAllByRole("region").map((r) => r.textContent ?? "").join(" ");
    for (const chord of ["C", "G", "Am", "F"]) expect(sheetText).toContain(chord);
  });
});

describe("Failed or cancelled analysis is never saved as a completed song", () => {
  it("a server-side failure shows what went wrong, offers retry, and saves nothing", async () => {
    xhrBehaviour.script = (xhr) =>
      xhr.streamEvents([
        { type: "progress", stage: "decoding", progress: 10 },
        { type: "error", status: 400, detail: "That file could not be decoded as audio." },
      ]);
    const { user } = await renderApp({ session, path: "/upload" });
    await chooseFileAndConfirm(user, audioFile());
    await user.click(page().getByRole("button", { name: "Analyze Song" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "We couldn't read the music in that file" })).toBeInTheDocument();
    expect(alert).toHaveTextContent("That file could not be decoded as audio.");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();

    expect(getLibrary()).toEqual([]);
    expect(JSON.parse(localStorage.getItem("wilsify_library_v1") ?? "[]")).toEqual([]);
    expect(fakeSupabaseState.upserts).toEqual([]);
    expect(window.location.pathname).toBe("/upload");

    // "Choose another file" returns to the form so the user can carry on.
    await user.click(within(alert).getByRole("button", { name: "Choose another file" }));
    expect(await page().findByRole("heading", { name: "Select media" })).toBeInTheDocument();
  });

  it("a connection that closes before a result arrives is reported and saves nothing", async () => {
    xhrBehaviour.script = (xhr) => xhr.streamEvents([{ type: "progress", stage: "chords", progress: 50 }]); // no result event
    const { user } = await renderApp({ session, path: "/upload" });
    await chooseFileAndConfirm(user, audioFile());
    await user.click(page().getByRole("button", { name: "Analyze Song" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/connection closed before analysis finished/i);
    expect(getLibrary()).toEqual([]);
  });

  it("cancelling mid-analysis aborts the request, returns to the form and saves nothing", async () => {
    // The server has started but never finishes; only the user's Cancel ends this.
    xhrBehaviour.script = (xhr) => xhr.streamEvents([{ type: "progress", stage: "chords", progress: 40 }], { finish: false });
    const { user } = await renderApp({ session, path: "/upload" });
    await chooseFileAndConfirm(user, audioFile());
    await user.click(page().getByRole("button", { name: "Analyze Song" }));

    expect(await screen.findByRole("progressbar", { name: "Analysis progress" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(xhrBehaviour.instances[0].aborted).toBe(true);
    expect(await page().findByRole("alert")).toHaveTextContent("Analysis cancelled.");
    expect(page().getByRole("heading", { name: "Select media" })).toBeInTheDocument();
    expect(getLibrary()).toEqual([]);
    expect(JSON.parse(localStorage.getItem("wilsify_library_v1") ?? "[]")).toEqual([]);
    expect(fakeSupabaseState.upserts).toEqual([]);
    // Cancel is not an error screen and the app did not navigate away.
    expect(window.location.pathname).toBe("/upload");
  });

  it("an upload the user has not confirmed rights for is blocked before any request is sent", async () => {
    const { user } = await renderApp({ session, path: "/upload" });
    await chooseFileAndConfirm(user, audioFile(), { confirmRights: false });

    // Analyze stays disabled until the rights box is ticked.
    expect(page().getByRole("button", { name: "Analyze Song" })).toBeDisabled();
    expect(xhrBehaviour.instances).toHaveLength(0);
    expect(getLibrary()).toEqual([]);
  });

  it("an unsupported file is flagged Invalid and never reaches the server", async () => {
    const { user } = await renderApp({ session, path: "/upload" });
    await chooseFileAndConfirm(user, audioFile("malware.exe", 500, "application/octet-stream"));

    expect(await page().findByText("Invalid")).toBeInTheDocument();
    expect(await page().findByRole("alert")).toHaveTextContent(/Unsupported file type/);
    await user.click(page().getByRole("button", { name: "Analyze Song" }));
    expect(xhrBehaviour.instances).toHaveLength(0);
    expect(getLibrary()).toEqual([]);
  });

  it("an oversized file is rejected with the 100 MB message and never reaches the server", async () => {
    const { user } = await renderApp({ session, path: "/upload" });
    const huge = audioFile("huge.wav", 10, "audio/wav");
    Object.defineProperty(huge, "size", { value: 101 * 1024 * 1024 }); // avoid allocating 101 MB
    await chooseFileAndConfirm(user, huge);

    expect(await page().findByRole("alert")).toHaveTextContent("File is too large. Maximum size is 100 MB.");
    expect(xhrBehaviour.instances).toHaveLength(0);
  });
});

describe("Backend offline", () => {
  it("shows a retryable 'can't reach the server' alert; Retry sends a second request that can succeed", async () => {
    let attempt = 0;
    xhrBehaviour.script = (xhr) => {
      attempt += 1;
      if (attempt === 1) xhr.failWithNetworkError();
      else xhr.streamEvents(successfulAnalysisEvents(analysis));
    };
    const { user } = await renderApp({ session, path: "/upload" });
    await chooseFileAndConfirm(user, audioFile());
    await user.click(page().getByRole("button", { name: "Analyze Song" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Can't reach the Wilsify server" })).toBeInTheDocument();
    expect(alert).toHaveTextContent(/isn't responding/i);
    expect(getLibrary()).toEqual([]); // nothing half-saved

    await user.click(within(alert).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(window.location.pathname).toBe("/analysis"), { timeout: 3000 });
    expect(xhrBehaviour.instances).toHaveLength(2);
    expect(getLibrary()).toHaveLength(1);
  });

  it("maps a 429 to the 'server is busy' state", async () => {
    xhrBehaviour.script = (xhr) => xhr.failWithHttp(429, "Too many analyses at once — wait a minute and try again.");
    const { user } = await renderApp({ session, path: "/upload" });
    await chooseFileAndConfirm(user, audioFile());
    await user.click(page().getByRole("button", { name: "Analyze Song" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "The server is busy" })).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(getLibrary()).toEqual([]);
  });
});
