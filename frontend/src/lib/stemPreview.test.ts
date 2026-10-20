import { describe, expect, it } from "vitest";
import { bandsFor, encodeWav16 } from "./stemPreview";

describe("encodeWav16", () => {
  it("writes a valid 16-bit mono WAV header and clamps samples", async () => {
    const blob = encodeWav16(new Float32Array([0, 0.5, -0.5, 2, -2]), 22050);
    const v = new DataView(await blob.arrayBuffer());
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint32(40, true)).toBe(10);
    expect(v.getInt16(44 + 6, true)).toBe(0x7fff);
    expect(v.getInt16(44 + 8, true)).toBe(-0x8000);
  });
});

describe("bandsFor", () => {
  it("gives every stem at least one band, and a custom stem is never treated as drums", () => {
    for (const id of ["lead_vocal", "backing_vocals", "drums", "bass", "guitar", "piano_keys", "residual_other", "custom_strings"]) {
      expect(bandsFor(id).length).toBeGreaterThan(0);
    }
    expect(bandsFor("custom_strings")).toEqual(bandsFor("residual_other"));
  });
  it("backing vocals use the side signal, lead uses the mid signal, bass is low-passed", () => {
    expect(bandsFor("backing_vocals")[0].source).toBe("side");
    expect(bandsFor("lead_vocal")[0].source).toBe("mid");
    expect(bandsFor("bass")[0].filters[0]).toMatchObject({ type: "lowpass", freq: 220 });
  });
});
