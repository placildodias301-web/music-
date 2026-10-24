import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsProvider } from "../lib/settings/SettingsProvider";
import { findDefinition, tunerInstruments } from "../lib/instruments/definitions";
import { selectionForDefinition } from "../lib/instruments/tunerLink";
import { saveSelection } from "../lib/tuner/selection";
import { Tuner } from "./Tuner";

function renderTuner(id: string) {
  saveSelection(selectionForDefinition(findDefinition(id)!));
  return render(
    <SettingsProvider>
      <MemoryRouter>
        <Tuner />
      </MemoryRouter>
    </SettingsProvider>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the Tuner page adapts to the instrument", () => {
  it("shows each string instrument's own strings, never the guitar's", () => {
    const strings: Record<string, string> = {
      violin: "G D A E",
      cello: "C G D A",
      ukulele: "G C E A",
      mandolin: "G D A E",
      "guitar": "E A D G B E",
      "double-bass": "E A D G",
    };
    for (const [id, text] of Object.entries(strings)) {
      const view = renderTuner(id);
      expect(document.body.textContent, id).toContain(text);
      view.unmount();
    }
  });

  it("explains what 'tuning' means for winds, drums and traditional instruments", () => {
    const flute = renderTuner("flute");
    expect(screen.getAllByText(/Woodwind intonation/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/intonation of the notes|how in tune the notes you play are/i).length).toBeGreaterThan(0);
    flute.unmount();
    const timpani = renderTuner("timpani");
    expect(screen.getAllByText(/strike the head/i).length).toBeGreaterThan(0);
    timpani.unmount();
    const sitar = renderTuner("sitar");
    expect(screen.getByRole("note").textContent).toMatch(/approximation of a traditional tuning/);
    sitar.unmount();
    const clarinet = renderTuner("clarinet");
    expect(screen.getByRole("note").textContent).toMatch(/transposing/);
    clarinet.unmount();
  });

  it("opens for every tuner instrument without error, including 1-string and 11-string ones", () => {
    for (const id of ["tabla", "tanpura", "oud", "charango", "bouzouki", "tres", "cuatro", "erhu", "sitar", "classical-guitar", "guitar-8", "vibraphone", "marimba"]) {
      const view = renderTuner(id);
      expect(document.body.textContent, id).toBeTruthy();
      view.unmount();
    }
  });

  it("does not offer a tuner for pianos and keyboards", () => {
    renderTuner("guitar");
    expect(screen.queryByRole("note")).toBeNull(); // plain strings need no explanation
  });

  it("string instruments get the string tuner: Auto and Chromatic switches, strings, reference by tapping a peg", () => {
    for (const id of ["guitar", "violin", "ukulele", "mandolin"]) {
      const view = renderTuner(id);
      expect(document.querySelector('[data-tuner-type="string"]'), id).not.toBeNull();
      expect(screen.getByRole("switch", { name: /auto/i }), id).toBeTruthy();
      expect(screen.getByRole("switch", { name: /chromatic/i }), id).toBeTruthy();
      expect(screen.queryByText("Lugs"), id).toBeNull();
      view.unmount();
    }
  });

  it("brass and woodwinds get an intonation tuner: no strings, no Auto switch, a reference tone, and a transposition choice where it exists", () => {
    for (const id of ["trumpet", "trombone", "flute", "clarinet", "alto-sax"]) {
      const view = renderTuner(id);
      const type = id === "trumpet" || id === "trombone" ? "brass" : "wind";
      expect(document.querySelector(`[data-tuner-type="${type}"]`), id).not.toBeNull();
      expect(screen.queryByRole("switch", { name: /auto/i }), id).toBeNull();
      expect(screen.queryByRole("switch", { name: /chromatic/i }), id).toBeNull();
      expect(screen.getByRole("group", { name: /reference tone/i }), id).toBeTruthy();
      view.unmount();
    }
    const clarinet = renderTuner("clarinet");
    expect(screen.getByLabelText("Instrument transposition")).toBeTruthy();
    clarinet.unmount();
    const flute = renderTuner("flute");
    expect(screen.queryByLabelText("Instrument transposition")).toBeNull(); // flute sounds as written
    flute.unmount();
  });

  it("timpani: drum choice, target note and reference — no string controls", () => {
    renderTuner("timpani");
    expect(document.querySelector('[data-tuner-type="timpani"]')).not.toBeNull();
    expect(screen.getByRole("group", { name: /timpani drum/i })).toBeTruthy();
    expect(screen.getByRole("group", { name: /target note/i })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /auto/i })).toBeNull();
  });

  it("piano is labelled as reference assistance, not professional tuning", () => {
    renderTuner("piano");
    expect(document.querySelector('[data-tuner-type="keyboard"]')).not.toBeNull();
    expect(screen.getAllByText(/not professional piano tuning/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/stretched octaves/i).length).toBeGreaterThan(0);
  });

  it("tabla, tanpura and drum heads each get their own panels", () => {
    const tabla = renderTuner("tabla");
    expect(document.querySelector('[data-tuner-type="percussion-pitch"]')).not.toBeNull();
    expect(screen.queryByRole("switch", { name: /auto/i })).toBeNull();
    tabla.unmount();
    const bayan = renderTuner("bayan");
    expect(screen.getByRole("group", { name: /reference tone/i })).toBeTruthy();
    expect(screen.getByText(/no fixed note/i)).toBeTruthy();
    bayan.unmount();
    const tanpura = renderTuner("tanpura");
    expect(document.querySelector('[data-tuner-type="drone"]')).not.toBeNull();
    expect(screen.getByRole("group", { name: /drone string relations/i })).toBeTruthy();
    tanpura.unmount();
    renderTuner("dholak");
    expect(document.querySelector('[data-tuner-type="drum-head"]')).not.toBeNull();
    expect(screen.getByRole("group", { name: /drum lugs/i })).toBeTruthy();
    expect(screen.getByText(/cannot measure its tension|not measure its tension/i)).toBeTruthy();
  });

  it("instruments without one standard tuning say so instead of inventing one", () => {
    for (const id of ["sarod", "veena", "santoor", "sarangi"]) {
      const view = renderTuner(id);
      expect(screen.getByText(/does not assume one/i), id).toBeTruthy();
      view.unmount();
    }
  });

  it("every instrument the Tuner lists opens without error", () => {
    for (const d of tunerInstruments()) {
      const view = renderTuner(d.id);
      expect(document.querySelector("[data-tuner-type]"), d.id).not.toBeNull();
      view.unmount();
    }
  }, 120_000);
});
