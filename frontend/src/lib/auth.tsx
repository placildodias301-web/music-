/**
 * Signed-in user and session state, shared app-wide.
 *
 * - Validates Supabase configuration before attempting session calls.
 * - Hydrates initial session via `supabase.auth.getSession()` with a bounded
 *   timeout (default 8s) and retry support.
 * - Subscribes once to `supabase.auth.onAuthStateChange` for SIGNED_IN,
 *   SIGNED_OUT, TOKEN_REFRESHED, PASSWORD_RECOVERY, and INITIAL_SESSION,
 *   and always unsubscribes on unmount.
 */

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { AuthChangeEvent, AuthError, Session, SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { forgetLocalData, pullAccountData } from "./cloudSync";
import { getSupabaseConfigError, supabase, SupabaseConfigError } from "./supabase";

export const AUTH_HYDRATION_TIMEOUT_MS = 8000;

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "timeout" | "config_error";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthSnapshot {
  status: AuthStatus;
  /** undefined while loading or timed out, null when signed out or unconfigured. */
  user: User | null | undefined;
  session: Session | null;
  configError: string | null;
}

export interface AuthValue extends AuthSnapshot {
  /** Retries initial session hydration after a slow-network timeout. */
  retrySession: () => void;
  /** Resolves null when the account must first be confirmed from the emailed link. */
  signup: (input: { email: string; password: string; firstName: string; lastName: string }) => Promise<User | null>;
  login: (email: string, password: string) => Promise<User>;
  /** Leaves for Google's sign-in page; Google sends the user back to /login, which finishes signing in. */
  loginWithGoogle: (from?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const HANDLED_AUTH_EVENTS = new Set<AuthChangeEvent>([
  "INITIAL_SESSION",
  "SIGNED_IN",
  "SIGNED_OUT",
  "TOKEN_REFRESHED",
  "PASSWORD_RECOVERY",
]);

const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
  "rate_limit_exceeded",
]);

function toUser(u: SupabaseUser): User {
  const meta = u.user_metadata ?? {};
  if (meta.first_name !== undefined) {
    return { id: u.id, email: u.email ?? "", firstName: String(meta.first_name), lastName: String(meta.last_name ?? "") };
  }
  // Google accounts only carry a full name.
  const [firstName = "", ...rest] = String(meta.full_name ?? meta.name ?? "").trim().split(/\s+/);
  return { id: u.id, email: u.email ?? "", firstName, lastName: rest.join(" ") };
}

function getErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return "";
}

function getErrorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error && typeof (error as { name: unknown }).name === "string") {
    return (error as { name: string }).name;
  }
  return "";
}

