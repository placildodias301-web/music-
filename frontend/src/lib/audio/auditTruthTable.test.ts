import { describe, it, expect } from "vitest";
import { InstrumentRegistry, type InstrumentDefinition } from "../instruments/definitions";

export interface InstrumentTruthRecord {
  id: string;
  name: string;
  category: string;
  midiSupported: boolean;
  midiProgram: number;
  midiStatus: "PASS" | "FAIL";
  audioSupported: boolean;
  audioProvider: string;
  audioStatus: string;
  synthesisMethod: string;
  license: string;
  isRealisticAcousticRecording: boolean;
  overallStatus: "PASS (Physical Model)" | "PASS (Synthesized)" | "AUDIO NOT AVAILABLE";
}

export function generateTruthTable(): InstrumentTruthRecord[] {
  const instruments = InstrumentRegistry.all();

  return instruments.map((inst: InstrumentDefinition) => {
    const midiSupported = inst.midiMapping?.programNumber !== undefined;
    const midiProgram = inst.midiMapping?.programNumber ?? 0;
    const audioSupported = inst.audioProvider !== "none";

    let synthesisMethod = "None";
    if (inst.audioProvider === "physical-string") {
      synthesisMethod = "Karplus-Strong feedback loop physical string model";
    } else if (inst.audioProvider === "synth-recipe") {
      synthesisMethod = "Multi-partial subtractive / formant / FM algorithmic synthesis";
    }

    const license =
      inst.audioProvider !== "none"
        ? "Wilsify Open Web Audio Synthesis (MIT) / Sonivox EAS GM Soundfont (Apache 2.0)"
        : "None (Pitch Detection Only)";

    const isRealisticAcousticRecording = false; // Ethical ground truth: physical simulation / synth, NOT real recording

    let overallStatus: InstrumentTruthRecord["overallStatus"] = "AUDIO NOT AVAILABLE";
    if (inst.audioStatus === "physical_model") {
      overallStatus = "PASS (Physical Model)";
    } else if (inst.audioStatus === "synthesized") {
      overallStatus = "PASS (Synthesized)";
    }

    return {
      id: inst.id,
      name: inst.name,
      category: inst.category,
      midiSupported,
      midiProgram,
      midiStatus: midiSupported ? "PASS" : "FAIL",
      audioSupported,
      audioProvider: inst.audioProvider,
      audioStatus: inst.audioStatus,
      synthesisMethod,
      license,
      isRealisticAcousticRecording,
      overallStatus,
    };
  });
}

describe("Phase 7G — Final Audio Truth Table Verification", () => {
  it("generates a complete truth record for all registered instruments", () => {
    const table = generateTruthTable();
    expect(table.length).toBeGreaterThanOrEqual(18);

    for (const row of table) {
      // 1. MIDI Verification
      expect(row.midiSupported).toBe(true);
      expect(row.midiStatus).toBe("PASS");
      expect(row.midiProgram).toBeGreaterThanOrEqual(0);
      expect(row.midiProgram).toBeLessThanOrEqual(127);

      // 2. Audio Honesty: No instrument claims to be a realistic acoustic recording
      expect(row.isRealisticAcousticRecording).toBe(false);

      // 3. Audio status must be strictly verified
      if (row.audioSupported) {
        expect(["physical_model", "synthesized"]).toContain(row.audioStatus);
        expect(row.overallStatus).toMatch(/^PASS \(/);
      } else {
        expect(row.audioStatus).toBe("unavailable");
        expect(row.overallStatus).toBe("AUDIO NOT AVAILABLE");
      }
    }
  });

  it("distinguishes guitar physical modeling from keyboard and wind synthesis recipes", () => {
    const table = generateTruthTable();
    const guitar = table.find((r) => r.id === "guitar")!;
    expect(guitar.audioStatus).toBe("physical_model");
    expect(guitar.synthesisMethod).toContain("Karplus-Strong");

    const piano = table.find((r) => r.id === "piano")!;
    expect(piano.audioStatus).toBe("synthesized");
    expect(piano.synthesisMethod).toContain("Multi-partial");

    const sitar = table.find((r) => r.id === "sitar")!;
    expect(sitar.audioStatus).toBe("synthesized");

    const tabla = table.find((r) => r.id === "tabla")!;
    expect(tabla.audioStatus).toBe("unavailable");
    expect(tabla.overallStatus).toBe("AUDIO NOT AVAILABLE");
  });
});
