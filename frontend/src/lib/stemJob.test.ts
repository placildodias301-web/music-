import { describe, expect, it } from "vitest";
import {
  addCustomStem,
  applyPreset,
  bleedWarning,
  buildRequest,
  buildZip,
  fmtBytes,
  fmtTime,
  normaliseAnalysis,
  normaliseResults,
  validateAudioFile,
} from "./stemJob";
import type { StemChoice } from "./stemJob";
import { mockAnalyse, mockApi, toneWav } from "./stemJobMock";

const detected = [
  { id: "lead_vocal", label: "Lead vocal", confidence: "high", available: true },
  { id: "backing_vocals", label: "Backing vocals", confidence: "medium", available: true },
  { id: "drums", label: "Drums", confidence: "high", available: true },
  { id: "bass", label: "Bass", confidence: "high", available: true },
  { id: "guitar", label: "Guitar", confidence: "medium", available: true },
  { id: "piano_keys", label: "Piano / keys", confidence: "not detected", available: false },
  { id: "residual_other", label: "Residual other", confidence: "mixed", available: true },
];
const choices = (): StemChoice[] => normaliseAnalysis({ detected_stems: detected }).detected_stems.map((s) => ({ ...s, checked: s.available }));

describe("validateAudioFile", () => {
  it("accepts the supported formats", () => {
    for (const e of ["mp3", "wav", "FLAC", "aac", "m4a", "mp4", "MOV", "mkv", "webm"]) expect(validateAudioFile({ name: `a.${e}`, size: 10 })).toBeNull();
  });
  it("rejects unsupported, empty and oversized files", () => {
    expect(validateAudioFile({ name: "a.txt", size: 10 })).toMatch(/not supported/);
    expect(validateAudioFile({ name: "a.mp3", size: 0 })).toMatch(/empty/);
    expect(validateAudioFile({ name: "a.mp3", size: 600 * 1024 * 1024 })).toMatch(/larger/);
  });
});

describe("normaliseAnalysis", () => {
  it("keeps any number of stems and marks not-detected as unavailable", () => {
    const a = normaliseAnalysis({ detected_stems: detected });
    expect(a.detected_stems).toHaveLength(7);
    expect(a.detected_stems.find((s) => s.id === "piano_keys")?.available).toBe(false);
  });
  it("supports more than 7 stems", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, label: `S${i}`, confidence: "high", available: true }));
    expect(normaliseAnalysis({ detected_stems: many }).detected_stems).toHaveLength(20);
  });
  it("drops duplicates and falls back to low confidence for unknown values", () => {
    const a = normaliseAnalysis({ detected_stems: [{ id: "x", label: "X", confidence: "wat" }, { id: "x", label: "X2", confidence: "high" }] });
    expect(a.detected_stems).toHaveLength(1);
    expect(a.detected_stems[0].confidence).toBe("low");
  });
  it("throws on malformed or empty responses", () => {
    expect(() => normaliseAnalysis(null)).toThrow(/detected_stems/);
    expect(() => normaliseAnalysis({ detected_stems: [] })).toThrow(/did not find/);
  });
});

describe("applyPreset", () => {
  it("auto selects every available stem", () => {
    const r = applyPreset(choices().map((s) => ({ ...s, checked: false })), "auto");
    expect(r.filter((s) => s.checked).map((s) => s.id)).not.toContain("piano_keys");
    expect(r.filter((s) => s.checked)).toHaveLength(6);
  });
  it("standard4 and extended6 select their own lists, only if available", () => {
    const demucs = ["vocals", "drums", "bass", "other"].map((id) => ({ id, label: id, confidence: "medium" as const, available: true, checked: false }));
    expect(applyPreset(demucs, "standard4").filter((s) => s.checked).map((s) => s.id)).toEqual(["vocals", "drums", "bass", "other"]);
    const withMusic = [...demucs, { id: "music", label: "music", confidence: "medium" as const, available: true, checked: true }];
    expect(applyPreset(withMusic, "two_stems").filter((s) => s.checked).map((s) => s.id)).toEqual(["vocals", "music"]);
    const six = ["vocals", "drums", "bass", "guitar", "piano", "other", "music"].map((id) => ({ id, label: id, confidence: "medium" as const, available: true, checked: false }));
    expect(applyPreset(six, "six_stems").filter((s) => s.checked).map((s) => s.id)).toEqual(["vocals", "drums", "bass", "guitar", "piano", "other"]);
    expect(applyPreset(choices(), "extended6").filter((s) => s.checked).map((s) => s.id)).toEqual(["lead_vocal", "drums", "bass", "guitar", "residual_other"]);
  });
  it("custom leaves the selection untouched", () => {
    const c = choices();
    expect(applyPreset(c, "custom")).toBe(c);
  });
});

