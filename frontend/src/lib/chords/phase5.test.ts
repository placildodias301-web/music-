import { describe, it, expect } from "vitest";
import { findDefinition } from "../instruments/definitions";
import { parseChordSymbol } from "../chordTheory";
import { buildChordModel, modelMidi, type ModalModel } from "./model";

describe("Phase 5: Instrument-Specific Chord UI & Visualizations", () => {
  it("renders guitar chords with fretboard shapes and tuning", () => {
    const guitar = findDefinition("guitar")!;
    expect(guitar).toBeDefined();
    expect(guitar.chordRenderer).toBe("guitar");

    const chord = parseChordSymbol("C");
    const model = buildChordModel(chord, guitar, { inversion: 0 });
    expect(model).not.toBeNull();
    expect(model?.kind).toBe("fretted");

    if (model?.kind === "fretted") {
      expect(model.shapes.length).toBeGreaterThan(0);
      expect(model.stringNames).toEqual(["E", "A", "D", "G", "B", "E"]);
      const midi = modelMidi(model, 0);
      expect(midi.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("renders keyboard chords with explicit keys and inversions", () => {
    const piano = findDefinition("piano")!;
    expect(piano).toBeDefined();
    expect(piano.chordRenderer).toBe("keyboard");

    const chord = parseChordSymbol("Am7");
    const rootModel = buildChordModel(chord, piano, { inversion: 0 });
    expect(rootModel?.kind).toBe("keyboard");
    if (rootModel?.kind === "keyboard") {
      expect(rootModel.keys.map((k) => k.name)).toEqual(["A", "C", "E", "G"]);
      expect(rootModel.keys[0].midi % 12).toBe(9); // A
    }

    const firstInvModel = buildChordModel(chord, piano, { inversion: 1 });
    expect(firstInvModel?.kind).toBe("keyboard");
    if (firstInvModel?.kind === "keyboard") {
      expect(firstInvModel.keys[0].name).toBe("C");
    }
  });

  it("renders bass chords with dyads, chord shapes, and arpeggios", () => {
    const bass = findDefinition("bass")!;
    expect(bass).toBeDefined();
    expect(bass.chordRenderer).toBe("bass");

    const chord = parseChordSymbol("G7");
    const model = buildChordModel(chord, bass, { inversion: 0 });
    expect(model?.kind).toBe("bass");
    if (model?.kind === "bass") {
      expect(model.dyads.length).toBeGreaterThan(0);
      expect(model.arpeggio.length).toBeGreaterThanOrEqual(3);
      expect(model.stringNames).toEqual(["E", "A", "D", "G"]);
    }
  });

  it("renders non-Western modal instruments (Sitar) with authentic drones, Sargam swaras, and Ragas", () => {
    const sitar = findDefinition("sitar")!;
    expect(sitar).toBeDefined();
    expect(sitar.chordDisplayMode).toBe("modal");
    expect(sitar.chordRenderer).toBe("modal");

    const chord = parseChordSymbol("C");
    const model = buildChordModel(chord, sitar, { inversion: 0 }) as ModalModel;
    expect(model).not.toBeNull();
    expect(model.kind).toBe("modal");
    expect(model.tradition).toBe("indian");

    // Drones: Sa, Pa, Chikari
    expect(model.droneNotes.some((d) => d.role.includes("Tonic"))).toBe(true);
    expect(model.droneNotes.some((d) => d.role.includes("Fifth"))).toBe(true);

    // Sargam swaras (Bhatkhande notation: Capital = Shuddha, lowercase = Komal)
    expect(model.sargamOrMaqamTones.map((t) => t.syllable)).toContain("Sa");
    expect(model.sargamOrMaqamTones.map((t) => t.syllable)).toContain("Ga");
    expect(model.sargamOrMaqamTones.map((t) => t.syllable)).toContain("Pa");
    expect(model.sargamOrMaqamTones.find((t) => t.syllable === "Ga")?.role).toContain("Shuddha Gandhar");

    // Compatible Ragas & Arohana/Avarohana
    expect(model.resonantRagasOrMaqams.some((r) => r.includes("Bilawal"))).toBe(true);
    expect(model.melodicMovement).toContain("Arohana");

    // MIDI playback produces modal pitch realization
    const midi = modelMidi(model);
    expect(midi.length).toBe(3);
  });

  it("renders Middle Eastern modal instruments (Oud) with Maqam degrees and Sayr movement", () => {
    const oud = findDefinition("oud")!;
    expect(oud).toBeDefined();
    expect(oud.chordDisplayMode).toBe("modal");
    expect(oud.chordRenderer).toBe("modal");

    const chord = parseChordSymbol("Dm");
    const model = buildChordModel(chord, oud, { inversion: 0 }) as ModalModel;
    expect(model).not.toBeNull();
    expect(model.kind).toBe("modal");
    expect(model.tradition).toBe("middle-eastern");

    // Drones: Qarar and Nawa
    expect(model.droneNotes.some((d) => d.role.includes("Qarar"))).toBe(true);
    expect(model.droneNotes.some((d) => d.role.includes("Nawa"))).toBe(true);

    // Compatible Maqamat & Sayr
    expect(model.resonantRagasOrMaqams.some((m) => m.includes("Bayati") || m.includes("Kurd"))).toBe(true);
    expect(model.melodicMovement).toContain("Sayr");
  });
});