function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error && typeof (error as { status: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  return undefined;
}

export function isNetworkAuthError(error: unknown): boolean {
  const code = getErrorCode(error);
  const name = getErrorName(error);
  const status = getErrorStatus(error);
  return (
    name === "AuthRetryableFetchError" ||
    name === "TypeError" ||
    name === "FetchError" ||
    code === "network_error" ||
    code === "request_timeout" ||
    status === 0
  );
}

/**
 * Maps Supabase auth errors using `error.code` and `error.name` (not brittle string matching).
 * Never logs secrets, tokens, or full error objects in production.
 */
export function authMessage(
  error: AuthError | Error | unknown,
  context?: "login" | "signup" | "reset",
): string {
  const code = getErrorCode(error);
  const name = getErrorName(error);
  const status = getErrorStatus(error);

  if (name === "SupabaseConfigError" || code === "supabase_config_error") {
    return error instanceof Error ? error.message : "Authentication service is not configured.";
  }

  if (isNetworkAuthError(error)) {
    return "Cannot reach authentication service. Check your internet connection.";
  }

  if (RATE_LIMIT_CODES.has(code) || status === 429) {
    return "Too many attempts. Please wait and try again.";
  }

  if (code === "invalid_credentials") {
    return "Incorrect email or password.";
  }

  if (code === "email_not_confirmed") {
    return "Please confirm your email before signing in.";
  }

  if (code === "weak_password") {
    return "Choose a stronger password.";
  }

  if (code === "user_already_exists" || code === "email_exists") {
    return "An account with this email already exists.";
  }

  // Do not reveal whether an email exists during password reset.
  if (context === "reset" && (code === "user_not_found" || code === "email_not_confirmed")) {
    return "If an account uses this email, a reset link has been sent.";
  }

  if (status && status >= 500) {
    if (import.meta.env.DEV) {
      console.error("[auth] server error", { code, name, status });
    }
    return "Something went wrong on our side. Please try again in a minute.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Authentication failed. Please try again.";
}

export interface AuthControllerOptions {
  client?: SupabaseClient;
  configError?: string | null;
  hydrationTimeoutMs?: number;
  pullData?: (userId: string) => Promise<void>;
  forgetData?: () => void;
}

export function createAuthController(options: AuthControllerOptions = {}) {
  const client = options.client ?? supabase;
  const initialConfigError = options.configError !== undefined ? options.configError : getSupabaseConfigError();
  const timeoutMs = options.hydrationTimeoutMs ?? AUTH_HYDRATION_TIMEOUT_MS;
  const pullData = options.pullData ?? pullAccountData;
  const forgetData = options.forgetData ?? forgetLocalData;

  let snapshot: AuthSnapshot = initialConfigError
    ? { status: "config_error", user: null, session: null, configError: initialConfigError }
    : { status: "loading", user: undefined, session: null, configError: null };

  const listeners = new Set<() => void>();
  let syncedId: string | null = null;
  let hydrationTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let hydrationId = 0;
  let unsubscribeAuth: (() => void) | null = null;
  let started = false;

  function emit(next: AuthSnapshot) {
    snapshot = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function clearHydrationTimer() {
    if (hydrationTimer !== null) {
      globalThis.clearTimeout(hydrationTimer);
      hydrationTimer = null;
    }
  }

  function applyAuthenticatedSession(session: Session) {
    clearHydrationTimer();
    const nextUser = toUser(session.user);
    if (syncedId === nextUser.id) {
      emit({ status: "authenticated", user: nextUser, session, configError: null });
      return;
    }
    syncedId = nextUser.id;
    emit({ status: "authenticated", user: nextUser, session, configError: null });
    // Load cloud data on the next tick so Supabase auth callbacks never deadlock.
    globalThis.setTimeout(() => {
      void pullData(nextUser.id);
    }, 0);
  }

  function applySignedOut() {
    clearHydrationTimer();
    if (syncedId) forgetData();
    syncedId = null;
    emit({ status: "unauthenticated", user: null, session: null, configError: null });
  }

  async function hydrate(): Promise<void> {
    if (initialConfigError) {
      emit({ status: "config_error", user: null, session: null, configError: initialConfigError });
      return;
    }

    const currentAttempt = ++hydrationId;
    clearHydrationTimer();
    emit({ status: "loading", user: undefined, session: null, configError: null });

    let timedOut = false;
    hydrationTimer = globalThis.setTimeout(() => {
      if (currentAttempt !== hydrationId) return;
      timedOut = true;
      hydrationTimer = null;
      // Do not treat slow network as logged out — surface a retryable timeout state.
      emit({ status: "timeout", user: undefined, session: null, configError: null });
    }, timeoutMs);

    try {
      const { data, error } = await client.auth.getSession();
      if (currentAttempt !== hydrationId || timedOut) return;
      clearHydrationTimer();

      if (error) {
        if (error instanceof SupabaseConfigError || getErrorName(error) === "SupabaseConfigError") {
          emit({ status: "config_error", user: null, session: null, configError: error.message });
          return;
        }
        if (isNetworkAuthError(error)) {
          emit({ status: "timeout", user: undefined, session: null, configError: null });
          return;
        }
        applySignedOut();
        return;
      }

      if (data?.session && data.session.user) {
        applyAuthenticatedSession(data.session);
      } else {
        applySignedOut();
      }
    } catch (err) {
      if (currentAttempt !== hydrationId || timedOut) return;
      clearHydrationTimer();
      if (err instanceof SupabaseConfigError || getErrorName(err) === "SupabaseConfigError") {
        emit({
          status: "config_error",
          user: null,
          session: null,
          configError: err instanceof Error ? err.message : "Authentication service is not configured.",
        });
        return;
      }
      if (isNetworkAuthError(err)) {
        emit({ status: "timeout", user: undefined, session: null, configError: null });
        return;
      }
      applySignedOut();
    }
  }

  function start() {
    if (started) return;
    started = true;

    if (initialConfigError) {
      emit({ status: "config_error", user: null, session: null, configError: initialConfigError });
      return;
    }

    // Register onAuthStateChange exactly once for the required lifecycle events.
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!HANDLED_AUTH_EVENTS.has(event)) return;

      if (event === "SIGNED_OUT") {
        hydrationId++;
        applySignedOut();
        return;
      }

      if (session && session.user) {
        hydrationId++;
        applyAuthenticatedSession(session);
      } else if (event !== "INITIAL_SESSION") {
        hydrationId++;
        applySignedOut();
      }
    });

    unsubscribeAuth = () => data.subscription.unsubscribe();
    void hydrate();
  }

  function stop() {
    started = false;
    hydrationId++;
    clearHydrationTimer();
    if (unsubscribeAuth) {
      unsubscribeAuth();
      unsubscribeAuth = null;
    }
  }

  function retrySession() {
    void hydrate();
  }

  async function signup({
    email,
    password,
    firstName,
    lastName,
  }: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<User | null> {
    const origin = typeof globalThis.location !== "undefined" ? globalThis.location.origin : "http://localhost:5173";
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName },
        emailRedirectTo: `${origin}/studio`,
      },
    });
    if (error) throw new Error(authMessage(error, "signup"));
    if (data.session && data.user) {
      applyAuthenticatedSession(data.session);
      return toUser(data.user);
    }
    return null;
  }

  async function login(email: string, password: string): Promise<User> {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(authMessage(error, "login"));
    if (!data.session || !data.user) {
      throw new Error("Authentication failed. Please try signing in again.");
    }
    applyAuthenticatedSession(data.session);
    return toUser(data.user);
  }

  async function loginWithGoogle(from?: string): Promise<void> {
    const origin = typeof globalThis.location !== "undefined" ? globalThis.location.origin : "http://localhost:5173";
    const back = new URL("/login", origin);
    if (from) back.searchParams.set("from", from);
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: back.href },
    });
    if (error) throw new Error(authMessage(error, "login"));
  }

  async function logout(): Promise<void> {
    await client.auth.signOut();
    applySignedOut();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    stop,
    retrySession,
    signup,
    login,
    loginWithGoogle,
    logout,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => createAuthController());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  const retrySession = useCallback(() => controller.retrySession(), [controller]);
  const signup = useCallback<AuthValue["signup"]>((input) => controller.signup(input), [controller]);
  const login = useCallback<AuthValue["login"]>((email, password) => controller.login(email, password), [controller]);
  const loginWithGoogle = useCallback<AuthValue["loginWithGoogle"]>((from) => controller.loginWithGoogle(from), [controller]);
  const logout = useCallback<AuthValue["logout"]>(() => controller.logout(), [controller]);

  return (
    <AuthContext.Provider
      value={{
        ...snapshot,
        retrySession,
        signup,
        login,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function fullName(user: Pick<User, "firstName" | "lastName">): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}
