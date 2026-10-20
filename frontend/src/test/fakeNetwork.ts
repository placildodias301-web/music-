/**
 * Network boundary doubles. The app talks to the FastAPI backend with
 * XMLHttpRequest (analysis upload, so it can report upload progress) and
 * fetch (everything else). jsdom would try real sockets, so tests install
 * these instead; the app's own request/stream-parsing code still runs.
 */
import { vi } from "vitest";
import type { AnalysisResult } from "../lib/api";

export type XhrScript = (xhr: FakeXHR) => void;

/** Describes what the fake "server" does with the next analysis upload. */
export const xhrBehaviour: { script: XhrScript | null; instances: FakeXHR[] } = { script: null, instances: [] };

export class FakeXHR {
  static readonly UNSENT = 0;
  static readonly OPENED = 1;
  static readonly DONE = 4;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  timeout = 0;
  status = 0;
  responseText = "";
  readyState = 0;
  aborted = false;
  body: unknown = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null; onload: (() => void) | null } = {
    onprogress: null,
    onload: null,
  };
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
    this.readyState = 1;
    xhrBehaviour.instances.push(this);
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
    // Respond asynchronously like a real network would.
    queueMicrotask(() => xhrBehaviour.script?.(this));
  }
  abort() {
    if (this.aborted) return;
    this.aborted = true;
    this.onabort?.();
  }

  // ── helpers used by scripts ──
  /** Stream NDJSON events (as /api/analyze/stream does) and finish the response. */
  streamEvents(events: object[], opts: { finish?: boolean } = {}) {
    this.status = 200;
    this.responseText += events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    this.onprogress?.();
    if (opts.finish !== false) this.onload?.();
  }
  failWithNetworkError() {
    this.onerror?.();
  }
  failWithHttp(status: number, detail: string) {
    this.status = status;
    this.responseText = JSON.stringify({ detail });
    this.onload?.();
  }
}

export function installFakeXhr(): void {
  xhrBehaviour.script = null;
  xhrBehaviour.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
}

export function successfulAnalysisEvents(analysis: AnalysisResult): object[] {
  return [
    { type: "progress", stage: "uploaded", progress: 5 },
    { type: "progress", stage: "chords", progress: 60 },
    { type: "result", analysis },
  ];
}

/** Minimal fetch router: unknown URLs fail loudly so a test never silently reaches the network. */
export type FetchRoute = (url: string, init?: RequestInit) => Response | Promise<Response>;

export function installFakeFetch(routes: Record<string, FetchRoute> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    for (const [needle, route] of Object.entries(routes)) {
      if (url.includes(needle)) return route(url, init);
    }
    throw new Error(`Unexpected network request in test: ${url}`);
  };
  vi.stubGlobal("fetch", impl);
  return calls;
}
