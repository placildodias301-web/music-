import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { chordInstruments } from "../../lib/instruments/definitions";
import { SettingsProvider } from "../../lib/settings/SettingsProvider";
import { ChordExplorerView } from "./ChordExplorerView";

vi.mock("../../lib/audio", () => ({ audioEngine: { playNote: vi.fn(), playChord: vi.fn(), playArpeggio: vi.fn(), stop: vi.fn() } }));

function renderFor(definitionId: string, chord = "Cmaj7") {
  return render(
    <SettingsProvider>
      <MemoryRouter>
        <ChordExplorerView initialChordSymbol={chord} settings={{ definitionId, inversion: 0 }} onSettingsChange={() => {}} />
      </MemoryRouter>
    </SettingsProvider>,
  );
}

describe("ChordExplorerView", () => {
  it("renders theory for every instrument the Chords page offers", () => {
    for (const def of chordInstruments()) {
      const { unmount } = renderFor(def.id);
      expect(screen.getAllByText(/Chord identity/i).length, def.name).toBeGreaterThan(0);
      unmount();
    }
  }, 60_000);

  it("shows fingerings for a fretted instrument and hole or key guidance for the others", () => {
    const guitar = renderFor("guitar", "C");
    expect(screen.getByText(/Fingering:/)).toBeTruthy();
    guitar.unmount();

    const harmonica = renderFor("harmonica", "C");
    expect(screen.getByText(/diatonic, 10 holes/)).toBeTruthy();
    harmonica.unmount();

    const piano = renderFor("piano", "C");
    expect(screen.getByText(/Keys to press/)).toBeTruthy();
    expect(screen.getByText(/Right-hand fingering/)).toBeTruthy();
    piano.unmount();
  });

  it("keeps the play button the same label while playing", () => {
    renderFor("piano", "C");
    expect(screen.getByRole("button", { name: /Play C on Piano/ }).textContent).toContain("Play Chord");
  });
});
