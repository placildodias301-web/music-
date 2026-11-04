import { describe, expect, it, vi } from "vitest";
import { LIBRARY_CHANGED_EVENT, clearLibrary, removeFromLibrary } from "./library";

describe("library change event", () => {
  it("fires after a delete and after clearing, so the sidebar count updates at once", () => {
    const seen = vi.fn();
    window.addEventListener(LIBRARY_CHANGED_EVENT, seen);
    removeFromLibrary("nothing");
    clearLibrary();
    window.removeEventListener(LIBRARY_CHANGED_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
