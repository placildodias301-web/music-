/**
 * The chord timeline with pipeline data: section bands, passing chords and
 * possible-fill markers, all seeking the existing player through the same
 * playFrom path a chord uses. Rendered through the real LiveChordSync, so the
 * <audio> element and its clock are the app's own; only media playback is faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LiveChordSync } from "./LiveChordSync";
import { MeterCard, TempoCard } from "./RhythmCards";
import { SettingsContext, type SettingsContextValue } from "../../lib/settings/settingsContext";
import { DEFAULT_SETTINGS } from "../../lib/settings/model";
import type { AnalysisResult } from "../../lib/api";
import { installFakeAudio } from "../../test/fakeAudio";
import { makeAnalysis } from "../../test/fixtures";

const settings: SettingsContextValue = {
  settings: { ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, countIn: 0 } },
  update: () => true,
  replace: () => true,
  resolvedTheme: "dark",
  reduceMotion: true,
};

function pipelineAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return makeAnalysis({
    key: "C Major",
    durationSeconds: 12,
    engine: "pipeline",
    chordProgression: ["C", "Dm", "G", "Am"],
    chordTimeline: [
      { chord: "C", start: 0, end: 4, harte: "C:maj" },
      { chord: "Dm", start: 4, end: 4.3, harte: "D:min", passing: true },
      { chord: "G", start: 4.3, end: 8, harte: "G:maj" },
      { chord: "Am", start: 8, end: 12, harte: "A:min" },
    ],
    beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
    downbeats: [0, 2, 4],
    sections: [
      { start: 0, end: 6, label: "verse" },
      { start: 6, end: 12, label: "chorus" },
    ],
    possibleFills: [{ time: 7.5, confidence: 0.72 }],
    warnings: ["Song sections unavailable because allin1 was not used.", "allin1 was not used (wsl_unavailable: …); beat_this was used instead."],
    ...overrides,
  });
}

function renderTimeline(analysis: AnalysisResult, audioUrl: string | null = "blob:song") {
  const onSelectChord = vi.fn();
  const view = render(
    <MemoryRouter>
      <SettingsContext.Provider value={settings}>
        <LiveChordSync analysis={analysis} audioUrl={audioUrl} selectedChord={null} onActiveChordChange={() => {}} onSelectChord={onSelectChord} />
      </SettingsContext.Provider>
    </MemoryRouter>,
  );
  const audio = view.container.querySelector("audio");
  return { ...view, audio, onSelectChord, user: userEvent.setup() };
}

const play = () => HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  installFakeAudio();
});

describe("click-to-seek", () => {
  it("a chord, a section band and a possible-fill marker all seek the player and play", async () => {
    const { audio, user, onSelectChord } = renderTimeline(pipelineAnalysis());
    expect(audio).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /^G · 0:04–0:08\. Play from here/ }));
    expect(onSelectChord).toHaveBeenCalledWith("G");
    expect(audio!.currentTime).toBeCloseTo(4.3);
    const plays = play().mock.calls.length;
    expect(plays).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /^Chorus · 0:06–0:12\. Play from here/ }));
    expect(audio!.currentTime).toBeCloseTo(6);
    expect(play().mock.calls.length).toBeGreaterThan(plays);

    await user.click(screen.getByRole("button", { name: /^Possible drum fill · 0:07 · 72% likely\. Play from here/ }));
    expect(audio!.currentTime).toBeCloseTo(7.5);
  });

  it("a passing chord is marked as one, and seeks like any chord", async () => {
    const { audio, user } = renderTimeline(pipelineAnalysis());
    const passing = screen.getByRole("button", { name: /^Dm · 0:04–0:04 · passing chord\. Play from here/ });
    expect(passing.className).toContain("border-dotted");
    expect(screen.getByRole("button", { name: /^C · 0:00–0:04\. Play from here/ }).className).not.toContain("border-dotted");
    await user.click(passing);
    expect(audio!.currentTime).toBeCloseTo(4);
  });

  it("without audio (reopened from the Library) markers are shown but never touch playback", async () => {
    const { user } = renderTimeline(pipelineAnalysis(), null);
    const band = screen.getByRole("button", { name: /^Verse · 0:00–0:06$/ });
    await user.click(band);
    await user.click(screen.getByRole("button", { name: /^Possible drum fill/ }));
    expect(play()).not.toHaveBeenCalled();
  });
});

describe("what the timeline shows", () => {
  it("section bands, fill markers and their legend appear only when the analysis has them", () => {
    renderTimeline(pipelineAnalysis());
    expect(screen.getByText("Song section")).toBeInTheDocument();
    expect(screen.getByText("Possible drum fill")).toBeInTheDocument();
    expect(screen.getByText("Passing chord")).toBeInTheDocument();
  });

  it("a v2 analysis renders exactly as before: no bands, no markers, no notes", () => {
    renderTimeline(makeAnalysis());
    expect(screen.queryByText("Song section")).toBeNull();
    expect(screen.queryByText("Possible drum fill")).toBeNull();
    expect(screen.queryByText(/Analysis notes/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Verse|Chorus) ·/ })).toBeNull();
  });

  it("warnings sit in a collapsed 'Analysis notes' list that never blocks the timeline", async () => {
    const { user } = renderTimeline(pipelineAnalysis());
    const summary = screen.getByText("Analysis notes (2)");
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    await user.click(summary);
    expect(within(details).getByText("Song sections unavailable because allin1 was not used.")).toBeVisible();
    // The chords stay usable with the notes open.
    expect(screen.getByRole("button", { name: /^Am · 0:08–0:12/ })).toBeEnabled();
  });

  it("no-chord spans show as N.C.", () => {
    renderTimeline(
      pipelineAnalysis({
        chordTimeline: [
          { chord: "N.C.", start: 0, end: 2, harte: "N" },
          { chord: "C", start: 2, end: 12, harte: "C:maj" },
        ],
        chordProgression: ["C"],
      }),
    );
    expect(screen.getByRole("button", { name: /^N\.C\. · 0:00–0:02/ })).toBeInTheDocument();
  });
});

describe("Tempo and time signature cards", () => {
  function cards(analysis: AnalysisResult) {
    return render(
      <MemoryRouter>
        <TempoCard analysis={analysis} onChange={() => {}} />
        <MeterCard analysis={analysis} onChange={() => {}} />
      </MemoryRouter>,
    );
  }

  it("null BPM and meter show — instead of 0 or a made-up 4/4, without the half/double buttons", () => {
    cards(pipelineAnalysis({ bpm: 0, bpmStatus: "unavailable", beats: [], downbeats: [], timeSignature: "", timeSignatureStatus: "unavailable" }));
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("No clear beat detected")).toBeInTheDocument();
    expect(screen.getByText("No confident meter detected")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Correct the tempo" })).toBeNull();
  });

  it("a real tempo keeps the half/double correction buttons", () => {
    cards(pipelineAnalysis());
    expect(screen.getByRole("group", { name: "Correct the tempo" })).toBeInTheDocument();
  });

  it.each(["4/4", "3/4", "5/4", "6/8"])("shows %s", (meter) => {
    cards(pipelineAnalysis({ timeSignature: meter }));
    expect(screen.getByText(meter)).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
  });
});
