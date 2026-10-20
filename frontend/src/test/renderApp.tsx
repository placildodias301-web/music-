/**
 * Renders the REAL <App/> (real router, auth provider, route guard, app
 * shell and pages). Only the outside world is faked: Supabase (module
 * boundary), the backend (XHR/fetch), and audio hardware APIs.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { fakeSupabaseState } from "./fakeSupabase";

export interface RenderAppOptions {
  /** Signed-in session, or null for a signed-out visitor. */
  session: Session | null;
  /** Route to open, e.g. "/library". */
  path: string;
  /** Wait for the signed-in app shell (<main>) before returning. Default: true when signed in. */
  waitForShell?: boolean;
}

/**
 * App owns a module-level browser router (created when App is imported), so
 * to "open" a URL we push it into history and tell that router with a popstate
 * before rendering — exactly what the browser does on back/forward.
 */
export async function renderApp(options: RenderAppOptions) {
  const { session, path } = options;
  fakeSupabaseState.session = session;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  const { default: App } = await import("../App");
  const user = userEvent.setup({ applyAccept: false });
  const utils = render(<App />);
  if (session && options.waitForShell !== false) await screen.findByRole("main");
  return { user, ...utils };
}

/** Simulates a full page refresh: unmount everything (React state gone) but keep localStorage/sessionStorage. */
export async function refreshApp(
  rendered: { unmount: () => void },
  options: RenderAppOptions,
) {
  await act(async () => rendered.unmount());
  return renderApp(options);
}
