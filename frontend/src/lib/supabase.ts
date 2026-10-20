import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SupabaseConfigError extends Error {
  readonly code = "supabase_config_error";

  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

/**
 * Validates VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before creating the client.
 * Throws a clear SupabaseConfigError if either is missing or malformed.
 */
export function validateSupabaseConfig(
  rawUrl: unknown = import.meta.env.VITE_SUPABASE_URL,
  rawKey: unknown = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
): { url: string; publishableKey: string } {
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
  const publishableKey = typeof rawKey === "string" ? rawKey.trim() : "";

  if (!url) {
    throw new SupabaseConfigError(
      "Missing VITE_SUPABASE_URL. Copy frontend/.env.example to frontend/.env and set your Supabase project URL.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SupabaseConfigError(
      "Malformed VITE_SUPABASE_URL. Expected a valid http:// or https:// Supabase project URL in frontend/.env.",
    );
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new SupabaseConfigError(
      "Malformed VITE_SUPABASE_URL. Protocol must be https:// (or http:// for local Supabase).",
    );
  }

  if (!parsedUrl.hostname || parsedUrl.hostname.includes("your-project") || parsedUrl.hostname === "example.com") {
    throw new SupabaseConfigError(
      "Placeholder VITE_SUPABASE_URL detected. Replace it with your real Supabase project URL in frontend/.env.",
    );
  }

  if (!publishableKey) {
    throw new SupabaseConfigError(
      "Missing VITE_SUPABASE_PUBLISHABLE_KEY. Copy frontend/.env.example to frontend/.env and set your Supabase anon/publishable key.",
    );
  }

  if (
    publishableKey.length < 16 ||
    /\s/.test(publishableKey) ||
    /your[-_]?publishable[-_]?key|your[-_]?anon[-_]?key|placeholder/i.test(publishableKey)
  ) {
    throw new SupabaseConfigError(
      "Malformed VITE_SUPABASE_PUBLISHABLE_KEY. Set a valid Supabase anon/publishable key in frontend/.env.",
    );
  }

  return { url, publishableKey };
}

let configError: string | null = null;
let clientInstance: SupabaseClient | null = null;

try {
  const { url, publishableKey } = validateSupabaseConfig();
  clientInstance = createClient(url, publishableKey);
} catch (err) {
  configError = err instanceof Error ? err.message : "Supabase environment variables are not configured.";
}

export const isSupabaseConfigured = clientInstance !== null;

export function getSupabaseConfigError(): string | null {
  return configError;
}

function createUnconfiguredClient(message: string): SupabaseClient {
  const fail = () => Promise.reject(new SupabaseConfigError(message));
  const authProxy = {
    getSession: () => Promise.resolve({ data: { session: null }, error: new SupabaseConfigError(message) }),
    getUser: () => Promise.resolve({ data: { user: null }, error: new SupabaseConfigError(message) }),
    onAuthStateChange: () => ({
      data: {
        subscription: {
          id: "unconfigured",
          callback: () => undefined,
          unsubscribe: () => undefined,
        },
      },
    }),
    signInWithPassword: fail,
    signUp: fail,
    signInWithOAuth: fail,
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: fail,
    updateUser: fail,
  };
  const tableProxy = () => ({
    select: fail,
    upsert: fail,
    delete: () => ({ eq: () => ({ in: fail }), in: fail }),
  });
  return {
    auth: authProxy,
    from: tableProxy,
  } as unknown as SupabaseClient;
}

/** The one Supabase client. The publishable key is public by design; row-level security guards the data. */
export const supabase: SupabaseClient = clientInstance ?? createUnconfiguredClient(configError ?? "Supabase is not configured.");
