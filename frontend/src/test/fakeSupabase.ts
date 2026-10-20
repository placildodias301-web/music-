/**
 * In-memory stand-in for the Supabase client. Tests mock `../lib/supabase`
 * with this at the module boundary, so the REAL auth controller, cloud sync
 * and app code run unchanged on top of it. Nothing here touches the network.
 */
import type { Session } from "@supabase/supabase-js";

type AuthCallback = (event: string, session: Session | null) => void;

export const fakeSupabaseState = {
  session: null as Session | null,
  /** When set, every `user_data` read/write resolves with this error (simulates Supabase being down). */
  userDataError: null as { message: string; code?: string } | null,
  /** Rows the account "already has" in the cloud. */
  cloudRows: [] as { kind: string; id: string; data: unknown }[],
  /** Every row the app tried to upsert successfully. */
  upserts: [] as { kind: string; id: string; data: unknown }[],
  getSessionCalls: 0,
  listeners: new Set<AuthCallback>(),
};

export function resetFakeSupabase(): void {
  fakeSupabaseState.session = null;
  fakeSupabaseState.userDataError = null;
  fakeSupabaseState.cloudRows = [];
  fakeSupabaseState.upserts = [];
  fakeSupabaseState.getSessionCalls = 0;
  fakeSupabaseState.listeners.clear();
}

export function makeSession(overrides: { id?: string; email?: string } = {}): Session {
  return {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: overrides.id ?? "user-test-123",
      aud: "authenticated",
      role: "authenticated",
      email: overrides.email ?? "tester@wilsify.test",
      app_metadata: {},
      user_metadata: { first_name: "Test", last_name: "User" },
      created_at: "2026-01-01T00:00:00.000Z",
    },
  } as Session;
}

const userDataTable = {
  upsert: async (rows: { kind: string; id: string; data: unknown }[]) => {
    if (fakeSupabaseState.userDataError) return { error: fakeSupabaseState.userDataError };
    fakeSupabaseState.upserts.push(...rows);
    return { error: null };
  },
  select: async () => {
    if (fakeSupabaseState.userDataError) return { data: null, error: fakeSupabaseState.userDataError };
    return { data: fakeSupabaseState.cloudRows, error: null };
  },
  delete: () => ({
    eq: () => ({ in: async () => ({ error: fakeSupabaseState.userDataError }) }),
    in: async () => ({ error: fakeSupabaseState.userDataError }),
  }),
};

export const fakeSupabaseClient = {
  auth: {
    getSession: async () => {
      fakeSupabaseState.getSessionCalls += 1;
      return { data: { session: fakeSupabaseState.session }, error: null };
    },
    onAuthStateChange: (cb: AuthCallback) => {
      fakeSupabaseState.listeners.add(cb);
      return {
        data: { subscription: { id: "fake", callback: cb, unsubscribe: () => fakeSupabaseState.listeners.delete(cb) } },
      };
    },
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: { session: fakeSupabaseState.session, user: fakeSupabaseState.session?.user }, error: null }),
  },
  from: () => userDataTable,
};

/** The shape of `src/lib/supabase.ts`, for `vi.mock("../lib/supabase", ...)`. */
export function fakeSupabaseModule() {
  class SupabaseConfigError extends Error {
    readonly code = "supabase_config_error";
    constructor(message: string) {
      super(message);
      this.name = "SupabaseConfigError";
    }
  }
  return {
    SupabaseConfigError,
    supabase: fakeSupabaseClient,
    isSupabaseConfigured: true,
    getSupabaseConfigError: () => null,
    validateSupabaseConfig: () => ({ url: "https://test.supabase.co", publishableKey: "test-publishable-key-0000" }),
  };
}
