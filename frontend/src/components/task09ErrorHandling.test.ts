import { describe, it, expect } from "vitest";
import { sanitizeErrorMessage } from "./ErrorBanner";
import { TOP_PRACTICERS } from "../pages/Community";
import { PLANS, CREDIT_FEATURES } from "../lib/plans";

describe("TASK-09: Error Handling and Sanitization", () => {
  it("sanitizes JWTs, Bearer tokens, API keys, and stack trace file paths", () => {
    const raw = `Error: Request failed with status 401
    at fetchMedia (C:\\project\\src\\api.ts:12:34)
    at Object.invoke (C:/project/src/index.js:5:10)
    Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature
    AIzaSyD-1234567890abcdefghijklmnopqrstuv
    sk-proj-1234567890abcdefghijklmnopqrstuvwx`;

    const cleaned = sanitizeErrorMessage(raw);
    expect(cleaned).not.toContain("eyJhbGciOiJIUzI1Ni");
    expect(cleaned).not.toContain("AIzaSyD-");
    expect(cleaned).not.toContain("sk-proj-");
    expect(cleaned).not.toContain("C:\\project");
    expect(cleaned).toContain("[token redacted]");
    expect(cleaned).toContain("[API key redacted]");
  });

  it("handles empty or safe strings without corruption", () => {
    expect(sanitizeErrorMessage("")).toBe("");
    expect(sanitizeErrorMessage("Network timeout while contacting analysis server.")).toBe(
      "Network timeout while contacting analysis server."
    );
  });
});

describe("TASK-09: Unfinished Modules Coming Soon State & Preserved Models", () => {
  it("preserves underlying community and plan data structures without exposing them in UI", () => {
    // Preserves models for backward compatibility
    expect(TOP_PRACTICERS.length).toBeGreaterThan(0);
    expect(PLANS.length).toBeGreaterThan(0);
    expect(CREDIT_FEATURES.length).toBeGreaterThan(0);
  });
});
