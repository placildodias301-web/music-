import { describe, expect, it } from "vitest";
import { SPEEDS, stemKind, stemVolume } from "./StemFileMixer";

describe("stemVolume", () => {
  it("maps the 0–200 slider to a 0–2 gain (above 100% boosts)", () => {
    expect(stemVolume(100, false)).toBe(1);
    expect(stemVolume(50, false)).toBe(0.5);
    expect(stemVolume(0, false)).toBe(0);
    expect(stemVolume(200, false)).toBe(2);
    expect(stemVolume(250, false)).toBe(2);
  });
  it("mute silences a stem", () => expect(stemVolume(150, true)).toBe(0));
});

describe("stemKind", () => {
  it("picks an icon family from the stem id", () => {
    expect(stemKind("lead_vocal")).toBe("vocal");
    expect(stemKind("backing_vocals")).toBe("vocal");
    expect(stemKind("drums")).toBe("drums");
    expect(stemKind("bass")).toBe("bass");
    expect(stemKind("guitar")).toBe("guitar");
    expect(stemKind("piano_keys")).toBe("keys");
    expect(stemKind("custom_strings")).toBe("other");
  });
});

describe("speeds", () => {
  it("offers slow, normal and fast", () => {
    expect(SPEEDS).toContain(0.5);
    expect(SPEEDS).toContain(1);
    expect(SPEEDS).toContain(1.5);
  });
});
