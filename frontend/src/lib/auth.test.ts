import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { SupabaseConfigError, validateSupabaseConfig } from "./supabase";
import { authMessage, createAuthController } from "./auth";

function makeMockSession(overrides: Partial<Session> = {}): Session {
  return {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "user-abc-123",
      aud: "authenticated",
      role: "authenticated",
      email: "wilbur@example.com",
      app_metadata: {},
      user_metadata: { first_name: "Wilbur", last_name: "Fernandes" },
      created_at: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("TASK-03: Authentication flow, Supabase config validation, and error mapping", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("1. Missing or malformed Supabase environment variables produce a clear configuration error", () => {
    expect(() => validateSupabaseConfig("", "valid-publishable-key-123456")).toThrow(SupabaseConfigError);
    expect(() => validateSupabaseConfig("", "valid-publishable-key-123456")).toThrow(/Missing VITE_SUPABASE_URL/);

    expect(() => validateSupabaseConfig("not-a-valid-url", "valid-publishable-key-123456")).toThrow(
      /Malformed VITE_SUPABASE_URL/,
    );
    expect(() => validateSupabaseConfig("ftp://project.supabase.co", "valid-publishable-key-123456")).toThrow(
      /Protocol must be https:\/\//,
    );
    expect(() => validateSupabaseConfig("https://your-project.supabase.co", "valid-publishable-key-123456")).toThrow(
      /Placeholder VITE_SUPABASE_URL/,
    );

    expect(() => validateSupabaseConfig("https://xyzcompany.supabase.co", "")).toThrow(
      /Missing VITE_SUPABASE_PUBLISHABLE_KEY/,
    );
    expect(() => validateSupabaseConfig("https://xyzcompany.supabase.co", "short")).toThrow(
      /Malformed VITE_SUPABASE_PUBLISHABLE_KEY/,
    );
    expect(() => validateSupabaseConfig("https://xyzcompany.supabase.co", "your-publishable-key-here")).toThrow(
      /Malformed VITE_SUPABASE_PUBLISHABLE_KEY/,
    );

    const valid = validateSupabaseConfig(
      "https://xyzcompany.supabase.co",
      "sb_publishable_1234567890abcdef123456",
    );
    expect(valid.url).toBe("https://xyzcompany.supabase.co");
    expect(valid.publishableKey).toBe("sb_publishable_1234567890abcdef123456");

    // Controller surfaces config_error state cleanly without crashing
    const controller = createAuthController({
      configError: "Missing VITE_SUPABASE_URL. Copy frontend/.env.example to frontend/.env.",
    });
    expect(controller.getSnapshot().status).toBe("config_error");
    expect(controller.getSnapshot().user).toBeNull();
    expect(controller.getSnapshot().configError).toContain("Missing VITE_SUPABASE_URL");
  });

  it("2. Initial loading state transitions to timeout on slow network and recovers on retrySession", async () => {
    vi.useFakeTimers();

    const session = makeMockSession();
    let callCount = 0;
    const mockClient = {
      auth: {
        getSession: vi.fn(() => {
          callCount++;
          if (callCount === 1) {
            // First attempt hangs past the hydration timeout
            return new Promise<{ data: { session: Session | null }; error: null }>(() => {});
          }
          return Promise.resolve({ data: { session }, error: null });
        }),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
    } as unknown as SupabaseClient;

    const controller = createAuthController({
      client: mockClient,
      configError: null,
      hydrationTimeoutMs: 8000,
      pullData: vi.fn(() => Promise.resolve()),
      forgetData: vi.fn(),
    });

    // Starts in "loading" state, not undefined-blank
    expect(controller.getSnapshot().status).toBe("loading");
    expect(controller.getSnapshot().user).toBeUndefined();

    controller.start();
    expect(controller.getSnapshot().status).toBe("loading");

    // Advance 4 seconds: still loading, NOT treated as logged out
    vi.advanceTimersByTime(4000);
    expect(controller.getSnapshot().status).toBe("loading");

    // Advance past 8s bounded timeout: transitions to "timeout" (retryable), NOT "unauthenticated"
    vi.advanceTimersByTime(4001);
    expect(controller.getSnapshot().status).toBe("timeout");
    expect(controller.getSnapshot().user).toBeUndefined();

    // Retry session hydration: transitions back to loading, then authenticated
    controller.retrySession();
    expect(controller.getSnapshot().status).toBe("loading");
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.getSnapshot().status).toBe("authenticated");
    expect(controller.getSnapshot().user?.email).toBe("wilbur@example.com");
    expect(controller.getSnapshot().session?.access_token).toBe("test-access-token");

    controller.stop();
  });

  it("3. Successful sign-in sets user and session", async () => {
    const session = makeMockSession();
    const pullData = vi.fn(() => Promise.resolve());
    const mockClient = {
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signInWithPassword: vi.fn(() =>
          Promise.resolve({ data: { session, user: session.user }, error: null }),
        ),
      },
    } as unknown as SupabaseClient;

    const controller = createAuthController({
      client: mockClient,
      configError: null,
      pullData,
      forgetData: vi.fn(),
    });
    controller.start();
    await Promise.resolve();

    expect(controller.getSnapshot().status).toBe("unauthenticated");

    const signedInUser = await controller.login("wilbur@example.com", "StrongPass!123");
    expect(signedInUser).toEqual({
      id: "user-abc-123",
      email: "wilbur@example.com",
      firstName: "Wilbur",
      lastName: "Fernandes",
    });
    expect(controller.getSnapshot().status).toBe("authenticated");
    expect(controller.getSnapshot().user?.id).toBe("user-abc-123");
    expect(controller.getSnapshot().session?.access_token).toBe("test-access-token");

    controller.stop();
  });

  it("4. invalid_credentials maps to the friendly message via error.code", () => {
    const err = Object.assign(new Error("Raw backend text"), {
      name: "AuthApiError",
      code: "invalid_credentials",
      status: 400,
    });
    expect(authMessage(err, "login")).toBe("Incorrect email or password.");
  });

  it("5. email_not_confirmed maps to the friendly message via error.code", () => {
    const err = Object.assign(new Error("Email not confirmed"), {
      name: "AuthApiError",
      code: "email_not_confirmed",
      status: 400,
    });
    expect(authMessage(err, "login")).toBe("Please confirm your email before signing in.");
  });

  it("6. Network failure, weak_password, user_already_exists, rate limit, and password reset privacy map accurately", () => {
    const netErr = Object.assign(new Error("socket hang up"), {
      name: "AuthRetryableFetchError",
      status: 0,
    });
    expect(authMessage(netErr)).toBe("Cannot reach authentication service. Check your internet connection.");

    const typeErr = Object.assign(new Error("NetworkError"), {
      name: "TypeError",
    });
    expect(authMessage(typeErr)).toBe("Cannot reach authentication service. Check your internet connection.");

    const existsErr = Object.assign(new Error("User already registered"), {
      name: "AuthApiError",
      code: "user_already_exists",
      status: 422,
    });
    expect(authMessage(existsErr, "signup")).toBe("An account with this email already exists.");

    const weakErr = Object.assign(new Error("Password too weak"), {
      name: "AuthWeakPasswordError",
      code: "weak_password",
      status: 422,
    });
    expect(authMessage(weakErr, "signup")).toBe("Choose a stronger password.");

    const rateErr = Object.assign(new Error("Rate limit"), {
      name: "AuthApiError",
      code: "over_request_rate_limit",
      status: 429,
    });
    expect(authMessage(rateErr)).toBe("Too many attempts. Please wait and try again.");

    // Password reset does not reveal whether an email exists
    const resetNotFound = Object.assign(new Error("User not found"), {
      name: "AuthApiError",
      code: "user_not_found",
      status: 400,
    });
    expect(authMessage(resetNotFound, "reset")).toBe("If an account uses this email, a reset link has been sent.");
  });

  it("7. Sign-out clears user, session, and local account data", async () => {
    const session = makeMockSession();
    const forgetData = vi.fn();
    const mockClient = {
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session }, error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
      },
    } as unknown as SupabaseClient;

    const controller = createAuthController({
      client: mockClient,
      configError: null,
      pullData: vi.fn(() => Promise.resolve()),
      forgetData,
    });

    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.getSnapshot().status).toBe("authenticated");
    expect(controller.getSnapshot().user?.id).toBe("user-abc-123");

    await controller.logout();
    expect(controller.getSnapshot().status).toBe("unauthenticated");
    expect(controller.getSnapshot().user).toBeNull();
    expect(controller.getSnapshot().session).toBeNull();
    expect(forgetData).toHaveBeenCalledTimes(1);

    controller.stop();
  });

  it("8. onAuthStateChange is registered once, handles lifecycle events, and unsubscribes on stop", async () => {
    const unsubscribe = vi.fn();
    let capturedCallback: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;

    const onAuthStateChange = vi.fn((cb: (event: AuthChangeEvent, session: Session | null) => void) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe } } };
    });

    const mockClient = {
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        onAuthStateChange,
      },
    } as unknown as SupabaseClient;

    const controller = createAuthController({
      client: mockClient,
      configError: null,
      pullData: vi.fn(() => Promise.resolve()),
      forgetData: vi.fn(),
    });

    controller.start();
    // Calling start() a second time is a no-op (single subscription)
    controller.start();
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    expect(controller.getSnapshot().status).toBe("unauthenticated");

    // Emit SIGNED_IN via onAuthStateChange
    const session = makeMockSession();
    capturedCallback!("SIGNED_IN", session);
    expect(controller.getSnapshot().status).toBe("authenticated");
    expect(controller.getSnapshot().user?.email).toBe("wilbur@example.com");

    // Emit TOKEN_REFRESHED
    const refreshedSession = makeMockSession({ access_token: "refreshed-token-xyz" });
    capturedCallback!("TOKEN_REFRESHED", refreshedSession);
    expect(controller.getSnapshot().status).toBe("authenticated");
    expect(controller.getSnapshot().session?.access_token).toBe("refreshed-token-xyz");

    // Emit SIGNED_OUT
    capturedCallback!("SIGNED_OUT", null);
    expect(controller.getSnapshot().status).toBe("unauthenticated");
    expect(controller.getSnapshot().user).toBeNull();
    expect(controller.getSnapshot().session).toBeNull();

    // Unmount / stop cleans up subscription
    expect(unsubscribe).not.toHaveBeenCalled();
    controller.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