describe("addCustomStem", () => {
  it("adds a stem and rejects duplicates case-insensitively", () => {
    const r1 = addCustomStem(choices(), "Strings");
    expect(r1.error).toBeNull();
    expect(r1.stems.at(-1)).toMatchObject({ id: "custom_strings", custom: true, checked: true });
    expect(addCustomStem(r1.stems, "  strings ").error).toMatch(/already/);
    expect(addCustomStem(r1.stems, "drums").error).toMatch(/already/);
  });
  it("rejects empty or symbol-only names", () => {
    expect(addCustomStem(choices(), "  ").error).toMatch(/Type/);
    expect(addCustomStem(choices(), "!!!").error).toMatch(/letters/);
  });
});

describe("buildRequest", () => {
  it("separates detected and custom stems and skips unavailable ones", () => {
    const withCustom = addCustomStem(choices(), "Brass").stems.map((s) => (s.id === "piano_keys" ? { ...s, checked: true } : s));
    const req = buildRequest({ upload_id: "u1", detected_stems: [] }, "song.mp3", "custom", withCustom, {
      format: "flac", quality: "best", split_vocals: true, split_drums: false,
    });
    expect(req.stems).not.toContain("piano_keys");
    expect(req.custom_stems).toEqual(["Brass"]);
    expect(req).toMatchObject({ upload_id: "u1", track: "song.mp3", format: "flac", quality: "best", split_vocals: true });
  });
});

describe("results + warnings", () => {
  it("normalises results and flags possible bleed", () => {
    const r = normaliseResults({ stems: [{ id: "bass", label: "Bass", confidence: "medium", size_bytes: 5, url: "blob:x" }] }, "wav", "blob:orig");
    expect(r.stems[0].filename).toBe("bass.wav");
    expect(r.original_url).toBe("blob:orig");
    expect(bleedWarning(r.stems[0])).toMatch(/bleed/);
    expect(bleedWarning({ confidence: "high", warning: "" })).toBe("");
    expect(bleedWarning({ confidence: "high", warning: "Custom text" })).toBe("Custom text");
  });
  it("throws when the stems list is missing or empty", () => {
    expect(() => normaliseResults({}, "wav", null)).toThrow(/stems/);
    expect(() => normaliseResults({ stems: [] }, "wav", null)).toThrow(/no stem files/);
  });
});

describe("formatting", () => {
  it("formats sizes and times", () => {
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtTime(97)).toBe("1:37");
    expect(fmtTime(NaN)).toBe("—");
  });
});

describe("buildZip", () => {
  it("writes a valid stored ZIP (local headers, central directory, end record)", async () => {
    const blob = buildZip([
      { name: "a.wav", data: new Uint8Array([1, 2, 3]) },
      { name: "b.wav", data: new Uint8Array([4, 5]) },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const v = new DataView(bytes.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = bytes.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    // central directory starts where the end record says it does
    expect(v.getUint32(v.getUint32(end + 16, true), true)).toBe(0x02014b50);
  });
});

describe("mock backend", () => {
  it("analyses, runs a job, and returns playable stems incl. custom ones", async () => {
    const a = await mockAnalyse(new File([new Uint8Array(4)], "demo.wav"), () => undefined);
    expect(a.track).toBe("demo");
    const { job_id } = (await mockApi("/api/stems/separate", {
      method: "POST",
      body: JSON.stringify({ stems: ["drums"], custom_stems: ["Strings"] }),
    })) as { job_id: string };
    const status = (await mockApi(`/api/stems/job/${job_id}`)) as { status: string };
    expect(["analyzing", "separating"]).toContain(status.status);
    const res = (await mockApi(`/api/stems/job/${job_id}/stems`)) as { stems: { id: string; size_bytes: number }[] };
    expect(res.stems.map((s) => s.id)).toEqual(["drums", "custom_strings"]);
    expect(res.stems[0].size_bytes).toBe(toneWav(180).size);
  });
  it("rejects unknown jobs", async () => {
    await expect(mockApi("/api/stems/job/nope")).rejects.toThrow(/unknown job/);
  });
});
