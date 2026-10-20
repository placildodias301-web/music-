import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// ── Browser APIs jsdom does not implement (the app calls them at render time) ──
beforeEach(() => {
  if (typeof window === "undefined") return; // node-environment test files
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  );
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  // <dialog> (used by ConfirmDialog) is only partly implemented in jsdom.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

// Every test starts and ends with a clean DOM, storage, timers, mocks and history.
afterEach(() => {
  if (typeof window === "undefined") return;
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // storage unavailable — nothing to clear
  }
  window.history.replaceState(null, "", "/");
});
