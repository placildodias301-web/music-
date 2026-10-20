import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_TYPES_LABEL,
  AnalysisError,
  analyzeFile,
  MAX_UPLOAD_BYTES,
  validateUploadFile,
} from "./api";

describe("TASK-04: Client-side upload pre-flight validation", () => {
  it("1. Valid audio file passes validation", () => {
    const validMp3 = { name: "practice-track.mp3", size: 4 * 1024 * 1024 };
    expect(validateUploadFile(validMp3)).toBeNull();

    const maxBoundaryWav = { name: "full-session.wav", size: MAX_UPLOAD_BYTES };
    expect(validateUploadFile(maxBoundaryWav)).toBeNull();
  });

  it("2. Missing file returns 'Please choose an audio or video file.'", () => {
    expect(validateUploadFile(null)).toBe("Please choose an audio or video file.");
    expect(validateUploadFile(undefined)).toBe("Please choose an audio or video file.");
  });

  it("3. 0-byte file is rejected with 'File is empty.' and does not trigger network upload", async () => {
    const emptyFile = new File([], "empty.mp3", { type: "audio/mpeg" });
    expect(validateUploadFile(emptyFile)).toBe("File is empty.");

    const xhrSpy = vi.fn();
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    await expect(analyzeFile(emptyFile)).rejects.toThrow("File is empty.");
    expect(xhrSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("4. Oversized file (> 100 MB) is rejected with 'File is too large. Maximum size is 100 MB.'", async () => {
    const oversized = { name: "huge-concert.wav", size: MAX_UPLOAD_BYTES + 1 };
    expect(validateUploadFile(oversized)).toBe("File is too large. Maximum size is 100 MB.");

    const xhrSpy = vi.fn();
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    const fakeOversizedFile = { name: "huge-concert.wav", size: MAX_UPLOAD_BYTES + 1024 } as unknown as File;
    await expect(analyzeFile(fakeOversizedFile)).rejects.toMatchObject({
      name: "AnalysisError",
      kind: "too-large",
      status: 413,
      message: "File is too large. Maximum size is 100 MB.",
    });
    expect(xhrSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("5. Unsupported extensions are rejected with a clear allowlist message", async () => {
    for (const badName of ["document.pdf", "archive.zip", "script.exe", "notes.txt", "no-extension"]) {
      const msg = validateUploadFile({ name: badName, size: 2048 });
      expect(msg).toBe(`Unsupported file type. Allowed types: ${ALLOWED_UPLOAD_TYPES_LABEL}.`);
    }

    const badFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(analyzeFile(badFile)).rejects.toBeInstanceOf(AnalysisError);
    await expect(analyzeFile(badFile)).rejects.toMatchObject({
      kind: "unsupported",
      status: 400,
    });
  });

  it("6. All allowed audio and video extensions are accepted (case-insensitive)", () => {
    for (const ext of ALLOWED_UPLOAD_EXTENSIONS) {
      expect(validateUploadFile({ name: `song${ext}`, size: 1024 })).toBeNull();
      expect(validateUploadFile({ name: `SONG${ext.toUpperCase()}`, size: 1024 })).toBeNull();
    }
  });
});
